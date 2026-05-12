import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;
const APP_URL = process.env.APP_URL || 'http://localhost:5173';

// ── Supabase admin (service key — bypasses RLS) ──────────────────────────────
const supabaseAdmin = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

// ── Stripe ───────────────────────────────────────────────────────────────────
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// ── Token packs (one-time purchases) ─────────────────────────────────────────
const TOKEN_PACKS = {
  starter: { name: 'Starter Pack', tokens: 10, cents: 499  },
  grinder: { name: 'Grinder Pack', tokens: 25, cents: 999  },
  pro:     { name: 'Pro Pack',     tokens: 75, cents: 1999 },
};

// Token cost per grade — all paid grades use Opus (1 token each); Sonnet reserved for anonymous free grades
const TOKEN_COST = { 'claude-sonnet-4-6': 1, 'claude-opus-4-7': 1 };

// ── Auth helper ───────────────────────────────────────────────────────────────
async function getUser(req) {
  if (!supabaseAdmin) return null;
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  if (!token) return null;
  try {
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    return user ?? null;
  } catch { return null; }
}

// ── Get or create user plan row ───────────────────────────────────────────────
async function getUserPlan(userId) {
  const { data } = await supabaseAdmin.from('user_plans').select('*').eq('id', userId).maybeSingle();
  if (data) return data;
  // First-time user — create free plan
  const { data: created } = await supabaseAdmin
    .from('user_plans')
    .insert({ id: userId, plan: 'free', grades_used: 0, grade_limit: 2, model: 'claude-sonnet-4-6' })
    .select().single();
  return created;
}

// ── Stripe webhook — must be registered BEFORE express.json() ────────────────
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Payments not configured' });
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.warn('Webhook signature failed:', err.message);
    return res.status(400).json({ error: err.message });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.metadata?.user_id;
      const tokens = parseInt(session.metadata?.tokens || '0');
      if (userId && tokens > 0 && supabaseAdmin) {
        const planRow = await getUserPlan(userId);
        if (planRow) {
          const newLimit = planRow.grade_limit + tokens;
          await supabaseAdmin.from('user_plans')
            .update({ grade_limit: newLimit, plan: 'paid', updated_at: new Date().toISOString() })
            .eq('id', userId);
          console.log(`Tokens purchased: ${userId} +${tokens} → ${newLimit} total`);
        }
      }
    }
  } catch (err) {
    console.error('Webhook handler error:', err.message);
  }

  res.json({ received: true });
});

app.use(express.json({ limit: '50mb' }));
app.use(cors({ origin: true }));

// Serve built frontend if dist/ exists (production / mobile tunnel mode)
const distPath = join(__dirname, '..', 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set. Add it to your .env file.');
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// eBay reference image fetching
let ebayTokenCache = null;

async function getEbayToken() {
  if (ebayTokenCache && ebayTokenCache.expires > Date.now()) return ebayTokenCache.token;
  if (!process.env.EBAY_APP_ID || !process.env.EBAY_CERT_ID) return null;

  const creds = Buffer.from(`${process.env.EBAY_APP_ID}:${process.env.EBAY_CERT_ID}`).toString('base64');
  const res = await fetchWithTimeout('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
  });
  const data = await res.json();
  if (!data.access_token) return null;
  ebayTokenCache = { token: data.access_token, expires: Date.now() + (data.expires_in - 60) * 1000 };
  return data.access_token;
}

// eBay thumbnail URLs use s-l140 (140px). Replace suffix with s-l1600 for high-res.
function upscaleEbayUrl(url) {
  return url.replace(/s-l\d+(\.[a-z]+)$/i, 's-l1600$1');
}

async function ebaySearch(token, query, limit = 3, excludeGraded = false, requirePsa10 = false) {
  const q = encodeURIComponent(query.trim());
  const res = await fetchWithTimeout(
    `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${q}&filter=conditions:{PRE_OWNED}&limit=${limit * 3}&sort=newlyListed`,
    { headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' } },
    5000
  );
  const data = await res.json();
  let items = data.itemSummaries ?? [];
  if (excludeGraded) {
    items = items.filter(item => !/\b(PSA|BGS|SGC|CGC|Beckett|graded|slab)\b/i.test(item.title ?? ''));
  }
  if (requirePsa10) {
    // Must have PSA 10 / GEM MT / GEM MINT in the title — not just "PSA" or a lower grade
    items = items.filter(item => /PSA\s*10\b|GEM[\s-]MT\b|GEM[\s-]MINT\b/i.test(item.title ?? ''));
  }
  return items
    .slice(0, limit)
    .map(item => item.image?.imageUrl)
    .filter(Boolean)
    .map(upscaleEbayUrl);
}

async function fetchWithTimeout(url, options = {}, ms = 5000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function urlToBase64(url) {
  try {
    const res = await fetchWithTimeout(url, {}, 5000);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const mediaType = res.headers.get('content-type') || 'image/jpeg';
    return { data: Buffer.from(buf).toString('base64'), mediaType };
  } catch { return null; }
}

// Fetch actual sold eBay prices via the Finding API (findCompletedItems + SoldItemsOnly).
// No OAuth needed — just EBAY_APP_ID.
async function ebayFindingSearch(query, limit = 25, searchDescription = false) {
  if (!process.env.EBAY_APP_ID) return [];
  const q = encodeURIComponent(query.trim());
  try {
    const url = `https://svcs.ebay.com/services/search/FindingService/v1` +
      `?OPERATION-NAME=findCompletedItems` +
      `&SERVICE-VERSION=1.0.0` +
      `&SECURITY-APPNAME=${process.env.EBAY_APP_ID}` +
      `&RESPONSE-DATA-FORMAT=JSON` +
      `&REST-PAYLOAD` +
      `&keywords=${q}` +
      `&descriptionSearch=${searchDescription}` +
      `&itemFilter(0).name=SoldItemsOnly` +
      `&itemFilter(0).value=true` +
      `&sortOrder=EndTimeSoonest` +
      `&paginationInput.entriesPerPage=${limit}`;
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) return [];
    const data = await res.json();
    const items = data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item ?? [];
    return items.map(item => ({
      title: item.title?.[0] ?? '',
      price: parseFloat(item.sellingStatus?.[0]?.currentPrice?.[0]?.['__value__'] ?? 0),
      url: item.viewItemURL?.[0] ?? '',
    })).filter(l => l.price > 0 && l.title);
  } catch (e) {
    return [];
  }
}

const OVERSIZED_PRONE_VARIANTS = ['downtown', 'stained glass', 'color blast', 'sparkle', 'dynagon', 'light it up', 'magic numbers', 'pulsar', 'stargazer'];

async function fetchMarketComps(player, year, set, variant, cardNumber) {
  if (!process.env.EBAY_APP_ID) return null;

  const baseParts = [year, set, player, variant, cardNumber ? `#${cardNumber}` : ''].filter(Boolean);
  const base = baseParts.join(' ');

  const variantLower = (variant ?? '').toLowerCase();
  const isOversizedProne = OVERSIZED_PRONE_VARIANTS.some(v => variantLower.includes(v));

  // For oversized-prone variants, exclude 5x7 jumbo keywords in both title AND description
  const sizeExclusion = isOversizedProne ? ' -5x7 -"5 x 7" -jumbo -oversized -"box topper"' : '';
  const [rawList, psaList, bgsList] = await Promise.all([
    ebayFindingSearch(`${base}${sizeExclusion}`, 25, isOversizedProne),
    ebayFindingSearch(`${base} PSA${sizeExclusion}`, 25, isOversizedProne),
    ebayFindingSearch(`${base} BGS${sizeExclusion}`, 25, isOversizedProne),
  ]);

  const seen = new Set();
  let unique = [...rawList, ...psaList, ...bgsList].filter(l => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });

  // Oversized-prone variants (Downtown, Stained Glass, etc.) exist in both standard 2.5x3.5
  // and cheap jumbo 5x7 formats. Sellers rarely label the size.
  // Raw jumbo: typically $10-40. Standard raw: $80-200+. Use $100 floor for raw.
  // Graded (PSA/BGS) jumbo 10: typically $50-180. Standard graded 10: $200-1000+. Use $200 floor for graded.
  if (isOversizedProne) {
    const before = unique.length;
    unique = unique.filter(l => {
      const isGraded = /\b(PSA|BGS|SGC|CGC)\b/i.test(l.title);
      return isGraded ? l.price >= 200 : l.price >= 100;
    });
    console.log(`Oversized filter: removed ${before - unique.length} listings below floor for "${variant}"`);
  }

  console.log(`Market comps: pulled ${unique.length} unique sold listings for ${player}`);
  if (unique.length === 0) return null;

  const prompt = `Target card: ${player}, ${year} ${set}${variant ? ', ' + variant : ''}${cardNumber ? ', #' + cardNumber : ''}.

Below are eBay sold listings. Bucket each VALID one into a tier and return its price.

Tiers: raw (no grade), psa7, psa8, psa9, psa10, bgs7, bgs8, bgs9, bgs9_5, bgs10, bgsBlackLabel (BGS Black Label / BGS Pristine)

EXCLUSION — BE AGGRESSIVE. WHEN IN DOUBT, EXCLUDE.

A listing is INVALID if ANY of these apply:
1. Different player, year, or set than the target
2. Different variant — Base, Silver Prizm, Gold, Refractor, Wave, Mosaic Pink, Auto, etc. are DIFFERENT cards. Match must be exact.
3. Different card number (when target specifies one)
4. Lot or multi-card listing — title mentions: "lot", "x2", "x3", "(2)", "(3)", multiple player names, "bundle", "set break", "complete set", "20 cards", "all", etc.
5. NOT a standard 2.5x3.5 inch trading card — exclude ANY mention of: "jumbo", "5x7", "5 x 7", "8x10", "blanket", "manu", "manupatch", "manufactured patch", "promo", "magnet", "oversized", "box topper", "topper", "mini", "micro", "stickers", "decal", "poster", "wall art", "bobblehead", "figure", "coin", "patch card" (when it implies oversized). When in doubt about size, EXCLUDE.

   CRITICAL — these specific inserts exist in BOTH standard 2.5×3.5 AND oversized 5×7 formats. Sellers rarely label the size in the title: "Stained Glass", "Downtown", "Color Blast", "Sparkle", "Dynagon", "Light It Up", "Magic Numbers", "Pulsar", "Stargazer". Oversized PSA/BGS 5×7 slabs typically sell for $50–180; standard 2.5×3.5 graded copies sell for $200+. Any graded listing under $200 for these variants is almost certainly the worthless oversized slab — EXCLUDE it from ALL graded tiers. Raw oversized sell under $100 and have been pre-filtered. Treat all remaining raw listings as standard size.
6. Sealed product / pack / box, not a single card — "pack", "box", "case", "hot pack", "blaster", "hobby box", "mega", "factory sealed", "wax", "FOTL"
7. Damaged / altered / fake — "altered", "trimmed", "creased", "crease", "ding", "bent", "torn", "stain", "miscut", "reprint", "custom", "proxy", "replica", "novelty", "art card"
8. Auto/autograph variant when target is base (or vice versa) — autographs are a different card
9. Suspicious price for the grade (e.g. modern PSA 10 rookie listed under $5 — almost always a lot, wrong card, or scam)
10. Grade unclear from title (just says "graded" with no company/number)

Listings:
${unique.map((l, i) => `${i + 1}. "${l.title.slice(0, 140)}" — $${l.price.toFixed(2)} [${l.url}]`).join('\n')}

For each tier with at least 1 valid listing, return ALL valid prices sorted ascending and the URL of the most recently sold valid listing for that tier (lowest index number in the list above, since they are sorted newest-first). Omit tiers with zero valid listings.

Return ONLY this JSON:
{
  "raw":           { "prices": [<sorted asc>], "count": <int>, "url": "<representative listing URL or null>" },
  "psa9":          { "prices": [<sorted asc>], "count": <int>, "url": "<representative listing URL or null>" },
  "psa10":         { "prices": [<sorted asc>], "count": <int>, "url": "<representative listing URL or null>" },
  "bgs9_5":        { "prices": [<sorted asc>], "count": <int>, "url": "<representative listing URL or null>" },
  "bgs10":         { "prices": [<sorted asc>], "count": <int>, "url": "<representative listing URL or null>" },
  "bgsBlackLabel": { "prices": [<sorted asc>], "count": <int>, "url": "<representative listing URL or null>" },
  "totalValid": <int>,
  "totalListings": ${unique.length}
}`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content.find(b => b.type === 'text')?.text ?? '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    console.log(`Market: ${parsed.totalValid}/${parsed.totalListings} valid — `
      + Object.entries(parsed)
        .filter(([k, v]) => Array.isArray(v?.prices) && v.prices.length > 0)
        .map(([k, v]) => `${k}=[${v.prices.join(',')}](${v.count})`)
        .join(' '));
    // Extract per-tier URLs for frontend deep-links
    const urls = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v?.url) urls[k] = v.url;
    }
    parsed._urls = urls;
    return parsed;
  } catch (err) {
    console.warn('Market comp parsing failed:', err.message);
    return null;
  }
}

