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

// ── Card-stack hero illustration ──────────────────────────────────────────────

function CardStackHero() {
  const cardStyle = (rot, tx, ty, zIndex, opacity) => ({
    position: "absolute",
    width: 72, height: 100,
    borderRadius: 8,
    background: "linear-gradient(160deg, rgba(40,36,20,0.95) 0%, rgba(22,22,24,0.98) 100%)",
    border: "1px solid rgba(201,168,76,0.35)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08)",
    transform: `rotate(${rot}deg) translate(${tx}px, ${ty}px)`,
    transformOrigin: "center bottom",
    zIndex, opacity,
  });

  return (
    <div style={{ position: "relative", width: 72, height: 110, margin: "0 auto 20px", flexShrink: 0 }}>
      {/* Back cards */}
      <div style={cardStyle(-14, -34, 4, 1, 0.5)} />
      <div style={cardStyle(8,   28, 2, 2, 0.65)} />
      {/* Front card with scan line */}
      <div style={{ ...cardStyle(0, 0, 0, 3, 1), overflow: "hidden", position: "absolute" }}>
        {/* Inner card art placeholder */}
        <div style={{
          position: "absolute", inset: 6, borderRadius: 4,
          background: "linear-gradient(135deg, rgba(201,168,76,0.06) 0%, rgba(201,168,76,0.02) 100%)",
          border: "1px solid rgba(201,168,76,0.1)",
        }} />
        {/* Scan line */}
        <div style={{
          position: "absolute", left: 0, right: 0, height: 1.5,
          background: "linear-gradient(90deg, transparent, rgba(201,168,76,0.4) 20%, #c9a84c 50%, rgba(201,168,76,0.4) 80%, transparent)",
          boxShadow: "0 0 8px rgba(201,168,76,0.8)",
          animation: "scanLine 2s cubic-bezier(0.4,0,0.6,1) infinite",
        }} />
        {/* Corner brackets */}
        {[{ top: 5, left: 5 }, { top: 5, right: 5 }, { bottom: 5, left: 5 }, { bottom: 5, right: 5 }].map((pos, i) => (
          <div key={i} style={{ position: "absolute", width: 8, height: 8, ...pos }}>
            <div style={{
              position: "absolute", inset: 0,
              borderTop:    (i < 2)  ? "1.5px solid rgba(201,168,76,0.8)" : "none",
              borderBottom: (i >= 2) ? "1.5px solid rgba(201,168,76,0.8)" : "none",
              borderLeft:   (i % 2 === 0) ? "1.5px solid rgba(201,168,76,0.8)" : "none",
              borderRight:  (i % 2 === 1) ? "1.5px solid rgba(201,168,76,0.8)" : "none",
            }} />
          </div>
        ))}
        {/* Grade badge */}
        <div style={{
          position: "absolute", bottom: 8, left: 0, right: 0,
          display: "flex", justifyContent: "center", gap: 5,
        }}>
          <div style={{
            background: "rgba(201,168,76,0.15)", border: "1px solid rgba(201,168,76,0.4)",
            borderRadius: 4, padding: "2px 6px",
            color: "#c9a84c", fontSize: 9, fontWeight: 800, letterSpacing: "0.05em",
          }}>PSA 9</div>
        </div>
      </div>
    </div>
  );
}

// ── Scan animation on thumbnail while grading ─────────────────────────────────

