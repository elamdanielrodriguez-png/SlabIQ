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
const VERSION = "2.5.0";

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

        // Auto-crop to just the card (scanner-feel) when detection found a card
        // smaller than the frame. Keeps a 4% margin so we never shave the card.
        let finalCanvas = canvas;
        let finalW = w, finalH = h;
        let finalBounds = detected?.cardBounds ?? { cL: 0, cR: w, cT: 0, cB: h };
        let finalLines = detected?.lines ?? null;

        if (detected?.cardBounds) {
          const { cL, cR, cT, cB } = detected.cardBounds;
          const cardW = cR - cL, cardH = cB - cT;
          const cardFillsFrame = (cardW / w) > 0.92 && (cardH / h) > 0.92;
          if (!cardFillsFrame) {
            const mX = Math.round(cardW * 0.04);
            const mY = Math.round(cardH * 0.04);
            const cropX = Math.max(0, cL - mX);
            const cropY = Math.max(0, cT - mY);
            const cropW = Math.min(w - cropX, cardW + mX * 2);
            const cropH = Math.min(h - cropY, cardH + mY * 2);

            const cropped = document.createElement("canvas");
            cropped.width = cropW;
            cropped.height = cropH;
            cropped.getContext("2d").drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

            finalCanvas = cropped;
            finalW = cropW;
            finalH = cropH;
            finalBounds = { cL: cL - cropX, cR: cR - cropX, cT: cT - cropY, cB: cB - cropY };

            // Translate the auto-detected centering lines from the original frame's
            // coordinate system to the cropped frame so the editor still places them
            // correctly on the card edges.
            if (detected.lines) {
              const tx = (frac, total, off, newTot) => (frac * total - off) / newTot;
              finalLines = {
                leftOuter:   Math.max(tx(detected.lines.leftOuter,   w, cropX, cropW), 0.001),
                leftInner:           tx(detected.lines.leftInner,    w, cropX, cropW),
                rightInner:          tx(detected.lines.rightInner,   w, cropX, cropW),
                rightOuter:  Math.min(tx(detected.lines.rightOuter,  w, cropX, cropW), 0.999),
                topOuter:    Math.max(tx(detected.lines.topOuter,    h, cropY, cropH), 0.001),
                topInner:            tx(detected.lines.topInner,     h, cropY, cropH),
                bottomInner:         tx(detected.lines.bottomInner,  h, cropY, cropH),
                bottomOuter: Math.min(tx(detected.lines.bottomOuter, h, cropY, cropH), 0.999),
              };
            }
          }
        }

        finalCanvas.toBlob((blob) => {
          resolve({
            imageData: finalCanvas.toDataURL("image/jpeg", 0.92).split(",")[1],
            objectURL: blob ? URL.createObjectURL(blob) : null,
            centering: detected ? { leftPct: detected.leftPct, rightPct: detected.rightPct, topPct: detected.topPct, bottomPct: detected.bottomPct } : null,
            centeringLines: finalLines,
            cardBounds: finalBounds,
            width: finalW,
            height: finalH,
          });
        }, "image/jpeg", 0.92);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ─── Perspective correction (Path C: scanner mode) ────────────────────────────
// Solve 8x8 linear system via Gaussian elimination with partial pivoting
function solveLinear8x8(A, b) {
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) {
    let max = i;
    for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[max][i])) max = k;
    [M[i], M[max]] = [M[max], M[i]];
    for (let k = i + 1; k < n; k++) {
      const f = M[k][i] / M[i][i];
      for (let j = i; j <= n; j++) M[k][j] -= f * M[i][j];
    }
  }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n];
    for (let j = i + 1; j < n; j++) x[i] -= M[i][j] * x[j];
    x[i] /= M[i][i];
  }
  return x;
}

