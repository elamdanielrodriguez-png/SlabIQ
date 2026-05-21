import { useState, useEffect } from "react";

export default function SubmitTab({ result }) {
  const { submission, market, bgs, sgc, cgc } = result;
  const bgsIsBlackLabel = bgs?.isBlackLabel === true;
  const sgcIsBlackLabel = false;
  const cgcIsBlackLabel = false;

  const allRois = [
    submission?.psaRecommended  ? Number(submission?.psaRoi)  || 0 : -Infinity,
    submission?.bgsRecommended  ? Number(submission?.bgsRoi)  || 0 : -Infinity,
    submission?.sgcRecommended  ? Number(submission?.sgcRoi)  || 0 : -Infinity,
    submission?.cgcRecommended  ? Number(submission?.cgcRoi)  || 0 : -Infinity,
  ];
  const bestRoi = Math.max(...allRois);
  const psaRoi = Number(submission?.psaRoi) || 0;
  const bgsRoi = Number(submission?.bgsRoi) || 0;
  const sgcRoi = Number(submission?.sgcRoi) || 0;
  const cgcRoi = Number(submission?.cgcRoi) || 0;
  const psaBestPick  = submission?.psaRecommended  && psaRoi  === bestRoi && bestRoi > -Infinity;
  const bgsBestPick  = submission?.bgsRecommended  && bgsRoi  === bestRoi && bestRoi > -Infinity && !psaBestPick;
  const sgcBestPick  = submission?.sgcRecommended  && sgcRoi  === bestRoi && bestRoi > -Infinity && !psaBestPick && !bgsBestPick;
  const cgcBestPick  = submission?.cgcRecommended  && cgcRoi  === bestRoi && bestRoi > -Infinity && !psaBestPick && !bgsBestPick && !sgcBestPick;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Company cards */}
      <div className="result-card-0" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <CompanyCard
          company="PSA"
          recommended={submission?.psaRecommended}
          bestPick={psaBestPick}
          tier={submission?.psaTier}
          cost={submission?.psaCost}
          expectedGrade={submission?.psaExpectedGrade}
          expectedValue={submission?.psaExpectedValue}
          roi={submission?.psaRoi}
          rawValue={market?.raw}
        />
        <CompanyCard
          company="BGS"
          recommended={submission?.bgsRecommended}
          bestPick={bgsBestPick}
          tier={submission?.bgsTier}
          cost={submission?.bgsCost}
          expectedGrade={submission?.bgsExpectedGrade}
          expectedGradeLabel={
            bgsIsBlackLabel ? "Black Label" :
            submission?.bgsExpectedGrade === 10 ? "Pristine" :
            submission?.bgsExpectedGrade === 9.5 ? "Gem Mint" : null
          }
          expectedValue={submission?.bgsExpectedValue}
          roi={submission?.bgsRoi}
          rawValue={market?.raw}
        />
        <CompanyCard
          company="SGC"
          recommended={submission?.sgcRecommended}
          bestPick={sgcBestPick}
          tier={submission?.sgcTier}
          cost={submission?.sgcCost}
          expectedGrade={submission?.sgcExpectedGrade}
          expectedGradeLabel={
            submission?.sgcExpectedGrade === 10 ? "Pristine" :
            submission?.sgcExpectedGrade === 9.5 ? "Mint+" : null
          }
          expectedValue={submission?.sgcExpectedValue}
          roi={submission?.sgcRoi}
          rawValue={market?.raw}
        />
        <CompanyCard
          company="CGC"
          recommended={submission?.cgcRecommended}
          bestPick={cgcBestPick}
          tier={submission?.cgcTier}
          cost={submission?.cgcCost}
          expectedGrade={submission?.cgcExpectedGrade}
          expectedGradeLabel={
            submission?.cgcExpectedGrade === 10 ? "Pristine" :
            submission?.cgcExpectedGrade === 9.5 ? "Gem Mint" : null
          }
          expectedValue={submission?.cgcExpectedValue}
          roi={submission?.cgcRoi}
          rawValue={market?.raw}
        />
      </div>

      {/* Analysis */}
      <div className="result-card-1" style={card}>
        <div style={{ ...sectionLabel, marginBottom: 12 }}>Submission Analysis</div>
        <p style={{ color: "rgba(255,255,255,0.5)", margin: 0, fontSize: 14, lineHeight: 1.75, letterSpacing: "-0.1px" }}>
          {submission?.analysis}
        </p>
      </div>

      {/* Tier guide */}
      <div className="result-card-2" style={card}>
        <div style={{ ...sectionLabel, marginBottom: 16 }}>Submission Tier Reference</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <TierGuide
            company="PSA"
            activeTier={submission?.psaTier}
            tiers={[
              { name: "Value", cost: "$22", note: "Under $500" },
              { name: "Regular", cost: "$75", note: "Under $1,500" },
              { name: "Express", cost: "$150", note: "Under $2,500" },
              { name: "Super Express", cost: "$250", note: "Under $5,000" },
              { name: "Walk-Through", cost: "$600", note: "Under $10,000" },
              { name: "Premium", cost: "$1k / 25k insured", note: "$10k+" },
            ]}
          />
          <TierGuide
            company="BGS"
            activeTier={submission?.bgsTier}
            tiers={[
              { name: "Standard", cost: "$25", note: "Under $499" },
              { name: "Express", cost: "$40", note: "Under $999" },
              { name: "Fast Track", cost: "$100", note: "Under $1,999" },
              { name: "Walk-Through", cost: "$300", note: "High value" },
            ]}
          />
          <TierGuide
            company="SGC"
            activeTier={submission?.sgcTier}
            tiers={[
              { name: "Standard", cost: "$25", note: "Under $500" },
              { name: "Express", cost: "$50", note: "Under $1,500" },
              { name: "Super Express", cost: "$100", note: "Under $3,000" },
              { name: "Walk-Through", cost: "$250", note: "$3k+" },
            ]}
          />
          <TierGuide
            company="CGC"
            activeTier={submission?.cgcTier}
            tiers={[
              { name: "Economy", cost: "$20", note: "Under $500" },
              { name: "Standard", cost: "$30", note: "Under $1,000" },
              { name: "Express", cost: "$65", note: "Under $2,500" },
              { name: "Priority", cost: "$150", note: "Under $10,000" },
              { name: "Walk-Through", cost: "$300", note: "$10k+" },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

function CompanyCard({ company, recommended, bestPick, tier, cost, expectedGrade, expectedGradeLabel, expectedValue, roi, rawValue }) {
  const roiPositive = (roi ?? 0) > 0;
  const profit = (expectedValue ?? 0) - (rawValue ?? 0) - (cost ?? 0);
  const accentColor = recommended ? "#30d158" : "#ff453a";
  const roiVal = Number(roi) || 0;

  const [profitDisplay, setProfitDisplay] = useState(0);
  const [roiDisplay, setRoiDisplay]       = useState(0);

  useEffect(() => {
    setProfitDisplay(0);
    const STEPS = 20, INTERVAL = 860 / STEPS;
    let step = 0;
    const id = setInterval(() => {
      step++;
      const eased = 1 - Math.pow(1 - step / STEPS, 2.5);
      if (step >= STEPS) { clearInterval(id); setProfitDisplay(profit); }
      else setProfitDisplay(Math.round(eased * profit));
    }, INTERVAL);
    return () => clearInterval(id);
  }, [profit]);

  useEffect(() => {
    setRoiDisplay(0);
    const STEPS = 22, INTERVAL = 950 / STEPS;
    let step = 0;
    const id = setInterval(() => {
      step++;
      const eased = 1 - Math.pow(1 - step / STEPS, 2.5);
      if (step >= STEPS) { clearInterval(id); setRoiDisplay(roiVal); }
      else setRoiDisplay(Math.round(eased * roiVal));
    }, INTERVAL);
    return () => clearInterval(id);
  }, [roiVal]);

  return (
    <div style={{
      background: "#1c1c1e",
      border: `1px solid ${bestPick ? "rgba(201,168,76,0.35)" : recommended ? "rgba(48,209,88,0.22)" : "rgba(255,255,255,0.08)"}`,
      borderRadius: 20,
      padding: "20px 20px",
      boxShadow: bestPick ? "0 2px 28px rgba(201,168,76,0.12)" : recommended ? "0 2px 20px rgba(48,209,88,0.06)" : "0 2px 20px rgba(0,0,0,0.4)",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Best Pick banner */}
      {bestPick && (
        <div style={{
          position: "absolute", top: 14, right: -28,
          background: "linear-gradient(90deg, #a07830, #c9a84c, #e8c870)",
          color: "#000", fontSize: 10, fontWeight: 800,
          letterSpacing: "0.12em", textTransform: "uppercase",
          padding: "5px 40px",
          transform: "rotate(35deg)",
          transformOrigin: "center",
          boxShadow: "0 2px 8px rgba(201,168,76,0.4)",
        }}>
          Best Pick
        </div>
      )}

      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ color: bestPick ? "#c9a84c" : "#c9a84c", fontSize: 22, fontWeight: 700, letterSpacing: "-0.5px" }}>
          {company}
        </div>
        <div style={{
          background: recommended ? "rgba(48,209,88,0.1)" : "rgba(255,69,58,0.08)",
          border: `1px solid ${accentColor}35`,
          color: accentColor,
          padding: "5px 14px",
          borderRadius: 100,
          fontSize: 12,
          fontWeight: 600,
        }}>
          {recommended ? "✓ Submit" : "✗ Skip"}
        </div>
      </div>

      {/* Metrics — 2 columns on full width */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px", marginBottom: 18 }}>
        <MetricRow label="Tier" value={tier} bold />
        <MetricRow label="Fee" value={`$${cost}`} />
        <MetricRow
          label="Expected Grade"
          value={expectedGradeLabel ? `${expectedGrade} ${expectedGradeLabel}` : expectedGrade}
          blackLabel={expectedGradeLabel === "Black Label"}
        />
        <MetricRow label="Expected Value" value={`$${expectedValue?.toLocaleString() ?? "—"}`} highlight />
      </div>

      {/* ROI bar */}
      <div style={{
        paddingTop: 16,
        borderTop: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div>
          <div style={{ color: "rgba(255,255,255,0.22)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>Profit</div>
          <div style={{ color: profit > 0 ? "#30d158" : "#ff453a", fontSize: 18, fontWeight: 700, letterSpacing: "-0.5px" }}>
            {profitDisplay > 0 ? `+$${profitDisplay.toLocaleString()}` : profitDisplay < 0 ? `-$${Math.abs(profitDisplay).toLocaleString()}` : "$0"}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "rgba(255,255,255,0.22)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>ROI</div>
          <div style={{ color: roiPositive ? "#30d158" : "#ff453a", fontSize: 34, fontWeight: 700, letterSpacing: "-1.5px", lineHeight: 1 }}>
            {roiDisplay > 0 ? "+" : ""}{roiDisplay}%
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricRow({ label, value, bold, highlight, blackLabel }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ color: "rgba(255,255,255,0.28)", fontSize: 13, letterSpacing: "-0.1px" }}>{label}</span>
      <span style={{
        color: blackLabel ? "#fff" : highlight ? "#c9a84c" : "rgba(255,255,255,0.7)",
        fontWeight: bold || blackLabel ? 600 : 400,
        fontSize: 13,
        letterSpacing: "-0.1px",
      }}>
        {value ?? "—"}
      </span>
    </div>
  );
}

function TierGuide({ company, tiers, activeTier }) {
  return (
    <div>
      <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
        {company}
      </div>
      {tiers.map((t) => {
        const active = activeTier && t.name.toLowerCase() === activeTier.toLowerCase();
        return (
          <div key={t.name} style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "7px 10px",
            margin: "3px 0",
            borderRadius: 8,
            border: active ? "1px solid rgba(201,168,76,0.5)" : "1px solid transparent",
            background: active ? "rgba(201,168,76,0.08)" : "transparent",
          }}>
            <div>
              <div style={{ color: active ? "#c9a84c" : "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: active ? 700 : 500, letterSpacing: "-0.1px" }}>
                {t.name} {active && <span style={{ fontSize: 10, opacity: 0.7 }}>← your card</span>}
              </div>
              <div style={{ color: "rgba(255,255,255,0.22)", fontSize: 11, marginTop: 1 }}>{t.note}</div>
            </div>
            <div style={{ color: active ? "#c9a84c" : "rgba(201,168,76,0.6)", fontWeight: active ? 700 : 600, fontSize: 13 }}>{t.cost}</div>
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