function BulkScanThumb({ thumb }) {
  return (
    <div style={{
      position: "relative", width: 56, height: 78,
      borderRadius: 10, overflow: "hidden", flexShrink: 0,
      boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
    }}>
      <img src={thumb} alt="" style={{
        width: "100%", height: "100%", objectFit: "cover",
        filter: "brightness(0.35) saturate(0.4)",
        display: "block",
      }} />
      <div style={{
        position: "absolute", left: 0, right: 0, height: 1.5,
        background: "linear-gradient(90deg, transparent, rgba(201,168,76,0.35) 15%, #c9a84c 50%, rgba(201,168,76,0.35) 85%, transparent)",
        boxShadow: "0 0 8px rgba(201,168,76,0.9), 0 0 20px rgba(201,168,76,0.35)",
        animation: "scanLine 1.9s cubic-bezier(0.4,0,0.6,1) infinite",
      }} />
      {[{ top: 4, left: 4 }, { top: 4, right: 4 }, { bottom: 4, left: 4 }, { bottom: 4, right: 4 }].map((pos, i) => (
        <div key={i} style={{ position: "absolute", width: 8, height: 8, ...pos }}>
          <div style={{
            position: "absolute", inset: 0,
            borderTop:    (i < 2)  ? "1.5px solid rgba(201,168,76,0.75)" : "none",
            borderBottom: (i >= 2) ? "1.5px solid rgba(201,168,76,0.75)" : "none",
            borderLeft:   (i % 2 === 0) ? "1.5px solid rgba(201,168,76,0.75)" : "none",
            borderRight:  (i % 2 === 1) ? "1.5px solid rgba(201,168,76,0.75)" : "none",
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
    const id = setInterval(() => {
      step++;
      const eased = 1 - Math.pow(1 - step / 20, 3);
      setVal(Math.round(eased * target * 10) / 10);
      if (step >= 20) { clearInterval(id); setVal(target); }
    }, 28);
    return () => clearInterval(id);
  }, [active, target]);
  return <>{target != null ? Number(val).toFixed(1) : "—"}</>;
}

function BulkGradeReveal({ result, onDone }) {
  const [step,  setStep]  = useState(0);
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
      {isGold && psaIn && (
        <div style={{
          position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)",
          width: 200, height: 100,
          background: "radial-gradient(ellipse at center bottom, rgba(201,168,76,0.2) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
      )}

      {/* Subgrade chips */}
      <div style={{ display: "flex", gap: 5 }}>
        {REVEAL_SUBGRADES.map(({ key, label }, i) => {
          const visible = step > i;
          const score   = getScore(key);
          const c       = gradeColor(score);
          const gold    = score != null && score >= 9.5;
          return (
            <div key={key} style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              background: visible ? (gold ? "rgba(201,168,76,0.1)" : "rgba(255,255,255,0.05)") : "rgba(255,255,255,0.02)",
              border: `1px solid ${visible ? (gold ? "rgba(201,168,76,0.38)" : "rgba(255,255,255,0.1)") : "rgba(255,255,255,0.04)"}`,
              borderRadius: 10, padding: "7px 4px",
              opacity: visible ? 1 : 0,
              transform: visible ? "scale(1) translateY(0)" : "scale(0.85) translateY(4px)",
              transition: "all 0.42s cubic-bezier(0.34,1.56,0.64,1)",
              boxShadow: visible && gold ? "0 0 10px rgba(201,168,76,0.18)" : "none",
            }}>
              <span style={{ color: "rgba(255,255,255,0.22)", fontSize: 7, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</span>
              <span style={{
                color: visible ? c : "transparent", fontSize: 14, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.4px",
                animation: visible ? "gradeCountBlur 0.4s ease both" : "none",
              }}>
                <CountUp target={score} active={visible} />
              </span>
            </div>
          );
        })}
      </div>

      {/* PSA slam */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
        opacity: step >= 5 ? 1 : 0, transition: "opacity 0.25s ease",
        paddingTop: 2, position: "relative",
      }}>
        {psaIn && (
          <div style={{
            position: "absolute",
            width: isGold ? 100 : 80, height: isGold ? 100 : 80, borderRadius: "50%",
            background: isGold
              ? "radial-gradient(circle, rgba(201,168,76,0.55) 0%, transparent 68%)"
              : isHigh ? "radial-gradient(circle, rgba(255,255,255,0.28) 0%, transparent 68%)" : "none",
            animation: `gradeFlash ${isGold ? "0.85s" : "0.65s"} cubic-bezier(0.22,1,0.36,1) forwards`,
            pointerEvents: "none",
          }} />
        )}
        <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 9, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", alignSelf: "flex-end", paddingBottom: 10 }}>PSA</div>
        <div style={{
          color, fontSize: 76, fontWeight: 800, lineHeight: 1,
          letterSpacing: isGold ? "-4px" : "-3px",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
          textShadow: psaIn && isGold ? "0 0 40px rgba(201,168,76,0.9), 0 0 80px rgba(201,168,76,0.35)" : psaIn && isHigh ? "0 0 24px rgba(255,255,255,0.45)" : "none",
          animation: psaIn ? "revealSlam 0.55s cubic-bezier(0.22,1,0.36,1) forwards" : "none",
        }}>{psaGrade ?? "—"}</div>
        <div style={{
          color: isGold ? "rgba(201,168,76,0.6)" : "rgba(255,255,255,0.2)",
          fontSize: 10, fontWeight: 700, alignSelf: "flex-end", paddingBottom: 11,
          opacity: psaIn ? 1 : 0, transition: "opacity 0.4s ease 0.3s",
        }}>{psaLabel}</div>
      </div>
    </div>
  );
}

// ── BulkItem row ─────────────────────────────────────────────────────────────

function BulkItem({ item, onConfirm, onRemove, onRevealDone }) {
  const isPending = item.status === 'pending_confirm';
  const isGrading = item.status === 'grading';
  const isDone    = item.status === 'done';
  const isError   = item.status === 'error';
  const isWorking = ['loading', 'identifying', 'grading'].includes(item.status);

  const cardName = item.confirmedCard?.player ?? item.candidates?.[0]?.player ?? null;
  const cardYear = item.confirmedCard?.year   ?? item.candidates?.[0]?.year   ?? null;
  const cardSet  = item.confirmedCard?.set    ?? item.candidates?.[0]?.set    ?? null;
  const cardVar  = item.confirmedCard?.variant ?? item.candidates?.[0]?.variant ?? null;

  const psaGrade = item.result?.psa?.grade;
  const bgsGrade = item.result?.bgs?.overall;
  const psaRec   = item.result?.submission?.psaRecommended;
  const psa10Val = item.result?.market?.graded?.psa10;

  const psaColor = gradeColor(psaGrade);
  const isGold   = psaGrade >= 10;

  return (
    <div style={{
      background: isDone && !item.revealing
        ? "linear-gradient(160deg, rgba(26,24,14,0.98) 0%, #1c1c1e 60%)"
        : "#1c1c1e",
      border: `1px solid ${
        isDone && !item.revealing && isGold ? "rgba(201,168,76,0.35)" :
        isDone && !item.revealing ? "rgba(255,255,255,0.1)" :
        isPending ? "rgba(255,159,10,0.25)" :
        isGrading ? "rgba(201,168,76,0.2)" :
        "rgba(255,255,255,0.07)"}`,
      borderRadius: 20,
      overflow: "hidden",
      boxShadow: isDone && !item.revealing && isGold
        ? "0 4px 28px rgba(201,168,76,0.1), inset 0 1px 0 rgba(201,168,76,0.08)"
        : isGrading
          ? "0 2px 24px rgba(201,168,76,0.07), inset 0 1px 0 rgba(255,255,255,0.07)"
          : "0 2px 16px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
      transition: "border-color 0.3s ease, box-shadow 0.3s ease",
    }}>

      {/* Main row */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px" }}>

        {/* Thumbnail */}
        {isGrading && item.thumb ? (
          <BulkScanThumb thumb={item.thumb} />
        ) : item.thumb ? (
          <div style={{ position: "relative", flexShrink: 0 }}>
            <img src={item.thumb} alt="" style={{
              width: 56, height: 78, objectFit: "cover", borderRadius: 10,
              opacity: isError ? 0.25 : 1,
              boxShadow: isDone && !item.revealing ? "0 4px 16px rgba(0,0,0,0.55)" : "0 2px 10px rgba(0,0,0,0.45)",
              display: "block",
              border: isDone && !item.revealing && isGold ? "1px solid rgba(201,168,76,0.3)" : "1px solid rgba(255,255,255,0.06)",
            }} />
            {/* PSA grade overlay on thumbnail when done */}
            {isDone && !item.revealing && psaGrade != null && (
              <div style={{
                position: "absolute", bottom: -1, left: "50%", transform: "translateX(-50%)",
                background: isGold ? "rgba(201,168,76,0.92)" : "rgba(28,28,30,0.92)",
                border: `1px solid ${isGold ? "rgba(201,168,76,0.6)" : "rgba(255,255,255,0.15)"}`,
                borderRadius: "0 0 8px 8px",
                padding: "2px 0", width: "calc(100% - 2px)",
                textAlign: "center",
              }}>
                <span style={{ color: isGold ? "#000" : psaColor, fontSize: 10, fontWeight: 800, letterSpacing: "0.02em" }}>
                  {psaGrade}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div style={{ width: 56, height: 78, borderRadius: 10, background: "rgba(255,255,255,0.04)", flexShrink: 0 }} />
        )}

        {/* Text content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Status / identifying state */}
          {!cardName && !isError && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#c9a84c", animation: "cornerBreathe 1.2s ease-in-out infinite", flexShrink: 0 }} />
              <span style={{ color: "rgba(201,168,76,0.75)", fontSize: 13, fontWeight: 600 }}>Identifying card…</span>
            </div>
          )}

          {isError && (
            <span style={{ color: "#ff453a", fontSize: 13, fontWeight: 600 }}>{item.error}</span>
          )}

          {cardName && (
            <>
              <div style={{
                color: isError ? "rgba(255,255,255,0.25)" : "#fff",
                fontSize: 14, fontWeight: 700, letterSpacing: "-0.35px",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                marginBottom: 3, lineHeight: 1.2,
              }}>{cardName}</div>

              <div style={{
                color: "rgba(255,255,255,0.28)", fontSize: 11, letterSpacing: "-0.1px",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                marginBottom: isDone && !item.revealing ? 0 : 7,
              }}>
                {[cardYear, cardSet, cardVar].filter(Boolean).join(" · ")}
              </div>

              {/* Status badge */}
              {!isDone && !isGrading && (
                isPending
                  ? <span style={badge('#ff9f0a')}>Select card ↓</span>
                  : item.status === 'confirmed'
                    ? <span style={badge('rgba(48,209,88,0.9)')}>Ready to grade</span>
                    : item.status === 'grading'
                      ? <span style={badge('#c9a84c')}>Grading…</span>
                      : null
              )}
              {isGrading && <span style={badge('#c9a84c')}>Grading…</span>}
            </>
          )}
        </div>

        {/* Done state — right side */}
        {isDone && !item.revealing && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
            {/* BGS overall */}
            {bgsGrade != null && (
              <div style={{ textAlign: "right" }}>
                <div style={{ color: "rgba(255,255,255,0.18)", fontSize: 7, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 1 }}>BGS</div>
                <div style={{ color: gradeColor(bgsGrade), fontSize: 15, fontWeight: 700, letterSpacing: "-0.5px", lineHeight: 1 }}>
                  {Number(bgsGrade).toFixed(1)}
                </div>
              </div>
            )}
            {/* Submit rec */}
            {item.result?.submission != null && (
              <div style={{
                background: psaRec ? "rgba(48,209,88,0.1)" : "rgba(255,69,58,0.08)",
                border: `1px solid ${psaRec ? "rgba(48,209,88,0.3)" : "rgba(255,69,58,0.2)"}`,
                borderRadius: 8, padding: "4px 10px",
                color: psaRec ? "#30d158" : "#ff453a",
                fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
              }}>
                {psaRec ? "✓ Submit" : "✗ Skip"}
              </div>
            )}
          </div>
        )}

        {!isWorking && !item.revealing && (
          <button onClick={() => onRemove(item.id)} style={{
            background: "none", border: "none", color: "rgba(255,255,255,0.13)",
            fontSize: 22, cursor: "pointer", padding: "0 0 0 4px", lineHeight: 1, flexShrink: 0,
            fontFamily: "inherit",
          }}>×</button>
        )}
      </div>

      {/* Candidate picker */}
      {isPending && item.candidates.length > 0 && (
        <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ color: "rgba(255,255,255,0.18)", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 2 }}>
            Which card is this?
          </div>
          {item.candidates.map((c, i) => (
            <button key={i} onClick={() => onConfirm(item.id, c)} style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: 12, padding: "10px 14px", textAlign: "left",
              cursor: "pointer", fontFamily: "inherit", transition: "border-color 0.15s",
            }}>
              <div style={{ color: "#fff", fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                {c.player}
                {c.cardNumber && <span style={{ color: "rgba(255,255,255,0.25)", fontWeight: 400, marginLeft: 6 }}>#{c.cardNumber}</span>}
              </div>
              <div style={{ color: "rgba(255,255,255,0.32)", fontSize: 11 }}>{c.year} · {c.set} · {c.variant}</div>
            </button>
          ))}
        </div>
      )}

      {/* Grade reveal animation */}
      {isDone && item.revealing && item.result && (
        <BulkGradeReveal result={item.result} onDone={onRevealDone} />
      )}

      {/* Done expanded — market + verdict */}
      {isDone && !item.revealing && item.result && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Subgrade pills */}
          {item.result.bgs && (() => {
            const s = item.result.bgs;
            const subs = [
              { label: "Ctr", val: s.centering },
              { label: "Crn", val: s.corners },
              { label: "Edg", val: s.edges },
              { label: "Srf", val: s.surface },
            ].filter(x => x.val != null);
            if (!subs.length) return null;
            return (
              <div style={{ display: "flex", gap: 5 }}>
                {subs.map(({ label, val }) => (
                  <div key={label} style={{
                    flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 8, padding: "5px 4px",
                  }}>
                    <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 7, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
                    <span style={{ color: gradeColor(val), fontSize: 12, fontWeight: 600 }}>{Number(val).toFixed(1)}</span>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Verdict snippet */}
          {item.result.verdict && (
            <p style={{ color: "rgba(255,255,255,0.28)", fontSize: 11, lineHeight: 1.65, margin: 0 }}>
              {item.result.verdict.length > 180 ? item.result.verdict.slice(0, 180) + "…" : item.result.verdict}
            </p>
          )}

          {/* Market row */}
          {psa10Val != null && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ color: "rgba(255,255,255,0.18)", fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>PSA 10 value</div>
                <div style={{ color: "#c9a84c", fontSize: 16, fontWeight: 700, letterSpacing: "-0.4px" }}>${psa10Val.toLocaleString()}</div>
              </div>
            </div>
          )}
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
      id: Date.now().toString(), savedAt: new Date().toISOString(),
      player: parsed.player, year: parsed.year, set_name: parsed.set,
      variant: parsed.variant, card_number: parsed.cardNumber ?? null,
      psa_grade: parsed.psa?.grade ?? null, bgs_overall: parsed.bgs?.overall ?? null,
      raw_value: parsed.market?.raw ?? null, result: parsed,
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

  const clearRevealing = (id) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, revealing: false } : i));

  const addImages = async (files) => {
    const fileArr = Array.from(files).slice(0, 20);
    const newItems = fileArr.map(f => ({
      id: Math.random().toString(36).slice(2),
      thumb: URL.createObjectURL(f),
      imageData: null, cardBounds: null, centering: null,
      width: null, height: null, originalObjectURL: null,
      status: 'loading', candidates: [], confirmedCard: null,
      result: null, revealing: false, error: null,
    }));
    setItems(prev => [...prev, ...newItems]);

    await Promise.all(fileArr.map(async (file, idx) => {
      const id = newItems[idx].id;
      try {
        const processed = await processImageFile(file);
        setItems(prev => prev.map(i => i.id === id ? {
          ...i, imageData: processed.imageData, cardBounds: processed.cardBounds,
          centering: processed.centering, width: processed.width,
          height: processed.height, originalObjectURL: processed.originalObjectURL,
          status: 'identifying',
        } : i));
        const res  = await fetch('/api/identify', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ images: [processed.imageData] }),
        });
        const data       = await res.json();
        const candidates = data.candidates ?? [];
        if (data.confidence >= 98 && candidates.length === 1) {
          setItems(prev => prev.map(i => i.id === id
            ? { ...i, status: 'confirmed', candidates, confirmedCard: candidates[0] } : i));
        } else {
          setItems(prev => prev.map(i => i.id === id
            ? { ...i, status: 'pending_confirm', candidates } : i));
        }
      } catch {
        setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'error', error: 'Could not identify' } : i));
      }
    }));
  };

  const confirmItem = (id, card) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, confirmedCard: card, status: 'confirmed' } : i));

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
          try { zoneCrops = await cropZonesFromImageData(item.imageData, item.cardBounds, { width: item.width, height: item.height, originalObjectURL: item.originalObjectURL }); } catch {}
        }
        const res = await fetch('/api/grade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ images: [item.imageData], confirmedCard: item.confirmedCard, zoneCrops, measuredCentering: item.centering ?? null, gradingModel: 'claude-opus-4-8' }),
        });
        if (res.status === 403) {
          setItems(prev => prev.map(i => (i.status === 'confirmed' || i.id === item.id) ? { ...i, status: 'error', error: 'Out of tokens' } : i));
          onUpgrade?.(); break;
        }
        const data = await res.json();
        if (data.code === 'GRADE_LIMIT_REACHED') {
          setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error', error: 'Out of tokens' } : i));
          onUpgrade?.(); break;
        }
        const result = extractJSON(data.content?.[0]?.text ?? '');
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'done', result, revealing: true } : i));
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

  // ── Not logged in ──────────────────────────────────────────────────────────
  if (!isLoggedIn) {
    return (
      <div style={{
        background: "linear-gradient(160deg, rgba(22,20,10,0.98) 0%, #1c1c1e 60%)",
        border: "1px solid rgba(201,168,76,0.2)",
        borderRadius: 24, padding: "40px 24px 32px", textAlign: "center",
        boxShadow: "0 4px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(201,168,76,0.06), inset 0 1px 0 rgba(255,255,255,0.08)",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 300, height: 180, background: "radial-gradient(ellipse at top, rgba(201,168,76,0.09) 0%, transparent 70%)", pointerEvents: "none" }} />
        <CardStackHero />
        <div style={{ color: "rgba(201,168,76,0.7)", fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 8 }}>Bulk Grading</div>
        <div style={{ color: "#fff", fontSize: 22, fontWeight: 800, letterSpacing: "-0.6px", marginBottom: 8 }}>Grade Your Whole Stack</div>
        <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, lineHeight: 1.6, marginBottom: 24, maxWidth: 260, margin: "0 auto 24px" }}>
          Upload up to 20 cards at once — PSA & BGS for each, in one tap.
        </div>
        <div style={{ color: "rgba(255,255,255,0.22)", fontSize: 12, fontWeight: 600 }}>Sign in from the top right to get started</div>
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Hero upload card */}
        <div style={{
          background: "linear-gradient(160deg, rgba(22,20,10,0.98) 0%, #1c1c1e 60%)",
          border: "1px solid rgba(201,168,76,0.22)",
          borderRadius: 24, padding: "32px 22px 26px",
          boxShadow: "0 4px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(201,168,76,0.06), inset 0 1px 0 rgba(255,255,255,0.08)",
          position: "relative", overflow: "hidden",
        }}>
          {/* Gold glow top */}
          <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 340, height: 200, background: "radial-gradient(ellipse at top, rgba(201,168,76,0.1) 0%, transparent 70%)", pointerEvents: "none" }} />

          <CardStackHero />

          {/* Headline */}
          <div style={{ textAlign: "center", marginBottom: 20, position: "relative" }}>
            <div style={{ color: "rgba(201,168,76,0.7)", fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 8 }}>Bulk Grading</div>
            <div style={{ color: "#fff", fontSize: 24, fontWeight: 800, letterSpacing: "-0.7px", lineHeight: 1.15, marginBottom: 8 }}>
              Grade Your Whole Stack
            </div>
            <div style={{ color: "rgba(255,255,255,0.38)", fontSize: 13, lineHeight: 1.55, marginBottom: 18 }}>
              One photo per card · up to 20 at once · PSA &amp; BGS per card
            </div>

            {/* Token badge */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(48,209,88,0.08)", border: "1px solid rgba(48,209,88,0.22)", borderRadius: 100, padding: "5px 14px" }}>
              <div className="pulse-dot" style={{ width: 5, height: 5, borderRadius: "50%", background: "#30d158", flexShrink: 0 }} />
              <span style={{ color: "#30d158", fontSize: 11, fontWeight: 700 }}>
                {tokensLeft} token{tokensLeft !== 1 ? "s" : ""} available
              </span>
            </div>
          </div>

          {/* CTA buttons */}
          <div style={{ display: "flex", gap: 10, position: "relative", marginBottom: 22 }}>
            <button onClick={() => fileInputRef.current?.click()} className="btn-gold" style={{
              flex: 1, padding: "15px 0",
              background: "linear-gradient(180deg, #dfc055 0%, #c9a84c 55%, #b89040 100%)",
              color: "#000", border: "none", borderRadius: 16,
              fontSize: 14, fontWeight: 700, letterSpacing: "-0.2px",
              cursor: "pointer", fontFamily: "inherit",
              boxShadow: "0 6px 28px rgba(201,168,76,0.5), inset 0 1px 0 rgba(255,255,255,0.25)",
            }}>Upload Photos</button>
            {onOpenCamera && (
              <button onClick={openCamera} className="btn-secondary" style={{
                flex: 1, padding: "15px 0",
                background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.7)",
                border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16,
                fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07)",
              }}>Take Photo</button>
            )}
          </div>

          {/* Feature list */}
          <div style={{ position: "relative", borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 18, display: "flex", flexDirection: "column", gap: 9 }}>
            <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 2 }}>What you get per card</div>
            {[
              "PSA & BGS estimate with all 4 subgrades",
              "Market value — raw, PSA 9, PSA 10",
              "Submit or skip recommendation",
            ].map(feat => (
              <div key={feat} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ color: "rgba(201,168,76,0.7)", fontSize: 11, flexShrink: 0, fontWeight: 700 }}>›</span>
                <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, lineHeight: 1.5 }}>{feat}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Feature mini-cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            { num: "01", title: "20 Cards at Once",        desc: "Upload your whole lot in one go" },
            { num: "02", title: "Grade Reveal per Card",   desc: "Each card gets its own reveal animation" },
            { num: "03", title: "1 Token per Card",        desc: "Same Opus model as single grading" },
            { num: "04", title: "Saved to History",        desc: "Every grade stored in your History tab" },
          ].map(({ num, title, desc }, i) => (
            <div key={title} className={`result-card-${i} card-hover`} style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 16, padding: "14px 14px",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.055)",
            }}>
              <div style={{ color: "rgba(201,168,76,0.55)", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>{num}</div>
              <div style={{ color: "rgba(255,255,255,0.88)", fontSize: 13, fontWeight: 700, letterSpacing: "-0.2px", lineHeight: 1.3, marginBottom: 4 }}>{title}</div>
              <div style={{ color: "rgba(255,255,255,0.32)", fontSize: 12, lineHeight: 1.5 }}>{desc}</div>
            </div>
          ))}
        </div>

        <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }}
          onChange={e => { if (e.target.files?.length) addImages(e.target.files); e.target.value = ''; }} />
      </div>
    );
  }

  // ── Card list ──────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 2px" }}>
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

      <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }}
        onChange={e => { if (e.target.files?.length) addImages(e.target.files); e.target.value = ''; }} />

      {/* Cards */}
      {items.map(item => (
        <BulkItem key={item.id} item={item} onConfirm={confirmItem} onRemove={removeItem} onRevealDone={() => clearRevealing(item.id)} />
      ))}

      {/* Pending notice */}
      {pendingCount > 0 && !grading && (
        <div style={{
          background: "rgba(255,159,10,0.07)", border: "1px solid rgba(255,159,10,0.18)",
          borderRadius: 12, padding: "10px 16px", textAlign: "center",
          color: "#ff9f0a", fontSize: 12, fontWeight: 600,
        }}>
          {pendingCount} card{pendingCount !== 1 ? "s" : ""} still need{pendingCount === 1 ? "s" : ""} confirmation above
        </div>
      )}

      {/* Grade all */}
      {confirmedCount > 0 && !grading && (
        <button onClick={gradeAll} className="btn-gold" style={{
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
          background: "#1c1c1e", border: "1px solid rgba(201,168,76,0.15)",
          borderRadius: 16, padding: "16px 20px", textAlign: "center",
          boxShadow: "0 2px 20px rgba(0,0,0,0.3)",
        }}>
          <div style={{ color: "#c9a84c", fontSize: 14, fontWeight: 700, letterSpacing: "-0.2px", marginBottom: 4 }}>
            Grading {doneCount + 1} of {doneCount + confirmedCount + gradingCount}…
          </div>
          <div style={{ color: "rgba(255,255,255,0.18)", fontSize: 11, marginBottom: 12 }}>~30 seconds per card</div>
          <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 99,
              background: "linear-gradient(90deg, #c9a84c, #e8c870)",
              width: `${Math.round((doneCount / Math.max(1, doneCount + confirmedCount + gradingCount)) * 100)}%`,
              transition: "width 0.4s ease",
            }} />
          </div>
        </div>
      )}

      {/* Clear all */}
      {!grading && (
        <button onClick={() => setItems([])} style={{
          background: "none", border: "none", color: "rgba(255,255,255,0.13)",
          fontSize: 12, cursor: "pointer", fontFamily: "inherit", padding: "2px 0", textAlign: "center",
        }}>Clear all</button>
      )}
    </div>
  );
}
