export function extractJSON(text) {
  try { return JSON.parse(text); } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) try { return JSON.parse(fence[1]); } catch {}
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj) try { return JSON.parse(obj[0]); } catch {}
  return null;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const _clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ─── Level 1a: Sobel edge magnitude map ──────────────────────────────────────
// Returns a Float32Array (W×H) of gradient magnitude at each pixel.
// Used as the foundation for all three levels.
function _sobel(d, W, H) {
  // Pre-compute grayscale to avoid repeated channel math
  const g = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  }
  const s = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    const r = y * W;
    for (let x = 1; x < W - 1; x++) {
      const gx =
        -g[r - W + x - 1] + g[r - W + x + 1]
        - 2 * g[r + x - 1] + 2 * g[r + x + 1]
        - g[r + W + x - 1] + g[r + W + x + 1];
      const gy =
        -g[r - W + x - 1] - 2 * g[r - W + x] - g[r - W + x + 1]
        + g[r + W + x - 1] + 2 * g[r + W + x] + g[r + W + x + 1];
      s[r + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return s;
}

// Centered moving average over a 1-D array (radius r)
function _smooth1d(arr, r = 5) {
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    let sum = 0, cnt = 0;
    for (let j = Math.max(0, i - r); j <= Math.min(arr.length - 1, i + r); j++) {
      sum += arr[j]; cnt++;
    }
    out[i] = sum / cnt;
  }
  return out;
}

// ─── Level 1b: Card boundary from edge projections ───────────────────────────
// Projects edge energy onto X and Y axes, then finds the outermost
// dominant peaks — which correspond to the card's physical edges.
// Robust to varied backgrounds because it looks for the STRONGEST
// consistent line, not a specific colour.
function _findBoundsFromEdges(sobelMap, W, H) {
  const colSum = new Float32Array(W);
  const rowSum = new Float32Array(H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      colSum[x] += sobelMap[y * W + x];
      rowSum[y] += sobelMap[y * W + x];
    }
  }
  const cs = _smooth1d(colSum, 6);
  const rs = _smooth1d(rowSum, 6);

  const csMax = Math.max(...cs);
  const rsMax = Math.max(...rs);
  if (csMax < 1 || rsMax < 1) return null;

  const cThr = csMax * 0.12;
  const rThr = rsMax * 0.12;

  // Walk inward from each side and find the first local peak above threshold
  let cL = 1;
  for (let x = 1; x < Math.floor(W * 0.45); x++) {
    if (cs[x] > cThr && cs[x] >= cs[x - 1] && cs[x] >= (cs[x + 1] ?? 0)) { cL = x; break; }
  }
  let cR = W - 2;
  for (let x = W - 2; x > Math.ceil(W * 0.55); x--) {
    if (cs[x] > cThr && cs[x] >= cs[x + 1] && cs[x] >= (cs[x - 1] ?? 0)) { cR = x; break; }
  }
  let cT = 1;
  for (let y = 1; y < Math.floor(H * 0.45); y++) {
    if (rs[y] > rThr && rs[y] >= rs[y - 1] && rs[y] >= (rs[y + 1] ?? 0)) { cT = y; break; }
  }
  let cB = H - 2;
  for (let y = H - 2; y > Math.ceil(H * 0.55); y--) {
    if (rs[y] > rThr && rs[y] >= rs[y + 1] && rs[y] >= (rs[y - 1] ?? 0)) { cB = y; break; }
  }

  if (cR - cL < W * 0.3 || cB - cT < H * 0.3) return null;
  return { cL, cR, cT, cB };
}

