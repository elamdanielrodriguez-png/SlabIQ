// Shareable grade-card image generator — single source of truth for the
// reveal overlay and the result-screen share buttons. Renders a 1080×1080
// social image with the actual card photo when one is available, and falls
// back to the grade-only layout for photo-less results (demo, history).

export const PSA_FULL_NAME = {
  10: "Gem Mint",
  9:  "Mint",
  8:  "NM-MT",
  7:  "Near Mint",
  6:  "EX-MT",
  5:  "Excellent",
  4:  "VG-EX",
  3:  "Very Good",
  2:  "Good",
  1:  "Poor",
};

const SUBGRADES = [
  { key: "centering", label: "Centering" },
  { key: "corners",   label: "Corners" },
  { key: "edges",     label: "Edges" },
  { key: "surface",   label: "Surface" },
];

function shareColor(g) {
  if (g >= 10) return "#c9a84c";
  if (g >= 9)  return "#e0e0e0";
  if (g >= 8)  return "#aaaaaa";
  if (g >= 6)  return "#ffb43c";
  return "#ff453a";
}

const FONT = "-apple-system, system-ui, sans-serif";

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Shrink font size until text fits maxWidth; returns the final size.
function fitText(ctx, text, weight, startSize, minSize, maxWidth) {
  let size = startSize;
  ctx.font = `${weight} ${size}px ${FONT}`;
  while (ctx.measureText(text).width > maxWidth && size > minSize) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${FONT}`;
  }
  return size;
}

function drawAccentLine(ctx, S, y, color, is10) {
  const lg = ctx.createLinearGradient(0, y, S, y);
  lg.addColorStop(0,    "transparent");
  lg.addColorStop(0.25, color + (is10 ? "55" : "28"));
  lg.addColorStop(0.5,  color + (is10 ? "99" : "44"));
  lg.addColorStop(0.75, color + (is10 ? "55" : "28"));
  lg.addColorStop(1,    "transparent");
  ctx.strokeStyle = lg;
  ctx.lineWidth = is10 ? 1.5 : 1;
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke();
}

function drawIdentity(ctx, result, S, nameY, subY) {
  const player = result?.player ?? "";
  fitText(ctx, player, 700, 54, 26, S - 160);
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.textAlign = "center";
  ctx.fillText(player, S / 2, nameY);

  const sub = [result?.year, result?.set, result?.variant].filter(Boolean).join("  ·  ");
  if (sub) {
    fitText(ctx, sub, 400, 28, 16, S - 160);
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.fillText(sub, S / 2, subY);
  }
}

function drawBranding(ctx, S) {
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.font = `500 22px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("Graded by CardGradeOrNot.com", S / 2, S - 34);
}

// Layout A — card photo on the left, grade column on the right.
function drawWithPhoto(ctx, result, img, S) {
  const grade     = result?.psa?.grade != null ? Number(result.psa.grade) : null;
  const is10      = grade >= 10;
  const gradeName = PSA_FULL_NAME[grade] ?? result?.psa?.label ?? "";
  const color     = grade != null ? shareColor(grade) : "#888";

  // Photo box — trading-card aspect (2.5 × 3.5)
  const box = { x: 84, y: 150, w: 400, h: 560, r: 24 };
  const colX = box.x + box.w;            // right column starts here
  const cx   = colX + (S - 84 - colX) / 2;

  if (is10) {
    const grd = ctx.createRadialGradient(box.x + box.w / 2, box.y + box.h / 2, 0, box.x + box.w / 2, box.y + box.h / 2, 480);
    grd.addColorStop(0, "rgba(201,168,76,0.16)");
    grd.addColorStop(0.6, "rgba(201,168,76,0.05)");
    grd.addColorStop(1, "transparent");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, S, S);
  }

  drawAccentLine(ctx, S, 88, color, is10);
  drawAccentLine(ctx, S, 992, color, is10);

  // Card photo, cover-cropped into the rounded box
  const scale = Math.max(box.w / img.naturalWidth, box.h / img.naturalHeight);
  const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
  ctx.save();
  roundRectPath(ctx, box.x, box.y, box.w, box.h, box.r);
  if (is10) { ctx.shadowColor = "rgba(201,168,76,0.55)"; ctx.shadowBlur = 60; ctx.fillStyle = "#000"; ctx.fill(); ctx.shadowBlur = 0; }
  ctx.clip();
  ctx.drawImage(img, box.x + (box.w - dw) / 2, box.y + (box.h - dh) / 2, dw, dh);
  ctx.restore();
  roundRectPath(ctx, box.x, box.y, box.w, box.h, box.r);
  ctx.strokeStyle = color + (is10 ? "88" : "55");
  ctx.lineWidth = 2;
  ctx.stroke();

  // Right column — PSA label, big number, grade name
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.font = `600 26px ${FONT}`;
  ctx.fillText("P  S  A", cx, 250);

  ctx.font = `800 250px ${FONT}`;
  ctx.textBaseline = "middle";
  if (is10) { ctx.shadowColor = color; ctx.shadowBlur = 70; }
  ctx.fillStyle = color;
  ctx.fillText(grade != null ? String(grade) : "—", cx, 408);
  ctx.shadowBlur = 0;
  ctx.textBaseline = "alphabetic";

  if (gradeName) {
    ctx.fillStyle = is10 ? color : color + "99";
    fitText(ctx, gradeName.toUpperCase(), 700, 36, 22, S - 84 - colX - 40);
    ctx.fillText(gradeName.toUpperCase(), cx, 556);
  }

  // Subgrades
  const bgs = result?.bgs ?? {};
  const rows = SUBGRADES.filter(({ key }) => bgs[key] != null);
  if (rows.length) {
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(colX + 56, 604); ctx.lineTo(S - 120, 604); ctx.stroke();

    rows.forEach(({ key, label }, i) => {
      const y = 660 + i * 52;
      const v = Number(bgs[key]);
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,255,255,0.30)";
      ctx.font = `500 24px ${FONT}`;
      ctx.fillText(label, colX + 56, y);
      ctx.textAlign = "right";
      ctx.fillStyle = shareColor(v) + "dd";
      ctx.font = `700 30px ${FONT}`;
      ctx.fillText(v.toFixed(1), S - 120, y);
    });
  }

  drawIdentity(ctx, result, S, 880, 926);
  drawBranding(ctx, S);
}

