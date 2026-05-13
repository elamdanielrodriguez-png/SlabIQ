import { useState } from "react";

export const TOKEN_PACKS = [
  { id: "starter", name: "Starter",  tokens: 10, price: 4.99  },
  { id: "grinder", name: "Pro",      tokens: 25, price: 9.99,  savePct: 25 },
  { id: "pro",     name: "Premium",  tokens: 100, price: 24.99, savePct: 50 },
];

export default function PricingModal({ onClose, session, tokenBalance = 0 }) {
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState(null);

  const buy = async (packId) => {
    if (!session) { setError("Sign in first."); return; }
    setLoading(packId);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ packId }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      window.location.href = data.url;
    } catch (err) {
      setError(err.message || "Checkout failed. Try again.");
      setLoading(null);
    }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={sheet} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ color: "#fff", fontSize: 20, fontWeight: 700, letterSpacing: "-0.5px" }}>Buy Tokens</div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, marginTop: 3 }}>
              Tokens never expire · Use anytime
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 24, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
        </div>

        {/* Current balance */}
        {session && (
          <div style={{
            background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.18)",
            borderRadius: 10, padding: "10px 14px", marginBottom: 16,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>Current balance</span>
            <span style={{ color: "#c9a84c", fontSize: 15, fontWeight: 700 }}>{tokenBalance} token{tokenBalance !== 1 ? "s" : ""}</span>
          </div>
        )}

        {/* Token cost explainer */}
        <div style={{
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 10, padding: "10px 14px", marginBottom: 16,
          textAlign: "center",
        }}>
          <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 600, marginBottom: 2 }}>1 token · 1 grade</div>
          <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 11 }}>Spots microscopic flaws not visible to the naked eye</div>
        </div>

        {/* Packs */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {TOKEN_PACKS.map((pack) => {
            const perToken = (pack.price / pack.tokens).toFixed(2);
            return (
              <div key={pack.id} style={{
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 14, padding: "14px 16px",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <span style={{ color: "#fff", fontSize: 15, fontWeight: 700, letterSpacing: "-0.3px" }}>{pack.name}</span>
                    {pack.savePct && (
                      <span style={{
                        background: "rgba(48,209,88,0.12)", border: "1px solid rgba(48,209,88,0.25)",
                        borderRadius: 4, padding: "1px 7px",
                        color: "#30d158", fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase",
                      }}>{pack.savePct}% off</span>
                    )}
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>
                    {pack.tokens} tokens
                    <span style={{ color: "rgba(255,255,255,0.2)", marginLeft: 4 }}>· ${perToken}/token</span>
                  </div>
                </div>

                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ color: "#fff", fontSize: 17, fontWeight: 700, letterSpacing: "-0.5px", lineHeight: 1, marginBottom: 8 }}>
                    ${pack.price}
                  </div>
                  <button
                    onClick={() => buy(pack.id)}
                    disabled={loading === pack.id}
                    style={{ ...buyBtn, opacity: loading === pack.id ? 0.5 : 1 }}
                  >
                    {loading === pack.id ? "…" : "Buy"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {error && (
          <div style={{ color: "#ff453a", fontSize: 13, marginTop: 14, textAlign: "center" }}>{error}</div>
        )}

        {!session && (
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, textAlign: "center", marginTop: 16 }}>
            Sign in to purchase tokens
          </div>
        )}
      </div>
    </div>
  );
}

const overlay = {
  position: "fixed", inset: 0, zIndex: 800,
  background: "rgba(0,0,0,0.82)",
  backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
  display: "flex", alignItems: "flex-end", justifyContent: "center",
};

const sheet = {
  background: "#1c1c1e", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "24px 24px 0 0", padding: "28px 20px 40px",
  width: "100%", maxWidth: 480,
  boxShadow: "0 -8px 40px rgba(0,0,0,0.6)",
};

const buyBtn = {
  padding: "7px 18px", background: "#c9a84c", color: "#000",
  fontWeight: 700, fontSize: 12, border: "none",
  borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
};
