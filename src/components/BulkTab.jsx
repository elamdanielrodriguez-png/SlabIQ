import { useState, useEffect, useRef } from "react";
import { processImageFile, cropZonesFromImageData, extractJSON } from "../lib/imageUtils";

// ── Helpers ───────────────────────────────────────────────────────────────────

function gradeColor(g) {
  if (g == null) return "rgba(255,255,255,0.3)";
  if (g >= 10) return "#c9a84c";
  if (g >= 9)  return "#f0f0f0";
  if (g >= 8)  return "rgba(255,255,255,0.65)";
  return "rgba(255,255,255,0.38)";
}

function GradeChip({ label, grade, sub }) {
  const color = gradeColor(grade);
  const isGold = grade >= 10;
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
      background: isGold ? "rgba(201,168,76,0.08)" : "rgba(255,255,255,0.04)",
      border: `1px solid ${isGold ? "rgba(201,168,76,0.25)" : "rgba(255,255,255,0.08)"}`,
      borderRadius: 10, padding: "5px 8px", minWidth: 38,
    }}>
      <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 7, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</span>
      <span style={{ color, fontSize: 16, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.5px" }}>
        {grade != null ? (Number.isInteger(grade) ? grade : Number(grade).toFixed(1)) : "—"}
      </span>
      {sub && <span style={{ color: "rgba(255,255,255,0.18)", fontSize: 7, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", marginTop: 1 }}>{sub}</span>}
    </div>
  );
}

function SubgradeRow({ bgs }) {
  if (!bgs) return null;
  const items = [
    { label: "Ctr", val: bgs.centering },
    { label: "Crn", val: bgs.corners },
    { label: "Edg", val: bgs.edges },
    { label: "Srf", val: bgs.surface },
  ];
  const defined = items.filter(i => i.val != null);
  if (!defined.length) return null;
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {defined.map(({ label, val }) => (
        <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 7, padding: "4px 7px", minWidth: 32 }}>
          <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 7, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
          <span style={{ color: gradeColor(val), fontSize: 12, fontWeight: 600, lineHeight: 1 }}>
            {Number(val).toFixed(1)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Scan animation on thumbnail while grading ─────────────────────────────────

function BulkScanThumb({ thumb }) {
  const bw = 7;
  const bc = "rgba(201,168,76,0.75)";
  return (
    <div style={{
      position: "relative", width: 42, height: 58,
      borderRadius: 8, overflow: "hidden", flexShrink: 0,
      boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
    }}>
      <img src={thumb} alt="" style={{
        width: "100%", height: "100%", objectFit: "cover",
        filter: "brightness(0.38) saturate(0.5)",
        display: "block",
      }} />

      {/* Scan line */}
      <div style={{
        position: "absolute", left: 0, right: 0, height: 1.5,
        background: "linear-gradient(90deg, transparent, rgba(201,168,76,0.35) 15%, #c9a84c 50%, rgba(201,168,76,0.35) 85%, transparent)",
        boxShadow: "0 0 7px rgba(201,168,76,0.9), 0 0 18px rgba(201,168,76,0.35)",
        animation: "scanLine 1.9s cubic-bezier(0.4,0,0.6,1) infinite",
      }} />

      {/* Corner brackets */}
      {[
        { top: 4, left: 4 },
        { top: 4, right: 4 },
        { bottom: 4, left: 4 },
        { bottom: 4, right: 4 },
      ].map((pos, i) => (
        <div key={i} style={{ position: "absolute", width: bw, height: bw, ...pos }}>
          <div style={{
            position: "absolute", inset: 0,
            borderTop:    (i === 0 || i === 1) ? `1.5px solid ${bc}` : "none",
            borderBottom: (i === 2 || i === 3) ? `1.5px solid ${bc}` : "none",
            borderLeft:   (i === 0 || i === 2) ? `1.5px solid ${bc}` : "none",
            borderRight:  (i === 1 || i === 3) ? `1.5px solid ${bc}` : "none",
            boxShadow: `0 0 4px rgba(201,168,76,0.35)`,
          }} />
        </div>
      ))}
    </div>
  );
}

// ── Inline grade reveal ───────────────────────────────────────────────────────

const REVEAL_SUBGRADES = [
  { key: "corners",   label: "CRN" },
  { key: "edges",     label: "EDG" },
  { key: "surface",   label: "SRF" },
  { key: "centering", label: "CTR" },
];

function CountUp({ target, active }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active || target == null) return;
    let step = 0;
    const STEPS = 20;
    const id = setInterval(() => {
      step++;
      const eased = 1 - Math.pow(1 - step / STEPS, 3);
      setVal(Math.round(eased * target * 10) / 10);
      if (step >= STEPS) { clearInterval(id); setVal(target); }
    }, 28);
    return () => clearInterval(id);
  }, [active, target]);
  return <>{target != null ? Number(val).toFixed(1) : "—"}</>;
}

function BulkGradeReveal({ result, onDone }) {
  const [step,  setStep]  = useState(0); // 1–4 = subgrades revealed; 5 = PSA in
  const [psaIn, setPsaIn] = useState(false);

  const bgs      = result?.bgs ?? {};
  const psaGrade = result?.psa?.grade != null ? Number(result.psa.grade) : null;
  const psaLabel = result?.psa?.label ?? "";
  const color    = gradeColor(psaGrade);
  const isGold   = psaGrade >= 10;
  const isHigh   = psaGrade >= 9;

  const getScore = (key) => bgs[key] != null ? Number(bgs[key]) : null;

  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 120),
      setTimeout(() => setStep(2), 620),
      setTimeout(() => setStep(3), 1120),
      setTimeout(() => setStep(4), 1620),
      setTimeout(() => { setStep(5); setTimeout(() => setPsaIn(true), 60); }, 2300),
      setTimeout(onDone, 4800),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div style={{
      borderTop: "1px solid rgba(255,255,255,0.06)",
      padding: "14px 18px 16px",
      display: "flex", flexDirection: "column", gap: 10,
      position: "relative", overflow: "hidden",
    }}>

      {/* Gold glow behind grade number for high grades */}
      {isGold && psaIn && (
        <div style={{
          position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)",
          width: 160, height: 80,
          background: "radial-gradient(ellipse at center bottom, rgba(201,168,76,0.22) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
      )}

      {/* Subgrade chips — appear one by one */}
      <div style={{ display: "flex", gap: 5 }}>
        {REVEAL_SUBGRADES.map(({ key, label }, i) => {
          const visible = step > i;
          const score   = getScore(key);
          const c       = gradeColor(score);
          const gold    = score != null && score >= 9.5;
          return (
            <div key={key} style={{
              flex: 1,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              background: visible
                ? (gold ? "rgba(201,168,76,0.1)" : "rgba(255,255,255,0.05)")
                : "rgba(255,255,255,0.02)",
              border: `1px solid ${visible
                ? (gold ? "rgba(201,168,76,0.38)" : "rgba(255,255,255,0.1)")
                : "rgba(255,255,255,0.04)"}`,
              borderRadius: 10, padding: "7px 4px",
              opacity: visible ? 1 : 0,
              transform: visible ? "scale(1) translateY(0)" : "scale(0.85) translateY(4px)",
              transition: "all 0.42s cubic-bezier(0.34,1.56,0.64,1)",
              boxShadow: visible && gold ? "0 0 10px rgba(201,168,76,0.18)" : "none",
            }}>
              <span style={{
                color: "rgba(255,255,255,0.22)", fontSize: 7, fontWeight: 700,
                letterSpacing: "0.1em", textTransform: "uppercase",
              }}>{label}</span>
              <span style={{
                color: visible ? c : "transparent",
                fontSize: 14, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.4px",
                transition: "color 0.25s ease",
                animation: visible ? "gradeCountBlur 0.4s ease both" : "none",
              }}>
                <CountUp target={score} active={visible} />
              </span>
            </div>
          );
        })}
      </div>

      {/* PSA final grade — slams in after subgrades */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
        opacity: step >= 5 ? 1 : 0,
        transition: "opacity 0.25s ease",
        paddingTop: 2,
        position: "relative",
      }}>
        {/* Flash ring behind grade */}
        {psaIn && (
          <div style={{
            position: "absolute",
            width: isGold ? 100 : 80, height: isGold ? 100 : 80,
            borderRadius: "50%",
            background: isGold
              ? "radial-gradient(circle, rgba(201,168,76,0.55) 0%, transparent 68%)"
              : isHigh
                ? "radial-gradient(circle, rgba(255,255,255,0.28) 0%, transparent 68%)"
                : "none",
            animation: `gradeFlash ${isGold ? "0.85s" : "0.65s"} cubic-bezier(0.22,1,0.36,1) forwards`,
            pointerEvents: "none",
          }} />
        )}

        <div style={{
          color: "rgba(255,255,255,0.2)", fontSize: 9, fontWeight: 800,
          letterSpacing: "0.22em", textTransform: "uppercase",
          alignSelf: "flex-end", paddingBottom: 10,
        }}>PSA</div>

        <div style={{
          color,
          fontSize: 76, fontWeight: 800, lineHeight: 1,
          letterSpacing: isGold ? "-4px" : "-3px",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
          fontVariantNumeric: "tabular-nums",
          textShadow: psaIn && isGold
            ? "0 0 40px rgba(201,168,76,0.9), 0 0 80px rgba(201,168,76,0.35)"
            : psaIn && isHigh
              ? "0 0 24px rgba(255,255,255,0.45)"
              : "none",
          animation: psaIn ? "revealSlam 0.55s cubic-bezier(0.22,1,0.36,1) forwards" : "none",
          transition: "text-shadow 0.5s ease",
          position: "relative",
        }}>
          {psaGrade ?? "—"}

          {/* Gold shimmer overlay for PSA 10 */}
          {isGold && psaIn && (
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.3) 50%, transparent 70%)",
              backgroundSize: "200% 100%",
              animation: "goldShimmer 2.2s ease-in-out 0.3s infinite",
              WebkitBackgroundClip: "text",
              pointerEvents: "none",
            }} />
          )}
        </div>

        <div style={{
          color: isGold ? "rgba(201,168,76,0.6)" : "rgba(255,255,255,0.2)",
          fontSize: 10, fontWeight: 700, letterSpacing: "-0.1px",
          alignSelf: "flex-end", paddingBottom: 11,
          opacity: psaIn ? 1 : 0,
          transition: "opacity 0.4s ease 0.3s",
        }}>
          {psaLabel}
        </div>
      </div>
    </div>
  );
}