// Homography mapping 4 source points to 4 destination points (returns 9 floats)
function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(u);
    b.push(v);
  }
  const h = solveLinear8x8(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

// Perspective-correct a quad in the source canvas to a rectangular output canvas
function perspectiveCorrect(srcCanvas, corners, outW, outH) {
  const H = homography(
    [[0, 0], [outW - 1, 0], [outW - 1, outH - 1], [0, outH - 1]],
    [[corners.tl.x, corners.tl.y], [corners.tr.x, corners.tr.y], [corners.br.x, corners.br.y], [corners.bl.x, corners.bl.y]]
  );
  const sw = srcCanvas.width, sh = srcCanvas.height;
  const srcCtx = srcCanvas.getContext("2d");
  const sd = srcCtx.getImageData(0, 0, sw, sh).data;

  const dst = document.createElement("canvas");
  dst.width = outW;
  dst.height = outH;
  const dstCtx = dst.getContext("2d");
  const dstImage = dstCtx.createImageData(outW, outH);
  const dd = dstImage.data;

  const h0 = H[0], h1 = H[1], h2 = H[2], h3 = H[3], h4 = H[4], h5 = H[5], h6 = H[6], h7 = H[7], h8 = H[8];

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const w = h6 * x + h7 * y + h8;
      const sx = (h0 * x + h1 * y + h2) / w;
      const sy = (h3 * x + h4 * y + h5) / w;
      const di = (y * outW + x) * 4;
      if (sx < 0 || sx >= sw - 1 || sy < 0 || sy >= sh - 1) {
        dd[di] = 0; dd[di + 1] = 0; dd[di + 2] = 0; dd[di + 3] = 255;
        continue;
      }
      const x0 = sx | 0, y0 = sy | 0;
      const fx = sx - x0, fy = sy - y0;
      const fx1 = 1 - fx, fy1 = 1 - fy;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + sw * 4;
      const i11 = i01 + 4;
      dd[di]     = (sd[i00]     * fx1 * fy1 + sd[i10]     * fx * fy1 + sd[i01]     * fx1 * fy + sd[i11]     * fx * fy) | 0;
      dd[di + 1] = (sd[i00 + 1] * fx1 * fy1 + sd[i10 + 1] * fx * fy1 + sd[i01 + 1] * fx1 * fy + sd[i11 + 1] * fx * fy) | 0;
      dd[di + 2] = (sd[i00 + 2] * fx1 * fy1 + sd[i10 + 2] * fx * fy1 + sd[i01 + 2] * fx1 * fy + sd[i11 + 2] * fx * fy) | 0;
      dd[di + 3] = 255;
    }
  }
  dstCtx.putImageData(dstImage, 0, 0);
  return dst;
}

async function fetchCardCorners(imageData) {
  try {
    const res = await fetch("/api/find-corners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageData }),
    });
    const data = await res.json();
    return data.corners ?? null;
  } catch {
    return null;
  }
}