async function fetchEbayReferenceImages(player, year, set, variant) {
  try {
    const token = await getEbayToken();
    if (!token) { console.warn('eBay ref: no token'); return { raw: [], graded: [] }; }

    const full  = [player, year, set, variant].filter(Boolean).join(' ');
    const short = [player, year].filter(Boolean).join(' ');

    // Try progressively broader queries until we get PSA 10 hits
    let gradedUrls = await ebaySearch(token, `${full} PSA 10`, 3, false, true);
    if (gradedUrls.length === 0) {
      gradedUrls = await ebaySearch(token, `${short} PSA 10 gem mint`, 3, false, true);
    }
    if (gradedUrls.length === 0) {
      // Last resort: no PSA-10 filter, just take graded listings
      gradedUrls = await ebaySearch(token, `${full} PSA graded`, 3, false, false);
      gradedUrls = gradedUrls.filter((_, i) => i < 2); // cap at 2 if unfiltered
    }

    const rawUrls = await ebaySearch(token, `${full} raw ungraded`, 2, true);

    const [rawImages, gradedImages] = await Promise.all([
      Promise.all(rawUrls.slice(0, 1).map(urlToBase64)),
      Promise.all(gradedUrls.slice(0, 2).map(urlToBase64)),
    ]);

    const result = {
      raw:    rawImages.filter(Boolean),
      graded: gradedImages.filter(Boolean),
    };
    console.log(`eBay refs for "${full}": ${result.graded.length} PSA-10, ${result.raw.length} raw`);
    return result;
  } catch (err) {
    console.warn('eBay reference fetch failed:', err.message);
    return { raw: [], graded: [] };
  }
}

const SYSTEM_PROMPT = `You are CardGradeOrNot, a PSA/BGS-calibrated sports card grader. Your only job is to find real physical flaws on the card. The grading software computes the final subgrades from your findings — your numbers for corners/edges/surface are ignored.

WHAT YOU MUST DO:
  Scan every zone of the card exhaustively, with special focus on all 4 edges and 4 corners.
  For every zone, report exactly what you observe (even if it looks clean).
  Edges and corners are graded on ABSOLUTE physical standards — you do not need a reference to know if an edge has a chip or a corner has whitening. Trust what you see in the zoom crops.
  When a PSA 10 reference is provided, use it to distinguish design elements (foil, holo, border color) from damage. When no reference is provided, grade everything against the physical ideal: razor-clean edges, sharp corner tips, flawless surface.
  For each confirmed flaw, classify severity honestly: microscopic (needs loupe/bright light), visible (naked eye on inspection), or obvious (immediately noticeable).

EDGES ARE THE #1 GRADING DEDUCTION:
  PSA 10 requires perfectly smooth edges with zero chips, nicks, dents, or whitening.
  A single visible chip or nick on any edge = PSA 8 at best — do not miss these.
  The edge zoom crops show magnified views of each edge — examine them aggressively.
  Default is suspicion, not trust: if an edge crop shows anything other than a clean straight line, it is "differs".

CORNERS ARE #2:
  PSA 10 requires sharp 90° corner tips with full color to the very point.
  Any whitening, soft tip, or rounding = "differs". Do not forgive minor tip wear.

WHAT IS NEVER A CONFIRMED FLAW:
  Foil, holographic, prizm, chrome patterns and textures (even if they look like scratches)
  Speckle or sparkle fills (Prizm, Mosaic) — printed design
  White corners on chrome/foil cards where the PSA 10 reference also shows white corners
  JPEG compression artifacts or photo blur
  Lighting or angle differences between the user's photo and any reference

GRADE ONLY THE CARD: background, table, hand, sleeve = ignore entirely.
EXCEPTION: The card's 4 edges and 4 corner tips ARE part of the card — damage there is real card damage, not background.`;