// ─── Level 1c: Background-colour fallback ─────────────────────────────────────
// Original approach: sample the 4 photo corners to establish background colour,
// then scan inward until pixels differ from it. Works well on plain backgrounds.
function _findBoundsBg(d, W, H) {
  const px    = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const dist2 = (a, b) => (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2;
  const mean3 = arr => arr.reduce((a, p) => [a[0]+p[0], a[1]+p[1], a[2]+p[2]], [0,0,0]).map(v => v / arr.length);

  const corners = [px(2, 2), px(W-3, 2), px(2, H-3), px(W-3, H-3)];
  const bgVar = Math.max(dist2(corners[0], corners[1]), dist2(corners[0], corners[2]), dist2(corners[1], corners[3]));
  if (bgVar >= 2500) return null; // background too varied — projection approach needed

  const bg = mean3(corners);
  const BG_THR = 50 * 50;
  const mx = Math.round(W / 2), my = Math.round(H / 2);
  let cL = 0, cR = W - 1, cT = 0, cB = H - 1;
  for (let x = 0; x < W * 0.45; x++) if (dist2(px(x, my), bg) > BG_THR) { cL = x; break; }
  for (let x = W-1; x > W * 0.55; x--) if (dist2(px(x, my), bg) > BG_THR) { cR = x; break; }
  for (let y = 0; y < H * 0.45; y++) if (dist2(px(mx, y), bg) > BG_THR) { cT = y; break; }
  for (let y = H-1; y > H * 0.55; y--) if (dist2(px(mx, y), bg) > BG_THR) { cB = y; break; }

  if (cR - cL < W * 0.35 || cB - cT < H * 0.35) return null;
  return { cL, cR, cT, cB };
}

// ─── Level 2: Precise card corners from fitted edge lines ─────────────────────
// Given the approximate bounding box, this function:
//   1. Collects the strongest edge pixel near each of the 4 card edges across
//      many scan lines (sampling the middle 80% of each edge to avoid corners).
//   2. Fits a line through those points using least-squares regression.
//   3. Intersects adjacent edge lines to get the 4 precise card corners.
//
// This handles rotation: a tilted card has diagonal edge lines whose intersection
// gives the true corner position, eliminating perspective distortion in the
// subsequent border measurement.
function _findCorners(sobelMap, W, H, bounds) {
  const { cL, cR, cT, cB } = bounds;
  const cW = cR - cL, cH = cB - cT;
  // Search radius around each known edge position
  const SR  = Math.max(6, Math.round(Math.min(cW, cH) * 0.04));
  const THR = 18; // minimum Sobel magnitude to count as an edge pixel

  // Collect edge points along one side of the card.
  // 'fixed' is the approximate pixel coordinate of the edge.
  // 'axis' tells us which direction to search (perpendicular to the edge).
  // 'pMin/pMax' is the range to scan along the edge.
  function collectEdgePoints(fixed, axis, pMin, pMax) {
    const pts = [];
    const step = Math.max(1, Math.round((pMax - pMin) / 60));
    for (let p = pMin; p <= pMax; p += step) {
      let bestV = 0, bestPos = -1;
      const lo = Math.max(0, fixed - SR);
      const hi = Math.min(axis === 'col' ? W : H, fixed + SR);
      for (let q = lo; q < hi; q++) {
        const v = axis === 'col' ? sobelMap[p * W + q] : sobelMap[q * W + p];
        if (v > bestV) { bestV = v; bestPos = q; }
      }
      if (bestPos >= 0 && bestV > THR) {
        pts.push(axis === 'col' ? [bestPos, p] : [p, bestPos]);
      }
    }
    return pts;
  }

  // Inner 80% of each edge (avoid corners which are noisy)
  const lPts = collectEdgePoints(cL, 'col', Math.round(cT + cH*0.1), Math.round(cB - cH*0.1));
  const rPts = collectEdgePoints(cR, 'col', Math.round(cT + cH*0.1), Math.round(cB - cH*0.1));
  const tPts = collectEdgePoints(cT, 'row', Math.round(cL + cW*0.1), Math.round(cR - cW*0.1));
  const bPts = collectEdgePoints(cB, 'row', Math.round(cL + cW*0.1), Math.round(cR - cW*0.1));

  if (lPts.length < 5 || rPts.length < 5 || tPts.length < 5 || bPts.length < 5) return null;

  // Fit a line through a set of points.
  // Vertical edges  → x = a*y + b  (x is function of y, handles near-vertical lines)
  // Horizontal edges → y = a*x + b
  function fitV(pts) {
    const n = pts.length;
    const my = pts.reduce((s, p) => s + p[1], 0) / n;
    const mx = pts.reduce((s, p) => s + p[0], 0) / n;
    let num = 0, den = 0;
    for (const [x, y] of pts) { num += (y - my) * (x - mx); den += (y - my) ** 2; }
    const a = den > 1 ? num / den : 0;
    return { a, b: mx - a * my }; // x = a*y + b
  }
  function fitH(pts) {
    const n = pts.length;
    const mx = pts.reduce((s, p) => s + p[0], 0) / n;
    const my = pts.reduce((s, p) => s + p[1], 0) / n;
    let num = 0, den = 0;
    for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) ** 2; }
    const a = den > 1 ? num / den : 0;
    return { a, b: my - a * mx }; // y = a*x + b
  }

  // Intersect a vertical line (x=a*y+b) with a horizontal line (y=c*x+d)
  function intersect(vL, hL) {
    // x = vL.a*(hL.a*x + hL.b) + vL.b  →  x(1 - vL.a*hL.a) = vL.a*hL.b + vL.b
    const denom = 1 - vL.a * hL.a;
    if (Math.abs(denom) < 0.01) return null; // lines are nearly parallel
    const x = (vL.a * hL.b + vL.b) / denom;
    return [x, hL.a * x + hL.b];
  }

  const lL = fitV(lPts), rL = fitV(rPts);
  const tL = fitH(tPts), bL = fitH(bPts);

  const TL = intersect(lL, tL);
  const TR = intersect(rL, tL);
  const BL = intersect(lL, bL);
  const BR = intersect(rL, bL);

  if (!TL || !TR || !BL || !BR) return null;

  // Validate: corners must form a sensible near-rectangular quadrilateral
  const wT = TR[0] - TL[0], wB = BR[0] - BL[0];
  const hL2 = BL[1] - TL[1], hR = BR[1] - TR[1];
  if (wT < cW * 0.7 || wB < cW * 0.7) return null;
  if (hL2 < cH * 0.7 || hR < cH * 0.7) return null;
  // Reject severely skewed quads (card tilted more than ~15°)
  if (Math.max(wT, wB) / Math.min(wT, wB) > 1.28) return null;
  if (Math.max(hL2, hR) / Math.min(hL2, hR) > 1.28) return null;

  return { TL, TR, BL, BR };
}

