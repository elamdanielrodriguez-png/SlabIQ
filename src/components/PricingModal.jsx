import { useState } from "react";

export const TOKEN_PACKS = [
  { id: "starter", name: "Starter",  tokens: 10,  price: 4.99  },
  { id: "grinder", name: "Pro",      tokens: 25,  price: 9.99,  savePct: 25 },
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

        {/* Drag handle */}
        <div style={{ width: 36, height: 4, background: "rgba(255,255,255,0.14)", borderRadius: 99, margin: "0 auto 24px" }} />

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ color: "#fff", fontSize: 22, fontWeight: 700, letterSpacing: "-0.6px" }}>Buy Tokens</div>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, marginTop: 3 }}>Never expire · Use anytime</div>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.07)", border: "none",
            color: "rgba(255,255,255,0.4)", fontSize: 14, fontWeight: 700,
            cursor: "pointer", padding: "6px 10px", borderRadius: 8, lineHeight: 1,
          }}>✕</button>
        </div>

        {/* Balance chip */}
        {session && (
          <div style={{
            background: "rgba(201,168,76,0.07)", border: "1px solid rgba(201,168,76,0.18)",
            borderRadius: 10, padding: "9px 14px", marginBottom: 16,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 13 }}>Current balance</span>
            <span style={{ color: "#c9a84c", fontSize: 15, fontWeight: 700 }}>{tokenBalance} token{tokenBalance !== 1 ? "s" : ""}</span>
          </div>
        )}

        {/* Packs */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {TOKEN_PACKS.map((pack) => {
            const isPremium = pack.id === "pro";
            const isMid     = pack.id === "grinder";
            const perToken  = (pack.price / pack.tokens).toFixed(2);
            const isLoading = loading === pack.id;

            const goldAlpha  = isPremium ? 0.09 : isMid ? 0.055 : 0.03;
            const borderAlpha= isPremium ? 0.52 : isMid ? 0.35  : 0.22;
            const nameSize   = isPremium ? 16   : isMid ? 15    : 14;
            const numSize    = isPremium ? 38   : isMid ? 32    : 26;
            const padding    = isPremium ? "20px 18px" : isMid ? "17px 16px" : "14px 16px";

            return (
              <div key={pack.id} style={{
                background: `rgba(201,168,76,${goldAlpha})`,
                border: `${isPremium ? "1.5px" : "1px"} solid rgba(201,168,76,${borderAlpha})`,
                borderRadius: 16,
                padding,
                boxShadow: isPremium
                  ? "0 6px 28px rgba(201,168,76,0.14), inset 0 1px 0 rgba(201,168,76,0.18)"
                  : isMid
                    ? "0 3px 16px rgba(201,168,76,0.07), inset 0 1px 0 rgba(201,168,76,0.1)"
                    : "inset 0 1px 0 rgba(201,168,76,0.06)",
              }}>

                {/* Name + badge */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{
                    color: isPremium ? "#c9a84c" : isMid ? "rgba(201,168,76,0.85)" : "rgba(201,168,76,0.65)",
                    fontSize: nameSize, fontWeight: 700, letterSpacing: "-0.3px",
                  }}>{pack.name}</span>
                  {pack.savePct && (
                    <span style={{
                      background: "rgba(201,168,76,0.12)",
                      border: "1px solid rgba(201,168,76,0.3)",
                      borderRadius: 5, padding: "2px 8px",
                      color: "#c9a84c",
                      fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                    }}>{pack.savePct}% off</span>
                  )}
                </div>

                {/* Token count */}
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 14 }}>
                  <span style={{
                    color: isPremium ? "#c9a84c" : isMid ? "rgba(201,168,76,0.8)" : "rgba(201,168,76,0.6)",
                    fontSize: numSize, fontWeight: 800, letterSpacing: "-1.5px", lineHeight: 1,
                  }}>{pack.tokens}</span>
                  <span style={{ color: "rgba(201,168,76,0.35)", fontSize: 13, fontWeight: 500 }}>tokens</span>
                  <span style={{ color: "rgba(201,168,76,0.22)", fontSize: 11, marginLeft: 2 }}>· ${perToken}/ea</span>
                </div>

                {/* Buy row */}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 17, fontWeight: 700, letterSpacing: "-0.4px" }}>${pack.price}</span>
                  <button
                    onClick={() => buy(pack.id)}
                    disabled={isLoading}
                    style={{
                      flex: 1, padding: isPremium ? "13px 0" : "11px 0",
                      background: isLoading
                        ? "rgba(255,255,255,0.05)"
                        : isPremium
                          ? "linear-gradient(180deg, #dfc055 0%, #c9a84c 55%, #b89040 100%)"
                          : "rgba(201,168,76,0.15)",
                      color: isLoading ? "rgba(255,255,255,0.2)" : isPremium ? "#000" : "#c9a84c",
                      fontWeight: 700, fontSize: 14, border: "none",
                      borderRadius: 12, cursor: isLoading ? "not-allowed" : "pointer",
                      fontFamily: "inherit", letterSpacing: "-0.2px",
                      boxShadow: isLoading ? "none" : isPremium
                        ? "0 4px 18px rgba(201,168,76,0.45), inset 0 1px 0 rgba(255,255,255,0.25)"
                        : "inset 0 1px 0 rgba(201,168,76,0.15)",
                      opacity: isLoading ? 0.5 : 1,
                    }}
                  >{isLoading ? "…" : `Buy ${pack.name}`}</button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <div style={{ textAlign: "center" }}>
          <span style={{ color: "rgba(255,255,255,0.18)", fontSize: 11 }}>1 token · 1 full AI grade · Claude Opus</span>
        </div>

        {error && (
          <div style={{ color: "#ff453a", fontSize: 13, marginTop: 12, textAlign: "center" }}>{error}</div>
        )}

        {!session && (
          <div style={{ color: "rgba(255,255,255,0.28)", fontSize: 12, textAlign: "center", marginTop: 14 }}>
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
  overscrollBehavior: "contain",
};

const sheet = {
  background: "#1c1c1e",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: "24px 24px 0 0",
  padding: "20px 20px 44px",
  width: "100%", maxWidth: 480,
  maxHeight: "90vh",
  overflowY: "auto",
  overscrollBehavior: "contain",
  boxShadow: "0 -8px 48px rgba(0,0,0,0.65), 0 -1px 0 rgba(255,255,255,0.06)",
};
