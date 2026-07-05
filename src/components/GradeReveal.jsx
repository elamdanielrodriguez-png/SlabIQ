import { useState, useEffect } from "react";
import { shareGrade, PSA_FULL_NAME } from "../lib/shareCard";

function gradeColor(g) {
  if (!g && g !== 0) return "rgba(255,255,255,0.55)";
  if (g >= 10) return "#c9a84c";
  if (g >= 9)  return "#f2f2f2";
  if (g >= 8)  return "rgba(255,255,255,0.80)";
  if (g >= 6)  return "rgba(255,180,60,0.85)";
  return "#ff453a";
}

function gradeGlow(g) {
  if (!g) return "none";
  if (g >= 10) return "0 0 120px rgba(201,168,76,0.7), 0 0 280px rgba(201,168,76,0.25)";
  if (g >= 9)  return "0 0 80px rgba(255,255,255,0.25)";
  return "none";
}

const JUDGES = [
  { key: "corners",   label: "Corners",   icon: "◆" },
  { key: "edges",     label: "Edges",     icon: "━" },
  { key: "surface",   label: "Surface",   icon: "✦" },
  { key: "centering", label: "Centering", icon: "⊕" },
];

// Radial particles — wrapper handles rotation so translateX flies them outward correctly
function GoldParticles({ grade }) {
  if (grade < 9) return null;
  const is10  = grade >= 10;
  const count = is10 ? 36 : 18;
  const color = is10 ? "#c9a84c" : "#e8e8e8";

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {[...Array(count)].map((_, i) => {
        const angle = (360 / count) * i + (Math.random() * 10 - 5);
        const size  = is10 ? (i % 4 === 0 ? 10 : i % 3 === 0 ? 7 : 4) : (i % 3 === 0 ? 6 : 3);
        const dist  = is10 ? (80 + (i % 5) * 40) : (50 + (i % 4) * 20);
        const dur   = 0.55 + (i % 6) * 0.08;
        const delay = i * 0.018;
        const bg    = i % 5 === 0 && is10 ? "#fff" : i % 3 === 0 ? color : color + "cc";
        return (
          <div key={i} style={{
            position: "absolute", top: "50%", left: "50%",
            width: 0, height: 0,
            transform: `rotate(${angle}deg)`,
            transformOrigin: "0 0",
          }}>
            <div style={{
              width: size, height: size,
              marginTop: -size / 2,
              borderRadius: i % 6 === 0 ? "2px" : "50%",
              background: bg,
              boxShadow: `0 0 ${size * 2}px ${color}`,
              "--fly-dist": `${dist}px`,
              animation: `particleFly ${dur}s cubic-bezier(0.22,1,0.36,1) ${delay}s both`,
            }} />
          </div>
        );
      })}
    </div>
  );
}

function StarburstRays({ grade }) {
  if (grade < 9) return null;
  const is10  = grade >= 10;
  const count = is10 ? 16 : 8;
  const color = is10 ? "rgba(201,168,76," : "rgba(255,255,255,";

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {[...Array(count)].map((_, i) => {
        const angle  = (360 / count) * i;
        const length = is10 ? (80 + (i % 3) * 50) : (50 + (i % 3) * 30);
        const width  = is10 ? (i % 4 === 0 ? 2 : 1) : 1;
        const alpha  = is10 ? (i % 2 === 0 ? "0.7)" : "0.4)") : "0.35)";
        const dur    = 0.5 + (i % 4) * 0.1;
        const delay  = i * 0.02;
        return (
          <div key={i} style={{
            position: "absolute", top: "50%", left: "50%",
            width: length, height: width,
            transformOrigin: "0 50%",
            transform: `rotate(${angle}deg)`,
            background: `linear-gradient(90deg, ${color}0.9), ${color}0))`,
            animation: `rayExpand ${dur}s cubic-bezier(0.22,1,0.36,1) ${delay}s both`,
          }} />
        );
      })}
    </div>
  );
}