const GRADING_PROMPT = `You are inspecting this sports card zone-by-zone. A PSA 10 GEM MINT reference image may or may not be provided.

IF a PSA 10 reference IS provided: use it as ground truth for design details — foil patterns, border colors, holo textures. Anything on the user's card that also appears on the PSA 10 at the same location is design, NOT damage.

IF no PSA 10 reference is provided: grade every zone on ABSOLUTE physical standards. Do not assume the card is in good condition. PSA 10 means perfectly sharp corner tips, razor-clean edges with zero interruption, and flawless surface. Any deviation is a defect.

You have ZOOM-IN crops of each of the 8 corner/edge zones labeled "ZOOM-IN FRONT: zone" and, if a back photo was provided, "ZOOM-IN BACK: zone". These are the regions a real grader inspects under a loupe. For each zone, examine BOTH the front and back crops — report the worst severity between them. A corner that is clean on the front but chipped on the back is still a flawed corner.

YOUR TASK — REPORT ON EVERY ZONE, NO SKIPPING:

For each of these 8 zones, write an entry:
  corner-TL, corner-TR, corner-BL, corner-BR, edge-top, edge-right, edge-bottom, edge-left

Each entry:
{
  "zone": "<id>",
  "psa10Match": "matches" | "differs",
  "observation": "specific description of what you see (e.g. 'sharp 90° corner with full color hold' or 'whitening on the very tip with a faint chip')",
  "severity": null | "microscopic" | "visible" | "obvious",
  "description": null | "if differs, the specific physical defect"
}

ZONE RULES:
  "matches" → severity null, description null
  "differs" → must name a SPECIFIC physical defect: whitening, chip, nick, dent, scratch, color rub, fraying, soft tip, rolled corner
  Lighting / angle / shadow / glare differences = "matches"
  Foil / prizm / holographic / chrome patterns = "matches" (design)

EDGE ZONES — ABSOLUTE PHYSICAL INSPECTION (edge-top, edge-right, edge-bottom, edge-left):
  Edges do NOT need a reference to grade. You are looking at the physical border line of the card.
  A PSA 10 edge is a razor-clean straight line with zero physical interruption — full color, no breaks.
  Grade the edge you actually see. Do not give benefit of the doubt.

  "differs" if you see ANY of these — even one instance:
  ● Chip      — missing color or white showing at any point on the border line (even 1mm)
  ● Nick      — a small notch or cut into the edge
  ● Dent      — a pressed-in indent that creates a shadow or irregularity along the edge
  ● Whitening — white spots or streaks on a colored edge border
  ● Wear      — the edge line looks fuzzy, soft, or roughened instead of crisp
  ● Fraying   — visible fiber separation or layer lifting at the edge

  "matches" ONLY if the edge line is genuinely razor-clean with no physical interruption whatsoever.
  If you are uncertain, mark "differs" with severity "microscopic" — do not default to "matches" on doubt.

  EDGE SEVERITY CALIBRATION — be honest, not charitable:
  microscopic = you can barely detect it even in the magnified zoom crop; no clear color break; most graders would pass at PSA 10
  visible     = you can clearly see it in the zoom crop — a chip, nick, whitening, soft line, or any identifiable wear; PSA 8 maximum
  obvious     = immediately clear without zooming in; significant damage; PSA 7 or lower

  CRITICAL: The zoom crops you receive are already magnified several times over. If you can SEE the flaw and DESCRIBE it in the zoom crop, it is "visible" at minimum — NOT "microscopic." Reserve "microscopic" only for something you can barely detect even in the magnified image. Describing damage as "faint," "slight," "minor," or "subtle" but still visible = "visible" severity.

CORNER ZONES — ABSOLUTE PHYSICAL INSPECTION (corner-TL, corner-TR, corner-BL, corner-BR):
  Corners do NOT need a reference to grade. You are looking at the physical corner tip.
  A PSA 10 corner is a sharp 90° point with full color to the very tip — no rounding, no whitening.
  Grade the corner you actually see. Do not give benefit of the doubt.

  "differs" if you see ANY of these:
  ● Whitening — white showing at the tip instead of full card color
  ● Soft tip  — the corner tip is rounded or blunted rather than a sharp point
  ● Bent      — the tip is folded, creased, or angled away from 90°
  ● Chip      — missing material at the corner tip

  "matches" ONLY if the corner is genuinely a sharp 90° point with full color. If uncertain, mark "differs".

CARD BOUNDARY — CRITICAL:
  DO NOT flag: background surface, table, scanner glass, display case interior, or shadows cast by the card onto the background.
  These are clearly behind or around the card — they are not card damage.

  The card's 4 physical edges ARE part of the card, not background.
  A chip or nick at the card's border line is card damage, not background — flag it.
  Rule of thumb: interior marks → when in doubt, skip. Edge marks → when in doubt, look harder.

SURFACE INSPECTION (separate from zones):
  Scan the user's full front and back photos for surface defects: print lines, scratches, dents, color rubs, indentations, gloss disruption, haze.
  Compare each candidate flaw to the PSA 10 reference at the same location. Only list it if it's NOT on the PSA 10.
  Output as "surfaceFlaws" array. [] if genuinely clean — but be thorough before declaring clean.

SEVERITY:
  microscopic = needs loupe / raking light to see
  visible     = naked eye on close inspection
  obvious     = immediately noticeable

CENTERING — provide a visual estimate of the front centering subgrade in bgs.centering using the BGS scale:
  10.0 = perfectly centered (≤52/48 both axes)
  9.5  = near-perfect (≤55/45)
  9.0  = slightly off (≤60/40)
  8.5  = noticeably off (≤65/35)
  8.0  = significantly off (≤70/30)
  7.5 or lower = very off
This is an INITIAL estimate. The user may override it after grading.

OVERSIZED INSERT PRICING RULE: Downtown, Stained Glass, Color Blast, Sparkle, and similar inserts exist in BOTH standard 2.5×3.5 AND oversized 5×7 formats. The 5×7 version is a cheap product that sells raw for $5-30 and PSA 10 for $50-150. The standard 2.5×3.5 version is the valuable collectible. ALL market values you provide must reflect the STANDARD 2.5×3.5 size only. NEVER quote 5×7 oversized prices. When in doubt, your raw estimate should be at least $80 for a premium standard insert.

Market ratios: PSA10=100% | PSA9=20-40% | BGS BL=200-1000% | BGS10=100-150% | BGS9.5=50-75% | BGS9=40-60%
Submission threshold: net profit ≥ $30 AND ROI ≥ 25%
PSA tiers: Value $33(<$500), Regular $75(<$1500), Express $150(<$2500), Super Express $250(<$5000), Walk-Through $600(<$10000), Premium ≥$10000 ($1000 per $25k declared value, e.g. $10k card=$1000, $26k card=$2000)
BGS tiers: Standard $25(<$499), Express $40(<$999), Fast Track $100(<$2000), Walk-Through $300

POP REPORT CALIBRATION — real anchors for accurate popData estimates:

CARD TYPE → PSA TOTAL (all grades) / TYPICAL PSA 10 GEM RATE:
  Modern mega-star base rookie (Mahomes, Luka, Zion, Burrow, Tatum — 2017+): 30,000–120,000 / 30–45%
  Modern solid-prospect base rookie (2017+): 3,000–25,000 / 25–40%
  Modern veteran/non-rookie base: 500–8,000 / 35–50%
  Modern Silver Prizm parallel: ~25–40% of the base card's total
  Modern numbered parallel /99–/49: 500–3,000 / 40–55%
  Modern numbered parallel /25 or rarer: 30–400 / 45–60%
  Modern 1/1: 1–8 PSA graded
  Semi-vintage star rookie (1990–2010): 2,000–40,000 / 10–25%
  Vintage star (pre-1980): 500–60,000 / 1–8% (centering/surface much harder to pass)
  Vintage common (pre-1980): 20–800 / 1–5%

KNOWN REAL ANCHORS:
  2020 Prizm Patrick Mahomes base: ~60,000 PSA total, ~35% gem rate
  2018 Prizm Luka Doncic base rookie: ~85,000 PSA total, ~27% gem rate
  2019 Prizm Zion Williamson Silver Prizm: ~8,500 PSA total, ~35% gem rate
  2003 Topps Chrome LeBron James rookie: ~18,000 PSA total, ~28% gem rate
  1986 Fleer Michael Jordan rookie: ~55,000 PSA total, ~6% gem rate
  1952 Topps Mickey Mantle: ~3,500 PSA total, <1% gem rate

BGS POPULATION (derive from PSA total):
  BGS total ≈ 8–15% of PSA total for the same card
  BGS 9.5 Gem Mint rate: 15–30% of BGS submissions on modern cards
  BGS Pristine 10 rate: 2–8% of BGS submissions
  BGS Black Label (all four 10s): <1% of BGS submissions even on perfect modern cards

GRADE DISTRIBUTION SHAPE:
  Modern chrome/prizm: clusters high — PSA 8 ~15%, PSA 9 ~30–35%, PSA 10 ~30–45%, lower grades small
  Semi-vintage: PSA 8 ~20%, PSA 9 ~25%, PSA 10 ~15%, grades 5–7 collectively ~30%
  Vintage: spread low — grades 1–6 dominate, PSA 10 <5%, PSA 9 5–15%

Use these to estimate realistic counts per grade — never invent implausibly round or extreme numbers.

Return ONLY raw JSON. If card identity uncertain: needsClarification:true with candidates only.

{
  "needsClarification": false,
  "candidates": [],
  "confidence": <0-100>,
  "player": "Full name", "year": "Year", "set": "Set", "cardNumber": null, "sport": "Sport", "variant": "Base/Rookie/etc.",
  "psa": { "grade": <1-10>, "label": "GEM MT|MINT|NM-MT|NM|EX-MT|EX|VG-EX|VG|GOOD|FR|PR" },
  "zones": [ exactly 8 entries — corner-TL, corner-TR, corner-BL, corner-BR, edge-top, edge-right, edge-bottom, edge-left ],
  "surfaceFlaws": [ { "severity": "microscopic|visible|obvious", "description": "...", "location": "where on the card" } ],
  "bgs": {
    "overall": <num>, "isBlackLabel": <bool>,
    "centering": <num 7.0-10.0 — your visual estimate, user may override>,
    "corners": <num — overridden by software>, "edges": <num — overridden>, "surface": <num — overridden>
  },
  "positives": ["up to 3 specific positives"],
  "negatives": ["up to 3 confirmed flaws from zones / surfaceFlaws (centering OK if it's actually off)"],
  "defects": [{ "label": "2-3 words", "description": "One sentence.", "confidence": <80-100>, "x": <0-1>, "y": <0-1> }],
  "verdict": "2-3 sentences. Cite specific zones with flaws or confirm card is clean.",
  "popData": {
    "psa": { "total": <int>, "gemRate": <pct>, "distribution": [{"grade":10,"label":"GEM MT","count":<int>},{"grade":9,"label":"MINT","count":<int>},{"grade":8,"label":"NM-MT","count":<int>},{"grade":7,"label":"NM","count":<int>},{"grade":6,"label":"EX-MT","count":<int>},{"grade":5,"label":"EX","count":<int>}] },
    "bgs": { "total": <int>, "gemRate": <pct>, "distribution": [{"grade":"BL","label":"Black Label","count":<int>},{"grade":10,"label":"Pristine","count":<int>},{"grade":9.5,"label":"Gem Mint","count":<int>},{"grade":9,"label":"Mint","count":<int>},{"grade":8.5,"label":"NM-MT+","count":<int>},{"grade":8,"label":"NM-MT","count":<int>},{"grade":7.5,"label":"NM+","count":<int>},{"grade":7,"label":"NM","count":<int>}] }
  },
  "market": {
    "raw": <USD>, "graded": { "psa7":<USD>,"psa8":<USD>,"psa9":<USD>,"psa10":<USD>,"bgs7":<USD>,"bgs8":<USD>,"bgs9":<USD>,"bgs9_5":<USD>,"bgs10":<USD>,"bgsBlackLabel":<USD> },
    "trend": "rising|stable|falling", "trendPercent": <num>, "aiAnalysis": "2-3 sentences."
  },
  "submission": {
    "psaRecommended": <bool>, "bgsRecommended": <bool>,
    "psaTier": "Value|Regular|Express|Super Express|Walk-Through|Premium", "bgsTier": "Standard|Express|Fast Track|Walk-Through",
    "psaCost": <USD>, "bgsCost": <USD>, "psaExpectedGrade": <num>, "bgsExpectedGrade": <num>,
    "psaExpectedValue": <USD>, "bgsExpectedValue": <USD>, "psaRoi": <num>, "bgsRoi": <num>,
    "analysis": "2-3 sentences with dollar math."
  }
}`;