// ─── Level 2+3: Perspective-aware border measurement with content detection ───
// For each of the 4 sides:
//   - Runs SCANS evenly-spaced scan lines perpendicular to the actual card edge
//     (using the real edge direction from the corner coordinates, not axis-aligned).
//     This eliminates angle-distortion error from camera tilt (Level 2).
//   - On each scan line, samples ~10px inward to establish the border colour,
//     then continues scanning until it detects a high-variance / strong-colour-jump
//     region — the transition from uniform border to card content (Level 3).
//   - Returns the 40th-percentile reading across scan lines (robust to outliers
//     from holograms, foil edges, or dirt near the card edge).
function _measureBordersWithCorners(d, W, H, corners) {
  const { TL, TR, BL, BR } = corners;
  const SCANS   = 19;
  const MAX_FRAC = 0.40; // border can't exceed 40% of card dimension
  const WIN     = 5;     // sliding window for variance computation
  const VAR_THR = 380;   // variance threshold: content starts here
  const COL_THR = 2800;  // colour-distance threshold: sudden colour jump = content

  function spx(x, y) {
    x = _clamp(Math.round(x), 0, W - 1);
    y = _clamp(Math.round(y), 0, H - 1);
    const i = (y * W + x) * 4;
    return [d[i], d[i + 1], d[i + 2]];
  }
  const lerp   = (p1, p2, t) => [p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t];
  const vlen   = v => Math.sqrt(v[0] ** 2 + v[1] ** 2);
  const vnorm  = v => { const l = vlen(v) || 1; return [v[0] / l, v[1] / l]; };

  function measureSide(eA, eB, oA, oB) {
    // Inward unit vector: perpendicular to the edge, pointing toward card centre
    const edgeDir = vnorm([eB[0] - eA[0], eB[1] - eA[1]]);
    const cand1   = [-edgeDir[1],  edgeDir[0]];
    const cand2   = [ edgeDir[1], -edgeDir[0]];
    const midE    = lerp(eA, eB, 0.5);
    const midO    = lerp(oA, oB, 0.5);
    const toCenter = [midO[0] - midE[0], midO[1] - midE[1]];
    const inward  = (cand1[0] * toCenter[0] + cand1[1] * toCenter[1] > 0) ? cand1 : cand2;

    const edgeLen = vlen([eB[0] - eA[0], eB[1] - eA[1]]);
    const maxD    = edgeLen * MAX_FRAC;

    const readings = [];
    for (let si = 1; si <= SCANS; si++) {
      const t  = si / (SCANS + 1);
      const ep = lerp(eA, eB, t); // point on the card edge for this scan line

      // Sample the first ~10px inward to characterise the border colour
      const bSamples = [];
      for (let dp = 2; dp <= 11; dp++) {
        bSamples.push(spx(ep[0] + inward[0] * dp, ep[1] + inward[1] * dp));
      }
      if (bSamples.length < 5) continue;
      const bColor = bSamples
        .reduce((a, p) => [a[0]+p[0], a[1]+p[1], a[2]+p[2]], [0, 0, 0])
        .map(v => v / bSamples.length);

      // Continue scanning inward, looking for content boundary (Level 3)
      const acc = [...bSamples];
      let found = null;
      for (let dp = 12; dp < maxD; dp++) {
        acc.push(spx(ep[0] + inward[0] * dp, ep[1] + inward[1] * dp));
        if (acc.length < WIN * 2) continue;

        const recent   = acc.slice(-WIN);
        const mr = recent.reduce((s, p) => s + p[0], 0) / WIN;
        const mg = recent.reduce((s, p) => s + p[1], 0) / WIN;
        const mb = recent.reduce((s, p) => s + p[2], 0) / WIN;
        // High local variance = we've entered the card artwork/content
        const variance = recent.reduce((s, p) => s + (p[0]-mr)**2 + (p[1]-mg)**2 + (p[2]-mb)**2, 0) / WIN;
        // Sudden colour shift away from the border baseline colour
        const last = acc[acc.length - 1];
        const colorJump = (last[0]-bColor[0])**2 + (last[1]-bColor[1])**2 + (last[2]-bColor[2])**2;

        if (variance > VAR_THR || colorJump > COL_THR) { found = dp - WIN; break; }
      }
      if (found !== null && found >= 3) readings.push(found);
    }

    if (readings.length < Math.ceil(SCANS * 0.35)) return null;
    readings.sort((a, b) => a - b);
    return readings[Math.floor(readings.length * 0.40)]; // 40th-percentile: ignore outliers
  }

  return {
    left:   measureSide(TL, BL, TR, BR),
    right:  measureSide(TR, BR, TL, BL),
    top:    measureSide(TL, TR, BL, BR),
    bottom: measureSide(BL, BR, TL, TR),
  };
}

