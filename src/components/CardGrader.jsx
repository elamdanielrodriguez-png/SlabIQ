// VERSION HISTORY
// v1.0.0 — Initial release: image upload, Claude grading, PSA/BGS results, market + submit tabs
// v1.1.0 — Apple UI redesign: true black bg, frosted glass header, floating pill tab bar
// v1.2.0 — Centering overhaul: frontend computeCentering() from measured %, dismissible defects/negatives
// v1.3.0 — Server fix: template string bug repaired (full prompt now sent), system prompt added, server-side sanitization of vague centering language
// v1.4.0 — Grade accuracy: PSA/BGS equivalency table, default subgrade 10.0 (not 9.5), realistic market value ratios
// v1.4.1 — BGS overall fix: average rounded to 0.5, capped at lowest subgrade + 0.5 (not just lowest)
// v1.5.0 — Grading balance: active inspection per subgrade, no lazy defaults; confidence always shown with photo tip
// v1.6.0 — Defect accuracy: image resolution 1200→2000px, defect confidence scores, server-side print-element filter, 5-step surface inspection
// v1.7.0 — eBay reference images: fetches both raw + PSA 10 sold listings; raw confirms design elements, PSA 10 confirms gem condition baseline
// v1.8.0 — Centering rewrite: measures border WIDTH not center-to-edge; separate front/back measurements; PSA back=75/25; eBay cross-check logic
// v1.9.0 — Card picker always shown: /api/identify step before grading; Mosaic/decorative card design elements; borderless centering default
// v2.0.0 — Client-side centering: canvas pixel detection measures actual border widths; server uses as authoritative ground truth; AI no longer estimates centering
// v2.5.0 — Scanner mode: auto-crop background + AI-detected 4-corner perspective correction for front/back. AI centering re-added as initial estimate (user override updates BGS+PSA). PSA = round(avg of 4 subgrades). Forced 8-zone grading. Real eBay market comps via Haiku. User-picked card identity forces server response.
// v3.0.0 — Camera capture replaces scanner: live camera feed with fixed 5:7 alignment rectangle. User aligns card inside, captures, frame is cropped to rectangle. No detection, no AI, just static crop. All scanner code (perspective correction, pixel detection, manual corner editor, AI corner detection) removed.
const VERSION = "3.0.0";

import { useState, useEffect, useRef } from "react";
import { posthog } from "../main";
import { extractJSON, processImageFile, cropZonesFromImageData } from "../lib/imageUtils";
import GradeTab from "./GradeTab";
import MarketTab from "./MarketTab";
import SubmitTab from "./SubmitTab";
import HistoryPanel from "./HistoryPanel";
import AuthModal from "./AuthModal";
import PricingModal from "./PricingModal";
import Logo from "./Logo";
import BulkTab from "./BulkTab";
import GradeReveal from "./GradeReveal";
import LegalModal from "./LegalModal";
import { CameraCapture } from "./GradeTab";
import { supabase } from "../lib/supabase";

const FREE_GRADE_KEY = 'cgon_free_grades_used';
const FREE_GRADE_LIMIT = 2;

function LoadingOverlay({ message, frontImageUrl }) {
  if (!message) return null;
  const mode = message.toLowerCase().includes("identify") ? "identify" : "grade";
  return <LoadingOverlayInner key={mode} isIdentify={mode === "identify"} frontImageUrl={frontImageUrl} />;
}

const ZONE_LABELS = ["CORNERS", "EDGES", "SURFACE", "CENTERING"];