function categoryGrade(severities) {
  if (severities.length === 0) return 10.0;
  const n = severities.length;
  const obviousCount = severities.filter(s => s === 'obvious').length;
  const worst = obviousCount > 0 ? 'obvious'
              : severities.includes('visible') ? 'visible'
              : 'microscopic';
  if (worst === 'microscopic') return n >= 2 ? 9.0 : 9.5;
  if (worst === 'visible')     return n >= 3 ? 7.5 : n >= 2 ? 8.0 : 8.5;
  if (obviousCount >= 4) return 2.0;
  if (obviousCount >= 3) return 3.5;
  if (obviousCount >= 2) return 5.0;
  return 7.0;
}

// Edges are graded harsher than corners/surface. A single visible chip or nick
// on an edge is a hard PSA 8 ceiling — there's no partial credit.
function edgeCategoryGrade(severities) {
  if (severities.length === 0) return 10.0;
  const n = severities.length;
  const obviousCount = severities.filter(s => s === 'obvious').length;
  const worst = obviousCount > 0 ? 'obvious'
              : severities.includes('visible') ? 'visible'
              : 'microscopic';
  if (worst === 'microscopic') return n >= 3 ? 8.5 : n >= 2 ? 9.0 : 9.5;
  if (worst === 'visible')     return n >= 3 ? 7.0 : n >= 2 ? 7.5 : 8.0;
  if (obviousCount >= 3) return 3.0;
  if (obviousCount >= 2) return 4.5;
  return 6.0;
}

function computeSubgradesFromVerifications(verifications) {
  const corners = [], edges = [], surface = [];
  for (const v of verifications ?? []) {
    if (v.cleared) continue;
    const sev = v.severity ?? inferSeverity(v.reason ?? '');
    if (CORNER_IDS.has(v.id))  corners.push(sev);
    else if (SURFACE_IDS.has(v.id)) surface.push(sev);
    else edges.push(sev);
  }
  return {
    corners:  categoryGrade(corners),
    edges:    categoryGrade(edges),
    surface:  categoryGrade(surface),
    _debug: { corners, edges, surface },
  };
}

const PSA_LABELS = { 10: 'GEM MT', 9: 'MINT', 8: 'NM-MT', 7: 'NM', 6: 'EX-MT', 5: 'EX', 4: 'VG-EX', 3: 'VG', 2: 'GOOD', 1: 'PR' };

// Second-pass zone review: re-examine only the flagged zones with fresh eyes.
// Fires when PSA 7–9 or any zone was marked microscopic (both are uncertain territory).
// Only sends the flagged zone crops — cheap call, just revises severity.
async function doSecondPassReview(parsedResult, zoneCrops, backZoneCrops, model) {
  const flaggedZones = (parsedResult.zones ?? []).filter(z => z.severity);
  if (!flaggedZones.length) return parsedResult;

  const content = [];
  for (const z of flaggedZones) {
    const front = zoneCrops?.[z.zone];
    const back  = backZoneCrops?.[z.zone];
    content.push({ type: 'text', text: `Zone: ${z.zone} | Initial call: ${z.severity} | Observation: "${z.observation}"` });
    if (front) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: front } });
    if (back)  content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: back } });
  }

  content.push({ type: 'text', text: `Second-opinion review. For each zone above, look at the crop carefully and re-assess severity.

Rules:
- microscopic = barely detectable even in this magnified crop; no clear color break
- visible     = you can clearly see and describe the defect in the crop
- obvious     = immediately apparent without looking closely
- null        = on re-examination the zone actually looks clean

If you initially called something microscopic but can clearly see it → upgrade to visible.
If you initially called something visible but it genuinely looks fine → downgrade to null.
Do not just confirm your first answer. Look again.

Return ONLY a JSON array, no prose:
[{"zone":"<id>","severity":"microscopic"|"visible"|"obvious"|null,"observation":"one sentence what you see"}]` });

  try {
    const msg = await anthropic.messages.create({
      model, max_tokens: 600,
      messages: [{ role: 'user', content }],
    });
    const raw = msg.content.find(b => b.type === 'text')?.text ?? '';
    const m = raw.match(/\[[\s\S]*\]/);
    if (!m) return parsedResult;
    const revisions = JSON.parse(m[0]);

    const updatedZones = (parsedResult.zones ?? []).map(z => {
      const rev = revisions.find(r => r.zone === z.zone);
      if (!rev || rev.severity === z.severity) return z;
      console.log(`2nd pass: ${z.zone} ${z.severity} → ${rev.severity ?? 'null'}`);
      return { ...z, severity: rev.severity ?? null, psa10Match: rev.severity ? 'differs' : 'matches', observation: rev.observation || z.observation, description: rev.severity ? (z.description || rev.observation) : null };
    });

    const cornerSevs = updatedZones.filter(z => z?.zone?.startsWith('corner') && z?.severity).map(z => z.severity);
    const edgeSevs   = updatedZones.filter(z => z?.zone?.startsWith('edge')   && z?.severity).map(z => z.severity);
    const surfaceSevs = (parsedResult.surfaceFlaws ?? []).map(f => f?.severity).filter(Boolean);

    const corners = categoryGrade(cornerSevs);
    const edges   = edgeCategoryGrade(edgeSevs);
    const surface = categoryGrade(surfaceSevs);

    const c = typeof parsedResult.bgs?.centering === 'number' ? parsedResult.bgs.centering : null;
    const subs = c != null ? [c, corners, edges, surface] : [corners, edges, surface];
    const avg = subs.reduce((a, b) => a + b, 0) / subs.length;
    const rounded = Math.round(avg * 2) / 2;
    const lowest  = Math.min(...subs);
    const overall = Math.min(rounded, lowest + 0.5);
    const isBlackLabel = subs.length === 4 && subs.every(v => v === 10.0);

    const psaWeakest = Math.min(corners, edges, surface);
    const psaCap = psaWeakest >= 9.5 ? 10 : psaWeakest >= 9.0 ? 9 : psaWeakest >= 8.0 ? 8 : psaWeakest >= 7.0 ? 7 : psaWeakest >= 6.0 ? 6 : 5;
    const psaGrade = Math.max(1, Math.min(psaCap, Math.round(avg)));

    console.log(`2nd pass result: PSA ${parsedResult.psa?.grade} → ${psaGrade}, BGS ${parsedResult.bgs?.overall} → ${overall}`);
    return {
      ...parsedResult,
      zones: updatedZones,
      bgs: { ...parsedResult.bgs, corners, edges, surface, overall, isBlackLabel },
      psa: { grade: psaGrade, label: PSA_LABELS[psaGrade] || '' },
    };
  } catch (err) {
    console.warn('Second pass failed:', err.message);
    return parsedResult;
  }
}

const VAGUE_CENTERING_RE = [
  /slight\w*\s+(?:centering|off-?cent\w*)[^.!?]*/gi,
  /(?:centering\s+)?(?:concern|imbalance|issue|problem|deviation|variance)\s*(?:with\s+centering)?[^.!?]*/gi,
  /marginal\s+centering[^.!?]*/gi,
  /(?:a\s+)?(?:bit|little|touch|tad|minor|minor\s+)?(?:off-?cent\w*|miscent\w*)[^.!?]*/gi,
  /centering\s+appears?\s+(?:slightly|marginally|somewhat|a\s+(?:bit|little))\w*[^.!?]*/gi,
];

