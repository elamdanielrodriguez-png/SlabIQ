import { useState } from "react";

export const PLANS = {
  standard: [
    { id: "free",    name: "Free",    price: 0,     grades: 2,   desc: "Try it out" },
    { id: "hobby",   name: "Hobby",   price: 4.99,  grades: 20,  desc: "Casual collectors" },
    { id: "grinder", name: "Grinder", price: 9.99,  grades: 60,  desc: "Active flippers" },
    { id: "pro",     name: "Pro",     price: 19.99, grades: 150, desc: "Heavy volume" },
  ],
  elite: [
    { id: "elite_hobby",   name: "Hobby",   price: 24.99,  grades: 20,  desc: "Casual collectors" },
    { id: "elite_grinder", name: "Grinder", price: 49.99,  grades: 60,  desc: "Active flippers" },
    { id: "elite_pro",     name: "Pro",     price: 99.99,  grades: 100, desc: "Heavy volume" },
  ],
};

export default function PricingModal({ onClose, session, currentPlan, onManage }) {
  const [tier, setTier] = useState("standard");
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState(null);

  const plans = PLANS[tier];

  const subscribe = async (planId) => {
    if (!session) {
      setError("Sign in first to subscribe.");
      return;
    }
    setLoading(planId);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      window.location.href = data.url;
    } catch (err) {
      setError(err.message || "Checkout failed. Try again.");
      setLoading(null);
    }
  };

  const isCurrent = (planId) => currentPlan?.plan === planId;
  const isElite = tier === "elite";

  return (
    <div style={overlay} onClick={onClose}>
      <div style={sheet} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
          <div>
            <div style={{ color: "#fff", fontSize: 20, fontWeight: 700, letterSpacing: "-0.5px" }}>Choose a Plan</div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, marginTop: 3 }}>
              Resets monthly · Cancel anytime
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 24, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
        </div>

        {/* Tier toggle */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr",
          background: "rgba(255,255,255,0.05)",
          borderRadius: 12, padding: 3, marginBottom: 20,
        }}>
          {[
            { key: "standard", label: "Standard", sub: "Claude Sonnet" },
            { key: "elite",    label: "Elite",    sub: "Claude Opus" },
          ].map(({ key, label, sub }) => (
            <button
              key={key}
              onClick={() => setTier(key)}
              style={{
                padding: "10px 0",
                borderRadius: 10,
                border: "none",
                background: tier === key ? "rgba(255,255,255,0.1)" : "transparent",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "background 0.15s",
              }}
            >
              <div style={{ color: tier === key ? "#fff" : "rgba(255,255,255,0.4)", fontSize: 14, fontWeight: 600, letterSpacing: "-0.2px" }}>{label}</div>
              <div style={{ color: tier === key ? "#c9a84c" : "rgba(255,255,255,0.2)", fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 2 }}>{sub}</div>
            </button>
          ))}
        </div>

        {isElite && (
          <div style={{
            background: "rgba(201,168,76,0.07)",
            border: "1px solid rgba(201,168,76,0.2)",
            borderRadius: 10, padding: "10px 14px", marginBottom: 16,
            color: "rgba(255,255,255,0.5)", fontSize: 12, lineHeight: 1.55,
          }}>
            <span style={{ color: "#c9a84c", fontWeight: 600 }}>Claude Opus</span> — deeper zone analysis, more accurate defect detection for high-value cards. ~5× more powerful than Sonnet.
          </div>
        )}

        {/* Plan cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: "50vh", overflowY: "auto" }}>
          {plans.map((plan) => {
            const current = isCurrent(plan.id);
            const isFree = plan.price === 0;
            return (
              <div key={plan.id} style={{
                background: current ? "rgba(201,168,76,0.06)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${current ? "rgba(201,168,76,0.35)" : "rgba(255,255,255,0.07)"}`,
                borderRadius: 14,
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}>
                {/* Info */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <span style={{ color: current ? "#c9a84c" : "#fff", fontSize: 15, fontWeight: 700, letterSpacing: "-0.3px" }}>
                      {plan.name}
                    </span>
                    {current && (
                      <span style={{
                        background: "rgba(201,168,76,0.15)", border: "1px solid rgba(201,168,76,0.3)",
                        borderRadius: 4, padding: "1px 7px",
                        color: "#c9a84c", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                      }}>current</span>
                    )}
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>
                    {plan.grades} grade{plan.grades !== 1 ? "s" : ""}{isFree ? "" : "/mo"} · {plan.desc}
                  </div>
                </div>

                {/* Price + CTA */}
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ color: "#fff", fontSize: 17, fontWeight: 700, letterSpacing: "-0.5px", lineHeight: 1, marginBottom: 8 }}>
                    {isFree ? "Free" : `$${plan.price}`}
                    {!isFree && <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, fontWeight: 400 }}>/mo</span>}
                  </div>
                  {current ? (
                    currentPlan?.plan !== "free" && (
                      <button onClick={onManage} style={manageBtn}>Manage</button>
                    )
                  ) : isFree ? null : (
                    <button
                      onClick={() => subscribe(plan.id)}
                      disabled={loading === plan.id}
                      style={{ ...subBtn, opacity: loading === plan.id ? 0.5 : 1 }}
                    >
                      {loading === plan.id ? "…" : "Subscribe"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {error && (
          <div style={{ color: "#ff453a", fontSize: 13, marginTop: 14, textAlign: "center" }}>{error}</div>
        )}

        {!session && (
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, textAlign: "center", marginTop: 16, lineHeight: 1.5 }}>
            Sign in to subscribe
          </div>
        )}
      </div>
    </div>
  );
}

const overlay = {
  position: "fixed", inset: 0, zIndex: 800,
  background: "rgba(0,0,0,0.82)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  display: "flex", alignItems: "flex-end", justifyContent: "center",
};

const sheet = {
  background: "#1c1c1e",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "24px 24px 0 0",
  padding: "28px 20px 40px",
  width: "100%",
  maxWidth: 480,
  boxShadow: "0 -8px 40px rgba(0,0,0,0.6)",
};

const subBtn = {
  padding: "7px 14px",
  background: "#c9a84c",
  color: "#000",
  fontWeight: 700,
  fontSize: 12,
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontFamily: "inherit",
  letterSpacing: "-0.1px",
};

const manageBtn = {
  padding: "7px 14px",
  background: "rgba(255,255,255,0.07)",
  color: "rgba(255,255,255,0.5)",
  fontWeight: 600,
  fontSize: 12,
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  cursor: "pointer",
  fontFamily: "inherit",
};
