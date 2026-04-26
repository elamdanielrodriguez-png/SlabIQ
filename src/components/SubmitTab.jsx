export default function SubmitTab({ result }) {
  const { submission, market, bgs } = result;
  const bgsIsBlackLabel = bgs?.isBlackLabel === true;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Company cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <CompanyCard
          company="PSA"
          recommended={submission?.psaRecommended}
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
      </div>

      {/* Analysis */}
      <div style={card}>
        <div style={{ ...sectionLabel, marginBottom: 12 }}>Submission Analysis</div>
        <p style={{ color: "rgba(255,255,255,0.5)", margin: 0, fontSize: 14, lineHeight: 1.75, letterSpacing: "-0.1px" }}>
          {submission?.analysis}
        </p>
      </div>

      {/* Tier guide */}
      <div style={card}>
        <div style={{ ...sectionLabel, marginBottom: 16 }}>Submission Tier Reference</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <TierGuide
            company="PSA"
            tiers={[
              { name: "Value", cost: "$28", note: "Under $500" },
              { name: "Regular", cost: "$75", note: "Under $1,500" },
              { name: "Express", cost: "$160", note: "Under $2,999" },
              { name: "Super Express", cost: "$300", note: "Under $4,999" },
              { name: "Walk-Through", cost: "$600", note: "Under $9,999" },
            ]}
          />
          <TierGuide
            company="BGS"
            tiers={[
              { name: "Standard", cost: "$25", note: "Under $499" },
              { name: "Express", cost: "$40", note: "Under $999" },
              { name: "Fast Track", cost: "$100", note: "Under $1,999" },
              { name: "Walk-Through", cost: "$300", note: "High value" },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

function CompanyCard({ company, recommended, tier, cost, expectedGrade, expectedGradeLabel, expectedValue, roi, rawValue }) {
  const roiPositive = (roi ?? 0) > 0;
  const profit = (expectedValue ?? 0) - (rawValue ?? 0) - (cost ?? 0);
  const accentColor = recommended ? "#30d158" : "#ff453a";

  return (
    <div style={{
      background: "#1c1c1e",
      border: `1px solid ${recommended ? "rgba(48,209,88,0.2)" : "rgba(255,255,255,0.07)"}`,
      borderRadius: 16,
      padding: "18px 16px",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
        <div style={{ color: "#c9a84c", fontSize: 20, fontWeight: 700, letterSpacing: "-0.5px" }}>
          {company}
        </div>
        <div style={{
          background: recommended ? "rgba(48,209,88,0.1)" : "rgba(255,69,58,0.08)",
          border: `1px solid ${accentColor}35`,
          color: accentColor,
          padding: "4px 11px",
          borderRadius: 100,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "-0.1px",
          whiteSpace: "nowrap",
        }}>
          {recommended ? "✓ Submit" : "✗ Skip"}
        </div>
      </div>

      {/* Metrics */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        <MetricRow label="Tier" value={tier} bold />
        <MetricRow label="Fee" value={`$${cost}`} />
        <MetricRow
          label="Exp. Grade"
          value={expectedGradeLabel ? `${expectedGrade} ${expectedGradeLabel}` : expectedGrade}
          blackLabel={expectedGradeLabel === "Black Label"}
        />
        <MetricRow label="Exp. Value" value={`$${expectedValue?.toLocaleString()}`} highlight />
      </div>

      {/* ROI */}
      <div style={{
        marginTop: 16,
        paddingTop: 14,
        borderTop: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
      }}>
        <div>
          <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
            Profit
          </div>
          <div style={{ color: profit > 0 ? "#30d158" : "#ff453a", fontSize: 15, fontWeight: 600, letterSpacing: "-0.3px" }}>
            {profit > 0 ? "+" : ""}${profit.toLocaleString()}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
            ROI
          </div>
          <div style={{ color: roiPositive ? "#30d158" : "#ff453a", fontSize: 26, fontWeight: 700, letterSpacing: "-1px", lineHeight: 1 }}>
            {roiPositive ? "+" : ""}{Number(roi).toFixed(0)}%
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

function TierGuide({ company, tiers }) {
  return (
    <div>
      <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
        {company}
      </div>
      {tiers.map((t) => (
        <div key={t.name} style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 0",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}>
          <div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 500, letterSpacing: "-0.1px" }}>{t.name}</div>
            <div style={{ color: "rgba(255,255,255,0.22)", fontSize: 11, marginTop: 1 }}>{t.note}</div>
          </div>
          <div style={{ color: "#c9a84c", fontWeight: 600, fontSize: 13 }}>{t.cost}</div>
        </div>
      ))}
    </div>
  );
}

const card = {
  background: "#1c1c1e",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 16,
  padding: "18px 20px",
};

const sectionLabel = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.28)",
};