function cleanVagueCentering(str, worstAxisRatio) {
  let out = str;
  const replacement = worstAxisRatio
    ? `centering measures ${worstAxisRatio}`
    : 'centering within tolerance';
  for (const re of VAGUE_CENTERING_RE) out = out.replace(re, replacement);
  return out;
}

function psaCenteringGradeFromWorst(worst) {
  if (worst <= 55) return 'PSA 10';
  if (worst <= 60) return 'PSA 9';
  if (worst <= 65) return 'PSA 8';
  return 'PSA 7';
}

function bgsCenteringFromWorst(worst) {
  if (worst <= 52) return 10.0;
  if (worst <= 55) return 9.5;
  if (worst <= 60) return 9.0;
  if (worst <= 65) return 8.5;
  if (worst <= 70) return 8.0;
  return 7.5;
}

function sanitizeGradingResponse(rawText, measuredCentering) {
  let parsed;
  try { parsed = JSON.parse(rawText); } catch {
    const m = rawText.match(/\{[\s\S]*\}/);
    if (!m) return rawText;
    try { parsed = JSON.parse(m[0]); } catch { return rawText; }
  }

  if (!parsed || parsed.needsClarification) return JSON.stringify(parsed);

  // strip chain-of-thought, log for debugging
  if (parsed.physicalNotes) {
    console.log('Physical notes:', parsed.physicalNotes);
    delete parsed.physicalNotes;
  }

  // Override AI centering estimate with pixel-measured value if available
  if (measuredCentering && parsed.bgs) {
    const lr = Math.max(measuredCentering.leftPct ?? 50, measuredCentering.rightPct ?? 50);
    const tb = Math.max(measuredCentering.topPct ?? 50, measuredCentering.bottomPct ?? 50);
    const worst = Math.max(lr, tb);
    const bgsVal = bgsCenteringFromWorst(worst);
    console.log(`Centering override: ${measuredCentering.leftPct}/${measuredCentering.rightPct} L-R, ${measuredCentering.topPct}/${measuredCentering.bottomPct} T-B → BGS ${bgsVal} (AI estimated ${parsed.bgs.centering})`);
    parsed.bgs.centering = bgsVal;
  }

  // compute subgrades from zones (forced 8) + surfaceFlaws — always overrides Claude's estimates
  {
    const zones = Array.isArray(parsed.zones) ? parsed.zones : [];
    const cornerSevs = zones.filter(z => z?.zone?.startsWith('corner') && z?.severity).map(z => z.severity);
    const edgeSevs   = zones.filter(z => z?.zone?.startsWith('edge')   && z?.severity).map(z => z.severity);
    const surfaceSevs = (Array.isArray(parsed.surfaceFlaws) ? parsed.surfaceFlaws : [])
      .map(f => f?.severity).filter(Boolean);

    const allSevs = [...cornerSevs, ...edgeSevs, ...surfaceSevs];
    const totalObvious = allSevs.filter(s => s === 'obvious').length;
    const totalVisible = allSevs.filter(s => s === 'visible').length;
    console.log(`Zones reported: ${zones.length}/8 — corners flagged ${cornerSevs.length}(${cornerSevs.join(',')}), edges flagged ${edgeSevs.length}(${edgeSevs.join(',')}), surface flaws ${surfaceSevs.length}(${surfaceSevs.join(',')}) — totalObvious=${totalObvious} totalVisible=${totalVisible}`);

    if (parsed.bgs) {
      console.log(`AI grades: corners=${parsed.bgs.corners} edges=${parsed.bgs.edges} surface=${parsed.bgs.surface}`);
      parsed.bgs.corners = categoryGrade(cornerSevs);
      parsed.bgs.edges   = edgeCategoryGrade(edgeSevs);
      parsed.bgs.surface = categoryGrade(surfaceSevs);
      console.log(`Computed:  corners=${parsed.bgs.corners} edges=${parsed.bgs.edges} surface=${parsed.bgs.surface}`);
    }

    // Hard cap on PSA grade based on total obvious flaws across all zones.
    // Prevents averaging masking widespread catastrophic damage (e.g. PSA 2 vintage).
    parsed._totalObvious = totalObvious;
    parsed._totalVisible = totalVisible;
  }

  // Strip the legacy centeringMeasured field
  delete parsed.centeringMeasured;

  // Compute BGS overall and PSA grade from whichever subgrades are present.
  // Centering is AI's initial estimate; user may override client-side which triggers a recompute.
  if (parsed.bgs) {
    const c = typeof parsed.bgs.centering === 'number' ? parsed.bgs.centering : null;
    const { corners, edges, surface } = parsed.bgs;
    const fixed = [corners, edges, surface].filter(v => typeof v === 'number');
    const subs = c != null ? [c, ...fixed] : fixed;

    if (subs.length >= 3) {
      const avg = subs.reduce((a, b) => a + b, 0) / subs.length;

      // BGS overall: avg rounded to 0.5, capped at lowest + 0.5 (BGS rule)
      const rounded = Math.round(avg * 2) / 2;
      const lowest = Math.min(...subs);
      parsed.bgs.overall = Math.min(rounded, lowest + 0.5);
      parsed.bgs.isBlackLabel = subs.length === 4 && subs.every(v => v === 10.0);

      // PSA: round of average, then cap by weakest non-centering subgrade.
      // Averaging alone masks damage — a single bad edge with perfect corners/surface
      // still averages high. PSA graders don't average; they cap on the worst zone.
      let psaGrade = Math.max(1, Math.min(10, Math.round(avg)));
      const psaWeakest = Math.min(
        typeof corners === 'number' ? corners : 10,
        typeof edges   === 'number' ? edges   : 10,
        typeof surface === 'number' ? surface : 10,
      );
      const psaCapFromWeakest =
        psaWeakest >= 9.5 ? 10 :
        psaWeakest >= 9.0 ?  9 :
        psaWeakest >= 8.0 ?  8 :
        psaWeakest >= 7.0 ?  7 :
        psaWeakest >= 6.0 ?  6 : 5;
      psaGrade = Math.min(psaGrade, psaCapFromWeakest);

      // Secondary cap: widespread obvious flaws (e.g. PSA 2 vintage with damage everywhere)
      const totalObvious = parsed._totalObvious ?? 0;
      const totalVisible = parsed._totalVisible ?? 0;
      if      (totalObvious >= 8) psaGrade = Math.min(psaGrade, 1);
      else if (totalObvious >= 6) psaGrade = Math.min(psaGrade, 2);
      else if (totalObvious >= 4) psaGrade = Math.min(psaGrade, 3);
      else if (totalObvious >= 2 && totalVisible >= 3) psaGrade = Math.min(psaGrade, 4);
      else if (totalObvious >= 2) psaGrade = Math.min(psaGrade, 5);
      delete parsed._totalObvious; delete parsed._totalVisible;

      if (!parsed.psa) parsed.psa = {};
      console.log(`Subgrades [${subs.join(',')}] avg=${avg.toFixed(2)} totalObvious=${totalObvious} → BGS ${parsed.bgs.overall}, PSA ${psaGrade}`);
      parsed.psa.grade = psaGrade;
      parsed.psa.label = PSA_LABELS[psaGrade] || '';

      // Force submission expected grades to match computed grades so both tabs agree
      if (parsed.submission) {
        parsed.submission.psaExpectedGrade = psaGrade;
        parsed.submission.bgsExpectedGrade = parsed.bgs.overall;
      }
    }
  }

  // filter defects: remove low-confidence ones and obvious printed-element false positives
  if (Array.isArray(parsed.defects)) {
    const PRINT_ELEMENTS = /\b(colon|period|comma|apostrophe|semicolon|dot|asterisk|bullet|dash|hyphen|text|letter|number|digit|logo|trademark|copyright|symbol|punctuation|printed|design|border|background)\b/i;
    parsed.defects = parsed.defects.filter(d => {
      if ((d.confidence ?? 100) < 80) return false;
      if (PRINT_ELEMENTS.test(d.label) || PRINT_ELEMENTS.test(d.description)) return false;
      return true;
    });
  }

  // strip centering mentions — user handles centering
  if (Array.isArray(parsed.negatives)) {
    parsed.negatives = parsed.negatives.filter(n => !/center/i.test(n));
  }
  if (Array.isArray(parsed.positives)) {
    parsed.positives = parsed.positives.filter(p => !/center/i.test(p));
  }

  if (parsed.verdict) {
    // remove sentences that mention centering
    parsed.verdict = parsed.verdict
      .split(/(?<=[.!?])\s+/)
      .filter(s => !/center/i.test(s))
      .join(' ')
      .trim();
  }

  return JSON.stringify(parsed);
}