// ─── Axis-aligned fallback (if corner detection fails) ────────────────────────
// Still applies Level 3 content-boundary detection, but samples axis-aligned
// rather than perpendicular to the actual card edge.
function _measureBordersAxisAligned(d, W, H, bounds) {
  const { cL, cR, cT, cB } = bounds;
  const cW = cR - cL, cH = cB - cT;
  const SCANS    = 17;
  const MAX_F    = 0.38;
  const WIN      = 5;
  const VAR_THR  = 380;
  const COL_THR  = 2800;

  function spx(x, y) {
    x = _clamp(Math.round(x), 0, W - 1);
    y = _clamp(Math.round(y), 0, H - 1);
    const i = (y * W + x) * 4;
    return [d[i], d[i + 1], d[i + 2]];
  }

  function measureSide(along, fromMin) {
    const [dim, eMin, eMax, pMin, pMax] = along === 'x'
      ? [cW, cL, cR, cT, cB]
      : [cH, cT, cB, cL, cR];
    const pDim = pMax - pMin;
    const edge = fromMin ? eMin : eMax;
    const dir  = fromMin ? 1 : -1;
    const maxD = Math.round(dim * MAX_F);

    const readings = [];
    for (let si = 1; si <= SCANS; si++) {
      const perp = Math.round(pMin + (si / (SCANS + 1)) * pDim);

      // Border colour sample
      const bSamples = [];
      for (let dp = 2; dp <= 11; dp++) {
        const pos = edge + dir * dp;
        const [ex, ey] = along === 'x' ? [pos, perp] : [perp, pos];
        if (ex >= 0 && ex < W && ey >= 0 && ey < H) bSamples.push(spx(ex, ey));
      }
      if (bSamples.length < 5) continue;
      const bColor = bSamples
        .reduce((a, p) => [a[0]+p[0], a[1]+p[1], a[2]+p[2]], [0, 0, 0])
        .map(v => v / bSamples.length);

      // Scan for content boundary (Level 3)
      const acc = [...bSamples];
      let found = null;
      for (let dp = 12; dp < maxD; dp++) {
        const pos = edge + dir * dp;
        const [ex, ey] = along === 'x' ? [pos, perp] : [perp, pos];
        if (ex < 0 || ex >= W || ey < 0 || ey >= H) break;
        acc.push(spx(ex, ey));
        if (acc.length < WIN * 2) continue;

        const recent   = acc.slice(-WIN);
        const mr = recent.reduce((s, p) => s + p[0], 0) / WIN;
        const mg = recent.reduce((s, p) => s + p[1], 0) / WIN;
        const mb = recent.reduce((s, p) => s + p[2], 0) / WIN;
        const variance = recent.reduce((s, p) => s + (p[0]-mr)**2 + (p[1]-mg)**2 + (p[2]-mb)**2, 0) / WIN;
        const last = acc[acc.length - 1];
        const colorJump = (last[0]-bColor[0])**2 + (last[1]-bColor[1])**2 + (last[2]-bColor[2])**2;

        if (variance > VAR_THR || colorJump > COL_THR) { found = dp - WIN; break; }
      }
      if (found !== null && found >= 3) readings.push(found);
    }

    if (readings.length < Math.ceil(SCANS * 0.4)) return null;
    readings.sort((a, b) => a - b);
    return readings[Math.floor(readings.length * 0.40)];
  }

  const left   = measureSide('x', true);
  const right  = measureSide('x', false);
  const top    = measureSide('y', true);
  const bottom = measureSide('y', false);

  if (!left || !right || !top || !bottom) return null;
  return { left, right, top, bottom };
}

