import { useState, useEffect } from "react";

function revealColor(g) {
  if (!g && g !== 0) return "rgba(255,255,255,0.55)";
  if (g >= 10) return "#c9a84c";
  if (g >= 9)  return "#f2f2f2";
  if (g >= 8)  return "rgba(255,255,255,0.80)";
  if (g >= 6)  return "rgba(255,180,60,0.85)";
  return "#ff453a";
}

function revealGlow(g) {
  if (!g) return "none";
  if (g >= 10) return "0 0 90px rgba(201,168,76,0.55), 0 0 200px rgba(201,168,76,0.18)";
  if (g >= 9)  return "0 0 70px rgba(255,255,255,0.22)";
  return "none";
}

function revealBg(g) {
  if (!g) return "transparent";
  if (g >= 10) return "radial-gradient(ellipse 55% 42% at 50% 52%, rgba(201,168,76,0.14) 0%, transparent 75%)";
  if (g >= 9)  return "radial-gradient(ellipse 55% 42% at 50% 52%, rgba(255,255,255,0.07) 0%, transparent 75%)";
  return "transparent";
}

function Particles({ grade }) {
  const count = grade >= 10 ? 10 : grade >= 9 ? 6 : 0;
  if (count === 0) return null;
  const color = grade >= 10 ? "#c9a84c" : "#e0e0e0";
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {[...Array(count)].map((_, i) => (
        <div key={i} style={{
          position: "absolute", top: "50%", left: "50%",
          width: grade >= 10 ? 7 : 5, height: grade >= 10 ? 7 : 5,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 6px ${color}`,
          transform: `rotate(${(360 / count) * i}deg)`,
          animation: `particleFly ${0.7 + (i % 3) * 0.12}s cubic-bezier(0.22,1,0.36,1) ${i * 0.04}s both`,
        }} />
      ))}
    </div>
  );
}

export default function GradeReveal({ result, onDone }) {
  const psaRaw  = result?.psa?.grade;
  const bgsRaw  = result?.bgs?.overall;
  const grade   = psaRaw != null ? Number(psaRaw) : null;
  const isInt   = grade != null && Number.isInteger(grade);

  const [phase,   setPhase]   = useState(0); // 0=in, 1=identity, 2=counting, 3=landed, 4=out
  const [display, setDisplay] = useState(null);
  const [exiting, setExiting] = useState(false);

  const exit = () => {
    if (exiting) return;
    setExiting(true);
    setTimeout(onDone, 550);
  };

  // Phased entrance
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 350);
    const t2 = setTimeout(() => {
      setPhase(2);
      if (grade == null) return;
      setDisplay(isInt ? 0 : 0.0);
      const FAST = 20, SLOW = 7, TOTAL = FAST + SLOW;
      let step = 0, tid;
      const tick = () => {
        step++;
        const eased = 1 - Math.pow(1 - step / TOTAL, 2.8);
        if (step >= TOTAL) { setDisplay(grade); setPhase(3); return; }
        setDisplay(isInt ? Math.floor(eased * grade) : Math.round(eased * grade * 2) / 2);
        tid = setTimeout(tick, step > FAST ? 250 : 45);
      };
      tid = setTimeout(tick, 45);
      return () => clearTimeout(tid);
    }, 850);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // Auto-exit 2.4s after landing
  useEffect(() => {
    if (phase !== 3) return;
    const t = setTimeout(exit, 2400);
    return () => clearTimeout(t);
  }, [phase]);

  const color   = revealColor(grade);
  const glow    = phase >= 3 ? revealGlow(grade) : "none";
  const displayStr = display == null ? "" : isInt ? String(display) : Number(display).toFixed(1);

  return (
    <div
      onClick={() => phase >= 2 && exit()}
      style={{
        position: "fixed", inset: 0, zIndex: 700,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.97)",
        backdropFilter: "blur(48px)",
        WebkitBackdropFilter: "blur(48px)",
        opacity: exiting ? 0 : 1,
        transform: exiting ? "scale(1.03)" : "scale(1)",
        transition: exiting ? "opacity 0.55s ease, transform 0.55s ease" : "opacity 0.25s ease",
        cursor: phase >= 2 ? "pointer" : "default",
        userSelect: "none",
      }}
    >
      {/* Grade-colored ambient glow */}
      {phase >= 3 && (
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: revealBg(grade),
          animation: "revealPulse 2.8s ease-in-out infinite",
        }} />
      )}

      {/* Top line */}
      <div style={{
        position: "absolute", top: 0, left: "50%",
        width: phase >= 3 ? "100%" : "0%",
        height: 1,
        background: `linear-gradient(90deg, transparent, ${color}55, transparent)`,
        transform: "translateX(-50%)",
        transition: "width 0.8s cubic-bezier(0.22,1,0.36,1) 0.1s",
        pointerEvents: "none",
      }} />

      {/* Card identity */}
      <div style={{
        textAlign: "center",
        marginBottom: 56,
        opacity: phase >= 1 ? 1 : 0,
        transform: phase >= 1 ? "translateY(0)" : "translateY(-16px)",
        transition: "opacity 0.65s cubic-bezier(0.22,1,0.36,1), transform 0.65s cubic-bezier(0.22,1,0.36,1)",
      }}>
        <div style={{
          color: "rgba(255,255,255,0.88)", fontSize: 22, fontWeight: 700,
          letterSpacing: "-0.5px", marginBottom: 7,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
        }}>
          {result?.player}
        </div>
        <div style={{ color: "rgba(255,255,255,0.28)", fontSize: 13, letterSpacing: "0.01em" }}>
          {[result?.year, result?.set, result?.variant].filter(Boolean).join("  ·  ")}
        </div>
      </div>

      {/* Grade */}
      <div style={{ textAlign: "center", position: "relative" }}>

        {/* PSA label */}
        <div style={{
          color: "rgba(255,255,255,0.18)", fontSize: 11, fontWeight: 700,
          letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 6,
          opacity: phase >= 2 ? 1 : 0,
          transition: "opacity 0.35s ease",
        }}>PSA</div>

        {/* Flash burst when number lands */}
        {phase >= 3 && (
          <div style={{
            position: "absolute", top: "30%", left: "50%",
            width: 120, height: 120, marginLeft: -60, marginTop: -60,
            borderRadius: "50%",
            background: grade >= 10
              ? "radial-gradient(circle, rgba(201,168,76,0.6) 0%, transparent 70%)"
              : grade >= 9
                ? "radial-gradient(circle, rgba(255,255,255,0.35) 0%, transparent 70%)"
                : "radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 70%)",
            animation: "gradeFlash 0.7s cubic-bezier(0.22,1,0.36,1) forwards",
            pointerEvents: "none",
          }} />
        )}

        {/* Expanding ring */}
        {phase >= 3 && grade >= 9 && (
          <div style={{
            position: "absolute", top: "30%", left: "50%",
            width: 70, height: 70, marginLeft: -35, marginTop: -35,
            borderRadius: "50%",
            border: `2px solid ${grade >= 10 ? "rgba(201,168,76,0.7)" : "rgba(255,255,255,0.5)"}`,
            animation: "gradeRing 1.1s cubic-bezier(0.22,1,0.36,1) forwards",
            pointerEvents: "none",
          }} />
        )}

        {/* Particles wrapper */}
        {phase >= 3 && (
          <div style={{ position: "absolute", top: "30%", left: "50%", width: 0, height: 0 }}>
            <Particles grade={grade} />
          </div>
        )}

        {/* THE NUMBER */}
        <div style={{
          fontSize: 148,
          fontWeight: 800,
          lineHeight: 1,
          letterSpacing: "-6px",
          color: phase >= 2 ? color : "rgba(255,255,255,0.04)",
          textShadow: glow,
          fontVariantNumeric: "tabular-nums",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
          minWidth: 220,
          transition: "color 0.25s ease",
          animation: phase === 3 ? "revealSlam 0.55s cubic-bezier(0.22,1,0.36,1) forwards" : "none",
        }}>
          {phase >= 2 ? displayStr : ""}
        </div>

        {/* Grade label */}
        <div style={{
          color,
          fontSize: 12, fontWeight: 700, letterSpacing: "0.2em",
          textTransform: "uppercase", marginTop: 14,
          opacity: phase >= 3 ? 0.65 : 0,
          transition: "opacity 0.6s ease 0.15s",
        }}>
          {result?.psa?.label}
        </div>

        {/* BGS secondary */}
        {bgsRaw != null && (
          <div style={{
            marginTop: 12,
            opacity: phase >= 3 ? 0.35 : 0,
            transition: "opacity 0.6s ease 0.35s",
            color: "rgba(255,255,255,0.55)", fontSize: 14, fontWeight: 600,
            letterSpacing: "-0.2px",
          }}>
            BGS {Number(bgsRaw).toFixed(1)}
          </div>
        )}
      </div>

      {/* Bottom line */}
      <div style={{
        position: "absolute", bottom: 0, left: "50%",
        width: phase >= 3 ? "100%" : "0%",
        height: 1,
        background: `linear-gradient(90deg, transparent, ${color}55, transparent)`,
        transform: "translateX(-50%)",
        transition: "width 0.8s cubic-bezier(0.22,1,0.36,1) 0.1s",
        pointerEvents: "none",
      }} />

      {/* Tap to continue */}
      <div style={{
        position: "absolute", bottom: 52,
        color: "rgba(255,255,255,0.18)", fontSize: 11,
        fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase",
        opacity: phase >= 3 ? 1 : 0,
        transition: "opacity 0.7s ease 1s",
        animation: phase >= 3 ? "revealPulse 2.5s ease-in-out 1.5s infinite" : "none",
      }}>
        Tap anywhere to continue
      </div>
    </div>
  );
}