// ── User plan endpoint ────────────────────────────────────────────────────────
app.get('/api/user/plan', async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  if (!supabaseAdmin) return res.status(503).json({ error: 'Auth not configured' });
  try {
    const plan = await getUserPlan(user.id);
    res.json({ plan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Stripe checkout (one-time token purchase) ─────────────────────────────────
app.post('/api/checkout', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Payments not configured yet' });
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in to buy tokens' });
  const { packId } = req.body;
  const pack = TOKEN_PACKS[packId];
  if (!pack) return res.status(400).json({ error: 'Invalid token pack' });
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: pack.cents,
          product_data: { name: pack.name, description: `${pack.tokens} grading tokens` },
        },
        quantity: 1,
      }],
      success_url: `${APP_URL}?checkout=success`,
      cancel_url: `${APP_URL}?checkout=canceled`,
      client_reference_id: user.id,
      metadata: { user_id: user.id, pack_id: packId, tokens: String(pack.tokens) },
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});


app.post('/api/fetch-listing', async (req, res) => {
  let { url } = req.body;
  if (!url?.trim()) return res.status(400).json({ error: 'URL required' });
  url = url.trim();

  if (!url.includes('ebay.com') && !url.includes('ebay.us')) {
    return res.status(400).json({ error: 'Only eBay listing URLs are supported right now' });
  }

  // Follow redirects for shortened URLs like ebay.us/m/...
  if (!url.includes('/itm/')) {
    try {
      const r = await fetchWithTimeout(url, { redirect: 'follow' }, 6000);
      if (r.url) url = r.url;
    } catch {}
  }

  const ebayMatch = url.match(/\/itm\/(?:[^/?#]+\/)?(\d{8,15})/);
  if (!ebayMatch) return res.status(400).json({ error: 'Could not find the listing ID — try copying the URL directly from the eBay listing page' });

  const itemId = ebayMatch[1];
  const token = await getEbayToken();
  if (!token) return res.status(503).json({ error: 'eBay not configured' });

  try {
    const itemRes = await fetchWithTimeout(
      `https://api.ebay.com/buy/browse/v1/item/v1|${itemId}|0`,
      { headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' } },
      8000
    );
    if (!itemRes.ok) {
      const errText = await itemRes.text().catch(() => '');
      console.error(`eBay API ${itemRes.status} for item ${itemId}: ${errText.slice(0, 300)}`);
      return res.status(404).json({ error: `Listing not found or unavailable (eBay ${itemRes.status})` });
    }
    const item = await itemRes.json();
    if (!item.itemId) {
      console.error(`eBay no itemId for ${itemId}:`, JSON.stringify(item).slice(0, 300));
      return res.status(404).json({ error: 'Listing not found or has ended' });
    }

    const allUrls = [
      item.image?.imageUrl,
      ...(item.additionalImages ?? []).map(i => i.imageUrl),
    ].filter(Boolean).slice(0, 8);
    if (!allUrls.length) return res.status(404).json({ error: 'No image found in this listing' });

    const downloaded = await Promise.all(allUrls.map(u => urlToBase64(u).catch(() => null)));
    const images = downloaded.filter(Boolean);
    if (!images.length) return res.status(502).json({ error: 'Could not download listing images' });

    console.log(`Fetch listing: ${itemId} — ${images.length} image(s) — "${item.title?.slice(0, 60)}"`);
    res.json({ images, title: item.title ?? '' });
  } catch (err) {
    console.error('Fetch listing error:', err.message);
    res.status(502).json({ error: 'Could not fetch listing. Make sure it\'s a valid eBay item URL.' });
  }
});

app.post('/api/search', async (req, res) => {
  const { images, query } = req.body;
  if (!query?.trim()) return res.status(400).json({ error: 'Query is required' });

  const imageList = Array.isArray(images) ? images : [];
  try {
    const imageContent = imageList.slice(0, 4).map(data => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data },
    }));

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: [
          ...imageContent,
          { type: 'text', text: `The user describes this card as: "${query.trim()}"

Use both the image(s) and the user's description to identify the most specific matching cards. If the back of the card is shown, read the year directly from it.

Return ONLY a JSON object:
{
  "candidates": [
    {
      "player": "Full player name",
      "year": "Year",
      "set": "Set name",
      "variant": "exact variant — e.g. Base, Silver Prizm, White Prizm, Rookie, Auto, etc.",
      "cardNumber": "Card number or null",
      "description": "One sentence distinguishing this from the other candidates"
    }
  ]
}

Rules:
- Return 1–4 candidates. Most likely match first.
- VARIANT IS CRITICAL: if the user says "Prizm" but doesn't specify the parallel, list Base Prizm and Silver Prizm as SEPARATE candidates — never combine them.
- NEVER use "or" in the variant field. NEVER write "Silver or Base", "Downtown or Base", etc. Each candidate must have exactly one specific variant. If unsure between two, make two entries.
- If you are certain from the description and images, return only 1 candidate.
- Never guess at variants you cannot confirm.` }
        ],
      }],
    });

    const text = msg.content.find(b => b.type === 'text')?.text ?? '';
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    console.log(`Search "${query}": ${parsed.candidates?.length ?? 0} candidates`);
    res.json({ candidates: parsed.candidates ?? [] });
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(502).json({ error: 'Search failed. Please try again.' });
  }
});

app.post('/api/identify', async (req, res) => {
  const { images, imageData, mediaType = 'image/jpeg', listingTitle } = req.body;
  const imageList = images || (imageData ? [imageData] : null);
  if (!imageList?.length) return res.status(400).json({ error: 'At least one image is required' });

  try {
    const imageContent = imageList.map(data => ({
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data },
    }));

    const listingHint = listingTitle
      ? `The eBay listing title for this card is: "${listingTitle}"\nThis title is authoritative — extract player, year, set, and variant directly from it. Set confidence to 98. Only create multiple candidates if the title is genuinely ambiguous between parallel variants.\n\n`
      : '';

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: [
          ...imageContent,
          { type: 'text', text: `${listingHint}Identify this sports card. Return ONLY a JSON object with no extra text:
{
  "confidence": <integer 0-100 — how certain you are. 98+ = certain of player, year, set AND exact variant. Under 98 = any doubt at all>,
  "candidates": [
    {
      "player": "Full player name",
      "year": "Year",
      "set": "Set name",
      "variant": "exact variant name — e.g. Base, Silver Prizm, White Prizm, Blue Wave, Mosaic Base, etc.",
      "cardNumber": "Card number or null",
      "description": "One sentence distinguishing this from the other candidates"
    }
  ]
}

RULES:
- YEAR: Look at the back of the card first — the year is almost always printed there explicitly. Use what you read, do not guess from the front design.
- List 1–4 candidates in order of likelihood.
- VARIANT ACCURACY IS CRITICAL: A Prizm base card, Silver Prizm, and White Prizm are DIFFERENT cards with very different values. Each possibility must be its own separate candidate entry.
- NEVER use "or" in the variant field (e.g. NEVER write "Silver or Base", "Downtown or Base", "Silver Prizm or Base Prizm"). If you are unsure between two variants, create TWO separate candidates — one for each.
- Each candidate must have exactly one specific variant. One card per entry, always.
- Set confidence to 98+ ONLY when you are certain of the exact variant, not just the player and set.
- If there is any chance the card is a parallel (silver, white, gold, blue, etc.) rather than the base version, list both as separate candidates.
- Never assume base — always consider that it could be a more valuable parallel.` }
        ],
      }],
    });

    const text = msg.content.find(b => b.type === 'text')?.text ?? '';
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    const candidates = parsed.candidates ?? [];

    // Downtown and Color Blast inserts are visually indistinguishable from base cards
    // in photos. Always inject them as selectable options for modern cards so the user
    // can pick the correct variant even when the AI can't tell from the image.
    const first = candidates[0];
    if (first && parseInt(first.year) >= 2017) {
      const existingVariants = candidates.map(c => (c.variant ?? '').toLowerCase());
      const { player, year, set, cardNumber } = first;
      // Downtown looks nearly identical to base in photos — always offer it as an option.
      // Stained Glass has a visually distinctive design; only offer it if AI didn't already identify it.
      if (!existingVariants.some(v => v.includes('downtown'))) {
        candidates.push({ player, year, set, cardNumber, variant: 'Downtown', description: 'Downtown insert — nearly identical to base in photos, confirm from card back' });
      }
    }

    console.log(`Identify: confidence=${parsed.confidence}, candidates=${candidates.length}`);
    res.json({ candidates, confidence: parsed.confidence ?? 80 });
  } catch (err) {
    console.error('Identify error:', err.message);
    res.status(502).json({ error: 'Could not identify card. Please try again.' });
  }
});