// Pixel-based corner detection: finds the actual physical corners of a tilted card
// by sampling background, masking card pixels, and finding the extreme pixel in each
// of 4 quadrants from the card centroid. Pixel-precise, no API call, no model latency.
function findCornersFromPixels(canvas, ctx) {
  const W = canvas.width, H = canvas.height;
  const data = ctx.getImageData(0, 0, W, H).data;
  const px = (x, y) => {
    const i = (y * W + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

  // Sample 8 perimeter points for background — corners + edge midpoints
  const samples = [
    px(3, 3), px(W - 4, 3), px(3, H - 4), px(W - 4, H - 4),
    px(W >> 1, 3), px(W >> 1, H - 4), px(3, H >> 1), px(W - 4, H >> 1),
  ];
  // Background must be roughly uniform across multiple perimeter points
  let maxVar = 0;
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      maxVar = Math.max(maxVar, dist2(samples[i], samples[j]));
    }
  }
  if (maxVar > 4000) return null; // background too varied — can't reliably segment

  const bg = [0, 0, 0];
  for (const s of samples) { bg[0] += s[0]; bg[1] += s[1]; bg[2] += s[2]; }
  bg[0] /= samples.length; bg[1] /= samples.length; bg[2] /= samples.length;
  const THR = 55 * 55; // squared color distance threshold for "card" vs "background"

  // Pass 1: find centroid of card pixels
  const STEP = Math.max(2, Math.round(Math.min(W, H) / 600));
  let count = 0, cx = 0, cy = 0;
  for (let y = 0; y < H; y += STEP) {
    for (let x = 0; x < W; x += STEP) {
      if (dist2(px(x, y), bg) > THR) { count++; cx += x; cy += y; }
    }
  }
  if (count < 500) return null;
  cx /= count; cy /= count;

  // Pass 2: find extreme card pixel in each quadrant relative to centroid
  let tl = { d: -1, x: 0, y: 0 };
  let tr = { d: -1, x: 0, y: 0 };
  let bl = { d: -1, x: 0, y: 0 };
  let br = { d: -1, x: 0, y: 0 };
  for (let y = 0; y < H; y += STEP) {
    for (let x = 0; x < W; x += STEP) {
      if (dist2(px(x, y), bg) > THR) {
        const d = (x - cx) ** 2 + (y - cy) ** 2;
        const dx = x - cx, dy = y - cy;
        if (dx <= 0 && dy <= 0 && d > tl.d) { tl = { d, x, y }; }
        else if (dx >= 0 && dy <= 0 && d > tr.d) { tr = { d, x, y }; }
        else if (dx <= 0 && dy >= 0 && d > bl.d) { bl = { d, x, y }; }
        else if (dx >= 0 && dy >= 0 && d > br.d) { br = { d, x, y }; }
      }
    }
  }
  if (tl.d < 0 || tr.d < 0 || bl.d < 0 || br.d < 0) return null;

  return {
    tl: { x: tl.x / W, y: tl.y / H },
    tr: { x: tr.x / W, y: tr.y / H },
    br: { x: br.x / W, y: br.y / H },
    bl: { x: bl.x / W, y: bl.y / H },
  };
}

function detectCornersFromImageData(imageData) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = reject;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      resolve(findCornersFromPixels(canvas, ctx));
    };
    img.src = `data:image/jpeg;base64,${imageData}`;
  });
}

function validCorners(c) {
  if (!c?.tl || !c?.tr || !c?.br || !c?.bl) return false;
  for (const k of ["tl", "tr", "br", "bl"]) {
    const p = c[k];
    if (typeof p?.x !== "number" || typeof p?.y !== "number") return false;
    if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return false;
  }
  // Sanity: corners should be ordered roughly correctly (loose tolerance to allow tilted cards)
  if (c.tl.x >= c.tr.x) return false;
  if (c.tl.y >= c.bl.y) return false;
  if (c.bl.x >= c.br.x) return false;
  if (c.tr.y >= c.br.y) return false;
  // Quad must have meaningful area (not a degenerate flat shape)
  const minX = Math.min(c.tl.x, c.bl.x);
  const maxX = Math.max(c.tr.x, c.br.x);
  const minY = Math.min(c.tl.y, c.tr.y);
  const maxY = Math.max(c.bl.y, c.br.y);
  if (maxX - minX < 0.2 || maxY - minY < 0.2) return false;
  return true;
}

