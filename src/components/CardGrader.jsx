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
const VERSION = "2.0.0";

import { useState } from "react";
import GradeTab from "./GradeTab";
import MarketTab from "./MarketTab";
import SubmitTab from "./SubmitTab";

const TABS = [
  { id: "grade", label: "Grade" },
  { id: "market", label: "Market" },
  { id: "submit", label: "Submit" },
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
        resolve({
          imageData: canvas.toDataURL("image/jpeg", 0.92).split(",")[1],
          centering: detected ? { leftPct: detected.leftPct, rightPct: detected.rightPct, topPct: detected.topPct, bottomPct: detected.bottomPct } : null,
          centeringLines: detected?.lines ?? null,
          cardBounds: detected?.cardBounds ?? { cL: 0, cR: w, cT: 0, cB: h },
          width: w,
          height: h,
        });
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

export default function CardGrader() {
  const [activeTab, setActiveTab] = useState("grade");
  const [images, setImages] = useState([]);
  const [result, setResult] = useState(null);
  const [candidates, setCandidates] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const addImages = async (files) => {
    const slots = 10 - images.length;
    if (slots <= 0) return;
    const currentCount = images.length;
    const processed = await Promise.all(
      [...files].slice(0, slots).map(async (file, fileIdx) => {
        const { imageData, centering, centeringLines, cardBounds, width, height } = await processImageFile(file);
        const slot = currentCount + fileIdx;
        const role = slot === 0 ? 'front' : slot === 1 ? 'back' : 'detail';
        return { objectURL: URL.createObjectURL(file), imageData, centering, centeringLines, cardBounds, width, height, role };
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
    setImages(prev => prev.map((img, i) => i !== idx ? img : { ...img, centering, centeringLines: lines }));
    // Only the front photo's centering drives BGS overall + PSA. Front = role 'front' or index 0.
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

  const identifyCard = async () => {
    if (!images.length) return;
    setLoading(true);
    setError(null);
    setCandidates(null);
    setResult(null);
    try {
      const res = await fetch("/api/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: images.map((i) => i.imageData) }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.candidates?.length === 1 && (data.confidence ?? 0) >= 98) {
        await gradeCards(data.candidates[0]);
      } else {
        setCandidates(data.candidates || []);
      }
    } catch (err) {
      setError(err.message || "Could not identify card. Please try again.");
    } finally {
      setLoading(false);
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

      const res = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: images.map((i) => i.imageData),
          confirmedCard: { player, year, set, variant, cardNumber },
          zoneCrops,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const parsed = extractJSON(data.content?.[0]?.text || "");
      if (!parsed) {
        setError("Could not parse grading response. Please try again.");
      } else {
        setResult(parsed);
        setCandidates(null);
      }
    } catch (err) {
      setError(err.message || "API error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#000",
      color: "#fff",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', system-ui, sans-serif",
      WebkitFontSmoothing: "antialiased",
    }}>
      {/* Frosted glass header */}
      <header style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
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
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.4px", color: "#fff" }}>
              SlabIQ
            </span>
            <span style={{ fontSize: 11, fontWeight: 500, color: "#c9a84c", letterSpacing: "0.06em" }}>
              PSA · BGS · v{VERSION}
            </span>
          </div>
          {result && (
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.28)", fontWeight: 400, letterSpacing: "-0.1px" }}>
              {result.player}
            </span>
          )}
        </div>
      </header>

      {/* Main content */}
      <main style={{ maxWidth: 700, margin: "0 auto", padding: "20px 20px 120px" }}>
        {activeTab === "grade" && (
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
          />
        )}
        {activeTab === "market" && result && <MarketTab result={result} />}
        {activeTab === "submit" && result && <SubmitTab result={result} />}
      </main>

      {/* Floating tab bar — always visible */}
      <nav style={{
        position: "fixed",
        bottom: 28,
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(28,28,30,0.86)",
        backdropFilter: "saturate(180%) blur(28px)",
        WebkitBackdropFilter: "saturate(180%) blur(28px)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 100,
        padding: "5px",
        display: "flex",
        zIndex: 200,
        boxShadow: "0 12px 40px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.5)",
      }}>
        {TABS.map((tab) => {
          const locked = tab.id !== "grade" && !result;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => !locked && setActiveTab(tab.id)}
              style={{
                padding: "9px 28px",
                borderRadius: 100,
                border: "none",
                background: active ? "rgba(255,255,255,0.14)" : "transparent",
                color: active ? "#fff" : locked ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.42)",
                fontWeight: active ? 600 : 400,
                fontSize: 14,
                letterSpacing: "-0.01em",
                cursor: locked ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                transition: "background 0.18s ease, color 0.18s ease",
                whiteSpace: "nowrap",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