// Confetti dots raining down for PSA 10
function GoldConfetti() {
  const pieces = [...Array(28)].map((_, i) => ({
    left: `${5 + (i * 3.3) % 90}%`,
    delay: `${(i * 0.08) % 1.2}s`,
    duration: `${1.2 + (i % 5) * 0.2}s`,
    size: i % 4 === 0 ? 6 : i % 3 === 0 ? 4 : 3,
    color: i % 3 === 0 ? "#c9a84c" : i % 3 === 1 ? "#e8c870" : "#fff8e0",
  }));
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {pieces.map((p, i) => (
        <div key={i} style={{
          position: "absolute", top: "-8px", left: p.left,
          width: p.size, height: p.size,
          borderRadius: i % 2 === 0 ? "50%" : "1px",
          background: p.color,
          boxShadow: `0 0 4px ${p.color}88`,
          animation: `confettiFall ${p.duration} ease-in ${p.delay} both`,
        }} />
      ))}
    </div>
  );
}

function DeliberatingDots() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN(d => (d + 1) % 4), 380);
    return () => clearInterval(id);
  }, []);
  return (
    <span style={{ color: "rgba(201,168,76,0.6)", letterSpacing: "0.08em", minWidth: 18, display: "inline-block" }}>
      {"•".repeat(n)}
    </span>
  );
}

const JUDGE_SUBTITLES = ["tip condition", "border integrity", "print quality", "alignment"];

