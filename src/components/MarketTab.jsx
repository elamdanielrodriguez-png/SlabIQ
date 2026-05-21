import { useState, useEffect } from "react";

function AnimPrice({ value, style }) {
  const [display, setDisplay] = useState(null);
  useEffect(() => {
    if (value == null) { setDisplay(null); return; }
    setDisplay(0);
    const STEPS = 22, INTERVAL = 880 / STEPS;
    let step = 0;
    const id = setInterval(() => {
      step++;
      const eased = 1 - Math.pow(1 - step / STEPS, 2.5);
      if (step >= STEPS) { clearInterval(id); setDisplay(value); }
      else setDisplay(Math.round(eased * value));
    }, INTERVAL);
    return () => clearInterval(id);
  }, [value]);
  return <span style={style}>{display == null ? "—" : `$${Number(display).toLocaleString()}`}</span>;
}

function AnimPct({ value, sign }) {
  const [display, setDisplay] = useState(null);
  useEffect(() => {
    if (value == null) { setDisplay(null); return; }
    setDisplay(0);
    const STEPS = 20, INTERVAL = 820 / STEPS;
    let step = 0;
    const id = setInterval(() => {
      step++;
      const eased = 1 - Math.pow(1 - step / STEPS, 2.5);
      if (step >= STEPS) { clearInterval(id); setDisplay(value); }
      else setDisplay(Math.round(eased * value));
    }, INTERVAL);
    return () => clearInterval(id);
  }, [value]);
  return <span>{display == null ? "—" : `${sign}${display}%`}</span>;
}

