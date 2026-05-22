export function extractJSON(text) {
  try { return JSON.parse(text); } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) try { return JSON.parse(fence[1]); } catch {}
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj) try { return JSON.parse(obj[0]); } catch {}
  return null;
}

export function detectCardCentering(canvas, ctx) {
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

  const SCANS  = 17;
  const REF_D  = 15;
  const MAX_F  = 0.30;
  const MIN_PX = 5;
  const STREAK = 4;

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
      const borderSamples = [];
      for (let dp = 1; dp <= REF_D; dp++) {
        const pos = edge + dir * dp;
        const [ex, ey] = along === 'x' ? [pos, perp] : [perp, pos];
        if (ex >= 0 && ex < W && ey >= 0 && ey < H) borderSamples.push(px(ex, ey));
      }
      if (borderSamples.length < REF_D * 0.5) continue;
      const borderColor = mean3(borderSamples);
      const borderVar = borderSamples.reduce((s,p) => s + dist2(p, borderColor), 0) / borderSamples.length;
      const THR = Math.max(28*28, Math.min(58*58, borderVar * 4));

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

    if (readings.length < Math.ceil(SCANS * 0.40)) return null;
    readings.sort((a,b) => a-b);
    return readings[Math.floor(readings.length * 0.4)];
  }

  let left  = measureOneSide('x', true);
  let right = measureOneSide('x', false);
  let top   = measureOneSide('y', true);
  let bot   = measureOneSide('y', false);

  if (!left || !right || !top || !bot) return null;
  if (left+right > cW*0.5 || top+bot > cH*0.5) return null;

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