function JudgeCard({ judge, score, visible, idx }) {
  const [displayScore, setDisplayScore] = useState(0);
  const [landed,       setLanded]       = useState(false);
  const [flash,        setFlash]        = useState(false);

  const color  = gradeColor(score);
  const isGold = score >= 9.5;
  const isGood = score >= 9;

  useEffect(() => {
    if (!visible) return;
    setFlash(true);
    const t1 = setTimeout(() => setFlash(false), 500);
    const t2 = setTimeout(() => setLanded(true), 520);
    if (score == null) return () => { clearTimeout(t1); clearTimeout(t2); };
    const t3 = setTimeout(() => {
      let step = 0;
      const STEPS = 22;
      const id = setInterval(() => {
        step++;
        const eased = 1 - Math.pow(1 - step / STEPS, 2.8);
        setDisplayScore(Math.round(eased * score * 10) / 10);
        if (step >= STEPS) { clearInterval(id); setDisplayScore(score); }
      }, 28);
      return () => clearInterval(id);
    }, 80);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [visible]);

  return (
    <div style={{
      position: "relative",
      width: "100%",
      background: visible
        ? (isGold ? "rgba(201,168,76,0.1)" : isGood ? "rgba(255,255,255,0.055)" : "rgba(255,255,255,0.03)")
        : "rgba(255,255,255,0.018)",
      border: `1px solid ${
        visible
          ? (isGold ? "rgba(201,168,76,0.45)" : isGood ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.08)")
          : "rgba(255,255,255,0.05)"
      }`,
      borderRadius: 16,
      padding: "13px 16px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      transform: visible ? "scale(1)" : "scale(0.96)",
      transition: `background 0.5s ease, border-color 0.5s ease, transform 0.6s cubic-bezier(0.34,1.56,0.64,1), box-shadow ${flash ? "0.05s" : "0.55s"} ease`,
      boxShadow: flash
        ? `0 0 50px ${isGold ? "rgba(201,168,76,0.55)" : "rgba(255,255,255,0.22)"}, 0 0 0 1.5px ${isGold ? "rgba(201,168,76,0.35)" : "rgba(255,255,255,0.18)"}`
        : landed && isGold ? "0 4px 28px rgba(201,168,76,0.18)" : "none",
      overflow: "hidden",
      minHeight: 64,
    }}>

      {/* Shimmer while waiting */}
      {!visible && (
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.025) 50%, transparent 100%)",
          animation: "scanGlow 2s ease-in-out infinite",
          animationDelay: `${idx * 0.3}s`,
        }} />
      )}

      {/* Radial burst on reveal */}
      {flash && (
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: isGold
            ? "radial-gradient(ellipse at center, rgba(201,168,76,0.38) 0%, transparent 70%)"
            : "radial-gradient(ellipse at center, rgba(255,255,255,0.18) 0%, transparent 70%)",
          animation: "screenFlash 0.5s ease-out forwards",
        }} />
      )}

      {/* Left: icon box + label */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateX(0)" : "translateX(-10px)",
        transition: "opacity 0.35s ease 0.1s, transform 0.35s ease 0.1s",
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 11, flexShrink: 0,
          background: isGold ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.07)",
          border: `1px solid ${isGold ? "rgba(201,168,76,0.3)" : "rgba(255,255,255,0.1)"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18,
          boxShadow: landed && isGold ? "0 0 16px rgba(201,168,76,0.4)" : "none",
          transition: "box-shadow 0.6s ease",
        }}>{judge.icon}</div>
        <div>
          <div style={{
            color: isGold ? "rgba(201,168,76,0.75)" : "rgba(255,255,255,0.4)",
            fontSize: 10, fontWeight: 800, letterSpacing: "0.16em",
            textTransform: "uppercase", marginBottom: 3,
          }}>{judge.label}</div>
          <div style={{ color: "rgba(255,255,255,0.18)", fontSize: 10 }}>
            {JUDGE_SUBTITLES[idx]}
          </div>
        </div>
      </div>

      {/* Score */}
      <div style={{
        opacity: visible ? 1 : 0,
        color, fontSize: 46, fontWeight: 800,
        letterSpacing: "-2.5px", lineHeight: 1,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
        minWidth: 76, textAlign: "right",
        textShadow: landed && isGold
          ? "0 0 32px rgba(201,168,76,0.75), 0 0 64px rgba(201,168,76,0.3)"
          : landed && isGood
            ? "0 0 20px rgba(255,255,255,0.3)"
            : "none",
        transition: "opacity 0.3s ease 0.15s, text-shadow 0.6s ease",
        animation: flash ? "gradeCountBlur 0.45s ease both" : "none",
      }}>
        {score != null ? Number(displayScore).toFixed(1) : "—"}
      </div>
    </div>
  );
}

export default function GradeReveal({ result, frontImage, onDone }) {
  const psaRaw = result?.psa?.grade;
  const bgsRaw = result?.bgs?.overall;
  const grade  = psaRaw != null ? Number(psaRaw) : null;
  const is10   = grade >= 10;
  const is9    = grade >= 9 && grade < 10;

  const [phase,          setPhase]          = useState(0);
  const [judgesRevealed, setJudgesRevealed] = useState(0);
  const [gradeVisible,   setGradeVisible]   = useState(false);
  const [exiting,        setExiting]        = useState(false);
  const [sharing,        setSharing]        = useState(false);
  const [shaking,        setShaking]        = useState(false);
  const [flashing,       setFlashing]       = useState(false);

  const bgs = result?.bgs ?? {};
  const getScore = (key) => {
    const v = bgs[key] != null ? Number(bgs[key]) : null;
    if (v != null) return v;
    if (grade == null) return null;
    const jitter = { corners: 0, edges: 0.2, surface: -0.1, centering: 0.1 };
    return Math.min(10, Math.max(1, grade + jitter[key]));
  };

  const exit = () => {
    if (exiting) return;
    setExiting(true);
    setTimeout(onDone, 500);
  };

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 200);
    const t2 = setTimeout(() => setPhase(2), 700);
    const t3 = setTimeout(() => {
      setPhase(3);
      setJudgesRevealed(1);
      setTimeout(() => setJudgesRevealed(2), 750);
      setTimeout(() => setJudgesRevealed(3), 1500);
      setTimeout(() => setJudgesRevealed(4), 2250);
      setTimeout(() => setPhase(4), 3100);
      setTimeout(() => {
        setPhase(5);
        setGradeVisible(true);
        if (grade != null && grade >= 9) {
          setFlashing(true);
          setTimeout(() => setFlashing(false), 600);
          setShaking(true);
          setTimeout(() => setShaking(false), 500);
        }
      }, 4000);
    }, 1000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const color    = gradeColor(grade);
  const glow     = gradeVisible ? gradeGlow(grade) : "none";
  const fontSize = is10 ? 192 : 160;

  return (
    <div
      onClick={() => phase >= 5 && exit()}
      style={{
        position: "fixed", inset: 0, zIndex: 700,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.97)",
        backdropFilter: "blur(48px)",
        WebkitBackdropFilter: "blur(48px)",
        opacity: exiting ? 0 : 1,
        transform: exiting ? "scale(1.04)" : "scale(1)",
        transition: exiting ? "opacity 0.5s ease, transform 0.5s ease" : "opacity 0.2s ease",
        cursor: phase >= 5 ? "pointer" : "default",
        userSelect: "none",
        overflow: "hidden",
        animation: shaking ? "screenShake 0.5s cubic-bezier(0.36,0.07,0.19,0.97) forwards" : "none",
      }}
    >
      {/* Screen flash */}
      {flashing && (
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none", zIndex: 10,
          background: is10
            ? "radial-gradient(ellipse 70% 50% at 50% 50%, rgba(201,168,76,0.7) 0%, rgba(201,168,76,0.2) 50%, transparent 80%)"
            : "radial-gradient(ellipse 60% 45% at 50% 50%, rgba(255,255,255,0.5) 0%, transparent 70%)",
          animation: "screenFlash 0.6s cubic-bezier(0.22,1,0.36,1) forwards",
        }} />
      )}

      {is10 && gradeVisible && (
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(201,168,76,0.18) 0%, rgba(201,168,76,0.05) 55%, transparent 80%)",
          animation: "revealPulse 3s ease-in-out infinite",
        }} />
      )}
      {is9 && gradeVisible && (
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse 60% 45% at 50% 50%, rgba(255,255,255,0.07) 0%, transparent 75%)",
          animation: "revealPulse 2.8s ease-in-out infinite",
        }} />
      )}
      {is10 && gradeVisible && <GoldConfetti />}

      {/* Accent lines */}
      {[0, 1].map((i) => (
        <div key={i} style={{
          position: "absolute", [i === 0 ? "top" : "bottom"]: 0, left: "50%",
          width: gradeVisible ? "100%" : "0%",
          height: is10 ? 2 : 1,
          background: `linear-gradient(90deg, transparent, ${color}${is10 ? "99" : "44"}, transparent)`,
          transform: "translateX(-50%)",
          transition: "width 0.7s cubic-bezier(0.22,1,0.36,1) 0.05s",
          pointerEvents: "none",
          boxShadow: is10 && gradeVisible ? `0 0 12px ${color}66` : "none",
        }} />
      ))}

      {/* ── JUDGE PANEL (phases 1–4) ── */}
      <div style={{
        width: "100%", maxWidth: 360, padding: "0 24px",
        opacity: phase >= 5 ? 0 : 1,
        transition: phase >= 5 ? "opacity 0.35s ease" : "opacity 0.5s ease",
        pointerEvents: "none",
        position: phase >= 5 ? "absolute" : "relative",
      }}>
        {/* Card identity */}
        <div style={{
          textAlign: "center", marginBottom: 20,
          opacity: phase >= 1 ? 1 : 0,
          transform: phase >= 1 ? "translateY(0)" : "translateY(-12px)",
          transition: "opacity 0.5s cubic-bezier(0.22,1,0.36,1), transform 0.5s cubic-bezier(0.22,1,0.36,1)",
        }}>
          <div style={{ color: "rgba(255,255,255,0.88)", fontSize: 20, fontWeight: 700, letterSpacing: "-0.5px", marginBottom: 4 }}>
            {result?.player}
          </div>
          <div style={{ color: "rgba(255,255,255,0.28)", fontSize: 12 }}>
            {[result?.year, result?.set, result?.variant].filter(Boolean).join("  ·  ")}
          </div>
        </div>

        {/* Deliberating subtitle */}
        <div style={{
          textAlign: "center", marginBottom: 16,
          opacity: phase >= 2 && phase < 4 ? 1 : 0,
          transition: "opacity 0.45s ease",
          color: "rgba(255,255,255,0.28)", fontSize: 11, fontWeight: 700,
          letterSpacing: "0.2em", textTransform: "uppercase",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        }}>
          {phase >= 3 ? "Scores are in" : "Deliberating"}
          {phase < 3 && <DeliberatingDots />}
        </div>

        {/* Judge cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {JUDGES.map((judge, idx) => (
            <JudgeCard
              key={judge.key}
              judge={judge}
              score={getScore(judge.key)}
              visible={judgesRevealed > idx}
              idx={idx}
            />
          ))}
        </div>

        {/* Verdict label */}
        <div style={{
          textAlign: "center", marginTop: 20,
          opacity: phase >= 4 ? 1 : 0,
          transform: phase >= 4 ? "translateY(0)" : "translateY(8px)",
          transition: "opacity 0.4s ease, transform 0.4s cubic-bezier(0.22,1,0.36,1)",
          color: "rgba(255,255,255,0.35)", fontSize: 11, fontWeight: 700,
          letterSpacing: "0.2em", textTransform: "uppercase",
        }}>
          The Verdict
        </div>
      </div>

      {/* ── GRADE SLAM (phase 5) ── */}
      <div style={{
        position: "absolute",
        display: "flex", flexDirection: "column", alignItems: "center",
        opacity: phase >= 5 ? 1 : 0,
        transition: "opacity 0.3s ease",
        pointerEvents: phase >= 5 ? "auto" : "none",
      }}>
        {/* Grade name */}
        <div style={{
          textAlign: "center", marginBottom: 12,
          opacity: gradeVisible ? 1 : 0,
          transform: gradeVisible ? "translateY(0) scale(1)" : "translateY(8px) scale(0.9)",
          transition: "opacity 0.5s ease 0.1s, transform 0.5s cubic-bezier(0.22,1,0.36,1) 0.1s",
        }}>
          {is10 ? (
            <div style={{
              fontSize: 11, fontWeight: 800, letterSpacing: "0.35em", textTransform: "uppercase",
              background: "linear-gradient(90deg, #a07830, #c9a84c, #e8c870, #c9a84c, #a07830)",
              backgroundSize: "200% 100%",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              animation: gradeVisible ? "goldShimmer 2.5s ease-in-out infinite" : "none",
            }}>{PSA_FULL_NAME[10]}</div>
          ) : (
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.28em", textTransform: "uppercase", color: `${color}99` }}>
              {PSA_FULL_NAME[grade] ?? result?.psa?.label ?? ""}
            </div>
          )}
        </div>

        {/* Player name recap */}
        <div style={{
          textAlign: "center", marginBottom: 24,
          opacity: gradeVisible ? 1 : 0,
          transition: "opacity 0.5s ease 0.15s",
          color: "rgba(255,255,255,0.55)", fontSize: 15, fontWeight: 600,
        }}>{result?.player}</div>

        {/* Grade block */}
        <div style={{ textAlign: "center", position: "relative" }}>
          <div style={{
            color: "rgba(255,255,255,0.18)", fontSize: 11, fontWeight: 700,
            letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 4,
            opacity: gradeVisible ? 1 : 0,
            transition: "opacity 0.3s ease",
          }}>PSA</div>

          {gradeVisible && (
            <div style={{
              position: "absolute", top: "35%", left: "50%",
              width: is10 ? 200 : 140, height: is10 ? 200 : 140,
              marginLeft: is10 ? -100 : -70, marginTop: is10 ? -100 : -70,
              borderRadius: "50%",
              background: is10
                ? "radial-gradient(circle, rgba(201,168,76,0.75) 0%, rgba(201,168,76,0.2) 50%, transparent 72%)"
                : is9
                  ? "radial-gradient(circle, rgba(255,255,255,0.4) 0%, transparent 70%)"
                  : "radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 70%)",
              animation: `gradeFlash ${is10 ? "0.9s" : "0.7s"} cubic-bezier(0.22,1,0.36,1) forwards`,
              pointerEvents: "none",
            }} />
          )}

          {gradeVisible && [...Array(is10 ? 3 : is9 ? 1 : 0)].map((_, i) => (
            <div key={i} style={{
              position: "absolute", top: "35%", left: "50%",
              width: is10 ? 90 : 70, height: is10 ? 90 : 70,
              marginLeft: is10 ? -45 : -35, marginTop: is10 ? -45 : -35,
              borderRadius: "50%",
              border: `${is10 ? 2.5 : 1.5}px solid ${is10 ? "rgba(201,168,76,0.8)" : "rgba(255,255,255,0.55)"}`,
              boxShadow: is10 ? "0 0 8px rgba(201,168,76,0.4)" : "none",
              animation: `gradeRing ${0.9 + i * 0.25}s cubic-bezier(0.22,1,0.36,1) ${i * 0.15}s forwards`,
              pointerEvents: "none",
            }} />
          ))}

          {gradeVisible && (
            <div style={{ position: "absolute", top: "35%", left: "50%", width: 0, height: 0 }}>
              <StarburstRays grade={grade} />
            </div>
          )}
          {gradeVisible && (
            <div style={{ position: "absolute", top: "35%", left: "50%", width: 0, height: 0 }}>
              <GoldParticles grade={grade} />
            </div>
          )}

          {/* THE NUMBER */}
          <div style={{
            fontSize, fontWeight: 800, lineHeight: 1,
            letterSpacing: is10 ? "-8px" : "-6px",
            color: gradeVisible ? color : "rgba(255,255,255,0.04)",
            textShadow: glow,
            fontVariantNumeric: "tabular-nums",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
            minWidth: is10 ? 260 : 220,
            transition: "color 0.2s ease",
            animation: gradeVisible ? "revealSlam 0.6s cubic-bezier(0.22,1,0.36,1) forwards" : "none",
            position: "relative",
          }}>
            {gradeVisible ? (grade != null ? String(grade) : "—") : ""}
            {is10 && gradeVisible && (
              <div style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%)",
                backgroundSize: "200% 100%",
                animation: "goldShimmer 2.2s ease-in-out 0.3s infinite",
                WebkitBackgroundClip: "text",
                pointerEvents: "none", borderRadius: 8,
              }} />
            )}
          </div>

          {bgsRaw != null && (
            <div style={{
              marginTop: 10,
              opacity: gradeVisible ? 0.35 : 0,
              transition: "opacity 0.6s ease 0.3s",
              color: "rgba(255,255,255,0.55)", fontSize: 14, fontWeight: 600,
            }}>
              BGS {Number(bgsRaw).toFixed(1)}
            </div>
          )}
        </div>
      </div>

      {/* Share button */}
      <button
        onClick={async (e) => {
          e.stopPropagation();
          if (sharing || phase < 5) return;
          setSharing(true);
          try { await shareGrade(result, frontImage); } finally { setSharing(false); }
        }}
        style={{
          position: "absolute", bottom: 96,
          display: "flex", alignItems: "center", gap: 7,
          background: is10 ? "rgba(201,168,76,0.12)" : "rgba(255,255,255,0.08)",
          border: `1px solid ${is10 ? "rgba(201,168,76,0.3)" : "rgba(255,255,255,0.15)"}`,
          borderRadius: 100, padding: "10px 22px",
          color: is10 ? "#c9a84c" : "rgba(255,255,255,0.75)",
          fontSize: 13, fontWeight: 600,
          cursor: sharing ? "default" : "pointer",
          fontFamily: "inherit",
          opacity: gradeVisible ? 1 : 0,
          transition: "opacity 0.6s ease 1.8s",
          pointerEvents: gradeVisible ? "auto" : "none",
        }}
      >
        {sharing ? (
          <>
            <div style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid currentColor", borderTopColor: "transparent", animation: "cgonSpin 0.7s linear infinite" }} />
            Saving…
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
              <polyline points="16 6 12 2 8 6"/>
              <line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
            Share
          </>
        )}
      </button>

      {/* Tap to continue */}
      <div style={{
        position: "absolute", bottom: 52,
        color: "rgba(255,255,255,0.18)", fontSize: 11,
        fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase",
        opacity: gradeVisible ? 1 : 0,
        transition: "opacity 0.7s ease 1.2s",
        animation: gradeVisible ? "revealPulse 2.5s ease-in-out 2s infinite" : "none",
      }}>
        Tap anywhere to continue
      </div>
    </div>
  );
}