export default function MarketTab({ result }) {
  const { popData, market, psa, bgs, player, year, set, variant } = result;
  const psaGrade = psa?.grade;
  const bgsGrade = bgs?.overall;
  const bgsBlackLabel = bgs?.isBlackLabel === true;

  const trend = market?.trend;
  const up = trend === "rising";
  const down = trend === "falling";
  const trendColor = up ? "#30d158" : down ? "#ff453a" : "rgba(255,255,255,0.3)";
  const trendSign = (market?.trendPercent ?? 0) > 0 ? "+" : "";

  const psaMax = Math.max(...(popData?.psa?.distribution?.map((d) => d.count) ?? [1]));
  const bgsMax = Math.max(...(popData?.bgs?.distribution?.map((d) => d.count) ?? [1]));

  const isNumbered = typeof variant === "string" && variant.includes("/");
  const psaPopUrl = [player, year, set].filter(Boolean).length > 0
    ? `https://www.psacard.com/pop/index/searchresults?name=${encodeURIComponent([player, year, set].filter(Boolean).join(" "))}`
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Pop reports */}
      <div className="result-card-0" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <PopPanel
          title="PSA"
          subtitle="Population"
          total={popData?.psa?.total}
          gemRate={popData?.psa?.gemRate}
          gemLabel="PSA 10 Rate"
          distribution={popData?.psa?.distribution}
          highlightGrade={psaGrade}
          maxCount={psaMax}
          isPsa
          isReal={popData?.psa?.isReal === true}
          isNumbered={isNumbered}
          popUrl={psaPopUrl}
        />
        <PopPanel
          title="BGS"
          subtitle="Population"
          total={popData?.bgs?.total}
          gemRate={popData?.bgs?.gemRate}
          gemLabel="9.5+ Rate"
          distribution={popData?.bgs?.distribution}
          highlightGrade={bgsGrade}
          isBlackLabel={bgsBlackLabel}
          maxCount={bgsMax}
          isNumbered={isNumbered}
        />
      </div>

      {/* Market values */}
      <div className="result-card-1" style={card}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={sectionLabel}>Raw Value</div>
              {market?.rawUrl && (
                <a href={market.rawUrl} target="_blank" rel="noopener noreferrer" style={ebayLinkStyle}>
                  eBay ↗
                </a>
              )}
            </div>
            <div style={{ color: "#fff", fontSize: 30, fontWeight: 700, letterSpacing: "-1px", marginTop: 4, lineHeight: 1 }}>
              <AnimPrice value={market?.raw} />
            </div>
          </div>
          <div style={{
            background: `${trendColor}12`,
            border: `1px solid ${trendColor}30`,
            borderRadius: 10,
            padding: "10px 14px",
            textAlign: "right",
          }}>
            <div style={{ color: trendColor, fontSize: 20, fontWeight: 700, letterSpacing: "-0.5px", lineHeight: 1 }}>
              <AnimPct value={market?.trendPercent} sign={trendSign} />
            </div>
            <div style={{ color: "rgba(255,255,255,0.22)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 4 }}>
              90-day
            </div>
          </div>
        </div>

        {/* Value tables */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          <ValueTable
            heading="PSA"
            rows={[
              { grade: "PSA 7",  value: market?.graded?.psa7,  url: market?.gradedUrls?.psa7,  active: psaGrade === 7 },
              { grade: "PSA 8",  value: market?.graded?.psa8,  url: market?.gradedUrls?.psa8,  active: psaGrade === 8 },
              { grade: "PSA 9",  value: market?.graded?.psa9,  url: market?.gradedUrls?.psa9,  active: psaGrade === 9 },
              { grade: "PSA 10", value: market?.graded?.psa10, url: market?.gradedUrls?.psa10, active: psaGrade === 10 },
            ]}
          />
          <ValueTable
            heading="BGS"
            rows={[
              { grade: "BGS 7",       value: market?.graded?.bgs7,         url: market?.gradedUrls?.bgs7,         active: bgsGrade === 7   && !bgsBlackLabel },
              { grade: "BGS 8",       value: market?.graded?.bgs8,         url: market?.gradedUrls?.bgs8,         active: bgsGrade === 8   && !bgsBlackLabel },
              { grade: "BGS 9",       value: market?.graded?.bgs9,         url: market?.gradedUrls?.bgs9,         active: bgsGrade === 9   && !bgsBlackLabel },
              { grade: "9.5 Gem Mint",value: market?.graded?.bgs9_5,       url: market?.gradedUrls?.bgs9_5,       active: bgsGrade === 9.5 && !bgsBlackLabel },
              { grade: "10 Pristine", value: market?.graded?.bgs10,        url: market?.gradedUrls?.bgs10,        active: bgsGrade === 10  && !bgsBlackLabel, isPristine: true },
              { grade: "Black Label", value: market?.graded?.bgsBlackLabel, url: market?.gradedUrls?.bgsBlackLabel, active: bgsBlackLabel, isBlackLabel: true },
            ]}
          />
        </div>

        {/* AI analysis */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 18 }}>
          <div style={{ ...sectionLabel, marginBottom: 10 }}>AI Market Analysis</div>
          <p style={{ color: "rgba(255,255,255,0.45)", margin: 0, fontSize: 14, lineHeight: 1.75, letterSpacing: "-0.1px" }}>
            {market?.aiAnalysis}
          </p>
          <p style={{ color: "rgba(255,255,255,0.15)", margin: "12px 0 0", fontSize: 11, lineHeight: 1.6 }}>
            Prices based on recent eBay sold listings. Tap ↗ on any row to view the sale on eBay.
          </p>
        </div>
      </div>
    </div>
  );
}