// Layout B — no photo available (demo result, restored history): centered grade.
function drawWithoutPhoto(ctx, result, S) {
  const grade     = result?.psa?.grade != null ? Number(result.psa.grade) : null;
  const is10      = grade >= 10;
  const gradeName = PSA_FULL_NAME[grade] ?? result?.psa?.label ?? "";
  const color     = grade != null ? shareColor(grade) : "#888";

  if (is10) {
    const grd = ctx.createRadialGradient(S / 2, S * 0.42, 0, S / 2, S * 0.42, S * 0.52);
    grd.addColorStop(0, "rgba(201,168,76,0.20)");
    grd.addColorStop(0.55, "rgba(201,168,76,0.06)");
    grd.addColorStop(1, "transparent");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, S, S);
  }

  drawAccentLine(ctx, S, 88, color, is10);
  drawAccentLine(ctx, S, S - 88, color, is10);

  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.font = `600 28px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("P  S  A", S / 2, 172);

  const numSize = is10 ? 380 : 340;
  ctx.font = `800 ${numSize}px ${FONT}`;
  ctx.textBaseline = "middle";
  if (is10) { ctx.shadowColor = color; ctx.shadowBlur = 80; }
  ctx.fillStyle = color;
  ctx.fillText(grade != null ? String(grade) : "—", S / 2, S * 0.42);
  ctx.shadowBlur = 0;
  ctx.textBaseline = "alphabetic";

  if (gradeName) {
    ctx.fillStyle = is10 ? color : color + "99";
    ctx.font = `700 40px ${FONT}`;
    ctx.fillText(gradeName.toUpperCase(), S / 2, S * 0.67);
  }

  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(80, S * 0.73); ctx.lineTo(S - 80, S * 0.73); ctx.stroke();

  drawIdentity(ctx, result, S, S * 0.81, S * 0.88);
  drawBranding(ctx, S);
}

export async function generateShareCanvas(result, frontImageSrc) {
  const S = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#080808";
  ctx.fillRect(0, 0, S, S);

  let img = null;
  if (frontImageSrc) {
    try { img = await loadImage(frontImageSrc); } catch { img = null; }
  }

  if (img) drawWithPhoto(ctx, result, img, S);
  else drawWithoutPhoto(ctx, result, S);

  return canvas;
}

export async function shareGrade(result, frontImageSrc) {
  const canvas = await generateShareCanvas(result, frontImageSrc);
  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => {
      const grade    = result?.psa?.grade != null ? `PSA${result.psa.grade}` : "grade";
      const player   = (result?.player ?? "card").replace(/\s+/g, "_").slice(0, 40);
      const filename = `${player}_${grade}.png`;
      const file     = new File([blob], filename, { type: "image/png" });

      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `${result?.player ?? "Card"} — PSA ${result?.psa?.grade}`,
            text: `Just graded my ${[result?.year, result?.player, result?.variant].filter(Boolean).join(" ")} — PSA ${result?.psa?.grade} on CardGradeOrNot.com`,
          });
          resolve(); return;
        } catch (e) {
          // User cancelled the share sheet — don't punish them with a download
          if (e.name === "AbortError") { resolve(); return; }
        }
      }
      // Fallback: trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve();
    }, "image/png");
  });
}