// ─── Main entry point ─────────────────────────────────────────────────────────
export function detectCardCentering(canvas, ctx) {
  const W = canvas.width, H = canvas.height;
  const d = ctx.getImageData(0, 0, W, H).data;

  // ── Level 1: Find card boundary ──────────────────────────────────────────
  // Try edge-projection approach first (works on any background),
  // fall back to background-colour scan (works well on plain backgrounds).
  const sobelMap = _sobel(d, W, H);
  const bounds   = _findBoundsFromEdges(sobelMap, W, H) || _findBoundsBg(d, W, H);
  if (!bounds) return null;

  const { cL, cR, cT, cB } = bounds;
  if (cR - cL < W * 0.3 || cB - cT < H * 0.3) return null;

  // ── Level 2: Precise corner detection for perspective correction ──────────
  const corners = _findCorners(sobelMap, W, H, bounds);

  // ── Level 2+3: Measure borders ────────────────────────────────────────────
  // Use perspective-aware measurement if we have corners, axis-aligned otherwise.
  const allValid = b => b && b.left && b.right && b.top && b.bottom;
  let borders = corners ? _measureBordersWithCorners(d, W, H, corners) : null;
  if (!allValid(borders)) borders = _measureBordersAxisAligned(d, W, H, bounds);
  if (!allValid(borders)) return null;

  let { left, right, top, bottom } = borders;

  // Sanity check: borders can't be more than 65% of the card dimension combined
  if (left + right > (cR - cL) * 0.65 || top + bottom > (cB - cT) * 0.65) return null;

  // Outlier correction: if one border is implausibly larger than the opposite,
  // cap it at 2× the smaller side (catches single-side detection failures).
  function correctPair(a, b) {
    if (Math.max(a, b) / Math.min(a, b) <= 2.5) return [a, b];
    const s = Math.min(a, b);
    return a > b ? [Math.round(s * 2.0), b] : [a, Math.round(s * 2.0)];
  }
  [left, right]  = correctPair(left, right);
  [top,  bottom] = correctPair(top, bottom);

  const lrT = left + right, tbT = top + bottom;
  if (!lrT || !tbT) return null;

  const leftPct   = Math.round(left   / lrT * 100);
  const rightPct  = 100 - leftPct;
  const topPct    = Math.round(top    / tbT * 100);
  const bottomPct = 100 - topPct;

  // If essentially perfect centering, skip (margin of error territory)
  if (Math.abs(leftPct - 50) < 2 && Math.abs(topPct - 50) < 2) return null;

  // Card edge coordinates for overlay rendering
  // Use averaged corner positions if available (more precise after perspective fit)
  const eL = corners ? (corners.TL[0] + corners.BL[0]) / 2 : cL;
  const eR = corners ? (corners.TR[0] + corners.BR[0]) / 2 : cR;
  const eT = corners ? (corners.TL[1] + corners.TR[1]) / 2 : cT;
  const eB = corners ? (corners.BL[1] + corners.BR[1]) / 2 : cB;

  return {
    leftPct, rightPct, topPct, bottomPct,
    lines: {
      leftOuter:   Math.max(eL / W, 0.001),
      leftInner:   (eL + left)   / W,
      rightInner:  (eR - right)  / W,
      rightOuter:  Math.min((eR + 1) / W, 0.999),
      topOuter:    Math.max(eT / H, 0.001),
      topInner:    (eT + top)    / H,
      bottomInner: (eB - bottom) / H,
      bottomOuter: Math.min((eB + 1) / H, 0.999),
    },
    cardBounds: { cL: Math.round(eL), cR: Math.round(eR), cT: Math.round(eT), cB: Math.round(eB) },
    width: W,
    height: H,
  };
}