function PopPanel({ title, subtitle, total, gemRate, gemLabel, distribution, highlightGrade, isBlackLabel, maxCount, isPsa, isReal, isNumbered, popUrl }) {
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ color: "#fff", fontSize: 15, fontWeight: 600, letterSpacing: "-0.3px" }}>{title}</div>
            {popUrl && (
              <a href={popUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: "rgba(201,168,76,0.55)", textDecoration: "none", letterSpacing: "0.02em" }}>
                pop ↗
              </a>
            )}
          </div>
          <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, marginTop: 1 }}>{subtitle}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "#c9a84c", fontSize: 17, fontWeight: 700, letterSpacing: "-0.5px" }}>{gemRate}%</div>
          <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, marginTop: 1 }}>{gemLabel}</div>
        </div>
      </div>

      <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 11, marginBottom: isNumbered ? 4 : 14 }}>
        {total?.toLocaleString()} graded · <span style={{ color: isReal ? "#30d158" : "rgba(255,255,255,0.15)" }}>{isReal ? "live PSA data" : "AI-estimated"}</span>
      </div>
      {isNumbered && (
        <div style={{ color: "rgba(255,165,0,0.6)", fontSize: 10, marginBottom: 14, lineHeight: 1.4 }}>
          Numbered card — actual pop may be lower than estimated
        </div>
      )}

      {distribution?.map((d) => {
        const isBLRow = d.grade === "BL";
        let hi;
        if (isPsa) {
          hi = d.grade === highlightGrade;
        } else if (isBLRow) {
          hi = isBlackLabel === true;
        } else {
          hi = !isBlackLabel && typeof d.grade === "number" && Math.abs(d.grade - highlightGrade) < 0.3;
        }

        const pct = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
        const rowColor = isBLRow ? (hi ? "#fff" : "rgba(255,255,255,0.25)") : (hi ? "#c9a84c" : "rgba(255,255,255,0.28)");
        const barColor = isBLRow ? (hi ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.08)") : (hi ? "#c9a84c" : "rgba(255,255,255,0.07)");

        return (
          <div key={d.grade} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
              <span style={{ fontSize: 11, color: rowColor, fontWeight: hi ? 600 : 400, letterSpacing: "-0.1px" }}>
                {isBLRow ? "Black Label" : d.grade} — {d.label}
                {hi && <span style={{ marginLeft: 6, color: "rgba(255,255,255,0.2)", fontSize: 9 }}>← you</span>}
              </span>
              <span style={{ fontSize: 11, color: hi ? rowColor : "rgba(255,255,255,0.2)", fontWeight: hi ? 600 : 400 }}>
                {d.count?.toLocaleString()}
              </span>
            </div>
            <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 3, height: 2.5, overflow: "hidden" }}>
              <div className="pop-bar" style={{ background: barColor, width: `${pct}%`, height: "100%", borderRadius: 3 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ValueTable({ heading, rows }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, overflow: "hidden", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)" }}>
      <div style={{
        padding: "9px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        color: "rgba(255,255,255,0.25)",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
      }}>
        {heading}
      </div>
      {rows.map((row) => {
        const labelColor = row.isBlackLabel
          ? (row.active ? "#fff" : "rgba(255,255,255,0.3)")
          : row.isPristine
          ? (row.active ? "#c9a84c" : "rgba(255,255,255,0.28)")
          : row.active ? "#c9a84c" : "rgba(255,255,255,0.32)";
        const valueColor = row.isBlackLabel
          ? (row.active ? "#fff" : "rgba(255,255,255,0.2)")
          : row.active ? "#c9a84c" : "rgba(255,255,255,0.55)";
        const bg = row.isBlackLabel
          ? (row.active ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.01)")
          : row.active ? "rgba(201,168,76,0.07)" : "transparent";

        return (
          <div key={row.grade} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)", background: bg }}>
            <span style={{ fontSize: 12, color: labelColor, fontWeight: row.active ? 600 : 400, letterSpacing: "-0.1px" }}>
              {row.grade}
              {row.active && <span style={{ fontSize: 9, marginLeft: 4, color: "rgba(255,255,255,0.18)" }}>←</span>}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <AnimPrice value={row.value} style={{ fontSize: 12, color: valueColor, fontWeight: row.active ? 700 : 400 }} />
              {row.url && row.value != null && (
                <a href={row.url} target="_blank" rel="noopener noreferrer" style={ebayLinkStyle}>↗</a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const card = {
  background: "#1c1c1e",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 20,
  padding: "18px 20px",
  boxShadow: "0 2px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.09)",
};

const sectionLabel = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.28)",
};

const ebayLinkStyle = {
  fontSize: 10,
  color: "rgba(201,168,76,0.55)",
  textDecoration: "none",
  letterSpacing: "0.02em",
  lineHeight: 1,
};
