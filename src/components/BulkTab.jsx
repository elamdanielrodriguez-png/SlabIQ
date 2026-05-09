import { useState, useRef } from "react";

function gradeColor(g) {
  if (g == null) return "rgba(255,255,255,0.3)";
  if (g >= 10) return "#ffd60a";
  if (g >= 9)  return "#30d158";
  if (g >= 8)  return "#4fc3f7";
  if (g >= 7)  return "#ff9f0a";
  return "#ff453a";
}

function fileToBase64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1800;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) { const r = Math.min(MAX/w, MAX/h); w = Math.round(w*r); h = Math.round(h*r); }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.88).split(",")[1]);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

const CARD = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 16,
  padding: "14px",
};

function Chip({ color, children, onClick }) {
  return (
    <span onClick={onClick} style={{
      display: "inline-block",
      background: `${color}18`, border: `1px solid ${color}40`,
      borderRadius: 6, padding: "2px 8px",
      color, fontSize: 11, fontWeight: 600,
      cursor: onClick ? "pointer" : "default",
    }}>{children}</span>
  );
}

function BulkItem({ item, onConfirm, onRemove }) {
  const cardName = item.confirmedCard
    ? `${item.confirmedCard.player}`
    : item.candidates?.[0]?.player ?? "Identifying…";

  const cardSub = item.confirmedCard
    ? `${item.confirmedCard.year} ${item.confirmedCard.set} · ${item.confirmedCard.variant ?? "Base"}`
    : item.candidates?.[0]
      ? `${item.candidates[0].year} ${item.candidates[0].set}`
      : "";

  const statusChip = () => {
    switch (item.status) {
      case 'loading':
      case 'identifying': return <Chip color="rgba(255,255,255,0.25)">Identifying…</Chip>;
      case 'pending_confirm': return <Chip color="#ff9f0a">Confirm card ↓</Chip>;
      case 'confirmed': return <Chip color="rgba(255,255,255,0.25)">Ready to grade</Chip>;
      case 'grading':   return <Chip color="#c9a84c">Grading…</Chip>;
      case 'done':      return (
        <div style={{ display: "flex", gap: 6 }}>
          <Chip color={gradeColor(item.result?.psa?.grade)}>PSA {item.result?.psa?.grade ?? "—"}</Chip>
          <Chip color={gradeColor(item.result?.bgs?.overall)}>BGS {item.result?.bgs?.overall ?? "—"}</Chip>
        </div>
      );
      case 'error': return <Chip color="#ff453a">{item.error}</Chip>;
      default: return null;
    }
  };

  return (
    <div style={CARD}>
      {/* Row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {item.thumb && (
          <img src={item.thumb} alt="" style={{
            width: 44, height: 60, objectFit: "cover", borderRadius: 6,
            flexShrink: 0, opacity: item.status === 'error' ? 0.3 : 1,
          }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {cardName}
          </div>
          {cardSub && (
            <div style={{ color: "rgba(255,255,255,0.28)", fontSize: 11, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cardSub}</div>
          )}
          <div style={{ marginTop: 7 }}>{statusChip()}</div>
        </div>
        {!['grading', 'identifying', 'loading'].includes(item.status) && (
          <button onClick={() => onRemove(item.id)} style={{
            background: "none", border: "none", color: "rgba(255,255,255,0.2)",
            fontSize: 20, cursor: "pointer", padding: "0 2px", lineHeight: 1, flexShrink: 0,
          }}>×</button>
        )}
      </div>

      {/* Candidate picker */}
      {item.status === 'pending_confirm' && item.candidates.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", gap: 6 }}>
          {item.candidates.map((c, i) => (
            <button key={i} onClick={() => onConfirm(item.id, c)} style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10, padding: "8px 12px", textAlign: "left",
              cursor: "pointer", fontFamily: "inherit",
            }}>
              <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{c.player}</div>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 2 }}>{c.year} {c.set} · {c.variant}</div>
            </button>
          ))}
        </div>
      )}

      {/* Result snippet */}
      {item.status === 'done' && item.result && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {item.result.verdict && (
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, lineHeight: 1.55, marginBottom: 10 }}>
              {item.result.verdict.length > 130 ? item.result.verdict.slice(0, 130) + "…" : item.result.verdict}
            </div>
          )}
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            {item.result.market?.raw != null && (
              <div>
                <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Raw</div>
                <div style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>${item.result.market.raw}</div>
              </div>
            )}
            {item.result.market?.graded?.psa10 && (
              <div>
                <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>PSA 10</div>
                <div style={{ color: "#c9a84c", fontSize: 13, fontWeight: 700 }}>${item.result.market.graded.psa10}</div>
              </div>
            )}
            {item.result.submission && (
              <div style={{ marginLeft: "auto" }}>
                <div style={{
                  background: item.result.submission.psaRecommended ? "rgba(48,209,88,0.1)" : "rgba(255,69,58,0.1)",
                  border: `1px solid ${item.result.submission.psaRecommended ? "rgba(48,209,88,0.3)" : "rgba(255,69,58,0.3)"}`,
                  borderRadius: 8, padding: "5px 10px",
                  color: item.result.submission.psaRecommended ? "#30d158" : "#ff453a",
                  fontSize: 11, fontWeight: 700,
                }}>
                  {item.result.submission.psaRecommended ? "Submit ✓" : "Don't Submit"}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function BulkTab({ session, userPlan, onUpgrade, isLoggedIn, onOpenCamera }) {
  const [items, setItems] = useState([]);
  const [grading, setGrading] = useState(false);
  const fileInputRef = useRef();

  const authHeaders = () => session ? { Authorization: `Bearer ${session.access_token}` } : {};

  const openCamera = () => onOpenCamera?.((file) => addImages([file]));

  const tokensLeft = userPlan
    ? Math.max(0, userPlan.grade_limit - userPlan.grades_used)
    : 0;

  const addImages = async (files) => {
    const fileArr = Array.from(files).slice(0, 20);
    const newItems = fileArr.map(f => ({
      id: Math.random().toString(36).slice(2),
      thumb: URL.createObjectURL(f),
      imageData: null,
      status: 'loading',
      candidates: [],
      confirmedCard: null,
      result: null,
      error: null,
    }));
    setItems(prev => [...prev, ...newItems]);

    await Promise.all(fileArr.map(async (file, idx) => {
      const id = newItems[idx].id;
      const imageData = await fileToBase64(file);
      setItems(prev => prev.map(i => i.id === id ? { ...i, imageData, status: 'identifying' } : i));
      try {
        const res = await fetch('/api/identify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ images: [imageData] }),
        });
        const data = await res.json();
        const candidates = data.candidates ?? [];
        if (data.confidence >= 98 && candidates.length === 1) {
          setItems(prev => prev.map(i => i.id === id
            ? { ...i, imageData, status: 'confirmed', candidates, confirmedCard: candidates[0] }
            : i));
        } else {
          setItems(prev => prev.map(i => i.id === id
            ? { ...i, imageData, status: 'pending_confirm', candidates }
            : i));
        }
      } catch {
        setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'error', error: 'Could not identify' } : i));
      }
    }));
  };

  const confirmItem = (id, card) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, confirmedCard: card, status: 'confirmed' } : i));
  };

  const removeItem = (id) => setItems(prev => prev.filter(i => i.id !== id));

  const gradeAll = async () => {
    const toGrade = items.filter(i => i.status === 'confirmed');
    if (!toGrade.length) return;
    setGrading(true);

    for (const item of toGrade) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'grading' } : i));
      try {
        const res = await fetch('/api/grade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ images: [item.imageData], confirmedCard: item.confirmedCard }),
        });
        if (res.status === 403) {
          setItems(prev => prev.map(i =>
            (i.status === 'confirmed' || i.id === item.id)
              ? { ...i, status: 'error', error: 'Out of tokens' }
              : i
          ));
          onUpgrade?.();
          break;
        }
        const data = await res.json();
        let result = null;
        try { result = JSON.parse(data.content?.[0]?.text ?? '{}'); } catch {}
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'done', result } : i));
      } catch {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error', error: 'Grade failed' } : i));
      }
    }
    setGrading(false);
  };

  const confirmedCount = items.filter(i => i.status === 'confirmed').length;
  const pendingCount   = items.filter(i => i.status === 'pending_confirm').length;
  const gradingCount   = items.filter(i => i.status === 'grading').length;
  const doneCount      = items.filter(i => i.status === 'done').length;

  if (!isLoggedIn) {
    return (
      <div style={{ ...CARD, textAlign: "center", padding: "48px 24px" }}>
        <div style={{ color: "#fff", fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Sign in to use Bulk Grading</div>
        <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13 }}>Grade up to 20 cards at once — each uses 1 token</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Upload area */}
      {items.length === 0 ? (
        <div style={{
          ...CARD,
          padding: "32px 24px", textAlign: "center",
          borderStyle: "dashed", borderColor: "rgba(201,168,76,0.3)",
        }}>
          <div style={{ color: "#fff", fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Add Card Photos</div>
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, marginBottom: 6 }}>One photo per card — up to 20 at once</div>
          <div style={{ color: "rgba(201,168,76,0.55)", fontSize: 12, marginBottom: 20 }}>{tokensLeft} token{tokensLeft !== 1 ? "s" : ""} available · 1 per grade</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => fileInputRef.current?.click()} style={{
              flex: 1, padding: "12px 0",
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12, cursor: "pointer", fontFamily: "inherit",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
            }}>
              <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
                <rect x="2" y="6" width="28" height="20" rx="3" stroke="rgba(255,255,255,0.4)" strokeWidth="1.6" fill="none"/>
                <line x1="16" y1="12" x2="16" y2="22" stroke="rgba(255,255,255,0.4)" strokeWidth="1.6" strokeLinecap="round"/>
                <line x1="11" y1="17" x2="21" y2="17" stroke="rgba(255,255,255,0.4)" strokeWidth="1.6" strokeLinecap="round"/>
                <path d="M10 6 L12 2 L20 2 L22 6" stroke="rgba(255,255,255,0.4)" strokeWidth="1.6" fill="none" strokeLinejoin="round"/>
              </svg>
              <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: 600 }}>Upload</span>
            </button>
            {onOpenCamera && (
              <button onClick={openCamera} style={{
                flex: 1, padding: "12px 0",
                background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.25)",
                borderRadius: 12, cursor: "pointer", fontFamily: "inherit",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke="rgba(201,168,76,0.7)" strokeWidth="1.6" fill="none" strokeLinejoin="round"/>
                  <circle cx="12" cy="13" r="4" stroke="rgba(201,168,76,0.7)" strokeWidth="1.6" fill="none"/>
                </svg>
                <span style={{ color: "rgba(201,168,76,0.8)", fontSize: 12, fontWeight: 600 }}>Camera</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
            {items.length} card{items.length !== 1 ? "s" : ""}
            {doneCount > 0 && <span style={{ color: "#30d158" }}> · {doneCount} graded</span>}
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            {onOpenCamera && (
              <button onClick={openCamera} style={{
                background: "none", border: "1px solid rgba(201,168,76,0.2)",
                borderRadius: 8, padding: "5px 10px",
                color: "rgba(201,168,76,0.65)", fontSize: 12,
                cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", gap: 5,
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinejoin="round"/>
                  <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="1.8" fill="none"/>
                </svg>
                Camera
              </button>
            )}
            <button onClick={() => fileInputRef.current?.click()} style={{
              background: "none", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8, padding: "5px 12px",
              color: "rgba(255,255,255,0.45)", fontSize: 12,
              cursor: "pointer", fontFamily: "inherit",
            }}>+ Add More</button>
          </div>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }}
        onChange={e => { if (e.target.files?.length) addImages(e.target.files); e.target.value = ''; }} />

      {/* Item list */}
      {items.map(item => (
        <BulkItem key={item.id} item={item} onConfirm={confirmItem} onRemove={removeItem} />
      ))}

      {/* Pending notice */}
      {pendingCount > 0 && !grading && (
        <div style={{ color: "#ff9f0a", fontSize: 12, textAlign: "center", opacity: 0.8 }}>
          {pendingCount} card{pendingCount !== 1 ? "s" : ""} need{pendingCount === 1 ? "s" : ""} confirmation above
        </div>
      )}

      {/* Grade all */}
      {confirmedCount > 0 && !grading && (
        <button onClick={gradeAll} style={{
          width: "100%", padding: "14px 0",
          background: "#c9a84c", color: "#000",
          border: "none", borderRadius: 14,
          fontSize: 15, fontWeight: 700,
          cursor: "pointer", fontFamily: "inherit",
          boxShadow: "0 4px 24px rgba(201,168,76,0.35)",
        }}>
          Grade {confirmedCount} Card{confirmedCount !== 1 ? "s" : ""} — {confirmedCount} Token{confirmedCount !== 1 ? "s" : ""}
        </button>
      )}

      {/* Grading progress */}
      {grading && (
        <div style={{ textAlign: "center", padding: "8px 0" }}>
          <div style={{ color: "#c9a84c", fontSize: 13, fontWeight: 600 }}>
            Grading {doneCount + 1} of {doneCount + confirmedCount + gradingCount}…
          </div>
          <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, marginTop: 4 }}>This takes ~30 seconds per card</div>
        </div>
      )}

      {/* Clear all */}
      {items.length > 0 && !grading && (
        <button onClick={() => setItems([])} style={{
          background: "none", border: "none",
          color: "rgba(255,255,255,0.18)", fontSize: 12,
          cursor: "pointer", fontFamily: "inherit", padding: "2px 0",
        }}>Clear all</button>
      )}
    </div>
  );
}