export function processImageFile(file) {
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
            originalObjectURL: URL.createObjectURL(file),
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

// Crop 13 zoom-in regions (corners + edges + surface) for loupe-style inspection.
// Uses the full-resolution originalObjectURL when available so phone photos give real corner detail.
export function cropZonesFromImageData(imageData, bounds, { width: storedW, height: storedH, originalObjectURL } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => {
      if (originalObjectURL) {
        cropZonesFromImageData(imageData, bounds, {}).then(resolve).catch(reject);
      } else {
        reject(new Error("image load failed"));
      }
    };
    img.onload = () => {
      const src = document.createElement("canvas");
      src.width = img.naturalWidth;
      src.height = img.naturalHeight;
      src.getContext("2d").drawImage(img, 0, 0);

      const scaleX = storedW ? img.naturalWidth  / storedW : 1;
      const scaleY = storedH ? img.naturalHeight / storedH : 1;
      const cL = Math.round(bounds.cL * scaleX);
      const cR = Math.round(bounds.cR * scaleX);
      const cT = Math.round(bounds.cT * scaleY);
      const cB = Math.round(bounds.cB * scaleY);

      const cW = cR - cL, cH = cB - cT;
      const corner    = Math.round(Math.min(cW, cH) * 0.18);
      const tip       = Math.round(Math.min(cW, cH) * 0.05);
      const edgeLong  = Math.round(Math.max(cW, cH) * 0.50);
      const edgeShort = Math.round(Math.min(cW, cH) * 0.18);
      const surfaceW  = Math.round(cW * 0.55);
      const surfaceH  = Math.round(cH * 0.55);

      const crop = (x, y, w, h, outW, outH) => {
        const out = document.createElement("canvas");
        out.width = outW; out.height = outH;
        out.getContext("2d").drawImage(src, x, y, w, h, 0, 0, outW, outH);
        return out.toDataURL("image/jpeg", 0.95).split(",")[1];
      };

      resolve({
        "corner-TL":     crop(cL,           cT,            corner, corner, 640, 640),
        "corner-TR":     crop(cR - corner,  cT,            corner, corner, 640, 640),
        "corner-BL":     crop(cL,           cB - corner,   corner, corner, 640, 640),
        "corner-BR":     crop(cR - corner,  cB - corner,   corner, corner, 640, 640),
        "corner-TL-tip": crop(cL,           cT,            tip,    tip,    256, 256),
        "corner-TR-tip": crop(cR - tip,     cT,            tip,    tip,    256, 256),
        "corner-BL-tip": crop(cL,           cB - tip,      tip,    tip,    256, 256),
        "corner-BR-tip": crop(cR - tip,     cB - tip,      tip,    tip,    256, 256),
        "edge-top":      crop(cL + Math.round((cW - edgeLong) / 2), cT,             edgeLong,  edgeShort, 900, 350),
        "edge-bottom":   crop(cL + Math.round((cW - edgeLong) / 2), cB - edgeShort, edgeLong,  edgeShort, 900, 350),
        "edge-left":     crop(cL,             cT + Math.round((cH - edgeLong) / 2), edgeShort, edgeLong,  350, 900),
        "edge-right":    crop(cR - edgeShort, cT + Math.round((cH - edgeLong) / 2), edgeShort, edgeLong,  350, 900),
        "surface-center": crop(cL + Math.round((cW - surfaceW) / 2), cT + Math.round((cH - surfaceH) / 2), surfaceW, surfaceH, 900, 900),
      });
    };
    img.src = originalObjectURL ?? `data:image/jpeg;base64,${imageData}`;
  });
}