// ── BulkItem row ─────────────────────────────────────────────────────────────

function BulkItem({ item, onConfirm, onRemove, onRevealDone }) {
  const cardName = item.confirmedCard
    ? item.confirmedCard.player
    : item.candidates?.[0]?.player ?? "Identifying…";

  const cardSub = item.confirmedCard
    ? `${item.confirmedCard.year} · ${item.confirmedCard.set} · ${item.confirmedCard.variant ?? "Base"}`
    : item.candidates?.[0]
      ? `${item.candidates[0].year} · ${item.candidates[0].set}`
      : "";

  const isPending = item.status === 'pending_confirm';
  const isGrading = item.status === 'grading';
  const isDone    = item.status === 'done';
  const isError   = item.status === 'error';
  const isWorking = ['loading', 'identifying', 'grading'].includes(item.status);

  const statusBadge = () => {
    if (item.status === 'identifying' || item.status === 'loading')
      return <span style={badge('#c9a84c')}>Identifying…</span>;
    if (item.status === 'pending_confirm')
      return <span style={badge('#ff9f0a')}>Select card ↓</span>;
    if (item.status === 'confirmed')
      return <span style={badge('rgba(255,255,255,0.3)')}>Ready</span>;
    if (item.status === 'grading')
      return <span style={badge('#c9a84c')}>Grading…</span>;
    if (isError)
      return <span style={badge('#ff453a')}>{item.error}</span>;
    return null;
  };

  const psaGrade = item.result?.psa?.grade;
  const bgsGrade = item.result?.bgs?.overall;
  const psaRec   = item.result?.submission?.psaRecommended;
  const psa10Val = item.result?.market?.graded?.psa10;
  const verdict  = item.result?.verdict ?? "";

  return (
    <div style={{
      background: "#1c1c1e",
      border: `1px solid ${isDone ? "rgba(255,255,255,0.1)" : isPending ? "rgba(255,159,10,0.2)" : isGrading ? "rgba(201,168,76,0.18)" : "rgba(255,255,255,0.07)"}`,
      borderRadius: 20,
      overflow: "hidden",
      boxShadow: isGrading
        ? "0 2px 20px rgba(201,168,76,0.08), inset 0 1px 0 rgba(255,255,255,0.07)"
        : "0 2px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.07)",
      transition: "border-color 0.3s ease, box-shadow 0.3s ease",
    }}>

      {/* Main row */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px" }}>

        {/* Thumbnail — scan animation while grading, normal otherwise */}
        {isGrading && item.thumb ? (
          <BulkScanThumb thumb={item.thumb} />
        ) : item.thumb ? (
          <img src={item.thumb} alt="" style={{
            width: 42, height: 58, objectFit: "cover", borderRadius: 8,
            flexShrink: 0, opacity: isError ? 0.3 : 1,
            boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
          }} />
        ) : (
          <div style={{ width: 42, height: 58, borderRadius: 8, background: "rgba(255,255,255,0.05)", flexShrink: 0 }} />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: isError ? "rgba(255,255,255,0.3)" : "#fff", fontSize: 14, fontWeight: 700, letterSpacing: "-0.3px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 3 }}>
            {cardName}
          </div>
          {cardSub && (
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginBottom: (isDone && !item.revealing) ? 0 : 7, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {cardSub}
            </div>
          )}
          {!isDone && statusBadge()}
        </div>

        {/* Grade chips — only show after reveal animation finishes */}
        {isDone && !item.revealing && (
          <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
            <GradeChip label="PSA" grade={psaGrade} sub={item.result?.psa?.label} />
            <GradeChip label="BGS" grade={bgsGrade != null ? bgsGrade : null} />
          </div>
        )}

        {!isWorking && !item.revealing && (
          <button onClick={() => onRemove(item.id)} style={{
            background: "none", border: "none", color: "rgba(255,255,255,0.15)",
            fontSize: 22, cursor: "pointer", padding: "0 2px", lineHeight: 1, flexShrink: 0,
            fontFamily: "inherit",
          }}>×</button>
        )}
      </div>

      {/* Candidate picker */}
      {isPending && item.candidates.length > 0 && (
        <div style={{ padding: "0 18px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
            Which card is this?
          </div>
          {item.candidates.map((c, i) => (
            <button key={i} onClick={() => onConfirm(item.id, c)} style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: 12, padding: "10px 14px", textAlign: "left",
              cursor: "pointer", fontFamily: "inherit",
              transition: "border-color 0.15s",
            }}>
              <div style={{ color: "#fff", fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{c.player}</div>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{c.year} · {c.set} · {c.variant}</div>
            </button>
          ))}
        </div>
      )}

      {/* Inline grade reveal animation */}
      {isDone && item.revealing && item.result && (
        <BulkGradeReveal
          result={item.result}
          onDone={onRevealDone}
        />
      )}

      {/* Normal done — expanded result (shown only after reveal finishes) */}
      {isDone && !item.revealing && item.result && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          {item.result.bgs && <SubgradeRow bgs={item.result.bgs} />}

          {verdict && (
            <p style={{ color: "rgba(255,255,255,0.32)", fontSize: 11, lineHeight: 1.65, margin: 0 }}>
              {verdict.length > 220 ? verdict.slice(0, 220) + "…" : verdict}
            </p>
          )}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            {psa10Val ? (
              <div>
                <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>PSA 10</div>
                <div style={{ color: "#c9a84c", fontSize: 15, fontWeight: 700, letterSpacing: "-0.3px" }}>
                  ${psa10Val.toLocaleString()}
                </div>
              </div>
            ) : <div />}
            {item.result.submission != null && (
              <div style={{
                background: psaRec ? "rgba(48,209,88,0.1)" : "rgba(255,69,58,0.08)",
                border: `1px solid ${psaRec ? "rgba(48,209,88,0.25)" : "rgba(255,69,58,0.2)"}`,
                borderRadius: 8, padding: "5px 12px",
                color: psaRec ? "#30d158" : "#ff453a",
                fontSize: 12, fontWeight: 700,
              }}>
                {psaRec ? "✓ Submit" : "✗ Skip"}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function badge(color) {
  return {
    display: "inline-block",
    background: `${color}18`, border: `1px solid ${color}35`,
    borderRadius: 6, padding: "3px 8px",
    color, fontSize: 10, fontWeight: 700, letterSpacing: "0.02em",
  };
}

function saveGrading(parsed) {
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
  } catch {}
}

// ── Main BulkTab ──────────────────────────────────────────────────────────────

export default function BulkTab({ session, userPlan, onUpgrade, isLoggedIn, onOpenCamera }) {
  const [items,   setItems]   = useState([]);
  const [grading, setGrading] = useState(false);
  const fileInputRef = useRef();

  const authHeaders = () => session ? { Authorization: `Bearer ${session.access_token}` } : {};
  const openCamera  = () => onOpenCamera?.((file) => addImages([file]));
  const tokensLeft  = userPlan ? Math.max(0, userPlan.grade_limit - userPlan.grades_used) : 0;

  const clearRevealing = (id) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, revealing: false } : i));
  };

  const addImages = async (files) => {
    const fileArr = Array.from(files).slice(0, 20);
    const newItems = fileArr.map(f => ({
      id: Math.random().toString(36).slice(2),
      thumb: URL.createObjectURL(f),
      imageData: null,
      cardBounds: null,
      centering: null,
      width: null,
      height: null,
      originalObjectURL: null,
      status: 'loading',
      candidates: [],
      confirmedCard: null,
      result: null,
      revealing: false,
      error: null,
    }));
    setItems(prev => [...prev, ...newItems]);

    await Promise.all(fileArr.map(async (file, idx) => {
      const id = newItems[idx].id;
      try {
        const processed = await processImageFile(file);
        setItems(prev => prev.map(i => i.id === id ? {
          ...i,
          imageData: processed.imageData,
          cardBounds: processed.cardBounds,
          centering: processed.centering,
          width: processed.width,
          height: processed.height,
          originalObjectURL: processed.originalObjectURL,
          status: 'identifying',
        } : i));

        const res  = await fetch('/api/identify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ images: [processed.imageData] }),
        });
        const data       = await res.json();
        const candidates = data.candidates ?? [];
        if (data.confidence >= 98 && candidates.length === 1) {
          setItems(prev => prev.map(i => i.id === id
            ? { ...i, status: 'confirmed', candidates, confirmedCard: candidates[0] }
            : i));
        } else {
          setItems(prev => prev.map(i => i.id === id
            ? { ...i, status: 'pending_confirm', candidates }
            : i));
        }
      } catch {
        setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'error', error: 'Could not identify' } : i));
      }
    }));
  };

  const confirmItem = (id, card) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, confirmedCard: card, status: 'confirmed' } : i));
  };

  const removeItem = (id) => setItems(prev => prev.filter(i => i.id !== id));

  const gradeAll = async () => {
    const toGrade = items.filter(i => i.status === 'confirmed');
    if (!toGrade.length) return;
    setGrading(true);
    for (const item of toGrade) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'grading' } : i));
      try {
        let zoneCrops = null;
        if (item.cardBounds && item.imageData) {
          try {
            zoneCrops = await cropZonesFromImageData(item.imageData, item.cardBounds, {
              width: item.width,
              height: item.height,
              originalObjectURL: item.originalObjectURL,
            });
          } catch {}
        }

        const res = await fetch('/api/grade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({
            images: [item.imageData],
            confirmedCard: item.confirmedCard,
            zoneCrops,
            measuredCentering: item.centering ?? null,
            gradingModel: 'claude-opus-4-7',
          }),
        });
        if (res.status === 403) {
          setItems(prev => prev.map(i =>
            (i.status === 'confirmed' || i.id === item.id)
              ? { ...i, status: 'error', error: 'Out of tokens' }
              : i
          ));
          onUpgrade?.();
          break;
        }
        const data = await res.json();
        if (data.code === 'GRADE_LIMIT_REACHED') {
          setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error', error: 'Out of tokens' } : i));
          onUpgrade?.();
          break;
        }
        const result = extractJSON(data.content?.[0]?.text ?? '');
        // Set done + revealing:true to trigger the inline grade reveal animation
        setItems(prev => prev.map(i => i.id === item.id
          ? { ...i, status: 'done', result, revealing: true }
          : i
        ));
        if (result) saveGrading(result);
      } catch {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error', error: 'Grade failed' } : i));
      }
    }
    setGrading(false);
  };

  const confirmedCount = items.filter(i => i.status === 'confirmed').length;
  const pendingCount   = items.filter(i => i.status === 'pending_confirm').length;
  const doneCount      = items.filter(i => i.status === 'done').length;
  const gradingCount   = items.filter(i => i.status === 'grading').length;

  if (!isLoggedIn) {
    return (
      <div style={{
        background: "#1c1c1e", border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 24, padding: "48px 28px", textAlign: "center",
        boxShadow: "0 2px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.09)",
      }}>
        <div style={{ fontSize: 36, marginBottom: 16 }}>🃏</div>
        <div style={{ color: "#fff", fontSize: 17, fontWeight: 700, letterSpacing: "-0.4px", marginBottom: 8 }}>
          Bulk Grading
        </div>
        <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, lineHeight: 1.6, marginBottom: 24, maxWidth: 260, margin: "0 auto 24px" }}>
          Grade up to 20 cards at once. Sign in to get started — each card uses 1 token.
        </div>
        <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 11 }}>Sign in from the top right</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Empty state */}
      {items.length === 0 && (
        <div style={{
          background: "#1c1c1e", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 24, padding: "32px 22px",
          boxShadow: "0 2px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.09)",
        }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ color: "#fff", fontSize: 17, fontWeight: 700, letterSpacing: "-0.4px", marginBottom: 6 }}>
              Grade Multiple Cards
            </div>
            <div style={{ color: "rgba(255,255,255,0.32)", fontSize: 13, lineHeight: 1.5 }}>
              One photo per card · up to 20 at once
            </div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12,
              background: "rgba(48,209,88,0.08)", border: "1px solid rgba(48,209,88,0.2)",
              borderRadius: 100, padding: "5px 14px" }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#30d158" }} />
              <span style={{ color: "#30d158", fontSize: 11, fontWeight: 700 }}>
                {tokensLeft} token{tokensLeft !== 1 ? "s" : ""} available
              </span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => fileInputRef.current?.click()} style={{
              flex: 1, padding: "16px 0",
              background: "linear-gradient(180deg, #dfc055 0%, #c9a84c 55%, #b89040 100%)",
              color: "#000", border: "none", borderRadius: 16,
              fontSize: 14, fontWeight: 700, letterSpacing: "-0.2px",
              cursor: "pointer", fontFamily: "inherit",
              boxShadow: "0 4px 24px rgba(201,168,76,0.45), inset 0 1px 0 rgba(255,255,255,0.25)",
            }}>Upload Photos</button>
            {onOpenCamera && (
              <button onClick={openCamera} style={{
                flex: 1, padding: "16px 0",
                background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.7)",
                border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16,
                fontSize: 14, fontWeight: 600, letterSpacing: "-0.2px",
                cursor: "pointer", fontFamily: "inherit",
              }}>Take Photo</button>
            )}
          </div>
        </div>
      )}

      {/* Header row when items exist */}
      {items.length > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 2px" }}>
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13 }}>
            {items.length} card{items.length !== 1 ? "s" : ""}
            {doneCount > 0 && <span style={{ color: "#30d158", fontWeight: 600 }}> · {doneCount} graded</span>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {onOpenCamera && (
              <button onClick={openCamera} style={{
                background: "none", border: "1px solid rgba(201,168,76,0.22)", borderRadius: 10,
                padding: "6px 12px", color: "rgba(201,168,76,0.7)", fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}>Camera</button>
            )}
            <button onClick={() => fileInputRef.current?.click()} style={{
              background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10,
              padding: "6px 12px", color: "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}>+ Add</button>
          </div>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }}
        onChange={e => { if (e.target.files?.length) addImages(e.target.files); e.target.value = ''; }} />

      {/* Card list */}
      {items.map(item => (
        <BulkItem
          key={item.id}
          item={item}
          onConfirm={confirmItem}
          onRemove={removeItem}
          onRevealDone={() => clearRevealing(item.id)}
        />
      ))}

      {/* Pending notice */}
      {pendingCount > 0 && !grading && (
        <div style={{
          background: "rgba(255,159,10,0.08)", border: "1px solid rgba(255,159,10,0.2)",
          borderRadius: 12, padding: "10px 16px", textAlign: "center",
          color: "#ff9f0a", fontSize: 12, fontWeight: 600,
        }}>
          {pendingCount} card{pendingCount !== 1 ? "s" : ""} need{pendingCount === 1 ? "s" : ""} confirmation above
        </div>
      )}

      {/* Grade all button */}
      {confirmedCount > 0 && !grading && (
        <button onClick={gradeAll} style={{
          width: "100%", padding: "16px 0",
          background: "linear-gradient(180deg, #dfc055 0%, #c9a84c 55%, #b89040 100%)",
          color: "#000", border: "none", borderRadius: 18,
          fontSize: 15, fontWeight: 800, letterSpacing: "-0.2px",
          cursor: "pointer", fontFamily: "inherit",
          boxShadow: "0 6px 32px rgba(201,168,76,0.5), inset 0 1px 0 rgba(255,255,255,0.25)",
        }}>
          Grade {confirmedCount} Card{confirmedCount !== 1 ? "s" : ""} — {confirmedCount} Token{confirmedCount !== 1 ? "s" : ""}
        </button>
      )}

      {/* Batch progress */}
      {grading && (
        <div style={{
          background: "#1c1c1e", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 16, padding: "16px 20px", textAlign: "center",
          boxShadow: "0 2px 16px rgba(0,0,0,0.3)",
        }}>
          <div style={{ color: "#c9a84c", fontSize: 14, fontWeight: 700, letterSpacing: "-0.2px", marginBottom: 4 }}>
            Grading {doneCount + 1} of {doneCount + confirmedCount + gradingCount}…
          </div>
          <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 11 }}>~30 seconds per card</div>
          <div style={{ marginTop: 12, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 99,
              background: "linear-gradient(90deg, #c9a84c, #e8c870)",
              width: `${Math.round((doneCount / (doneCount + confirmedCount + gradingCount)) * 100)}%`,
              transition: "width 0.4s ease",
            }} />
          </div>
        </div>
      )}

      {/* Clear all */}
      {items.length > 0 && !grading && (
        <button onClick={() => setItems([])} style={{
          background: "none", border: "none",
          color: "rgba(255,255,255,0.15)", fontSize: 12,
          cursor: "pointer", fontFamily: "inherit", padding: "2px 0",
          textAlign: "center",
        }}>Clear all</button>
      )}
    </div>
  );
}
