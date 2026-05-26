import { useState, useEffect } from "react";

const GRADE_TIERS = [
  { value: "psa7",          label: "PSA 7" },
  { value: "psa8",          label: "PSA 8" },
  { value: "psa9",          label: "PSA 9" },
  { value: "psa10",         label: "PSA 10" },
  { value: "bgs9",          label: "BGS 9" },
  { value: "bgs9_5",        label: "BGS 9.5" },
  { value: "bgs10",         label: "BGS 10" },
  { value: "bgsBlackLabel", label: "BGS Black Label" },
];

export default function PriceAlertModal({ result, onClose }) {
  const { player, year, set, variant, cardNumber, psa } = result;
  const marketPrices = result.market?.graded ?? {};

  // Default to the expected PSA grade tier
  const defaultTier = psa?.grade === 10 ? "psa10" : "psa9";

  const [email,     setEmail]     = useState("");
  const [gradeTier, setGradeTier] = useState(defaultTier);
  const [direction, setDirection] = useState("below");
  const [threshold, setThreshold] = useState(String(marketPrices[defaultTier] ?? ""));
  const [status,    setStatus]    = useState("idle"); // idle | loading | success | error
  const [errMsg,    setErrMsg]    = useState("");

  // Auto-fill threshold with current market price when tier changes
  useEffect(() => {
    if (marketPrices[gradeTier]) setThreshold(String(marketPrices[gradeTier]));
  }, [gradeTier]);

  const submit = async () => {
    if (!email.trim() || !threshold) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          player,
          year,
          set_name: set,
          variant,
          card_number: cardNumber,
          grade_tier: gradeTier,
          direction,
          threshold_price: Number(threshold),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrMsg(data.error || "Something went wrong");
        setStatus("error");
        return;
      }
      setStatus("success");
    } catch {
      setErrMsg("Network error — please try again.");
      setStatus("error");
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 900,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 480,
          background: "rgba(18,18,20,0.99)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderTop: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "24px 24px 0 0",
          padding: "16px 24px 52px",
        }}
      >
        {/* Drag handle */}
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: "rgba(255,255,255,0.15)",
          margin: "0 auto 22px",
        }} />

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ color: "rgba(255,255,255,0.28)", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>
              CardGradeOrNot
            </div>
            <div style={{ color: "#fff", fontSize: 20, fontWeight: 800, letterSpacing: "-0.5px" }}>
              Set Price Alert
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 24, cursor: "pointer", padding: "0 0 0 16px", lineHeight: 1, flexShrink: 0 }}
          >×</button>
        </div>

        {/* Card info chip */}
        <div style={{
          background: "rgba(201,168,76,0.07)",
          border: "1px solid rgba(201,168,76,0.2)",
          borderRadius: 12,
          padding: "9px 14px",
          marginBottom: 20,
          fontSize: 13,
          color: "rgba(255,255,255,0.55)",
          lineHeight: 1.5,
        }}>
          <span style={{ color: "#c9a84c", fontWeight: 700 }}>{player}</span>
          {year && <span> · {year}</span>}
          {set && <span> {set}</span>}
          {variant && <span> · {variant}</span>}
          {cardNumber && <span> #{cardNumber}</span>}
        </div>

        {status === "success" ? (
          <div style={{ textAlign: "center", padding: "20px 0 8px" }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>🔔</div>
            <div style={{ color: "#30d158", fontWeight: 700, fontSize: 17, marginBottom: 10 }}>
              Alert set!
            </div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, lineHeight: 1.6 }}>
              We'll email <span style={{ color: "#c9a84c" }}>{email}</span> when&nbsp;
              {GRADE_TIERS.find(t => t.value === gradeTier)?.label} goes {direction === "below" ? "below" : "above"} ${Number(threshold).toLocaleString()}.
            </div>
          </div>
        ) : (
          <>
            {/* Email */}
            <label style={labelStyle}>Your email</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={inputStyle}
            />

            {/* Grade tier */}
            <label style={labelStyle}>Grade tier to watch</label>
            <select
              value={gradeTier}
              onChange={e => setGradeTier(e.target.value)}
              style={selectStyle}
            >
              {GRADE_TIERS.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>

            {/* Direction */}
            <label style={labelStyle}>Alert when price is</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {[
                { value: "below", label: "↓ Below" },
                { value: "above", label: "↑ Above" },
              ].map(d => (
                <button
                  key={d.value}
                  onClick={() => setDirection(d.value)}
                  style={{
                    flex: 1, padding: "11px 0",
                    borderRadius: 10, border: "none", cursor: "pointer",
                    fontWeight: 600, fontSize: 14,
                    background: direction === d.value ? "#c9a84c" : "rgba(255,255,255,0.06)",
                    color: direction === d.value ? "#000" : "rgba(255,255,255,0.45)",
                    transition: "background 0.15s, color 0.15s",
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>

            {/* Threshold price */}
            <label style={labelStyle}>Price threshold (USD)</label>
            <div style={{ position: "relative", marginBottom: 20 }}>
              <span style={{
                position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
                color: "rgba(255,255,255,0.3)", fontSize: 16, pointerEvents: "none",
              }}>$</span>
              <input
                type="number"
                placeholder="0"
                value={threshold}
                onChange={e => setThreshold(e.target.value)}
                min={1}
                style={{ ...inputStyle, paddingLeft: 26, marginBottom: 0 }}
              />
            </div>

            {status === "error" && (
              <div style={{ color: "#ff453a", fontSize: 13, marginBottom: 12 }}>{errMsg}</div>
            )}

            <button
              onClick={submit}
              disabled={!email.trim() || !threshold || status === "loading"}
              style={{
                width: "100%", padding: "14px 0", border: "none", borderRadius: 14, cursor: "pointer",
                background: "linear-gradient(135deg, #a07830, #c9a84c, #e8c870)",
                color: "#000", fontWeight: 700, fontSize: 15, letterSpacing: "-0.2px",
                opacity: (!email.trim() || !threshold || status === "loading") ? 0.4 : 1,
                transition: "opacity 0.15s",
              }}
            >
              {status === "loading" ? "Setting alert…" : "🔔 Set Alert"}
            </button>

            <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 12, textAlign: "center", marginTop: 12 }}>
              We check prices every 6 hours · Unsubscribe anytime via email link
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const labelStyle = {
  display: "block",
  color: "rgba(255,255,255,0.28)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  marginBottom: 6,
};

const inputStyle = {
  width: "100%",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10,
  padding: "11px 14px",
  color: "#fff",
  fontSize: 14,
  marginBottom: 16,
  boxSizing: "border-box",
  outline: "none",
};

const selectStyle = {
  width: "100%",
  background: "#1c1c1e",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10,
  padding: "11px 14px",
  color: "#fff",
  fontSize: 14,
  marginBottom: 16,
  boxSizing: "border-box",
  outline: "none",
  cursor: "pointer",
};
