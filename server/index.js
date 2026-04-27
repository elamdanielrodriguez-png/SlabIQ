import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

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

async function ebaySearch(token, query, limit = 3, excludeGraded = false) {
  const q = encodeURIComponent(query.trim());
  const res = await fetchWithTimeout(
    `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${q}&filter=conditions:{PRE_OWNED}&limit=${limit * 2}&sort=newlyListed`,
    { headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' } },
    5000
  );
  const data = await res.json();
  let items = data.itemSummaries ?? [];
  if (excludeGraded) {
    items = items.filter(item => !/\b(PSA|BGS|SGC|CGC|Beckett|graded|slab)\b/i.test(item.title ?? ''));
  }
  return items.slice(0, limit).map(item => item.image?.imageUrl).filter(Boolean);
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

// Fetch active eBay listings for the card across grade tiers, then have Haiku bucket and average them.
// Note: Browse API returns CURRENT ACTIVE listings, not sold prices. Real sold data would need
// Marketplace Insights API access (separate eBay approval). Active asking ≈ close proxy for sold.
async function ebayListingSearch(token, query, limit = 25) {
  const q = encodeURIComponent(query.trim());
  try {
    const res = await fetchWithTimeout(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${q}&limit=${limit}&sort=newlyListed`,
      { headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' } },
      8000
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.itemSummaries ?? [])
      .map(item => ({
        title: item.title ?? '',
        price: parseFloat(item.price?.value ?? 0),
        url: item.itemWebUrl ?? '',
      }))
      .filter(l => l.price > 0 && l.title);
  } catch (e) {
    return [];
  }
}

async function fetchMarketComps(player, year, set, variant, cardNumber) {
  const token = await getEbayToken();
  if (!token) return null;

  const baseParts = [year, set, player, variant, cardNumber ? `#${cardNumber}` : ''].filter(Boolean);
  const base = baseParts.join(' ');

  const [rawList, psaList, bgsList] = await Promise.all([
    ebayListingSearch(token, `${base}`, 25),
    ebayListingSearch(token, `${base} PSA`, 25),
    ebayListingSearch(token, `${base} BGS`, 25),
  ]);

  const seen = new Set();
  const unique = [...rawList, ...psaList, ...bgsList].filter(l => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });

  console.log(`Market comps: pulled ${unique.length} unique active listings for ${player}`);
  if (unique.length === 0) return null;

  const prompt = `Target card: ${player}, ${year} ${set}${variant ? ', ' + variant : ''}${cardNumber ? ', #' + cardNumber : ''}.

Below are eBay active listings. Bucket each VALID one into a tier and return its price.

Tiers: raw (no grade), psa7, psa8, psa9, psa10, bgs7, bgs8, bgs9, bgs9_5, bgs10, bgsBlackLabel (BGS Black Label / BGS Pristine)

EXCLUSION — BE AGGRESSIVE. WHEN IN DOUBT, EXCLUDE.

A listing is INVALID if ANY of these apply:
1. Different player, year, or set than the target
2. Different variant — Base, Silver Prizm, Gold, Refractor, Wave, Mosaic Pink, Auto, etc. are DIFFERENT cards. Match must be exact.
3. Different card number (when target specifies one)
4. Lot or multi-card listing — title mentions: "lot", "x2", "x3", "(2)", "(3)", multiple player names, "bundle", "set break", "complete set", "20 cards", "all", etc.
5. NOT a standard 2.5x3.5 inch trading card — exclude ANY mention of: "jumbo", "5x7", "5 x 7", "8x10", "blanket", "manu", "manupatch", "manufactured patch", "promo", "magnet", "oversized", "box topper", "topper", "mini", "micro", "stickers", "decal", "poster", "wall art", "bobblehead", "figure", "coin", "patch card" (when it implies oversized). When in doubt about size, EXCLUDE.

   CRITICAL — these specific inserts ALMOST ALWAYS have oversized 5x7 versions and sellers frequently HIDE the size in the title or description: "Stained Glass", "Downtown", "Color Blast", "Sparkle", "Dynagon", "Light It Up", "Magic Numbers", "Pulsar", "Stargazer". For ANY card matching one of these inserts: EXCLUDE the listing unless the title EXPLICITLY confirms standard size (e.g. says "base size", "2.5x3.5", "regular size") OR is suspiciously priced ABOVE the typical oversized range ($100+ usually means standard). When in doubt for these inserts, EXCLUDE.
6. Sealed product / pack / box, not a single card — "pack", "box", "case", "hot pack", "blaster", "hobby box", "mega", "factory sealed", "wax", "FOTL"
7. Damaged / altered / fake — "altered", "trimmed", "creased", "crease", "ding", "bent", "torn", "stain", "miscut", "reprint", "custom", "proxy", "replica", "novelty", "art card"
8. Auto/autograph variant when target is base (or vice versa) — autographs are a different card
9. Suspicious price for the grade (e.g. modern PSA 10 rookie listed under $5 — almost always a lot, wrong card, or scam)
10. Grade unclear from title (just says "graded" with no company/number)

Listings:
${unique.map((l, i) => `${i + 1}. "${l.title.slice(0, 140)}" — $${l.price.toFixed(2)}`).join('\n')}

For each tier with at least 1 valid listing, return ALL valid prices sorted ascending. Omit tiers with zero valid listings.

Return ONLY this JSON:
{
  "raw":           { "prices": [<sorted asc>], "count": <int> },
  "psa9":          { "prices": [<sorted asc>], "count": <int> },
  "psa10":         { "prices": [<sorted asc>], "count": <int> },
  "bgs9_5":        { "prices": [<sorted asc>], "count": <int> },
  "bgs10":         { "prices": [<sorted asc>], "count": <int> },
  "bgsBlackLabel": { "prices": [<sorted asc>], "count": <int> },
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
    return parsed;
  } catch (err) {
    console.warn('Market comp parsing failed:', err.message);
    return null;
  }
}

async function fetchEbayReferenceImages(player, year, set, variant) {
  try {
    const token = await getEbayToken();
    if (!token) return { raw: [], graded: [] };

    const base = `${player} ${year} ${set} ${variant ?? ''}`;

    const [rawUrls, gradedUrls] = await Promise.all([
      ebaySearch(token, `${base} raw ungraded`, 2, true),
      ebaySearch(token, `${base} PSA 10`, 3),
    ]);

    const [rawImages, gradedImages] = await Promise.all([
      Promise.all(rawUrls.slice(0, 1).map(urlToBase64)),
      Promise.all(gradedUrls.slice(0, 2).map(urlToBase64)),
    ]);

    return {
      raw: rawImages.filter(Boolean),
      graded: gradedImages.filter(Boolean),
    };
  } catch (err) {
    console.warn('eBay reference fetch failed:', err.message);
    return { raw: [], graded: [] };
  }
}

const SYSTEM_PROMPT = `You are SlabIQ, a PSA/BGS-calibrated sports card grader. Your only job is to find real physical flaws on the card. The grading software computes the final subgrades from your findings — your numbers for corners/edges/surface are ignored.

WHAT YOU MUST DO:
  Scan every zone of the card exhaustively.
  For every zone, report exactly what you observe (even if it looks clean).
  For every observation, check the exact same location on the PSA 10 reference.
  Report only confirmed physical differences that are NOT on the PSA 10 reference.
  For each confirmed flaw, classify severity honestly: microscopic (needs loupe/bright light), visible (naked eye on inspection), or obvious (immediately noticeable).

WHAT IS NEVER A CONFIRMED FLAW:
  Any feature present at the same location on the PSA 10 reference
  Foil, holographic, prizm, chrome patterns and textures
  Speckle or sparkle fills (Prizm, Mosaic, etc.) — printed design
  White corners on chrome/foil cards — manufacturing characteristic
  JPEG grain or photo blur
  Lighting or angle differences between the user's photo and reference

GRADE ONLY THE CARD: background, table, hand, sleeve = ignore entirely.`;



const GRADING_PROMPT = `You are inspecting this sports card zone-by-zone against the PSA 10 GEM MINT reference image. The PSA 10 reference is your ground truth for what a perfect copy of THIS EXACT CARD looks like — its design, foil/prizm/holo patterns, borders, and surface. Anything you see on the user's card that ALSO appears on the PSA 10 reference is design, NOT damage.

You also have ZOOM-IN crops of each of the 8 corner/edge zones of the user's card. These are the regions a real grader inspects under a loupe. Use them.

YOUR TASK — REPORT ON EVERY ZONE, NO SKIPPING:

For each of these 8 zones, compare the user's card region to the same region on the PSA 10 reference and write an entry:
  corner-TL, corner-TR, corner-BL, corner-BR, edge-top, edge-right, edge-bottom, edge-left

Each entry:
{
  "zone": "<id>",
  "psa10Match": "matches" | "differs",
  "observation": "specific description of what you see (e.g. 'sharp 90° corner with full color hold' or 'whitening on the very tip with a faint chip')",
  "severity": null | "microscopic" | "visible" | "obvious",
  "description": null | "if differs, the specific physical defect and why it's not on the PSA 10"
}

ZONE RULES:
  "matches" → severity null, description null
  "differs" → must name a SPECIFIC physical defect (whitening, chip, crease, dent, scratch, print line, color rub) that is NOT on the PSA 10 at the same location
  Lighting / angle / shadow / glare differences = "matches"
  Foil / prizm / holographic / chrome patterns visible on the PSA 10 = "matches"

SURFACE INSPECTION (separate from zones):
  Scan the user's full front and back photos for surface defects (print lines, scratches, dents, color rubs, indentations, gloss disruption).
  Compare each candidate flaw to the PSA 10 reference at the same location. Only list it if it's NOT on the PSA 10.
  Output as "surfaceFlaws" array. [] if clean.

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

Market ratios: PSA10=100% | PSA9=20-40% | BGS BL=200-1000% | BGS10=100-150% | BGS9.5=50-75% | BGS9=40-60%
Submission threshold: net profit ≥ $30 AND ROI ≥ 25%
PSA tiers: Value $28(<$500), Regular $75(<$1500), Express $160(<$3000), Super Express $300(<$5000), Walk-Through $600
BGS tiers: Standard $25(<$499), Express $40(<$999), Fast Track $100(<$2000), Walk-Through $300

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
    "psaTier": "Value|Regular|Express|Super Express|Walk-Through", "bgsTier": "Standard|Express|Fast Track|Walk-Through",
    "psaCost": <USD>, "bgsCost": <USD>, "psaExpectedGrade": <num>, "bgsExpectedGrade": <num>,
    "psaExpectedValue": <USD>, "bgsExpectedValue": <USD>, "psaRoi": <num>, "bgsRoi": <num>,
    "analysis": "2-3 sentences with dollar math."
  }
}`;

function categoryGrade(severities) {
  if (severities.length === 0) return 10.0;
  const n = severities.length;
  const worst = severities.includes('obvious') ? 'obvious'
              : severities.includes('visible')  ? 'visible'
              : 'microscopic';
  if (worst === 'microscopic') return n >= 2 ? 9.0 : 9.5;
  if (worst === 'visible')     return n >= 2 ? 8.5 : 9.0;
  return n >= 2 ? 8.0 : 8.5; // obvious
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
  return 8.0;
}

function sanitizeGradingResponse(rawText, measuredCenterings) {
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

  // compute subgrades from zones (forced 8) + surfaceFlaws — always overrides Claude's estimates
  {
    const zones = Array.isArray(parsed.zones) ? parsed.zones : [];
    const cornerSevs = zones.filter(z => z?.zone?.startsWith('corner') && z?.severity).map(z => z.severity);
    const edgeSevs   = zones.filter(z => z?.zone?.startsWith('edge')   && z?.severity).map(z => z.severity);
    const surfaceSevs = (Array.isArray(parsed.surfaceFlaws) ? parsed.surfaceFlaws : [])
      .map(f => f?.severity).filter(Boolean);

    console.log(`Zones reported: ${zones.length}/8 — corners flagged ${cornerSevs.length}(${cornerSevs.join(',')}), edges flagged ${edgeSevs.length}(${edgeSevs.join(',')}), surface flaws ${surfaceSevs.length}(${surfaceSevs.join(',')})`);

    if (parsed.bgs) {
      console.log(`AI grades: corners=${parsed.bgs.corners} edges=${parsed.bgs.edges} surface=${parsed.bgs.surface}`);
      parsed.bgs.corners = categoryGrade(cornerSevs);
      parsed.bgs.edges   = categoryGrade(edgeSevs);
      parsed.bgs.surface = categoryGrade(surfaceSevs);
      console.log(`Computed:  corners=${parsed.bgs.corners} edges=${parsed.bgs.edges} surface=${parsed.bgs.surface}`);
    }
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

      // PSA: straight round of average (user-specified rule)
      const psaGrade = Math.max(1, Math.min(10, Math.round(avg)));
      const PSA_LABELS = { 10: 'GEM MT', 9: 'MINT', 8: 'NM-MT', 7: 'NM', 6: 'EX-MT', 5: 'EX', 4: 'VG-EX', 3: 'VG', 2: 'GOOD', 1: 'PR' };
      if (!parsed.psa) parsed.psa = {};
      console.log(`Subgrades [${subs.join(',')}] avg=${avg.toFixed(2)} → BGS ${parsed.bgs.overall}, PSA ${psaGrade}`);
      parsed.psa.grade = psaGrade;
      parsed.psa.label = PSA_LABELS[psaGrade] || '';
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
- VARIANT IS CRITICAL: if the user says "Prizm" but doesn't specify the parallel, list Base Prizm and Silver Prizm as separate candidates.
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
  const { images, imageData, mediaType = 'image/jpeg' } = req.body;
  const imageList = images || (imageData ? [imageData] : null);
  if (!imageList?.length) return res.status(400).json({ error: 'At least one image is required' });

  try {
    const imageContent = imageList.map(data => ({
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data },
    }));

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: [
          ...imageContent,
          { type: 'text', text: `Identify this sports card. Return ONLY a JSON object with no extra text:
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
- VARIANT ACCURACY IS CRITICAL: A Prizm base card looks similar to a Silver Prizm and a White Prizm — they are DIFFERENT cards with very different values. If you cannot clearly confirm which parallel it is from the photo, list each possibility as a separate candidate.
- Set confidence to 98+ ONLY when you are certain of the exact variant, not just the player and set.
- If there is any chance the card is a parallel (silver, white, gold, blue, etc.) rather than the base version, list both.
- Never assume base — always consider that it could be a more valuable parallel.` }
        ],
      }],
    });

    const text = msg.content.find(b => b.type === 'text')?.text ?? '';
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    console.log(`Identify: confidence=${parsed.confidence}, candidates=${parsed.candidates?.length}`);
    res.json({ candidates: parsed.candidates ?? [], confidence: parsed.confidence ?? 80 });
  } catch (err) {
    console.error('Identify error:', err.message);
    res.status(502).json({ error: 'Could not identify card. Please try again.' });
  }
});

app.post('/api/find-corners', async (req, res) => {
  const { imageData, mediaType = 'image/jpeg' } = req.body;
  if (!imageData) return res.status(400).json({ error: 'Image required' });

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageData } },
          { type: 'text', text: `Locate the FOUR PHYSICAL CORNERS of the trading card in this image. The card may be tilted, rotated, or shot at an angle. There may be a table, desk, hand, sleeve, or other background around the card — IGNORE all of that.

CRITICAL — the corners must hug the card's actual physical edges TIGHTLY. Do NOT include any background, table, sleeve, or hand. Imagine drawing a sharpie line right on top of where the card's edge meets the background — those four corner points are what we want.

The output is used to crop and perspective-warp the card into a flat rectangle. Every percentage point matters — even a 2% error includes visible background in the output. Be precise.

Return ONLY this JSON (no extra text). Coordinates are fractions of image width/height (0.0 to 1.0):
{
  "tl": { "x": <num>, "y": <num> },
  "tr": { "x": <num>, "y": <num> },
  "br": { "x": <num>, "y": <num> },
  "bl": { "x": <num>, "y": <num> }
}

- tl = top-left physical corner of the card (the actual corner of the card itself)
- tr = top-right corner of the card
- br = bottom-right corner of the card
- bl = bottom-left corner of the card

If a card corner is cut off / out of frame / hidden by a finger / not visible, return: { "error": "corner missing" } and I'll fall back to a different method. Don't guess where a hidden corner would be.` }
        ],
      }],
    });
    const text = msg.content.find(b => b.type === 'text')?.text ?? '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return res.json({ corners: null });
    const parsed = JSON.parse(m[0]);
    if (parsed.error || !parsed.tl) return res.json({ corners: null });
    console.log(`Corners: tl=${parsed.tl.x?.toFixed(2)},${parsed.tl.y?.toFixed(2)} br=${parsed.br?.x?.toFixed(2)},${parsed.br?.y?.toFixed(2)}`);
    res.json({ corners: parsed });
  } catch (err) {
    console.error('Find corners error:', err.message);
    res.status(502).json({ corners: null });
  }
});

app.post('/api/grade', async (req, res) => {
  const { images, imageData, mediaType = 'image/jpeg', confirmedCard, zoneCrops } = req.body;

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

    // Build labeled zoom-in zone images (4 corners + 4 edges of the front photo)
    const zoneImages = [];
    if (zoneCrops && typeof zoneCrops === 'object') {
      const ZONE_ORDER = ['corner-TL', 'corner-TR', 'corner-BL', 'corner-BR', 'edge-top', 'edge-right', 'edge-bottom', 'edge-left'];
      for (const zone of ZONE_ORDER) {
        if (zoneCrops[zone]) {
          zoneImages.push({ type: 'text', text: `=== ZOOM-IN: ${zone} (loupe view of the user's card) ===` });
          zoneImages.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: zoneCrops[zone] } });
        }
      }
      console.log(`Zone crops sent: ${zoneImages.filter(c => c.type === 'image').length}/8`);
    }

    const confirmedPrefix = confirmedCard?.player
      ? `CONFIRMED CARD IDENTITY (selected by the user — do not second-guess this): ${confirmedCard.player}, ${confirmedCard.year} ${confirmedCard.set}, ${confirmedCard.variant || 'Base'}${confirmedCard.cardNumber ? `, #${confirmedCard.cardNumber}` : ''}. Set needsClarification to false and candidates to []. Provide complete grading and market data for exactly this card.\n\n`
      : '';

    const content = [
      { type: 'text', text: `=== USER'S CARD (full photos) ===` },
      ...userImages,
      ...refImages,
      ...zoneImages,
      { type: 'text', text: confirmedPrefix + GRADING_PROMPT },
    ];

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    });

    const raw = message.content.find(b => b.type === 'text')?.text ?? '';
    let text = sanitizeGradingResponse(raw);

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
    // Vintage (pre-1980) eBay data is too noisy — flooded with reprints/customs/lots,
    // and real comps go through major auction houses. Trust AI for vintage only.
    // For modern (incl. high-value parallels), eBay scrape gives much better data than AI training.
    let skipEbay = false;
    let skipReason = '';
    try {
      const preParsed = JSON.parse(text);
      const yearNum = parseInt(confirmedCard?.year, 10) || 0;
      if (yearNum > 0 && yearNum < 1980) { skipEbay = true; skipReason = 'vintage'; }
      if (skipEbay) {
        if (!preParsed.market) preParsed.market = {};
        preParsed.market.dataSource = `AI estimate (${skipReason} card — eBay too noisy)`;
        text = JSON.stringify(preParsed);
        console.log(`Market: skipping eBay scrape (${skipReason}: year=${yearNum})`);
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
            // Sanity floor: anything < 30% of AI estimate is almost certainly oversized/wrong card
            if (aiEstimate && aiEstimate > 0) {
              prices = prices.filter(p => p >= aiEstimate * 0.30);
            }
            if (prices.length < 2) return null;
            // Median is robust against oversized junk that slipped past the filter on the low end
            // and against scammy high listings on the top end.
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
          const aiRaw = Number(parsed.market.raw) || 0;
          const rawPrice = realPrice(market.raw, aiRaw);
          if (rawPrice) parsed.market.raw = rawPrice;
          parsed.market.dataSource = 'eBay (median active − 10%, AI-estimate floor)';
          parsed.market.sampleSize = market.totalValid;
          text = JSON.stringify(parsed);
        }
      } catch (e) {
        console.warn('Market injection failed:', e.message);
      }
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
  console.log(`SlabIQ server running on http://localhost:${PORT}`);
});