function LoadingOverlayInner({ isIdentify, frontImageUrl }) {
  const duration    = isIdentify ? 10000 : 33000;
  const checkpoints = isIdentify
    ? ["Reading image", "Detecting card details", "Identifying set & variant", "Confirming match"]
    : ["Inspecting corners & edges", "Analyzing surface", "Fetching market data", "Computing grades"];
  const pcts = [14, 38, 62, 83];

  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const STEP = 80;
    const inc  = 92 / (duration / STEP);
    const id   = setInterval(() => {
      setProgress(p => {
        const next = p + inc;
        if (next >= 92) { clearInterval(id); return 92; }
        return next;
      });
    }, STEP);
    return () => clearInterval(id);
  }, []);

  const activeStep  = pcts.findIndex(t => progress < t);
  const zoneLabel   = !isIdentify && activeStep >= 0 && activeStep < 2 ? ZONE_LABELS[activeStep] : null;
  const bracketColor = (done) => done ? "rgba(48,209,88,0.7)" : "rgba(201,168,76,0.55)";
  const cornersDown  = progress >= pcts[0];
  const bc           = bracketColor(cornersDown);
  const bw           = 14;

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.96)",
      backdropFilter: "blur(24px)",
      WebkitBackdropFilter: "blur(24px)",
      zIndex: 500,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 0,
    }}>

      {/* Card image with scan overlay */}
      {frontImageUrl ? (
        <div style={{
          position: "relative",
          width: 160, height: 224,
          borderRadius: 10,
          overflow: "hidden",
          marginBottom: 28,
          flexShrink: 0,
        }}>
          {/* Dimmed card photo */}
          <img src={frontImageUrl} alt="" style={{
            width: "100%", height: "100%", objectFit: "cover",
            filter: "brightness(0.45) saturate(0.6)",
            display: "block",
          }} />

          {/* Scan line */}
          <div style={{
            position: "absolute", left: 0, right: 0, height: 2,
            background: "linear-gradient(90deg, transparent 0%, rgba(201,168,76,0.3) 10%, #c9a84c 50%, rgba(201,168,76,0.3) 90%, transparent 100%)",
            boxShadow: "0 0 10px rgba(201,168,76,0.9), 0 0 28px rgba(201,168,76,0.4)",
            animation: "scanLine 2.2s cubic-bezier(0.4,0,0.6,1) infinite",
          }} />

          {/* Below-scan reveal tint */}
          <div style={{
            position: "absolute", left: 0, right: 0, bottom: 0, height: "30%",
            background: "linear-gradient(to top, rgba(201,168,76,0.04), transparent)",
            pointerEvents: "none",
          }} />

          {/* Corner brackets */}
          {[
            { top: 7,  left: 7  },
            { top: 7,  right: 7 },
            { bottom: 7, left: 7  },
            { bottom: 7, right: 7 },
          ].map((pos, i) => (
            <div key={i} style={{ position: "absolute", width: bw, height: bw, ...pos, transition: "border-color 0.5s ease" }}>
              <div style={{
                position: "absolute", inset: 0,
                borderTop:    (i === 0 || i === 1) ? `1.5px solid ${bc}` : "none",
                borderBottom: (i === 2 || i === 3) ? `1.5px solid ${bc}` : "none",
                borderLeft:   (i === 0 || i === 2) ? `1.5px solid ${bc}` : "none",
                borderRight:  (i === 1 || i === 3) ? `1.5px solid ${bc}` : "none",
                boxShadow: cornersDown ? `0 0 6px rgba(48,209,88,0.4)` : `0 0 6px rgba(201,168,76,0.3)`,
                transition: "all 0.5s ease",
              }} />
            </div>
          ))}

          {/* Zone label overlay */}
          {zoneLabel && (
            <div key={zoneLabel} style={{
              position: "absolute", bottom: 10, left: 0, right: 0,
              textAlign: "center",
              color: "#c9a84c", fontSize: 9, fontWeight: 800, letterSpacing: "0.22em",
              textShadow: "0 0 8px rgba(201,168,76,0.8)",
              animation: "zoneLabel 2.2s ease-in-out both",
            }}>{zoneLabel}</div>
          )}
        </div>
      ) : (
        /* Fallback spinner when no image */
        <div style={{ position: "relative", width: 72, height: 72, marginBottom: 28 }}>
          <svg width="72" height="72" style={{ display: "block" }} className="cgon-spin">
            <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(201,168,76,0.12)" strokeWidth="3" />
            <circle cx="36" cy="36" r="30" fill="none" stroke="#c9a84c" strokeWidth="3"
              strokeDasharray="58 130" strokeLinecap="round" transform="rotate(-90 36 36)" />
          </svg>
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#c9a84c", fontSize: 11, fontWeight: 800, letterSpacing: "0.06em",
          }}>AI</div>
        </div>
      )}

      {/* Title + progress + checkpoints */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "0 40px" }}>
        <div style={{ color: "#fff", fontSize: 17, fontWeight: 600, letterSpacing: "-0.4px" }}>
          {isIdentify ? "Identifying Card" : "Analyzing Card"}
        </div>

        <div style={{ width: 240, height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 99, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${progress}%`,
            background: "linear-gradient(90deg, rgba(201,168,76,0.6) 0%, #c9a84c 100%)",
            borderRadius: 99,
            transition: "width 0.08s linear",
          }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 11, alignItems: "flex-start", width: 240 }}>
          {checkpoints.map((label, i) => {
            const done   = progress >= pcts[i];
            const active = activeStep === i;
            return (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: done ? "rgba(48,209,88,0.12)" : "transparent",
                  border: `1px solid ${done ? "rgba(48,209,88,0.35)" : active ? "rgba(201,168,76,0.55)" : "rgba(255,255,255,0.1)"}`,
                  transition: "all 0.4s ease",
                }}>
                  {done ? (
                    <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                      <path d="M1 3.5L3 5.5L8 1" stroke="#30d158" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : active ? (
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#c9a84c", animation: "cornerBreathe 1.2s ease-in-out infinite" }} />
                  ) : null}
                </div>
                <span style={{
                  fontSize: 13,
                  color: done ? "#30d158" : active ? "#fff" : "rgba(255,255,255,0.22)",
                  fontWeight: active ? 500 : 400,
                  letterSpacing: "-0.1px",
                  transition: "color 0.4s ease",
                }}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Toast({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="cgon-toast" style={{
      position: "fixed", bottom: 108, left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(28,28,30,0.98)",
      border: "1px solid rgba(48,209,88,0.25)",
      borderRadius: 100, padding: "10px 22px",
      color: "#30d158", fontSize: 13, fontWeight: 600,
      zIndex: 300,
      boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
      whiteSpace: "nowrap",
    }}>
      ✓ Saved to history
    </div>
  );
}

const TABS = [
  { id: "grade",   label: "Grade"   },
  { id: "market",  label: "Market"  },
  { id: "submit",  label: "Submit"  },
  { id: "history", label: "History" },
];

const PSA_LABELS = { 10: "GEM MT", 9: "MINT", 8: "NM-MT", 7: "NM", 6: "EX-MT", 5: "EX", 4: "VG-EX", 3: "VG", 2: "GOOD", 1: "PR" };
function bgsCenteringFromCentering(c) {
  if (!c) return null;
  const lr = Math.max(c.leftPct ?? 50, c.rightPct ?? 50);
  const tb = Math.max(c.topPct ?? 50, c.bottomPct ?? 50);
  const worst = Math.max(lr, tb);
  if (worst <= 52) return 10.0;
  if (worst <= 55) return 9.5;
  if (worst <= 60) return 9.0;
  if (worst <= 65) return 8.5;
  if (worst <= 70) return 8.0;
  return 7.5;
}

function recomputeBgsAndPsa(prevResult, centering) {
  if (!prevResult?.bgs) return prevResult;
  const c = bgsCenteringFromCentering(centering);
  const { corners, edges, surface } = prevResult.bgs;
  if (typeof corners !== "number" || typeof edges !== "number" || typeof surface !== "number" || c == null) return prevResult;
  const subs = [c, corners, edges, surface];
  // BGS overall: average rounded to 0.5, capped at lowest + 0.5
  const avg = subs.reduce((a, b) => a + b, 0) / 4;
  const rounded = Math.round(avg * 2) / 2;
  const lowest = Math.min(...subs);
  const overall = Math.min(rounded, lowest + 0.5);
  const isBlackLabel = subs.every(v => v === 10);
  // PSA: straight round of the 4-subgrade average
  const psaGrade = Math.max(1, Math.min(10, Math.round(avg)));
  return {
    ...prevResult,
    bgs: { ...prevResult.bgs, overall, isBlackLabel, centering: c },
    psa: { grade: psaGrade, label: PSA_LABELS[psaGrade] ?? prevResult.psa?.label ?? "" },
  };
}

function base64ToBlob(b64, mime = 'image/jpeg') {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

const DEMO_RESULT = {
  _isDemo: true,
  player: "Patrick Mahomes", year: "2020", set: "Panini Prizm", variant: "Silver Prizm", cardNumber: "120", sport: "Football", confidence: 98,
  psa: { grade: 9, label: "MINT" },
  bgs: { overall: 9.0, isBlackLabel: false, centering: 9.5, corners: 9.0, edges: 8.5, surface: 9.5 },
  zones: [
    { zone: "corner-TL", psa10Match: "matches", observation: "Sharp 90° point with full silver color to the very tip", severity: null, description: null },
    { zone: "corner-TR", psa10Match: "matches", observation: "Clean sharp corner with full color hold", severity: null, description: null },
    { zone: "corner-BL", psa10Match: "differs", observation: "Microscopic softening at the tip under extreme zoom — barely detectable", severity: "microscopic", description: "soft tip" },
    { zone: "corner-BR", psa10Match: "matches", observation: "Sharp point with full color, no rounding", severity: null, description: null },
    { zone: "edge-top", psa10Match: "matches", observation: "Razor-clean straight border with zero interruption", severity: null, description: null },
    { zone: "edge-right", psa10Match: "differs", observation: "One barely detectable microscopic nick at the lower third — needs loupe to confirm", severity: "microscopic", description: "nick" },
    { zone: "edge-bottom", psa10Match: "matches", observation: "Clean edge throughout, full color", severity: null, description: null },
    { zone: "edge-left", psa10Match: "matches", observation: "Clean razor edge, no chips or wear", severity: null, description: null },
  ],
  surfaceFlaws: [],
  positives: ["Pristine gloss with no scratches or haze", "Three perfectly sharp gem-mint corners", "Vibrant silver prizm pattern fully intact"],
  negatives: ["Microscopic soft tip on corner-BL", "Microscopic nick on edge-right"],
  verdict: "Excellent card held back from gem mint by two microscopic issues: a barely detectable soft tip on corner-BL and a loupe-only nick on edge-right. Surface and three remaining corners are gem-mint quality. Solid PSA 9 — submit if the math works.",
  defects: [
    { label: "Soft tip BL", description: "Microscopic softening at bottom-left corner tip, visible only under extreme zoom.", confidence: 82, x: 0.04, y: 0.93 },
  ],
  market: {
    raw: 45,
    graded: {
      psa7: 60, psa8: 90, psa9: 130, psa10: 310,
      bgs7: 52, bgs8: 78, bgs9: 110, bgs9_5: 240, bgs10: 580, bgsBlackLabel: 2200,

    },
    trend: "rising", trendPercent: 14,
    aiAnalysis: "The 2020 Prizm Silver Prizm Mahomes rookie remains one of the most liquid modern cards in the hobby. PSA 9 copies trade consistently in the $120–$140 range with PSA 10 demand staying strong above $300.",
  },
  submission: {
    psaRecommended: true, bgsRecommended: false,
    psaTier: "Value", bgsTier: "Standard",
    psaCost: 33, bgsCost: 25,
    psaExpectedGrade: 9, bgsExpectedGrade: 9.0,
    psaExpectedValue: 130, bgsExpectedValue: 110,
    psaRoi: 116, bgsRoi: 89,
    analysis: "PSA 9 at $33 nets $52 profit on a $45 raw card — 116% ROI, well above the 25% threshold. BGS is marginal; the $110 expected value at BGS 9 minus $25 cost still returns 89% but PSA is the stronger play.",
  },
  popData: {
    psa: { total: 61200, gemRate: 34, distribution: [
      { grade: 10, label: "GEM MT", count: 20808 }, { grade: 9, label: "MINT", count: 18360 },
      { grade: 8, label: "NM-MT", count: 9792 }, { grade: 7, label: "NM", count: 4896 },
      { grade: 6, label: "EX-MT", count: 4284 }, { grade: 5, label: "EX", count: 3060 },
    ]},
    bgs: { total: 5800, gemRate: 23, distribution: [
      { grade: "BL", label: "Black Label", count: 46 }, { grade: 10, label: "Pristine", count: 232 },
      { grade: 9.5, label: "Gem Mint", count: 1334 }, { grade: 9, label: "Mint", count: 1740 },
      { grade: 8.5, label: "NM-MT+", count: 1160 }, { grade: 8, label: "NM-MT", count: 870 },
      { grade: 7.5, label: "NM+", count: 290 }, { grade: 7, label: "NM", count: 128 },
    ]},
  },
};

export default function CardGrader() {
  const [activeTab, setActiveTab] = useState("grade");
  const [gradeMode, setGradeMode] = useState("single");
  const [tabKey, setTabKey] = useState(0);
  const [images, setImages] = useState([]);
  const [result, setResult] = useState(null);
  const [candidates, setCandidates] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(null);
  const [toast, setToast] = useState(false);
  const [error, setError] = useState(null);
  const [showReveal, setShowReveal] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [legalPage, setLegalPage] = useState(null); // null | 'privacy' | 'terms'
  const [visitedTabs, setVisitedTabs] = useState(new Set());
  const bulkCaptureRef = useRef(null);

  // ── Auth + subscription state ──────────────────────────────────────────────
  const [session, setSession] = useState(null);
  const [userPlan, setUserPlan] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const [freeGradesUsed, setFreeGradesUsed] = useState(
    () => parseInt(localStorage.getItem(FREE_GRADE_KEY) || '0')
  );
  const [selectedModel, setSelectedModel] = useState('claude-opus-4-8');
  const [purchaseSuccess, setPurchaseSuccess] = useState(null); // null | 'polling' | 'confirmed'
  const [popLoading, setPopLoading] = useState(false);

  // Restore images that were in-flight when OAuth / Stripe redirect happened
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('cgon_pending_images');
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!Array.isArray(saved) || saved.length === 0) return;
      const restored = saved.map(img => ({
        ...img,
        objectURL: URL.createObjectURL(base64ToBlob(img.imageData)),
      }));
      setImages(restored);
    } catch (e) {}
  }, []);

  // Persist images to sessionStorage so they survive redirects
  useEffect(() => {
    if (images.length === 0) { sessionStorage.removeItem('cgon_pending_images'); return; }
    try {
      sessionStorage.setItem('cgon_pending_images', JSON.stringify(
        images.map(({ imageData, centering, centeringLines, cardBounds, role, width, height }) => ({
          imageData, centering, centeringLines, cardBounds, role, width, height,
        }))
      ));
    } catch (e) {}
  }, [images]);

  useEffect(() => {
    // Load session on mount
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s) loadUserPlan(s.access_token);
    });
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) {
        loadUserPlan(s.access_token);
        posthog.identify(s.user.id, { email: s.user.email });
      } else {
        setUserPlan(null);
        posthog.reset();
      }
    });
    // Check for post-checkout success
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success') {
      window.history.replaceState({}, '', '/');
      setShowPricing(false);
      setPurchaseSuccess('polling');
      posthog.capture('purchase_completed');
    }
    return () => subscription.unsubscribe();
  }, []);

  // Poll for updated token balance after Stripe redirect — webhook can lag 2-5s
  useEffect(() => {
    if (purchaseSuccess !== 'polling' || !session) return;
    const initialLimit = userPlan?.grade_limit ?? 0;
    let attempts = 0;
    const id = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch('/api/user/plan', { headers: { Authorization: `Bearer ${session.access_token}` } });
        if (res.ok) {
          const data = await res.json();
          if (data.plan.grade_limit > initialLimit) {
            setUserPlan(data.plan);
            setPurchaseSuccess('confirmed');
            clearInterval(id);
            setTimeout(() => setPurchaseSuccess(null), 4000);
            return;
          }
        }
      } catch {}
      if (attempts >= 10) {
        clearInterval(id);
        setPurchaseSuccess('confirmed');
        setTimeout(() => setPurchaseSuccess(null), 4000);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [purchaseSuccess, session]);

  const loadUserPlan = async (token, attempt = 0) => {
    try {
      const res = await fetch('/api/user/plan', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUserPlan(data.plan);
      } else if (attempt < 3) {
        setTimeout(() => loadUserPlan(token, attempt + 1), 1500 * (attempt + 1));
      }
    } catch {
      if (attempt < 3) setTimeout(() => loadUserPlan(token, attempt + 1), 1500 * (attempt + 1));
    }
  };

  const authHeaders = () => session ? { Authorization: `Bearer ${session.access_token}` } : {};

  const deviceFreeLeft = () => Math.max(0, FREE_GRADE_LIMIT - freeGradesUsed);

  const gradesRemaining = () => {
    if (deviceFreeLeft() > 0) return deviceFreeLeft();
    if (session && userPlan) return Math.max(0, userPlan.grade_limit - userPlan.grades_used);
    return 0;
  };

  const gradeLimit = () => {
    if (session && userPlan) return userPlan.grade_limit;
    return FREE_GRADE_LIMIT;
  };

  const gradesUsedDisplay = () => {
    if (session && userPlan) return userPlan.grades_used;
    return freeGradesUsed;
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUserPlan(null);
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [activeTab]);


  const saveGrading = (parsed) => {
    try {
      const existing = JSON.parse(localStorage.getItem('cgon_history') || '[]');
      const entry = {
        id: Date.now().toString(),
        savedAt: new Date().toISOString(),
        player: parsed.player,
        year: parsed.year,
        set_name: parsed.set,
        variant: parsed.variant,
        card_number: parsed.cardNumber ?? null,
        psa_grade: parsed.psa?.grade ?? null,
        bgs_overall: parsed.bgs?.overall ?? null,
        raw_value: parsed.market?.raw ?? null,
        result: parsed,
      };
      localStorage.setItem('cgon_history', JSON.stringify([entry, ...existing].slice(0, 50)));
    } catch (e) {
      console.warn('Failed to save grading:', e.message);
    }
  };

  const addImages = async (files) => {
    const slots = 10 - images.length;
    if (slots <= 0) return;
    const currentCount = images.length;
    const processed = await Promise.all(
      [...files].slice(0, slots).map(async (file, fileIdx) => {
        const base = await processImageFile(file);
        const slot = currentCount + fileIdx;
        const role = slot === 0 ? 'front' : slot === 1 ? 'back' : 'detail';
        return { ...base, role };
      })
    );
    setImages((prev) => [...prev, ...processed]);
    setResult(null);
    setError(null);
  };

  const ROLES = ['front', 'back', 'detail'];
  const cycleRole = (idx) => {
    setImages(prev => prev.map((img, i) => {
      if (i !== idx) return img;
      const next = ROLES[(ROLES.indexOf(img.role ?? 'detail') + 1) % ROLES.length];
      return { ...img, role: next };
    }));
  };

  const updateImageCentering = (idx, centering, lines) => {
    setImages(prev => prev.map((img, i) => i !== idx ? img : { ...img, centering, centeringLines: lines, centeringConfirmedByUser: true }));
    setImages(prev => {
      const target = prev[idx];
      const isFront = target?.role === "front" || (idx === 0 && !prev.some(i => i.role === "front"));
      if (!isFront) return prev;
      setResult(r => recomputeBgsAndPsa(r, centering));
      return prev;
    });
  };

  const removeImage = (idx) => {
    setImages((prev) => {
      URL.revokeObjectURL(prev[idx].objectURL);
      if (prev[idx].originalObjectURL) URL.revokeObjectURL(prev[idx].originalObjectURL);
      return prev.filter((_, i) => i !== idx);
    });
  };

  useEffect(() => {
    if (result) setVisitedTabs(new Set(['grade']));
  }, [result]);

  const switchTab = (tabId) => {
    setActiveTab(tabId);
    setTabKey(k => k + 1);
    setVisitedTabs(prev => new Set([...prev, tabId]));
  };

  const resetGrade = () => {
    setImages(prev => { prev.forEach(img => { URL.revokeObjectURL(img.objectURL); if (img.originalObjectURL) URL.revokeObjectURL(img.originalObjectURL); }); return []; });
    setResult(null);
    setCandidates(null);
    setError(null);
    setVisitedTabs(new Set());
    sessionStorage.removeItem('cgon_pending_images');
  };

  const identifyCard = async (listingTitle = null) => {
    if (!images.length) return;
    // Signed-in users: must have account tokens (device free grades ignored)
    // Anonymous users: must have device free grades
    if (session) {
      if (gradesRemaining() === 0) { setShowPricing(true); posthog.capture('paywall_hit'); return; }
    } else {
      if (deviceFreeLeft() === 0) { setShowPricing(true); posthog.capture('paywall_hit'); return; }
    }
    posthog.capture('grade_started');
    setLoading(true);
    setLoadingMessage("Identifying card…");
    setError(null);
    setCandidates(null);
    setResult(null);
    try {
      const res = await fetch("/api/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ images: images.map((i) => i.imageData), listingTitle: listingTitle || undefined }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      // Always show picker — user explicitly confirms even when AI is confident.
      // Past experience: 98% confidence has been wrong, picker is a one-tap safety net.
      setCandidates(data.candidates || []);
    } catch (err) {
      setError(err.message || "Could not identify card. Please try again.");
    } finally {
      setLoading(false);
      setLoadingMessage(null);
    }
  };

  const searchCards = async (query) => {
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        images: images.map((i) => i.imageData),
        query,
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.candidates ?? [];
  };

  const gradeCards = async (confirmedCard) => {
    if (!images.length || !confirmedCard) return;
    setLoading(true);
    setLoadingMessage("Analyzing card…");
    setError(null);
    try {
      const { player, year, set, variant, cardNumber } = confirmedCard;

      // Generate zoom-in crops of corners/edges from front and back photos
      const frontImg = images.find(img => img.role === "front") ?? images[0];
      const backImg  = images.find(img => img.role === "back");

      const makeCrops = async (img) => {
        if (!img?.cardBounds || !img?.imageData) return null;
        try {
          return await cropZonesFromImageData(img.imageData, img.cardBounds, {
            width: img.width, height: img.height, originalObjectURL: img.originalObjectURL,
          });
        } catch (err) { console.warn("Zone cropping failed:", err); return null; }
      };

      const [zoneCrops, backZoneCrops] = await Promise.all([
        makeCrops(frontImg),
        makeCrops(backImg),
      ]);

      // Send pixel-measured centering if detection succeeded — server will override AI estimate
      const measuredCentering = frontImg?.centering ?? null;

      setLoadingMessage("Fetching market data…");

      // Signed-in users always use account tokens; anonymous users use device free grades
      const usingDeviceFree = !session && deviceFreeLeft() > 0;
      const res = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(usingDeviceFree ? {} : authHeaders()) },
        body: JSON.stringify({
          images: images.map((i) => i.imageData),
          confirmedCard: { player, year, set, variant, cardNumber },
          zoneCrops,
          backZoneCrops,
          measuredCentering,
          gradingModel: selectedModel,
        }),
      });
      const data = await res.json();
      if (data.code === 'GRADE_LIMIT_REACHED') { setShowPricing(true); return; }
      if (data.error) throw new Error(data.error);
      const parsed = extractJSON(data.content?.[0]?.text || "");
      if (!parsed) {
        setError("Could not parse grading response. Please try again.");
      } else {
        setResult(parsed);
        setCandidates(null);
        sessionStorage.removeItem('cgon_pending_images');
        saveGrading(parsed);
        posthog.capture('grade_completed', { psa_grade: parsed.psa?.grade, player: parsed.player, year: parsed.year, set: parsed.set });
        setToast(true);
        setShowReveal(true);

        // Fetch real PSA pop data in background — updates MarketTab when it lands
        if (parsed.player) {
          setPopLoading(true);
          fetch('/api/pop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player: parsed.player, year: parsed.year, set: parsed.set, variant: parsed.variant }),
          })
            .then(r => r.ok ? r.json() : null)
            .then(popData => {
              if (popData && !popData.error) {
                setResult(r => r ? { ...r, popData: { ...r.popData, psa: popData } } : r);
              }
            })
            .catch(() => {})
            .finally(() => setPopLoading(false));
        }
        // Track usage
        if (usingDeviceFree) {
          const next = freeGradesUsed + 1;
          localStorage.setItem(FREE_GRADE_KEY, next);
          setFreeGradesUsed(next);
        } else if (session) {
          loadUserPlan(session.access_token);
        }
      }
    } catch (err) {
      setError(err.message || "API error. Please try again.");
    } finally {
      setLoading(false);
      setLoadingMessage(null);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(ellipse 120% 45% at 50% 0%, rgba(201,168,76,0.1) 0%, transparent 60%), radial-gradient(ellipse 70% 25% at 50% 100%, rgba(201,168,76,0.035) 0%, transparent 70%), #000",
      color: "#fff",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', system-ui, sans-serif",
      WebkitFontSmoothing: "antialiased",
    }}>
      {/* Frosted glass header */}
      <header style={{
        position: "sticky",
        top: 0,
        zIndex: 600,
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "saturate(180%) blur(20px)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}>
        <div style={{
          maxWidth: 900,
          margin: "0 auto",
          padding: "0 20px",
          height: 52,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div
            onClick={() => setActiveTab("grade")}
            style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
          >
            <Logo size={34} />
            <div style={{ display: "flex", alignItems: "baseline", gap: 0 }}>
              <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.5px", color: "#fff" }}>CardGrade</span>
              <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.5px", color: "#c9a84c" }}>OrNot</span>
            </div>
          </div>

          {/* Auth / usage area */}
          {session ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={() => { setShowPricing(true); posthog.capture('pricing_opened'); }}
                style={{
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit",
                }}
              >
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Tokens
                </span>
                <span style={{ color: gradesRemaining() === 0 ? "#ff453a" : "#c9a84c", fontSize: 10, fontWeight: 700, marginLeft: 6 }}>
                  {userPlan ? Math.max(0, userPlan.grade_limit - userPlan.grades_used) : gradesRemaining()}
                </span>
              </button>
              <button
                onClick={handleSignOut}
                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.2)", fontSize: 11, cursor: "pointer", fontFamily: "inherit", padding: "4px 0" }}
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAuth(true)}
              style={{
                background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.3)",
                borderRadius: 8, padding: "5px 12px",
                color: "#c9a84c", fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit", letterSpacing: "-0.1px",
              }}
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px 148px" }}>
        <div key={tabKey} className="anim-fade-up">
          {activeTab === "grade" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Single / Bulk toggle */}
              <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 3, gap: 3 }}>
                {["single", "bulk"].map(mode => (
                  <button
                    key={mode}
                    onClick={() => setGradeMode(mode)}
                    style={{
                      flex: 1, padding: "7px 0",
                      background: gradeMode === mode ? "rgba(255,255,255,0.1)" : "transparent",
                      border: "none", borderRadius: 8,
                      color: gradeMode === mode ? "#fff" : "rgba(255,255,255,0.35)",
                      fontSize: 13, fontWeight: gradeMode === mode ? 700 : 500,
                      cursor: "pointer", fontFamily: "inherit",
                      transition: "all 0.15s ease",
                      letterSpacing: "-0.1px",
                    }}
                  >
                    {mode === "single" ? "Single" : "Bulk"}
                  </button>
                ))}
              </div>

              {gradeMode === "single" ? (
                <GradeTab
                  images={images}
                  result={result}
                  candidates={candidates}
                  loading={loading}
                  error={error}
                  onAddImages={addImages}
                  onRemoveImage={removeImage}
                  onSetRole={cycleRole}
                  onGrade={identifyCard}
                  onConfirmCandidate={(card) => gradeCards(card)}
                  onSearch={searchCards}
                  onUpdateCentering={updateImageCentering}
                  gradesUsed={gradesUsedDisplay()}
                  gradesTotal={gradeLimit()}
                  isLoggedIn={!!session}
                  planName={userPlan?.plan ?? 'free'}
                  onUpgrade={() => setShowPricing(true)}
                  selectedModel={selectedModel}
                  onSelectModel={setSelectedModel}
                  onRevealAgain={result ? () => setShowReveal(true) : undefined}
                  onSampleGrade={() => { setResult(DEMO_RESULT); setVisitedTabs(new Set(['grade'])); setShowReveal(true); }}
                  onGradeAnother={resetGrade}
                  onOpenCamera={() => setCameraOpen(true)}
                  onSwitchTab={switchTab}
                />
              ) : (
                <BulkTab
                  session={session}
                  userPlan={userPlan}
                  isLoggedIn={!!session}
                  onUpgrade={() => setShowPricing(true)}
                  onOpenCamera={(callback) => {
                    bulkCaptureRef.current = callback;
                    setCameraOpen(true);
                  }}
                />
              )}
            </div>
          )}
          {activeTab === "market" && result && <MarketTab result={result} popLoading={popLoading} />}
          {activeTab === "submit" && result && <SubmitTab result={result} session={session} onNeedAuth={() => setShowAuth(true)} />}
          {activeTab === "history" && (
            <HistoryPanel
              onRestore={(savedResult) => {
                setResult(savedResult);
                switchTab("grade");
              }}
            />
          )}
        </div>
      </main>

      {/* Auth + Pricing modals */}
      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onAuth={(s) => { setSession(s); setShowAuth(false); if (s) loadUserPlan(s.access_token); }}
        />
      )}
      {showPricing && (
        <PricingModal
          onClose={() => setShowPricing(false)}
          session={session}
          tokenBalance={session && userPlan ? Math.max(0, userPlan.grade_limit - userPlan.grades_used) : 0}
        />
      )}

      {cameraOpen && (
        <CameraCapture
          onCapture={(file) => {
            if (bulkCaptureRef.current) {
              bulkCaptureRef.current(file);
              bulkCaptureRef.current = null;
            } else {
              addImages([file]);
            }
            setCameraOpen(false);
          }}
          onClose={() => { bulkCaptureRef.current = null; setCameraOpen(false); }}
        />
      )}

      {showReveal && result && (
        <GradeReveal
          result={result}
          frontImage={(images.find(i => i.role === "front") ?? images[0])?.objectURL ?? null}
          onDone={() => setShowReveal(false)}
        />
      )}
      {/* Post-purchase confirmation banner */}
      {purchaseSuccess && (
        <div style={{
          position: "fixed", top: 52, left: 0, right: 0, zIndex: 595,
          background: purchaseSuccess === 'confirmed' ? "rgba(48,209,88,0.12)" : "rgba(201,168,76,0.08)",
          borderBottom: `1px solid ${purchaseSuccess === 'confirmed' ? "rgba(48,209,88,0.25)" : "rgba(201,168,76,0.2)"}`,
          padding: "10px 20px",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
        }}>
          {purchaseSuccess === 'polling' ? (
            <>
              <div style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid #c9a84c", borderTopColor: "transparent", animation: "cgonSpin 0.7s linear infinite" }} />
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: 500 }}>Confirming payment…</span>
            </>
          ) : (
            <>
              <svg width="14" height="11" viewBox="0 0 14 11" fill="none"><path d="M1 5.5L5 9.5L13 1.5" stroke="#30d158" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <span style={{ color: "#30d158", fontSize: 13, fontWeight: 600 }}>
                Payment confirmed —{userPlan ? ` ${Math.max(0, userPlan.grade_limit - userPlan.grades_used)} tokens` : " tokens"} added to your account
              </span>
              <button onClick={() => setPurchaseSuccess(null)} style={{ marginLeft: 8, background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 16, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
            </>
          )}
        </div>
      )}

      <LoadingOverlay message={loadingMessage} frontImageUrl={(images.find(i => i.role === "front") ?? images[0])?.objectURL} />
      {toast && <Toast onDone={() => setToast(false)} />}

      {legalPage && <LegalModal page={legalPage} onClose={() => setLegalPage(null)} />}

      {/* Footer */}
      <div style={{
        textAlign: "center",
        padding: "0 0 140px",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
      }}>
        <div style={{ display: "flex", gap: 20 }}>
          {[["privacy", "Privacy Policy"], ["terms", "Terms of Service"]].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setLegalPage(key)}
              style={{
                background: "none", border: "none",
                color: "rgba(255,255,255,0.2)", fontSize: 11,
                cursor: "pointer", fontFamily: "inherit",
                letterSpacing: "0.02em", padding: 0,
                textDecoration: "underline", textUnderlineOffset: 3,
                textDecorationColor: "rgba(255,255,255,0.1)",
              }}
            >{label}</button>
          ))}
        </div>
        <div style={{ color: "rgba(255,255,255,0.1)", fontSize: 10 }}>
          © 2026 CardGradeOrNot · AI estimates are not official PSA or BGS grades
        </div>
      </div>

      {/* Floating tab bar */}
      <nav style={{
        position: "fixed",
        bottom: 32,
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(22,22,24,0.92)",
        backdropFilter: "saturate(200%) blur(32px)",
        WebkitBackdropFilter: "saturate(200%) blur(32px)",
        border: "1px solid rgba(255,255,255,0.11)",
        borderRadius: 100,
        padding: "4px",
        display: "flex",
        zIndex: 200,
        boxShadow: "0 16px 48px rgba(0,0,0,0.75), 0 2px 10px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}>
        {TABS.map((tab) => {
          const locked = (tab.id === "market" || tab.id === "submit") && !result;
          const active = activeTab === tab.id;
          const unread = result && !locked && !active && !visitedTabs.has(tab.id) && (tab.id === "market" || tab.id === "submit");
          return (
            <button
              key={tab.id}
              onClick={() => { if (!locked) switchTab(tab.id); }}
              style={{
                padding: "9px 18px",
                borderRadius: 100,
                border: "none",
                background: active ? "rgba(255,255,255,0.11)" : "transparent",
                color: active ? "#fff" : unread ? "rgba(255,220,120,0.82)" : locked ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.4)",
                fontWeight: active ? 600 : unread ? 600 : 400,
                fontSize: 13,
                letterSpacing: "-0.01em",
                cursor: locked ? "default" : "pointer",
                fontFamily: "inherit",
                transition: "background 0.15s ease, color 0.15s ease",
                whiteSpace: "nowrap",
                boxShadow: active ? "0 1px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)" : "none",
              }}
            >
              {tab.label}
              {active  && <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#c9a84c", margin: "3px auto 0", boxShadow: "0 0 6px rgba(201,168,76,0.8)" }} />}
              {unread  && <div className="tab-unread-dot" style={{ width: 4, height: 4, borderRadius: "50%", background: "#c9a84c", margin: "3px auto 0" }} />}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

