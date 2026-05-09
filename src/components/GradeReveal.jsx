import { useState, useEffect } from "react";

const PSA_FULL_NAME = {
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
  if (g >= 10) return "0 0 120px rgba(201,168,76,0.7), 0 0 280px rgba(201,168,76,0.25)";
  if (g >= 9)  return "0 0 80px rgba(255,255,255,0.25)";
  return "none";
}

// Radial particles scattered in all directions
function GoldParticles({ grade }) {
  if (grade < 9) return null;
  const is10 = grade >= 10;
  const count = is10 ? 22 : 10;
  const color = is10 ? "#c9a84c" : "#e8e8e8";
  const angles = [...Array(count)].map((_, i) => (360 / count) * i + (Math.random() * 12 - 6));
  const sizes  = [...Array(count)].map((_, i) => is10 ? (i % 3 === 0 ? 9 : 5) : 4);
  const dists  = [...Array(count)].map((_, i) => is10 ? (40 + (i % 4) * 30) : 30);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {angles.map((angle, i) => (
        <div key={i} style={{
          position: "absolute",
          top: "50%", left: "50%",
          width: sizes[i], height: sizes[i],
          marginLeft: -sizes[i] / 2, marginTop: -sizes[i] / 2,
          borderRadius: "50%",
          background: i % 4 === 0 && is10 ? "#fff" : color,
          boxShadow: `0 0 ${sizes[i] * 2}px ${color}`,
          transform: `rotate(${angle}deg)`,
          animation: `particleFly ${0.6 + (i % 5) * 0.1}s cubic-bezier(0.22,1,0.36,1) ${i * 0.03}s both`,
          "--fly-dist": `${dists[i]}px`,
        }} />
      ))}
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
          position: "absolute",
          top: "-8px",
          left: p.left,
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

export default function GradeReveal({ result, onDone }) {
  const psaRaw = result?.psa?.grade;
  const bgsRaw = result?.bgs?.overall;
  const grade  = psaRaw != null ? Number(psaRaw) : null;
  const isInt  = grade != null && Number.isInteger(grade);
  const is10   = grade >= 10;
  const is9    = grade >= 9 && grade < 10;

  const [phase,   setPhase]   = useState(0);
  const [display, setDisplay] = useState(null);
  const [exiting, setExiting] = useState(false);

  const exit = () => {
    if (exiting) return;
    setExiting(true);
    setTimeout(onDone, 500);
  };

  useEffect(() => {
    // identity fades in fast
    const t1 = setTimeout(() => setPhase(1), 200);
    // counting starts soon after
    const t2 = setTimeout(() => {
      setPhase(2);
      if (grade == null) return;
      setDisplay(isInt ? 0 : 0.0);
      // Fast sprint to ~80%, then crawl for drama
      const FAST = 16, SLOW = 8, TOTAL = FAST + SLOW;
      let step = 0, tid;
      const tick = () => {
        step++;
        const eased = 1 - Math.pow(1 - step / TOTAL, 3.0);
        if (step >= TOTAL) { setDisplay(grade); setPhase(3); return; }
        setDisplay(isInt ? Math.floor(eased * grade) : Math.round(eased * grade * 2) / 2);
        tid = setTimeout(tick, step > FAST ? 200 : 38);
      };
      tid = setTimeout(tick, 38);
      return () => clearTimeout(tid);
    }, 420);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const color      = revealColor(grade);
  const glow       = phase >= 3 ? revealGlow(grade) : "none";
  const displayStr = display == null ? "" : isInt ? String(display) : Number(display).toFixed(1);
  const fontSize   = is10 ? 192 : 160;

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
        transform: exiting ? "scale(1.04)" : "scale(1)",
        transition: exiting ? "opacity 0.5s ease, transform 0.5s ease" : "opacity 0.2s ease",
        cursor: phase >= 2 ? "pointer" : "default",
        userSelect: "none",
        overflow: "hidden",
      }}
    >

      {/* PSA 10: full-screen gold wash on land */}
      {is10 && phase >= 3 && (
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(201,168,76,0.18) 0%, rgba(201,168,76,0.05) 55%, transparent 80%)",
          animation: "revealPulse 3s ease-in-out infinite",
        }} />
      )}

      {/* PSA 9: subtle white glow */}
      {is9 && phase >= 3 && (
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse 60% 45% at 50% 50%, rgba(255,255,255,0.07) 0%, transparent 75%)",
          animation: "revealPulse 2.8s ease-in-out infinite",
        }} />
      )}

      {/* PSA 10 confetti rain */}
      {is10 && phase >= 3 && <GoldConfetti />}

      {/* Accent lines top + bottom */}
      {[{ pos: "top: 0" }, { pos: "bottom: 0" }].map(({ pos }, i) => (
        <div key={i} style={{
          position: "absolute", [i === 0 ? "top" : "bottom"]: 0, left: "50%",
          width: phase >= 3 ? "100%" : "0%",
          height: is10 ? 2 : 1,
          background: `linear-gradient(90deg, transparent, ${color}${is10 ? "99" : "44"}, transparent)`,
          transform: "translateX(-50%)",
          transition: "width 0.7s cubic-bezier(0.22,1,0.36,1) 0.05s",
          pointerEvents: "none",
          boxShadow: is10 && phase >= 3 ? `0 0 12px ${color}66` : "none",
        }} />
      ))}

      {/* Grade name above identity — always shown, gold shimmer for 10 */}
      <div style={{
        textAlign: "center",
        marginBottom: 12,
        opacity: phase >= 3 ? 1 : 0,
        transform: phase >= 3 ? "translateY(0) scale(1)" : "translateY(8px) scale(0.9)",
        transition: "opacity 0.5s ease 0.1s, transform 0.5s cubic-bezier(0.22,1,0.36,1) 0.1s",
      }}>
        {is10 ? (
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: "0.35em",
            textTransform: "uppercase",
            background: "linear-gradient(90deg, #a07830, #c9a84c, #e8c870, #c9a84c, #a07830)",
            backgroundSize: "200% 100%",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            animation: phase >= 3 ? "goldShimmer 2.5s ease-in-out infinite" : "none",
          }}>
            {PSA_FULL_NAME[10]}
          </div>
        ) : (
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.28em",
            textTransform: "uppercase", color: `${color}99`,
          }}>
            {PSA_FULL_NAME[grade] ?? result?.psa?.label ?? ""}
          </div>
        )}
      </div>

      {/* Card identity */}
      <div style={{
        textAlign: "center",
        marginBottom: is10 ? 44 : 52,
        opacity: phase >= 1 ? 1 : 0,
        transform: phase >= 1 ? "translateY(0)" : "translateY(-12px)",
        transition: "opacity 0.5s cubic-bezier(0.22,1,0.36,1), transform 0.5s cubic-bezier(0.22,1,0.36,1)",
      }}>
        <div style={{
          color: "rgba(255,255,255,0.88)", fontSize: 22, fontWeight: 700,
          letterSpacing: "-0.5px", marginBottom: 6,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
        }}>
          {result?.player}
        </div>
        <div style={{ color: "rgba(255,255,255,0.28)", fontSize: 13 }}>
          {[result?.year, result?.set, result?.variant].filter(Boolean).join("  ·  ")}
        </div>
      </div>

      {/* Grade block */}
      <div style={{ textAlign: "center", position: "relative" }}>

        {/* PSA label */}
        <div style={{
          color: "rgba(255,255,255,0.18)", fontSize: 11, fontWeight: 700,
          letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 4,
          opacity: phase >= 2 ? 1 : 0,
          transition: "opacity 0.3s ease",
        }}>PSA</div>

        {/* Flash burst */}
        {phase >= 3 && (
          <div style={{
            position: "absolute", top: "35%", left: "50%",
            width: is10 ? 200 : 140,
            height: is10 ? 200 : 140,
            marginLeft: is10 ? -100 : -70,
            marginTop: is10 ? -100 : -70,
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

        {/* Expanding rings — 3 for 10, 1 for 9 */}
        {phase >= 3 && [...Array(is10 ? 3 : is9 ? 1 : 0)].map((_, i) => (
          <div key={i} style={{
            position: "absolute", top: "35%", left: "50%",
            width: is10 ? 90 : 70,
            height: is10 ? 90 : 70,
            marginLeft: is10 ? -45 : -35,
            marginTop: is10 ? -45 : -35,
            borderRadius: "50%",
            border: `${is10 ? 2.5 : 1.5}px solid ${is10 ? "rgba(201,168,76,0.8)" : "rgba(255,255,255,0.55)"}`,
            boxShadow: is10 ? `0 0 8px rgba(201,168,76,0.4)` : "none",
            animation: `gradeRing ${0.9 + i * 0.25}s cubic-bezier(0.22,1,0.36,1) ${i * 0.15}s forwards`,
            pointerEvents: "none",
          }} />
        ))}

        {/* Particle burst */}
        {phase >= 3 && (
          <div style={{ position: "absolute", top: "35%", left: "50%", width: 0, height: 0 }}>
            <GoldParticles grade={grade} />
          </div>
        )}

        {/* THE NUMBER */}
        <div style={{
          fontSize,
          fontWeight: 800,
          lineHeight: 1,
          letterSpacing: is10 ? "-8px" : "-6px",
          color: phase >= 2 ? color : "rgba(255,255,255,0.04)",
          textShadow: glow,
          fontVariantNumeric: "tabular-nums",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
          minWidth: is10 ? 260 : 220,
          transition: "color 0.2s ease",
          animation: phase === 3 ? "revealSlam 0.6s cubic-bezier(0.22,1,0.36,1) forwards" : "none",
          position: "relative",
        }}>
          {phase >= 2 ? displayStr : ""}

          {/* Gold shimmer sweep on the number for PSA 10 */}
          {is10 && phase >= 3 && (
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%)",
              backgroundSize: "200% 100%",
              animation: "goldShimmer 2.2s ease-in-out 0.3s infinite",
              WebkitBackgroundClip: "text",
              pointerEvents: "none",
              borderRadius: 8,
            }} />
          )}
        </div>

        {/* Grade label below number */}
        <div style={{
          color,
          fontSize: 15,
          fontWeight: 700, letterSpacing: "0.18em",
          textTransform: "uppercase", marginTop: 18,
          opacity: phase >= 3 ? (is10 ? 0 : 0.75) : 0,
          transition: "opacity 0.5s ease 0.1s",
        }}>
          {PSA_FULL_NAME[grade] ?? result?.psa?.label ?? ""}
        </div>

        {/* BGS */}
        {bgsRaw != null && (
          <div style={{
            marginTop: 10,
            opacity: phase >= 3 ? 0.35 : 0,
            transition: "opacity 0.6s ease 0.3s",
            color: "rgba(255,255,255,0.55)", fontSize: 14, fontWeight: 600,
          }}>
            BGS {Number(bgsRaw).toFixed(1)}
          </div>
        )}
      </div>

      {/* PSA 10: trophy row below */}
      {is10 && (
        <div style={{
          marginTop: 40,
          opacity: phase >= 3 ? 1 : 0,
          transition: "opacity 0.7s ease 0.5s",
          display: "flex", gap: 32, alignItems: "center",
        }}>
          {["Corners", "Edges", "Surface", "Centering"].map((label) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ color: "rgba(201,168,76,0.5)", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
              <div style={{ color: "#c9a84c", fontSize: 15, fontWeight: 800 }}>10</div>
            </div>
          ))}
        </div>
      )}

      {/* Tap to continue */}
      <div style={{
        position: "absolute", bottom: 52,
        color: "rgba(255,255,255,0.18)", fontSize: 11,
        fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase",
        opacity: phase >= 3 ? 1 : 0,
        transition: "opacity 0.7s ease 1.2s",
        animation: phase >= 3 ? "revealPulse 2.5s ease-in-out 2s infinite" : "none",
      }}>
        Tap anywhere to continue
      </div>
    </div>
  );
}
