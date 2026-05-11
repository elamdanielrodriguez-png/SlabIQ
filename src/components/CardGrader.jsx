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

function LoadingOverlay({ message }) {
  if (!message) return null;
  const mode = message.toLowerCase().includes("identify") ? "identify" : "grade";
  return <LoadingOverlayInner key={mode} isIdentify={mode === "identify"} />;
}

function LoadingOverlayInner({ isIdentify }) {
  const duration  = isIdentify ? 10000 : 33000;
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

  const activeStep = pcts.findIndex(t => progress < t);

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.94)",
      backdropFilter: "blur(24px)",
      WebkitBackdropFilter: "blur(24px)",
      zIndex: 500,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 32,
    }}>
      <div style={{ position: "relative", width: 72, height: 72 }}>
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

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: "0 40px" }}>
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

function extractJSON(text) {
  try { return JSON.parse(text); } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) try { return JSON.parse(fence[1]); } catch {}
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj) try { return JSON.parse(obj[0]); } catch {}
  return null;
}

function detectCardCentering(canvas, ctx) {
  const W = canvas.width, H = canvas.height;
  const d = ctx.getImageData(0, 0, W, H).data;

  const px = (x, y) => {
    const i = (Math.max(0,Math.min(H-1,y)) * W + Math.max(0,Math.min(W-1,x))) * 4;
    return [d[i], d[i+1], d[i+2]];
  };
  const dist2 = (a, b) => (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2;
  const mean3 = arr => {
    const s = arr.reduce((a,p) => [a[0]+p[0],a[1]+p[1],a[2]+p[2]], [0,0,0]);
    return s.map(v => v/arr.length);
  };

  // ── Card boundary detection ──────────────────────────────────────────────────
  const corners = [px(2,2), px(W-3,2), px(2,H-3), px(W-3,H-3)];
  const bgVar = Math.max(dist2(corners[0],corners[1]), dist2(corners[0],corners[2]), dist2(corners[1],corners[3]));
  let cL = 0, cR = W-1, cT = 0, cB = H-1;
  if (bgVar < 2500) {
    const bg = mean3(corners);
    const BG_THR = 50*50;
    const mx = Math.round(W/2), my = Math.round(H/2);
    for (let x=0; x<W*0.45; x++) if (dist2(px(x,my),bg)>BG_THR) { cL=x; break; }
    for (let x=W-1; x>W*0.55; x--) if (dist2(px(x,my),bg)>BG_THR) { cR=x; break; }
    for (let y=0; y<H*0.45; y++) if (dist2(px(mx,y),bg)>BG_THR) { cT=y; break; }
    for (let y=H-1; y>H*0.55; y--) if (dist2(px(mx,y),bg)>BG_THR) { cB=y; break; }
  }
  const cW = cR-cL, cH = cB-cT;
  if (cW < W*0.35 || cH < H*0.35) return null;

  const SCANS  = 17;   // scan lines per side
  const REF_D  = 15;   // pixels from edge sampled as border color reference
  const MAX_F  = 0.30; // max border = 30% of card dimension
  const MIN_PX = 5;    // minimum plausible border in pixels
  const STREAK = 4;    // consecutive diverging pixels required to confirm art started

  function measureOneSide(along, fromMin) {
    const [cardDim, eMin, eMax, pMin, pMax] = along === 'x'
      ? [cW, cL, cR, cT, cB]
      : [cH, cT, cB, cL, cR];
    const pDim = pMax - pMin;
    const edge = fromMin ? eMin : eMax;
    const dir  = fromMin ? 1 : -1;
    const maxD = Math.round(cardDim * MAX_F);

    const readings = [];
    for (let si = 1; si <= SCANS; si++) {
      const perp = Math.round(pMin + (si / (SCANS + 1)) * pDim);

      // Sample border color: first REF_D pixels from this edge
      const borderSamples = [];
      for (let dp = 1; dp <= REF_D; dp++) {
        const pos = edge + dir * dp;
        const [ex, ey] = along === 'x' ? [pos, perp] : [perp, pos];
        if (ex >= 0 && ex < W && ey >= 0 && ey < H) borderSamples.push(px(ex, ey));
      }
      if (borderSamples.length < REF_D * 0.5) continue;
      const borderColor = mean3(borderSamples);

      // Adaptive threshold: 4× the border's own color variance, clamped to a safe range.
      // Holographic/shimmery borders have high variance → higher threshold → fewer false fires.
      const borderVar = borderSamples.reduce((s,p) => s + dist2(p, borderColor), 0) / borderSamples.length;
      const THR = Math.max(28*28, Math.min(58*58, borderVar * 4));

      // Scan inward: require STREAK consecutive diverging pixels before declaring art started
      let streak = 0, found = null;
      for (let dp = REF_D + 1; dp < maxD; dp++) {
        const pos = edge + dir * dp;
        const [ex, ey] = along === 'x' ? [pos, perp] : [perp, pos];
        if (dist2(px(ex, ey), borderColor) > THR) {
          if (++streak >= STREAK) { found = dp - STREAK + 1; break; }
        } else {
          streak = 0;
        }
      }
      if (found !== null && found >= MIN_PX) readings.push(found);
    }

    // Need ≥40% of scan lines to fire
    if (readings.length < Math.ceil(SCANS * 0.40)) return null;
    readings.sort((a,b) => a-b);
    // 40th-percentile: slightly conservative — biases toward smaller (more reliable) readings
    return readings[Math.floor(readings.length * 0.4)];
  }

  let left  = measureOneSide('x', true);
  let right = measureOneSide('x', false);
  let top   = measureOneSide('y', true);
  let bot   = measureOneSide('y', false);

  if (!left || !right || !top || !bot) return null;

  // Total borders must be < 50% of card dimension (full-bleed = no borders)
  if (left+right > cW*0.5 || top+bot > cH*0.5) return null;

  // Asymmetry correction: ratio > 2.5 means the larger side hit a false trigger.
  // Cap the larger at 2× the smaller — still shows off-center but not wild.
  function correctPair(a, b) {
    if (Math.max(a,b) / Math.min(a,b) <= 2.5) return [a, b];
    const s = Math.min(a,b);
    return a > b ? [Math.round(s * 2.0), b] : [a, Math.round(s * 2.0)];
  }

  [left, right] = correctPair(left, right);
  [top,  bot  ] = correctPair(top,  bot);

  const lrT = left+right, tbT = top+bot;
  const leftPct   = Math.round(left/lrT*100);
  const rightPct  = 100-leftPct;
  const topPct    = Math.round(top/tbT*100);
  const bottomPct = 100-topPct;

  // Both axes near-perfect → no borders detected (borderless card), let AI handle it
  if (Math.abs(leftPct-50) < 2 && Math.abs(topPct-50) < 2) return null;

  return {
    leftPct, rightPct, topPct, bottomPct,
    lines: {
      leftOuter:   Math.max(cL / W, 0.001),
      leftInner:   (cL + left) / W,
      rightInner:  (cR - right) / W,
      rightOuter:  Math.min((cR + 1) / W, 0.999),
      topOuter:    Math.max(cT / H, 0.001),
      topInner:    (cT + top) / H,
      bottomInner: (cB - bot) / H,
      bottomOuter: Math.min((cB + 1) / H, 0.999),
    },
    cardBounds: { cL, cR, cT, cB },
    width: W,
    height: H,
  };
}

function processImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 2000;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const detected = detectCardCentering(canvas, ctx);

        canvas.toBlob((blob) => {
          resolve({
            imageData: canvas.toDataURL("image/jpeg", 0.92).split(",")[1],
            objectURL: blob ? URL.createObjectURL(blob) : URL.createObjectURL(file),
            centering: detected ? { leftPct: detected.leftPct, rightPct: detected.rightPct, topPct: detected.topPct, bottomPct: detected.bottomPct } : null,
            centeringLines: detected?.lines ?? null,
            cardBounds: detected?.cardBounds ?? { cL: 0, cR: w, cT: 0, cB: h },
            width: w,
            height: h,
          });
        }, "image/jpeg", 0.92);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Crop 8 zoom-in regions (4 corners + 4 edges) from a stored image — sent to server for loupe-style inspection
function cropZonesFromImageData(imageData, bounds) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = reject;
    img.onload = () => {
      const src = document.createElement("canvas");
      src.width = img.width;
      src.height = img.height;
      src.getContext("2d").drawImage(img, 0, 0);

      const { cL, cR, cT, cB } = bounds;
      const cW = cR - cL, cH = cB - cT;
      const corner = Math.round(Math.min(cW, cH) * 0.30);
      const edgeLong = Math.round(Math.max(cW, cH) * 0.50);
      const edgeShort = Math.round(Math.min(cW, cH) * 0.22);

      const crop = (x, y, w, h) => {
        const out = document.createElement("canvas");
        out.width = w; out.height = h;
        out.getContext("2d").drawImage(src, x, y, w, h, 0, 0, w, h);
        return out.toDataURL("image/jpeg", 0.9).split(",")[1];
      };

      resolve({
        "corner-TL":   crop(cL, cT, corner, corner),
        "corner-TR":   crop(cR - corner, cT, corner, corner),
        "corner-BL":   crop(cL, cB - corner, corner, corner),
        "corner-BR":   crop(cR - corner, cB - corner, corner, corner),
        "edge-top":    crop(cL + Math.round((cW - edgeLong) / 2), cT, edgeLong, edgeShort),
        "edge-bottom": crop(cL + Math.round((cW - edgeLong) / 2), cB - edgeShort, edgeLong, edgeShort),
        "edge-left":   crop(cL, cT + Math.round((cH - edgeLong) / 2), edgeShort, edgeLong),
        "edge-right":  crop(cR - edgeShort, cT + Math.round((cH - edgeLong) / 2), edgeShort, edgeLong),
      });
    };
    img.src = `data:image/jpeg;base64,${imageData}`;
  });
}

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
  const [selectedModel, setSelectedModel] = useState('claude-opus-4-7');
  const [purchaseSuccess, setPurchaseSuccess] = useState(null); // null | 'polling' | 'confirmed'

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
    setImages(prev => { prev.forEach(img => URL.revokeObjectURL(img.objectURL)); return []; });
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

      // Generate zoom-in crops of corners/edges from the front photo for loupe-style inspection
      const frontImg = images.find(img => img.role === "front") ?? images[0];
      let zoneCrops = null;
      if (frontImg?.cardBounds && frontImg?.imageData) {
        try {
          zoneCrops = await cropZonesFromImageData(frontImg.imageData, frontImg.cardBounds);
        } catch (err) {
          console.warn("Zone cropping failed:", err);
        }
      }

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
          maxWidth: 700,
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
      <main style={{ maxWidth: 700, margin: "0 auto", padding: "20px 16px 148px" }}>
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
          {activeTab === "market" && result && <MarketTab result={result} />}
          {activeTab === "submit" && result && <SubmitTab result={result} />}
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
          tokenBalance={gradesRemaining()}
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

      <LoadingOverlay message={loadingMessage} />
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