app.post('/api/grade', async (req, res) => {
  const { images, imageData, mediaType = 'image/jpeg', confirmedCard, zoneCrops, backZoneCrops, measuredCentering } = req.body;

  // ── Auth + plan check ──────────────────────────────────────────────────────
  let gradingModel = 'claude-opus-4-7';
  let planRow = null;
  let tokenCost = 1;
  const user = await getUser(req);

  if (user && supabaseAdmin) {
    planRow = await getUserPlan(user.id);
    if (!planRow) return res.status(500).json({ error: 'Could not load user plan' });

    // All paid grades use Opus for best accuracy
    gradingModel = 'claude-opus-4-7';
    tokenCost = TOKEN_COST[gradingModel] ?? 1;

    if (planRow.grades_used + tokenCost > planRow.grade_limit) {
      return res.status(403).json({
        error: 'You\'ve used all your tokens for this period.',
        code: 'GRADE_LIMIT_REACHED',
        plan: planRow.plan,
        limit: planRow.grade_limit,
      });
    }
  }

  const imageList = images || (imageData ? [imageData] : null);

  if (!imageList || imageList.length === 0) {
    return res.status(400).json({ error: 'At least one image is required' });
  }
  if (imageList.length > 10) {
    return res.status(400).json({ error: 'Maximum 10 images allowed' });
  }

  try {
    const userImages = imageList.map(data => ({
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data },
    }));

    // fetch eBay PSA 10 reference image(s) for the confirmed card
    const refImages = [];
    if (confirmedCard?.player) {
      const refs = await fetchEbayReferenceImages(
        confirmedCard.player, confirmedCard.year, confirmedCard.set, confirmedCard.variant
      );
      if (refs.graded.length > 0) {
        refImages.push({ type: 'text', text: `=== PSA 10 GEM MINT REFERENCE — your ground truth for what this exact card looks like in perfect condition. Compare every zone to this. ===` });
        refs.graded.forEach(r => refImages.push({ type: 'image', source: { type: 'base64', media_type: r.mediaType, data: r.data } }));
      }
      if (refs.raw.length > 0) {
        refImages.push({ type: 'text', text: `=== Additional raw/ungraded copies (for design context — confirms what foil/holo patterns look like normally) ===` });
        refs.raw.forEach(r => refImages.push({ type: 'image', source: { type: 'base64', media_type: r.mediaType, data: r.data } }));
      }
      console.log(`eBay refs: ${refs.graded.length} PSA 10 + ${refs.raw.length} raw for ${confirmedCard.player}`);
    }

    // Build labeled zoom-in zone images (4 corners + 4 edges of front, then back)
    const ZONE_ORDER = ['corner-TL', 'corner-TR', 'corner-BL', 'corner-BR', 'edge-top', 'edge-right', 'edge-bottom', 'edge-left'];
    const zoneImages = [];
    if (zoneCrops && typeof zoneCrops === 'object') {
      for (const zone of ZONE_ORDER) {
        if (zoneCrops[zone]) {
          zoneImages.push({ type: 'text', text: `=== ZOOM-IN FRONT: ${zone} ===` });
          zoneImages.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: zoneCrops[zone] } });
        }
      }
    }
    if (backZoneCrops && typeof backZoneCrops === 'object') {
      for (const zone of ZONE_ORDER) {
        if (backZoneCrops[zone]) {
          zoneImages.push({ type: 'text', text: `=== ZOOM-IN BACK: ${zone} ===` });
          zoneImages.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: backZoneCrops[zone] } });
        }
      }
    }
    console.log(`Zone crops: ${zoneCrops ? 8 : 0} front + ${backZoneCrops ? 8 : 0} back`);

    const variantLowerForPrompt = (confirmedCard?.variant ?? '').toLowerCase();
    const isOversizedProneCard = OVERSIZED_PRONE_VARIANTS.some(v => variantLowerForPrompt.includes(v));
    const oversizedNote = isOversizedProneCard
      ? ` CRITICAL — this is the STANDARD 2.5×3.5 inch trading card, NOT the oversized 5×7 version. These variants exist in both sizes; the 5×7 sells for a fraction of the price. All market values must reflect the standard size only. PSA also grades the oversized version — do not anchor on any graded or raw prices you associate with the cheap oversized format.`
      : '';

    const cardYear = parseInt(confirmedCard?.year) || 0;
    const isVintage = cardYear > 0 && cardYear < 1980;
    const vintageNote = isVintage
      ? ` VINTAGE GRADING RULES (pre-1980 card — apply these without exception):
  - Do NOT rely on the PSA 10 reference for this card. Grade each zone independently based on physical condition.
  - ANY crease = automatic PSA 4 or below. Multiple or deep creases = PSA 1-2. Flag as "obvious" severity.
  - Rounded corner tips (worn to a curve, no sharp point) = severity "obvious" on EVERY affected corner. Most vintage cards have all 4 corners rounded.
  - Edge chips, fraying, rough texture = severity "obvious" on every affected edge.
  - Paper yellowing, toning, foxing, staining, or soiling = surface severity "obvious".
  - Wrinkles or surface creases = surface severity "obvious".
  - DO NOT mark zones as "matches" just because you cannot see a flaw clearly — vintage card photos rarely capture all damage. If the corner looks at all rounded or soft, mark it "differs" with severity "obvious".
  - For a heavily worn card, it is correct and expected to flag ALL 4 corners and ALL 4 edges as "differs" with severity "obvious". That is PSA 1-3 territory and perfectly valid.
  - NEVER grade a visibly worn vintage card higher than PSA 6. Most worn vintage cards are PSA 1-4.`
      : '';

    const centeringNote = measuredCentering
      ? ` CENTERING IS PIXEL-MEASURED — do not estimate it yourself. Set bgs.centering to exactly ${(() => {
          const lr = Math.max(measuredCentering.leftPct ?? 50, measuredCentering.rightPct ?? 50);
          const tb = Math.max(measuredCentering.topPct ?? 50, measuredCentering.bottomPct ?? 50);
          return bgsCenteringFromWorst(Math.max(lr, tb));
        })()}.`
      : '';

    const confirmedPrefix = confirmedCard?.player
      ? `CONFIRMED CARD IDENTITY (selected by the user — do not second-guess this): ${confirmedCard.player}, ${confirmedCard.year} ${confirmedCard.set}, ${confirmedCard.variant || 'Base'}${confirmedCard.cardNumber ? `, #${confirmedCard.cardNumber}` : ''}.${oversizedNote}${vintageNote}${centeringNote} Set needsClarification to false and candidates to []. Provide complete grading and market data for exactly this card.\n\n`
      : centeringNote ? `${centeringNote}\n\n` : '';

    const content = [
      { type: 'text', text: `=== USER'S CARD (full photos) ===` },
      ...userImages,
      ...refImages,
      ...zoneImages,
      { type: 'text', text: confirmedPrefix + GRADING_PROMPT },
    ];

    const message = await anthropic.messages.create({
      model: gradingModel,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    });

    const raw = message.content.find(b => b.type === 'text')?.text ?? '';
    let text = sanitizeGradingResponse(raw, measuredCentering);

    // Second-pass zone review for uncertain grades (PSA 7–9 or any microscopic zone)
    try {
      const firstPass = JSON.parse(text);
      if (!firstPass.needsClarification) {
        const flaggedZones = (firstPass.zones ?? []).filter(z => z.severity);
        const psaGrade = firstPass.psa?.grade ?? 10;
        const hasMicroscopic = flaggedZones.some(z => z.severity === 'microscopic');
        if (flaggedZones.length > 0 && (psaGrade >= 7 && psaGrade <= 9 || hasMicroscopic)) {
          const revised = await doSecondPassReview(firstPass, zoneCrops, backZoneCrops, gradingModel);
          text = JSON.stringify(revised);
        }
      }
    } catch (err) {
      console.warn('Second pass skipped:', err.message);
    }

    // Force the response's card identity to match what the USER picked, not what the AI thinks.
    // This is critical when the user used "Other" search to pick a different variant (e.g. Stained Glass)
    // — the AI might still output base-card identity in its response, polluting downstream logic.
    if (confirmedCard?.player) {
      try {
        const parsed = JSON.parse(text);
        parsed.player = confirmedCard.player;
        parsed.year = confirmedCard.year;
        parsed.set = confirmedCard.set;
        parsed.variant = confirmedCard.variant ?? parsed.variant ?? 'Base';
        parsed.cardNumber = confirmedCard.cardNumber ?? parsed.cardNumber ?? null;
        text = JSON.stringify(parsed);
      } catch {}
    }

    // Decide whether to use eBay comps or trust AI estimate.
    // Vintage (pre-1980): eBay flooded with reprints/customs/lots — trust AI.
    // Oversized-prone variants (Downtown, Stained Glass, etc.): eBay can't distinguish
    //   standard 2.5x3.5 from cheap 5x7 by title alone. Both sizes trade above any
    //   price floor we can set for Mahomes-level cards. Trust AI which knows the market
    //   and receives an explicit standard-size instruction.
    let skipEbay = false;
    let skipReason = '';
    try {
      const preParsed = JSON.parse(text);
      const yearNum = parseInt(confirmedCard?.year, 10) || 0;
      const variantLowerSkip = (confirmedCard?.variant ?? '').toLowerCase();
      if (yearNum > 0 && yearNum < 1980) { skipEbay = true; skipReason = 'vintage'; }
      if (!skipEbay && OVERSIZED_PRONE_VARIANTS.some(v => variantLowerSkip.includes(v))) {
        skipEbay = true; skipReason = 'oversized-prone variant';
      }
      if (skipEbay) {
        if (!preParsed.market) preParsed.market = {};
        preParsed.market.dataSource = `AI estimate (${skipReason} — eBay size contamination)`;
        text = JSON.stringify(preParsed);
        console.log(`Market: skipping eBay scrape (${skipReason})`);
      }
    } catch {}

    // Inject real eBay market data over the AI's estimates (when we have enough comps)
    if (confirmedCard?.player && !skipEbay) {
      try {
        const market = await fetchMarketComps(
          confirmedCard.player, confirmedCard.year, confirmedCard.set, confirmedCard.variant, confirmedCard.cardNumber
        );
        if (market) {
          // Median price × 0.9 (sold-vs-asking discount), with AI-estimate sanity floor
          // to reject oversized/wrong listings that slipped through (commonly < 30% of real value).
          const DISCOUNT = 0.10;
          const parsed = JSON.parse(text);
          if (!parsed.market) parsed.market = {};
          if (!parsed.market.graded) parsed.market.graded = {};

          const realPrice = (m, aiEstimate) => {
            if (!m || !Array.isArray(m.prices) || m.prices.length === 0) return null;
            let prices = [...m.prices].sort((a, b) => a - b);
            // Floor + ceiling relative to AI estimate: rejects oversized/wrong cards at both ends
            if (aiEstimate && aiEstimate > 0) {
              prices = prices.filter(p => p >= aiEstimate * 0.30 && p <= aiEstimate * 3.5);
            }
            if (prices.length < 2) return null;
            const mid = Math.floor(prices.length / 2);
            const median = prices.length % 2 === 0
              ? (prices[mid - 1] + prices[mid]) / 2
              : prices[mid];
            return Math.round(median * (1 - DISCOUNT));
          };

          const TIERS = ['psa7', 'psa8', 'psa9', 'psa10', 'bgs7', 'bgs8', 'bgs9', 'bgs9_5', 'bgs10', 'bgsBlackLabel'];
          for (const tier of TIERS) {
            const aiTierEstimate = Number(parsed.market.graded?.[tier]) || 0;
            const p = realPrice(market[tier], aiTierEstimate);
            if (p) parsed.market.graded[tier] = p;
          }
          const variantForRaw = (confirmedCard.variant ?? '').toLowerCase();
          const isOversizedProne = OVERSIZED_PRONE_VARIANTS.some(v => variantForRaw.includes(v));

          if (isOversizedProne) {
            // Raw eBay listings for these variants are unreliable (5x7 oversized cards).
            // Graded comps (post-$200 floor) are standard-size only. Derive raw mathematically.
            // Standard-size raw trades at ~45% of PSA 10, ~80% of PSA 9, ~90% of PSA 8.
            const psa10 = Number(parsed.market.graded?.psa10) || 0;
            const psa9  = Number(parsed.market.graded?.psa9)  || 0;
            const psa8  = Number(parsed.market.graded?.psa8)  || 0;
            if      (psa10 > 0) parsed.market.raw = Math.round(psa10 * 0.45);
            else if (psa9  > 0) parsed.market.raw = Math.round(psa9  * 0.80);
            else if (psa8  > 0) parsed.market.raw = Math.round(psa8  * 0.90);
            // If no graded comps at all, leave AI estimate but enforce $100 floor
            else if (parsed.market?.raw && Number(parsed.market.raw) < 100) delete parsed.market.raw;
          } else {
            const aiRaw = Number(parsed.market.raw) || 0;
            const rawPrice = realPrice(market.raw, aiRaw);
            if (rawPrice) parsed.market.raw = rawPrice;
          }

          parsed.market.dataSource = 'eBay sold prices (median − 10%, AI-estimate floor+ceiling)';
          parsed.market.sampleSize = market.totalValid;

          // Attach per-tier eBay listing URLs for frontend deep-links
          if (market._urls) {
            if (!parsed.market.gradedUrls) parsed.market.gradedUrls = {};
            for (const tier of TIERS) {
              if (market._urls[tier]) parsed.market.gradedUrls[tier] = market._urls[tier];
            }
            if (market._urls.raw) parsed.market.rawUrl = market._urls.raw;
          }

          text = JSON.stringify(parsed);
        }
      } catch (e) {
        console.warn('Market injection failed:', e.message);
      }
    }

    // For oversized-prone variants, eBay is skipped — derive raw from AI's graded estimates.
    // Standard-size inserts trade at ~55% of PSA 10, ~85% of PSA 9, ~92% of PSA 8.
    if (confirmedCard?.variant) {
      try {
        const variantLower = confirmedCard.variant.toLowerCase();
        if (OVERSIZED_PRONE_VARIANTS.some(v => variantLower.includes(v))) {
          const parsed = JSON.parse(text);
          const psa10 = Number(parsed.market?.graded?.psa10) || 0;
          const psa9  = Number(parsed.market?.graded?.psa9)  || 0;
          const psa8  = Number(parsed.market?.graded?.psa8)  || 0;
          if      (psa10 > 0) parsed.market.raw = Math.round(psa10 * 0.55);
          else if (psa9  > 0) parsed.market.raw = Math.round(psa9  * 0.85);
          else if (psa8  > 0) parsed.market.raw = Math.round(psa8  * 0.92);
          else if (parsed.market?.raw && Number(parsed.market.raw) < 100) delete parsed.market.raw;
          text = JSON.stringify(parsed);
        }
      } catch {}
    }

    // Sync all submission fields to match computed grades and actual market values.
    try {
      const parsed = JSON.parse(text);
      if (parsed.market?.graded && parsed.submission) {
        const s = parsed.submission;
        const g = parsed.market.graded;
        const raw = parsed.market.raw ?? 0;

        const psaTierFor = (v) => {
          if (v < 500)   return { tier: 'Value',         cost: 33   };
          if (v < 1500)  return { tier: 'Regular',       cost: 75   };
          if (v < 2500)  return { tier: 'Express',       cost: 150  };
          if (v < 5000)  return { tier: 'Super Express', cost: 250  };
          if (v < 10000) return { tier: 'Walk-Through',  cost: 600 };
          return                { tier: 'Premium', cost: Math.ceil(v / 25000) * 1000 };
        };
        const bgsTierFor = (v) => {
          if (v < 499)  return { tier: 'Standard',    cost: 25  };
          if (v < 999)  return { tier: 'Express',     cost: 40  };
          if (v < 2000) return { tier: 'Fast Track',  cost: 100 };
          return               { tier: 'Walk-Through', cost: 300 };
        };

        const psaKey = `psa${s.psaExpectedGrade}`;
        if (g[psaKey]) {
          s.psaExpectedValue = g[psaKey];
          const { tier, cost } = psaTierFor(s.psaExpectedValue);
          s.psaTier = tier;
          s.psaCost = cost;
          const profit = s.psaExpectedValue - raw - cost;
          s.psaRoi = raw > 0 ? Math.round((profit / raw) * 100) : 0;
          s.psaRecommended = profit >= 30 && s.psaRoi >= 25;
        }

        let bgsKey;
        if (parsed.bgs?.isBlackLabel) bgsKey = 'bgsBlackLabel';
        else if (s.bgsExpectedGrade === 10)  bgsKey = 'bgs10';
        else if (s.bgsExpectedGrade === 9.5) bgsKey = 'bgs9_5';
        else if (s.bgsExpectedGrade === 9)   bgsKey = 'bgs9';
        else if (s.bgsExpectedGrade === 8)   bgsKey = 'bgs8';
        else if (s.bgsExpectedGrade === 7)   bgsKey = 'bgs7';

        if (bgsKey && g[bgsKey]) {
          s.bgsExpectedValue = g[bgsKey];
          const { tier, cost } = bgsTierFor(s.bgsExpectedValue);
          s.bgsTier = tier;
          s.bgsCost = cost;
          const profit = s.bgsExpectedValue - raw - cost;
          s.bgsRoi = raw > 0 ? Math.round((profit / raw) * 100) : 0;
          s.bgsRecommended = profit >= 30 && s.bgsRoi >= 25;
        }

        text = JSON.stringify(parsed);
      }
    } catch (e) {
      console.warn('Submission sync failed:', e.message);
    }

    // debug
    try {
      const rawParsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
      const outParsed = JSON.parse(text);
      console.log('=== GRADE DEBUG ===');
      console.log('zones:', rawParsed.zones?.length ?? 'MISSING', '| surfaceFlaws:', rawParsed.surfaceFlaws?.length ?? 'MISSING');
      console.log('Final bgs: corners=' + outParsed.bgs?.corners + ' edges=' + outParsed.bgs?.edges + ' surface=' + outParsed.bgs?.surface + ' overall=' + outParsed.bgs?.overall);
      console.log('Final psa: grade=' + outParsed.psa?.grade + ' (' + outParsed.psa?.label + ')');
      console.log('stop_reason:', message.stop_reason);
      console.log('===================');
    } catch (e) { console.log('debug parse error:', e.message); }

    // Deduct tokens for authenticated users
    if (user && planRow && supabaseAdmin) {
      await supabaseAdmin.from('user_plans')
        .update({ grades_used: planRow.grades_used + tokenCost, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      console.log(`Tokens: ${user.id} → ${planRow.grades_used + tokenCost}/${planRow.grade_limit} (${planRow.plan}, ${gradingModel}, -${tokenCost})`);
    }

    res.json({ content: [{ type: 'text', text }] });
  } catch (err) {
    console.error('Anthropic API error:', err.message);
    res.status(502).json({ error: 'Failed to grade card. Please try again.' });
  }
});

// SPA fallback — serve index.html for any non-API route
if (existsSync(distPath)) {
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(join(distPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`CardGradeOrNot server running on http://localhost:${PORT}`);
});