// Run perspective correction on a base64 image using AI-detected corners
function perspectiveCorrectImage(imageData, corners) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = reject;
    img.onload = () => {
      const src = document.createElement("canvas");
      src.width = img.width;
      src.height = img.height;
      src.getContext("2d").drawImage(img, 0, 0);

      const px = {
        tl: { x: corners.tl.x * img.width, y: corners.tl.y * img.height },
        tr: { x: corners.tr.x * img.width, y: corners.tr.y * img.height },
        br: { x: corners.br.x * img.width, y: corners.br.y * img.height },
        bl: { x: corners.bl.x * img.width, y: corners.bl.y * img.height },
      };

      const avgW = (Math.hypot(px.tr.x - px.tl.x, px.tr.y - px.tl.y) + Math.hypot(px.br.x - px.bl.x, px.br.y - px.bl.y)) / 2;
      const avgH = (Math.hypot(px.bl.x - px.tl.x, px.bl.y - px.tl.y) + Math.hypot(px.br.x - px.tr.x, px.br.y - px.tr.y)) / 2;

      // Snap to standard card aspect (5:7 = 0.714)
      const RATIO = 5 / 7;
      let outW, outH;
      if (avgW / avgH > RATIO) {
        outH = Math.round(avgH);
        outW = Math.round(outH * RATIO);
      } else {
        outW = Math.round(avgW);
        outH = Math.round(outW / RATIO);
      }
      const MAX = 2000;
      if (outW > MAX || outH > MAX) {
        const s = MAX / Math.max(outW, outH);
        outW = Math.round(outW * s);
        outH = Math.round(outH * s);
      }
      if (outW < 200 || outH < 200) return reject(new Error("Output too small"));

      const corrected = perspectiveCorrect(src, px, outW, outH);
      const ctx = corrected.getContext("2d");
      const detected = detectCardCentering(corrected, ctx);

      corrected.toBlob((blob) => {
        resolve({
          imageData: corrected.toDataURL("image/jpeg", 0.92).split(",")[1],
          objectURL: blob ? URL.createObjectURL(blob) : null,
          centering: detected ? { leftPct: detected.leftPct, rightPct: detected.rightPct, topPct: detected.topPct, bottomPct: detected.bottomPct } : null,
          centeringLines: detected?.lines ?? null,
          cardBounds: detected?.cardBounds ?? { cL: 0, cR: outW, cT: 0, cB: outH },
          width: outW,
          height: outH,
        });
      }, "image/jpeg", 0.92);
    };
    img.src = `data:image/jpeg;base64,${imageData}`;
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
  const [scanStatus, setScanStatus] = useState(null);

  const addImages = async (files) => {
    const slots = 10 - images.length;
    if (slots <= 0) return;
    const currentCount = images.length;
    setScanStatus('Scanning card edges…');
    const processed = await Promise.all(
      [...files].slice(0, slots).map(async (file, fileIdx) => {
        const base = await processImageFile(file);
        const slot = currentCount + fileIdx;
        const role = slot === 0 ? 'front' : slot === 1 ? 'back' : 'detail';

        // Path C: perspective-correct front/back only. Detail shots (3rd+) are
        // intentionally angled to show surface flaws under raking light, so leave them alone.
        if (role === 'front' || role === 'back') {
          try {
            // Try pixel-based corner detection first (precise, free, no API latency).
            // Falls back to AI (Opus) if the background is too varied to segment cleanly.
            let corners = await detectCornersFromImageData(base.imageData);
            let source = 'pixel';
            if (!validCorners(corners)) {
              corners = await fetchCardCorners(base.imageData);
              source = 'ai';
            }
            if (validCorners(corners)) {
              const corrected = await perspectiveCorrectImage(base.imageData, corners);
              if (base.objectURL) URL.revokeObjectURL(base.objectURL);
              console.log(`[scanner] ${role}: perspective-corrected via ${source} ✓`);
              return { ...corrected, role, scanned: true };
            } else {
              console.warn(`[scanner] ${role}: no valid corners (pixel + ai both failed) — keeping original`);
            }
          } catch (e) {
            console.warn(`[scanner] ${role}: failed —`, e);
          }
        }

        return { ...base, role };
      })
    );
    setScanStatus(null);
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
      // Always show picker — user explicitly confirms even when AI is confident.
      // Past experience: 98% confidence has been wrong, picker is a one-tap safety net.
      setCandidates(data.candidates || []);
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
            scanStatus={scanStatus}
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
