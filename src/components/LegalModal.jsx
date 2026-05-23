export default function LegalModal({ page, onClose }) {
  const isPrivacy = page === 'privacy';

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 800,
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        overflowY: "auto",
        padding: "24px 16px 80px",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 600, margin: "0 auto",
          background: "rgba(18,18,20,0.98)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 20,
          padding: "32px 24px",
          color: "rgba(255,255,255,0.7)",
          fontSize: 14, lineHeight: 1.7,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
          <div>
            <div style={{ color: "rgba(255,255,255,0.28)", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
              CardGradeOrNot
            </div>
            <div style={{ color: "#fff", fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px" }}>
              {isPrivacy ? "Privacy Policy" : "Terms of Service"}
            </div>
            <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 12, marginTop: 4 }}>
              Last updated: May 2026
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 24, cursor: "pointer", padding: "0 0 0 16px", lineHeight: 1, flexShrink: 0 }}
          >×</button>
        </div>

        {isPrivacy ? <PrivacyContent /> : <TermsContent />}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ color: "#fff", fontSize: 15, fontWeight: 700, marginBottom: 10, letterSpacing: "-0.2px" }}>{title}</div>
      <div>{children}</div>
    </div>
  );
}

function PrivacyContent() {
  return (
    <>
      <Section title="What We Collect">
        <p style={{ margin: "0 0 8px" }}>
          <strong style={{ color: "rgba(255,255,255,0.8)" }}>Card images</strong> — uploaded or captured photos are sent to the Anthropic API for grading analysis. We do not store your images on our servers after processing.
        </p>
        <p style={{ margin: "0 0 8px" }}>
          <strong style={{ color: "rgba(255,255,255,0.8)" }}>Account information</strong> — if you sign up, we store your email address and token balance via Supabase.
        </p>
        <p style={{ margin: 0 }}>
          <strong style={{ color: "rgba(255,255,255,0.8)" }}>Usage data</strong> — anonymized analytics (pages viewed, features used) via PostHog. No card photos are included in analytics.
        </p>
      </Section>

      <Section title="How We Use It">
        <p style={{ margin: "0 0 8px" }}>Your card images are sent to the Anthropic API solely to generate grading results. Anthropic's usage policies prohibit using API inputs to train their models.</p>
        <p style={{ margin: 0 }}>Your email is used only for account access and transactional messages (receipts, password reset). We do not send marketing emails without your consent.</p>
      </Section>

      <Section title="Third-Party Services">
        {[
          ["Anthropic", "Powers the AI grading. Images are processed per their privacy policy at anthropic.com/privacy."],
          ["Supabase", "Stores account data and authentication. Privacy policy at supabase.com/privacy."],
          ["Stripe", "Processes payments. CardGradeOrNot never sees or stores your card number. Stripe's policy at stripe.com/privacy."],
          ["PostHog", "Anonymized product analytics. No personal data or images. Policy at posthog.com/privacy."],
        ].map(([name, desc]) => (
          <div key={name} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
            <span style={{ color: "#c9a84c", flexShrink: 0, fontSize: 12, lineHeight: 1.8 }}>·</span>
            <span><strong style={{ color: "rgba(255,255,255,0.7)" }}>{name}</strong> — {desc}</span>
          </div>
        ))}
      </Section>

      <Section title="Data Retention">
        <p style={{ margin: "0 0 8px" }}>Card images are not retained after your grading result is returned.</p>
        <p style={{ margin: 0 }}>Grading history is stored locally in your browser (localStorage) and never uploaded to our servers. Account data is retained until you request deletion.</p>
      </Section>

      <Section title="Your Rights">
        <p style={{ margin: 0 }}>You may request deletion of your account and associated data at any time by emailing us. We will process requests within 30 days.</p>
      </Section>

      <Section title="Contact">
        <p style={{ margin: 0 }}>Questions about this policy: <span style={{ color: "#c9a84c" }}>support@cardgradeornot.com</span></p>
      </Section>
    </>
  );
}

function TermsContent() {
  return (
    <>
      <Section title="The Service">
        <p style={{ margin: "0 0 8px" }}>CardGradeOrNot provides AI-assisted sports card grading estimates. Results are generated by an AI model and are <strong style={{ color: "rgba(255,255,255,0.8)" }}>not official PSA or BGS grades</strong>. They are estimates to help you decide whether to submit for professional grading.</p>
        <p style={{ margin: 0 }}>By using this service, you agree that AI estimates may differ from professional grading results and that CardGradeOrNot bears no liability for grading decisions made based on our estimates.</p>
      </Section>

      <Section title="Tokens and Payments">
        <p style={{ margin: "0 0 8px" }}>New accounts receive 2 free grades. Additional grading requires purchasing token packs via Stripe.</p>
        <p style={{ margin: "0 0 8px" }}>Tokens are non-refundable except where required by law. Unused tokens remain in your account until deletion.</p>
        <p style={{ margin: 0 }}>Prices may change. Existing token balances are not affected by price changes.</p>
      </Section>

      <Section title="Acceptable Use">
        {[
          "You must own or have permission to grade the cards you submit.",
          "You may not attempt to reverse-engineer, scrape, or abuse the grading API.",
          "You may not use the service for fraudulent purposes, including misrepresenting card conditions.",
          "Accounts found abusing the free tier or chargebacking without cause will be terminated.",
        ].map(rule => (
          <div key={rule} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
            <span style={{ color: "#c9a84c", flexShrink: 0, fontSize: 12, lineHeight: 1.8 }}>·</span>
            <span>{rule}</span>
          </div>
        ))}
      </Section>

      <Section title="Disclaimer of Warranties">
        <p style={{ margin: 0 }}>The service is provided "as is." We make no guarantees about the accuracy of grading results, market values, or submission recommendations. All estimates are probabilistic and for informational purposes only.</p>
      </Section>

      <Section title="Limitation of Liability">
        <p style={{ margin: 0 }}>CardGradeOrNot shall not be liable for any losses arising from grading decisions, submission fees paid to third parties, or market transactions made based on our estimates. Our total liability is limited to the amount you paid us in the 30 days prior to the claim.</p>
      </Section>

      <Section title="Changes">
        <p style={{ margin: 0 }}>We may update these terms. Continued use after changes constitutes acceptance. Material changes will be communicated via email if you have an account.</p>
      </Section>

      <Section title="Contact">
        <p style={{ margin: 0 }}>Questions: <span style={{ color: "#c9a84c" }}>support@cardgradeornot.com</span></p>
      </Section>
    </>
  );
}
