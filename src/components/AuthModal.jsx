import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function AuthModal({ onClose, onAuth }) {
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [checkEmail, setCheckEmail] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        if (data.session) {
          onAuth(data.session);
          onClose();
        } else {
          setCheckEmail(true);
        }
      } else {
        const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        onAuth(data.session);
        onClose();
      }
    } catch (err) {
      setError(err.message || "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  if (checkEmail) {
    return (
      <div style={overlay} onClick={onClose}>
        <div style={sheet} onClick={e => e.stopPropagation()}>
          <div style={{ textAlign: "center", padding: "8px 0 24px" }}>
            <div style={{ fontSize: 36, marginBottom: 16 }}>📬</div>
            <div style={{ color: "#fff", fontSize: 18, fontWeight: 700, letterSpacing: "-0.4px", marginBottom: 10 }}>
              Check your email
            </div>
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, lineHeight: 1.6 }}>
              We sent a confirmation link to <strong style={{ color: "rgba(255,255,255,0.7)" }}>{email}</strong>.
              Click it to activate your account.
            </div>
            <button onClick={onClose} style={{ ...btn, marginTop: 28, background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.6)" }}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={sheet} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <div>
            <div style={{ color: "#fff", fontSize: 20, fontWeight: 700, letterSpacing: "-0.5px" }}>
              {mode === "signin" ? "Sign In" : "Create Account"}
            </div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, marginTop: 3 }}>
              {mode === "signin" ? "Welcome back to SlabIQ" : "Start grading smarter"}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 24, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={input}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={6}
            style={input}
          />

          {error && (
            <div style={{ color: "#ff453a", fontSize: 13, padding: "8px 12px", background: "rgba(255,69,58,0.08)", borderRadius: 8 }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{ ...btn, marginTop: 4 }}>
            {loading ? "…" : mode === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
            {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
          </span>
          <button
            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}
            style={{ background: "none", border: "none", color: "#c9a84c", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0, fontFamily: "inherit" }}
          >
            {mode === "signin" ? "Sign Up" : "Sign In"}
          </button>
        </div>
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
  padding: "0 0 env(safe-area-inset-bottom, 0)",
};

const sheet = {
  background: "#1c1c1e",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "24px 24px 0 0",
  padding: "28px 24px 36px",
  width: "100%",
  maxWidth: 480,
  boxShadow: "0 -8px 40px rgba(0,0,0,0.6)",
};

const input = {
  width: "100%",
  boxSizing: "border-box",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12,
  padding: "13px 14px",
  color: "#fff",
  fontSize: 15,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
  outline: "none",
};

const btn = {
  width: "100%",
  padding: "14px 0",
  background: "#c9a84c",
  color: "#000",
  fontWeight: 700,
  fontSize: 15,
  border: "none",
  borderRadius: 12,
  cursor: "pointer",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
  letterSpacing: "-0.2px",
};
