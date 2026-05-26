import { useState, useEffect } from "react";

const GRADE_TIERS = [
  { value: "raw",           label: "Raw (ungraded)",  group: "Raw" },
  { value: "psa7",          label: "PSA 7",           group: "PSA" },
  { value: "psa8",          label: "PSA 8",           group: "PSA" },
  { value: "psa9",          label: "PSA 9",           group: "PSA" },
  { value: "psa10",         label: "PSA 10",          group: "PSA" },
  { value: "bgs9",          label: "BGS 9",           group: "BGS" },
  { value: "bgs9_5",        label: "BGS 9.5",         group: "BGS" },
  { value: "bgs10",         label: "BGS 10",          group: "BGS" },
  { value: "bgsBlackLabel", label: "BGS Black Label", group: "BGS" },
];

// Group tiers for <optgroup>
const TIER_GROUPS = ["Raw", "PSA", "BGS"];

export default function PriceAlertModal({ result, onClose }) {
  const { player, year, set, variant, cardNumber, psa } = result;
  const marketPrices = { raw: result.market?.raw, ...result.market?.graded };

  const defaultTier = psa?.grade === 10 ? "psa10" : "psa9";

  const [email,         setEmail]         = useState("");
  const [gradeTier,     setGradeTier]     = useState(defaultTier);
  const [thresholdType, setThresholdType] = useState("price"); // 'price' | 'percent'
  const [direction,     setDirection]     = useState("below");
  const [priceVal,      setPriceVal]      = useState(String(marketPrices[defaultTier] ?? ""));
  const [percentVal,    setPercentVal]    = useState("10");
  const [status,        setStatus]        = useState("idle"); // idle | loading | success | error
  const [errMsg,        setErrMsg]        = useState("");

  // Auto-fill price when grade tier changes
  useEffect(() => {
    if (marketPrices[gradeTier]) setPriceVal(String(marketPrices[gradeTier]));
  }, [gradeTier]);

  const currentMarketPrice = marketPrices[gradeTier];

  const submit = async () => {
    if (!email.trim()) return;
    if (thresholdType === "price" && !priceVal) return;
    if (thresholdType === "percent" && !percentVal) return;

    setStatus("loading");
    try {
      const body = {
        email: email.trim(),
        player, year,
        set_name: set,
        variant,
        card_number: cardNumber,
        grade_tier: gradeTier,
        direction,
        threshold_type: thresholdType,
        ...(thresholdType === "price"
          ? { threshold_price: Number(priceVal) }
          : { threshold_percent: Number(percentVal) }),
      };
      const res  = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setErrMsg(data.error || "Something went wrong"); setStatus("error"); return; }
      setStatus("success");
    } catch {
      setErrMsg("Network error — please try again.");
      setStatus("error");
    }
  };

  const tierLabel = GRADE_TIERS.find(t => t.value === gradeTier)?.label ?? gradeTier;

  // Human-readable description of what they're setting up
  let alertSummary = "";
  if (thresholdType === "price") {
    alertSummary = `Notify me when ${tierLabel} goes ${direction} $${priceVal || "?"}`;
  } else {
    const arrow = direction === "above" ? "↑" : "↓";
    alertSummary = `Notify me when ${tierLabel} moves ${arrow} ${percentVal || "?"}% from today's price`;
    if (currentMarketPrice) alertSummary += ` ($${currentMarketPrice})`;
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 900,
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 480,
          background: "#111113",
          border: "1px solid rgba(255,255,255,0.09)",
          borderBottom: "none",
          borderRadius: "24px 24px 0 0",
          padding: "14px 20px 52px",
          maxHeight: "92vh",
          overflowY: "auto",
        }}
      >
        {/* Drag handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.13)", margin: "0 auto 20px" }} />

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>
              Price Alert
            </div>
            <div style={{ color: "#fff", fontSize: 20, fontWeight: 800, letterSpacing: "-0.5px" }}>
              Get notified
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.28)", fontSize: 24, cursor: "pointer", padding: "0 0 0 16px", lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>

        {/* Card chip */}
        <div style={{
          background: "rgba(201,168,76,0.07)", border: "1px solid rgba(201,168,76,0.18)",
          borderRadius: 12, padding: "9px 14px", marginBottom: 20,
          fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.5,
        }}>
          <span style={{ color: "#c9a84c", fontWeight: 700 }}>{player}</span>
          {year && <span> · {year}</span>}
          {set && <span> {set}</span>}
          {variant && <span> · {variant}</span>}
          {cardNumber && <span> #{cardNumber}</span>}
        </div>

        {status === "success" ? (
          <div style={{ textAlign: "center", padding: "24px 0 8px" }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>🔔</div>
            <div style={{ color: "#30d158", fontWeight: 700, fontSize: 17, marginBottom: 10 }}>Alert set!</div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, lineHeight: 1.65 }}>
              {alertSummary}.<br />
              We'll email <span style={{ color: "#c9a84c" }}>{email}</span>.
            </div>
          </div>
        ) : (
          <>
            {/* ── Grade tier ──────────────────────────── */}
            <label style={labelStyle}>Grade to track</label>
            <select value={gradeTier} onChange={e => setGradeTier(e.target.value)} style={selectStyle}>
              {TIER_GROUPS.map(group => (
                <optgroup key={group} label={group}>
                  {GRADE_TIERS.filter(t => t.group === group).map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>

            {/* ── Alert type ──────────────────────────── */}
            <label style={labelStyle}>Alert type</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
              {[
                { value: "price",   label: "Hits a price",   sub: "exact $ target" },
                { value: "percent", label: "% change",        sub: "from today's price" },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setThresholdType(opt.value)}
                  style={{
                    flex: 1, padding: "10px 8px", border: "none", cursor: "pointer",
                    borderRadius: 12, textAlign: "center",
                    background: thresholdType === opt.value ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.05)",
                    outline: thresholdType === opt.value ? "1px solid rgba(201,168,76,0.45)" : "1px solid transparent",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ color: thresholdType === opt.value ? "#c9a84c" : "rgba(255,255,255,0.5)", fontWeight: 700, fontSize: 13 }}>
                    {opt.label}
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, marginTop: 2 }}>{opt.sub}</div>
                </button>
              ))}
            </div>

            {/* ── Direction ───────────────────────────── */}
            <label style={labelStyle}>
              {thresholdType === "price" ? "Notify when price is" : "Notify when price moves"}
            </label>
            <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
              {(thresholdType === "price"
                ? [{ value: "below", label: "↓ Below" }, { value: "above", label: "↑ Above" }]
                : [{ value: "below", label: "↓ Down" },  { value: "above", label: "↑ Up" }]
              ).map(d => (
                <button
                  key={d.value}
                  onClick={() => setDirection(d.value)}
                  style={{
                    flex: 1, padding: "11px 0", border: "none", cursor: "pointer",
                    borderRadius: 10, fontWeight: 600, fontSize: 14,
                    background: direction === d.value ? "#c9a84c" : "rgba(255,255,255,0.06)",
                    color: direction === d.value ? "#000" : "rgba(255,255,255,0.4)",
                    transition: "background 0.15s, color 0.15s",
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>

            {/* ── Threshold value ─────────────────────── */}
            {thresholdType === "price" ? (
              <>
                <label style={labelStyle}>
                  Price threshold
                  {currentMarketPrice && (
                    <span style={{ color: "rgba(255,255,255,0.2)", fontWeight: 400, marginLeft: 6 }}>
                      · current market: ${currentMarketPrice.toLocaleString()}
                    </span>
                  )}
                </label>
                <div style={{ position: "relative", marginBottom: 18 }}>
                  <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.28)", fontSize: 15, pointerEvents: "none" }}>$</span>
                  <input
                    type="number" placeholder="0" value={priceVal} min={1}
                    onChange={e => setPriceVal(e.target.value)}
                    style={{ ...inputStyle, paddingLeft: 26, marginBottom: 0 }}
                  />
                </div>
              </>
            ) : (
              <>
                <label style={labelStyle}>
                  Percentage
                  {currentMarketPrice && (
                    <span style={{ color: "rgba(255,255,255,0.2)", fontWeight: 400, marginLeft: 6 }}>
                      · today's price: ${currentMarketPrice.toLocaleString()}
                    </span>
                  )}
                </label>
                <div style={{ position: "relative", marginBottom: 4 }}>
                  <input
                    type="number" placeholder="10" value={percentVal} min={1} max={999}
                    onChange={e => setPercentVal(e.target.value)}
                    style={{ ...inputStyle, paddingRight: 36, marginBottom: 0 }}
                  />
                  <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.28)", fontSize: 15, pointerEvents: "none" }}>%</span>
                </div>
                {currentMarketPrice && percentVal && (
                  <div style={{ color: "rgba(255,255,255,0.28)", fontSize: 12, marginBottom: 18, paddingLeft: 2 }}>
                    {direction === "above" ? "Target: " : "Target: "}
                    <span style={{ color: "#c9a84c" }}>
                      ${Math.round(currentMarketPrice * (direction === "above" ? 1 + Number(percentVal) / 100 : 1 - Number(percentVal) / 100)).toLocaleString()}
                    </span>
                  </div>
                )}
                {(!currentMarketPrice || !percentVal) && <div style={{ marginBottom: 18 }} />}
              </>
            )}

            {/* ── Email ───────────────────────────────── */}
            <label style={labelStyle}>Your email</label>
            <input
              type="email" placeholder="you@example.com" value={email}
              onChange={e => setEmail(e.target.value)}
              style={inputStyle}
            />

            {/* ── Summary preview ─────────────────────── */}
            <div style={{
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 10, padding: "10px 14px", marginBottom: 16,
              color: "rgba(255,255,255,0.3)", fontSize: 12, lineHeight: 1.5,
            }}>
              {alertSummary || "Fill in the fields above to preview your alert."}
            </div>

            {status === "error" && (
              <div style={{ color: "#ff453a", fontSize: 13, marginBottom: 12 }}>{errMsg}</div>
            )}

            <button
              onClick={submit}
              disabled={!email.trim() || (thresholdType === "price" && !priceVal) || (thresholdType === "percent" && !percentVal) || status === "loading"}
              style={{
                width: "100%", padding: "14px 0", border: "none", borderRadius: 14, cursor: "pointer",
                background: "linear-gradient(135deg, #a07830, #c9a84c, #e8c870)",
                color: "#000", fontWeight: 700, fontSize: 15, letterSpacing: "-0.2px",
                opacity: (!email.trim() || (thresholdType === "price" && !priceVal) || (thresholdType === "percent" && !percentVal) || status === "loading") ? 0.4 : 1,
                transition: "opacity 0.15s",
              }}
            >
              {status === "loading" ? "Setting alert…" : "🔔 Set Alert"}
            </button>

            <div style={{ color: "rgba(255,255,255,0.18)", fontSize: 12, textAlign: "center", marginTop: 12 }}>
              Checked every 6 hours · Unsubscribe anytime via email link
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
  marginBottom: 7,
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
