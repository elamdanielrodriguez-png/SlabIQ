import { useRef, useState, useEffect } from "react";

// Camera capture with a fixed 5:7 rectangle overlay. User aligns the card inside
// the rectangle and taps capture. Captured frame is cropped to exactly the
// rectangle area — no detection, no AI, no post-processing. Card is the rectangle.
function CameraCapture({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const rectRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then(s => {
        if (!active) { s.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.onloadedmetadata = () => setReady(true);
        }
      })
      .catch(err => setError(err.message || "Camera unavailable. Check permissions."));
    return () => {
      active = false;
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  function capture() {
    const video = videoRef.current;
    const container = containerRef.current;
    const rectEl = rectRef.current;
    if (!video || !container || !rectEl) return;

    const vw = video.videoWidth, vh = video.videoHeight;
    const cw = container.clientWidth, ch = container.clientHeight;

    // Container uses object-fit: cover. Compute what part of the video is visible.
    const videoAspect = vw / vh;
    const containerAspect = cw / ch;
    let visW, visH, offX, offY;
    if (videoAspect > containerAspect) {
      // video wider — sides cropped
      visH = vh; visW = vh * containerAspect;
      offX = (vw - visW) / 2; offY = 0;
    } else {
      // video taller — top/bottom cropped
      visW = vw; visH = vw / containerAspect;
      offX = 0; offY = (vh - visH) / 2;
    }

    const cBox = container.getBoundingClientRect();
    const rBox = rectEl.getBoundingClientRect();
    const xFrac = (rBox.left - cBox.left) / cw;
    const yFrac = (rBox.top - cBox.top) / ch;
    const wFrac = rBox.width / cw;
    const hFrac = rBox.height / ch;

    const cropX = offX + xFrac * visW;
    const cropY = offY + yFrac * visH;
    const cropW = wFrac * visW;
    const cropH = hFrac * visH;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(cropW);
    canvas.height = Math.round(cropH);
    canvas.getContext("2d").drawImage(video, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], `card-${Date.now()}.jpg`, { type: "image/jpeg" });
      onCapture(file);
    }, "image/jpeg", 0.92);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 1000, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 20px", color: "#fff", textAlign: "center", fontSize: 13, fontWeight: 600, letterSpacing: "-0.2px" }}>
        Align card inside the rectangle
      </div>

      <div ref={containerRef} style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <video
          ref={videoRef}
          autoPlay playsInline muted
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />

        {/* Centered card-aspect rectangle, dim outside via huge box-shadow */}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <div ref={rectRef} style={{
            position: "relative",
            width: "min(78vw, calc(75vh * 5 / 7))",
            aspectRatio: "5 / 7",
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
            border: "2px solid rgba(201,168,76,0.45)",
            borderRadius: 8,
          }}>
            {[
              { top: -2,    left: -2,    borderTop: "3px solid #c9a84c",    borderLeft: "3px solid #c9a84c",    borderRadius: "8px 0 0 0" },
              { top: -2,    right: -2,   borderTop: "3px solid #c9a84c",    borderRight: "3px solid #c9a84c",   borderRadius: "0 8px 0 0" },
              { bottom: -2, left: -2,    borderBottom: "3px solid #c9a84c", borderLeft: "3px solid #c9a84c",    borderRadius: "0 0 0 8px" },
              { bottom: -2, right: -2,   borderBottom: "3px solid #c9a84c", borderRight: "3px solid #c9a84c",   borderRadius: "0 0 8px 0" },
            ].map((s, i) => (
              <div key={i} style={{
                position: "absolute", width: 36, height: 36,
                animation: `cornerBreathe 2.4s ease-in-out ${i * 0.15}s infinite`,
                ...s,
              }} />
            ))}
          </div>
        </div>

        {error && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#ff453a", padding: 24, textAlign: "center", background: "rgba(0,0,0,0.85)", fontSize: 13 }}>
            {error}
          </div>
        )}
      </div>

      <div style={{ padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#fff", fontSize: 14, padding: 12, cursor: "pointer", fontFamily: "inherit" }}>
          Cancel
        </button>
        <button
          onClick={capture}
          disabled={!ready}
          style={{
            width: 72, height: 72, borderRadius: "50%",
            background: ready ? "#c9a84c" : "rgba(201,168,76,0.3)",
            border: "4px solid rgba(255,255,255,0.5)",
            cursor: ready ? "pointer" : "not-allowed",
          }}
        />
        <div style={{ width: 60 }} />
      </div>
    </div>
  );
}

function CenteringEditor({ imageURL, initialLines, onConfirm, onClose }) {
  const DEFAULT = {
    leftOuter: 0.01, leftInner: 0.07,
    rightInner: 0.93, rightOuter: 0.99,
    topOuter: 0.01, topInner: 0.07,
    bottomInner: 0.93, bottomOuter: 0.99,
  };
  const [lines, setLines] = useState(initialLines ?? DEFAULT);
  const containerRef = useRef(null);

  const { leftOuter, leftInner, rightInner, rightOuter, topOuter, topInner, bottomInner, bottomOuter } = lines;
  const lBorder = leftInner - leftOuter;
  const rBorder = rightOuter - rightInner;
  const tBorder = topInner - topOuter;
  const bBorder = bottomOuter - bottomInner;
  const lrT = lBorder + rBorder, tbT = tBorder + bBorder;
  const leftPct  = lrT > 0.001 ? Math.round(lBorder / lrT * 100) : 50;
  const topPct   = tbT > 0.001 ? Math.round(tBorder / tbT * 100) : 50;
  const rightPct = 100 - leftPct, botPct = 100 - topPct;
  const worst     = Math.max(leftPct, rightPct, topPct, botPct);
  const psaLabel  = worst <= 55 ? 'PSA 10' : worst <= 60 ? 'PSA 9' : worst <= 65 ? 'PSA 8' : 'PSA 7–';
  const gradeColor = worst <= 55 ? '#30d158' : worst <= 65 ? '#ffd60a' : '#ff453a';

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const GAP = 0.02;

  const makeHandleProps = (side) => {
    const isV = side.includes('left') || side.includes('right');
    return {
      onPointerDown(e) { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); },
      onPointerMove(e) {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        if (isV) {
          const x = clamp((e.clientX - rect.left) / rect.width, 0.001, 0.999);
          setLines(prev => {
            if (side === 'leftOuter')  return { ...prev, leftOuter:  clamp(x, 0.001, prev.leftInner - GAP) };
            if (side === 'leftInner')  return { ...prev, leftInner:  clamp(x, prev.leftOuter + GAP, prev.rightInner - GAP) };
            if (side === 'rightInner') return { ...prev, rightInner: clamp(x, prev.leftInner + GAP, prev.rightOuter - GAP) };
            if (side === 'rightOuter') return { ...prev, rightOuter: clamp(x, prev.rightInner + GAP, 0.999) };
            return prev;
          });
        } else {
          const y = clamp((e.clientY - rect.top) / rect.height, 0.001, 0.999);
          setLines(prev => {
            if (side === 'topOuter')    return { ...prev, topOuter:    clamp(y, 0.001, prev.topInner - GAP) };
            if (side === 'topInner')    return { ...prev, topInner:    clamp(y, prev.topOuter + GAP, prev.bottomInner - GAP) };
            if (side === 'bottomInner') return { ...prev, bottomInner: clamp(y, prev.topInner + GAP, prev.bottomOuter - GAP) };
            if (side === 'bottomOuter') return { ...prev, bottomOuter: clamp(y, prev.bottomInner + GAP, 0.999) };
            return prev;
          });
        }
      },
    };
  };

  // 8 handles: outer (white, small) and inner (gold/blue, large)
  const handles = [
    { side: 'leftOuter',   isV: true,  pos: leftOuter,   color: '#ff2d92', size: 14, perp: 0.28 },
    { side: 'leftInner',   isV: true,  pos: leftInner,   color: '#c9a84c',                size: 22, perp: 0.72 },
    { side: 'rightInner',  isV: true,  pos: rightInner,  color: '#c9a84c',                size: 22, perp: 0.28 },
    { side: 'rightOuter',  isV: true,  pos: rightOuter,  color: '#ff2d92', size: 14, perp: 0.72 },
    { side: 'topOuter',    isV: false, pos: topOuter,    color: '#ff2d92', size: 14, perp: 0.28 },
    { side: 'topInner',    isV: false, pos: topInner,    color: '#0a84ff',                size: 22, perp: 0.72 },
    { side: 'bottomInner', isV: false, pos: bottomInner, color: '#0a84ff',                size: 22, perp: 0.28 },
    { side: 'bottomOuter', isV: false, pos: bottomOuter, color: '#ff2d92', size: 14, perp: 0.72 },
  ];

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: '#fff', fontSize: 13, fontWeight: 600, letterSpacing: '-0.2px' }}>Set Centering</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,45,146,0.7)', fontSize: 20, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
      </div>
      <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, margin: '0 0 14px', lineHeight: 1.55 }}>
        <span style={{ color: '#ff2d92', fontWeight: 600 }}>Pink</span> handles = card edge.{' '}
        <span style={{ color: '#c9a84c', fontWeight: 600 }}>Gold</span> / <span style={{ color: '#0a84ff', fontWeight: 600 }}>blue</span> handles = where border meets art.
      </p>

      <div ref={containerRef} style={{ position: 'relative', userSelect: 'none', touchAction: 'none', marginBottom: 14 }}>
        <img src={imageURL} alt="Card" style={{ width: '100%', display: 'block', borderRadius: 10, pointerEvents: 'none' }} />

        {/* Visual lines — outer (dim white), inner (gold/blue) */}
        {[
          { pos: leftOuter,   isV: true,  color: 'rgba(255,45,146,0.7)' },
          { pos: leftInner,   isV: true,  color: '#c9a84c' },
          { pos: rightInner,  isV: true,  color: '#c9a84c' },
          { pos: rightOuter,  isV: true,  color: 'rgba(255,45,146,0.7)' },
          { pos: topOuter,    isV: false, color: 'rgba(255,45,146,0.7)' },
          { pos: topInner,    isV: false, color: '#0a84ff' },
          { pos: bottomInner, isV: false, color: '#0a84ff' },
          { pos: bottomOuter, isV: false, color: 'rgba(255,45,146,0.7)' },
        ].map(({ pos, isV, color }, i) => (
          <div key={i} style={{
            position: 'absolute', pointerEvents: 'none',
            ...(isV
              ? { top: 0, bottom: 0, left: `${pos * 100}%`, width: 2, transform: 'translateX(-50%)', background: color }
              : { left: 0, right: 0, top: `${pos * 100}%`, height: 2, transform: 'translateY(-50%)', background: color }),
          }} />
        ))}

        {/* 8 drag handles */}
        {handles.map(({ side, isV, pos, color, size, perp }) => (
          <div
            key={side}
            {...makeHandleProps(side)}
            style={{
              position: 'absolute',
              ...(isV
                ? { top: `${perp * 100}%`, left: `${pos * 100}%`, transform: 'translate(-50%, -50%)', cursor: 'ew-resize' }
                : { left: `${perp * 100}%`, top: `${pos * 100}%`, transform: 'translate(-50%, -50%)', cursor: 'ns-resize' }),
              width: 44, height: 44,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 10, touchAction: 'none',
            }}
          >
            <div style={{
              width: size, height: size, borderRadius: '50%',
              background: color, border: '2px solid rgba(0,0,0,0.85)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
              pointerEvents: 'none',
            }} />
          </div>
        ))}
      </div>

      {/* Live stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
        {[
          { label: 'L/R', val: `${leftPct}/${rightPct}` },
          { label: 'T/B', val: `${topPct}/${botPct}` },
          { label: 'Worst', val: `${worst}/${100 - worst}` },
          { label: 'PSA', val: psaLabel, color: gradeColor },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 4px', textAlign: 'center' }}>
            <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
            <div style={{ color: color ?? '#fff', fontSize: 12, fontWeight: 600, letterSpacing: '-0.2px' }}>{val}</div>
          </div>
        ))}
      </div>

      <button
        onClick={() => onConfirm({ leftPct, rightPct, topPct, bottomPct: botPct }, lines)}
        style={{
          width: '100%', padding: '12px 0',
          background: '#c9a84c', color: '#000',
          fontWeight: 700, fontSize: 14, border: 'none',
          borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
          letterSpacing: '-0.2px',
        }}
      >
        Confirm Centering
      </button>
    </div>
  );
}

function AnnotatedCard({ images, defects = [] }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const src = images[activeIdx]?.objectURL;
  const isFront = activeIdx === 0;
  const hasDefects = defects.length > 0 && isFront;
  const role = images[activeIdx]?.role ?? (activeIdx === 0 ? 'front' : activeIdx === 1 ? 'back' : 'detail');
  const roleLabel = { front: 'Front', back: 'Back', detail: 'Detail' }[role] ?? 'Detail';

  return (
    <div style={card}>
      <div style={{ position: "relative", lineHeight: 0, borderRadius: 12, overflow: "hidden" }}>
        <img
          src={src}
          alt="Card"
          onClick={() => setFullscreen(true)}
          style={{ width: "100%", height: "auto", display: "block", borderRadius: 12, cursor: "zoom-in" }}
        />

        {/* Defect pins — only on front photo */}
        {hasDefects && defects.map((d, i) => {
          const flipDown = d.y < 0.18;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${d.x * 100}%`,
                top: `${d.y * 100}%`,
                transform: flipDown ? "translate(-50%, 0)" : "translate(-50%, -100%)",
                display: "flex",
                flexDirection: flipDown ? "column" : "column-reverse",
                alignItems: "center",
                pointerEvents: "none",
                zIndex: 10,
                filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.95))",
              }}
            >
              <div style={{
                width: 0, height: 0,
                borderLeft: "5px solid transparent",
                borderRight: "5px solid transparent",
                ...(flipDown ? { borderBottom: "8px solid #c9a84c" } : { borderTop: "8px solid #c9a84c" }),
              }} />
              <div style={{
                background: "#c9a84c", color: "#000",
                minWidth: 20, height: 20, borderRadius: 4,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 700, padding: "0 5px",
              }}>
                {i + 1}
              </div>
            </div>
          );
        })}

        {/* Navigation — only when multiple images */}
        {images.length > 1 && (
          <>
            {/* Role label badge */}
            <div style={{
              position: "absolute", top: 10, left: 10,
              background: "rgba(0,0,0,0.62)", backdropFilter: "blur(8px)",
              borderRadius: 8, padding: "4px 10px",
              color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
            }}>
              {roleLabel} {activeIdx + 1}/{images.length}
            </div>

            {/* Prev arrow */}
            {activeIdx > 0 && (
              <button
                onClick={() => setActiveIdx(i => i - 1)}
                style={{
                  position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
                  width: 34, height: 34, borderRadius: "50%",
                  background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "#fff", fontSize: 16, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  zIndex: 20,
                }}
              >‹</button>
            )}

            {/* Next arrow */}
            {activeIdx < images.length - 1 && (
              <button
                onClick={() => setActiveIdx(i => i + 1)}
                style={{
                  position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                  width: 34, height: 34, borderRadius: "50%",
                  background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "#fff", fontSize: 16, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  zIndex: 20,
                }}
              >›</button>
            )}

            {/* Dot indicators */}
            <div style={{ position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 5 }}>
              {images.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveIdx(i)}
                  style={{
                    width: 6, height: 6, borderRadius: "50%", border: "none", padding: 0,
                    background: i === activeIdx ? "#c9a84c" : "rgba(255,255,255,0.35)",
                    cursor: "pointer",
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {fullscreen && (
        <div
          onClick={() => setFullscreen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 2000,
            background: "rgba(0,0,0,0.97)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <img src={src} alt="Card" style={{ maxWidth: "95vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 10 }} />
          <div style={{ position: "absolute", top: 20, right: 24, color: "rgba(255,255,255,0.35)", fontSize: 32, lineHeight: 1, pointerEvents: "none" }}>×</div>
        </div>
      )}

      {hasDefects ? (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          {defects.map((d, i) => (
            <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{
                width: 20, height: 20,
                borderRadius: "50%",
                background: "rgba(201,168,76,0.12)",
                border: "1px solid rgba(201,168,76,0.4)",
                color: "#c9a84c",
                fontSize: 10,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginTop: 1,
              }}>
                {i + 1}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                <span style={{ color: "#c9a84c", fontWeight: 600 }}>{d.label}</span>
                <span style={{ color: "rgba(255,255,255,0.35)" }}> — {d.description}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 14, color: "#30d158", fontSize: 13, textAlign: "center", letterSpacing: "-0.1px" }}>
          No visible defects detected
        </div>
      )}
    </div>
  );
}

function CandidatePicker({ candidates, onConfirm, loading, onSearch }) {
  const [selected, setSelected] = useState(null);
  const [searchMode, setSearchMode] = useState(false);
  const [query, setQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [searchResults, setSearchResults] = useState(null);
  const inputRef = useRef(null);

  const displayed = searchResults ?? candidates;

  const handleSearch = async () => {
    if (!query.trim() || searchLoading) return;
    setSearchLoading(true);
    setSearchError(null);
    try {
      const results = await onSearch(query.trim());
      if (results?.length) {
        setSearchResults(results);
        setSelected(null);
        setSearchMode(false);
      } else {
        setSearchError("No matches found. Try a different description.");
      }
    } catch (e) {
      setSearchError(e.message || "Search failed. Try again.");
    } finally {
      setSearchLoading(false);
    }
  };

  const openSearch = () => {
    setSearchMode(true);
    setSelected(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div style={card}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ color: "#fff", fontSize: 16, fontWeight: 600, letterSpacing: "-0.3px", marginBottom: 5 }}>
          Which card is this?
        </div>
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, lineHeight: 1.5 }}>
          {searchResults ? "Search results — select the correct card." : "We found a few possible matches. Select the correct one for accurate data."}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {displayed.map((c, i) => {
          const isSelected = selected === i;
          return (
            <button
              key={i}
              onClick={() => { setSelected(i); setSearchMode(false); }}
              style={{
                background: isSelected ? "rgba(201,168,76,0.1)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${isSelected ? "rgba(201,168,76,0.5)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 12,
                padding: "14px 16px",
                textAlign: "left",
                cursor: "pointer",
                transition: "all 0.15s ease",
                fontFamily: "inherit",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div style={{ color: isSelected ? "#c9a84c" : "#fff", fontSize: 14, fontWeight: 600, marginBottom: 4, letterSpacing: "-0.2px" }}>
                    {c.player}
                    {c.cardNumber && (
                      <span style={{ color: "rgba(255,255,255,0.25)", fontWeight: 400, marginLeft: 6 }}>#{c.cardNumber}</span>
                    )}
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.38)", fontSize: 12, marginBottom: c.description ? 5 : 0 }}>
                    {[c.year, c.set, c.variant].filter(Boolean).join("  ·  ")}
                  </div>
                  {c.description && (
                    <div style={{ color: "rgba(255,255,255,0.22)", fontSize: 11, fontStyle: "italic", marginTop: 3 }}>
                      {c.description}
                    </div>
                  )}
                </div>
                <div style={{
                  width: 17, height: 17,
                  borderRadius: "50%",
                  border: `2px solid ${isSelected ? "#c9a84c" : "rgba(255,255,255,0.2)"}`,
                  background: isSelected ? "#c9a84c" : "transparent",
                  flexShrink: 0,
                  marginTop: 2,
                  transition: "all 0.15s ease",
                }} />
              </div>
            </button>
          );
        })}

        {/* Other / search option */}
        <button
          onClick={openSearch}
          style={{
            background: searchMode ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)",
            border: `1px dashed ${searchMode ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.08)"}`,
            borderRadius: 12,
            padding: "13px 16px",
            textAlign: "left",
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "all 0.15s ease",
          }}
        >
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13 }}>
            {searchResults ? "Search again…" : "Other — search for a different card"}
          </div>
        </button>
      </div>

      {/* Search input */}
      {searchMode && (
        <div style={{ marginBottom: 14 }}>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="e.g. 2019 Zion Williamson Prizm Silver"
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 10,
              padding: "12px 14px",
              color: "#fff",
              fontSize: 14,
              fontFamily: "inherit",
              outline: "none",
              marginBottom: 8,
            }}
          />
          {searchError && (
            <div style={{ color: "#ff453a", fontSize: 12, marginBottom: 8 }}>{searchError}</div>
          )}
          <button
            onClick={handleSearch}
            disabled={!query.trim() || searchLoading}
            style={{
              width: "100%",
              padding: "11px 0",
              background: searchLoading || !query.trim() ? "rgba(255,255,255,0.05)" : "rgba(201,168,76,0.15)",
              color: searchLoading || !query.trim() ? "rgba(255,255,255,0.2)" : "#c9a84c",
              fontWeight: 600,
              fontSize: 14,
              border: `1px solid ${searchLoading || !query.trim() ? "transparent" : "rgba(201,168,76,0.3)"}`,
              borderRadius: 10,
              cursor: searchLoading || !query.trim() ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              transition: "all 0.15s ease",
            }}
          >
            {searchLoading ? "Searching…" : "Search"}
          </button>
        </div>
      )}

      <button
        onClick={() => selected !== null && !loading && onConfirm(displayed[selected])}
        disabled={selected === null || loading}
        style={{
          width: "100%",
          padding: "13px 0",
          background: loading ? "rgba(255,255,255,0.05)" : selected !== null ? "#c9a84c" : "rgba(255,255,255,0.06)",
          color: loading ? "rgba(255,255,255,0.2)" : selected !== null ? "#000" : "rgba(255,255,255,0.2)",
          fontWeight: 600,
          fontSize: 15,
          letterSpacing: "-0.2px",
          border: "none",
          borderRadius: 12,
          cursor: (selected === null || loading) ? "not-allowed" : "pointer",
          fontFamily: "inherit",
          transition: "all 0.15s ease",
        }}
      >
        {loading ? "Grading…" : "Confirm & Grade"}
      </button>
    </div>
  );
}

function SubgradeNumber({ value }) {
  const [display, setDisplay] = useState(null);
  useEffect(() => {
    if (value == null) { setDisplay(null); return; }
    setDisplay(0);
    const STEPS = 16, INTERVAL = 680 / STEPS;
    let step = 0;
    const id = setInterval(() => {
      step++;
      const eased = 1 - Math.pow(1 - step / STEPS, 2.5);
      if (step >= STEPS) {
        clearInterval(id);
        setDisplay(Number(value));
      } else {
        setDisplay(Math.round(eased * value * 2) / 2);
      }
    }, INTERVAL);
    return () => clearInterval(id);
  }, [value]);
  return (
    <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 20, fontWeight: 600, letterSpacing: "-0.5px" }}>
      {display == null ? "—" : Number(display).toFixed(1)}
    </div>
  );
}

function ConfidenceArc({ confidence }) {
  const size   = 80;
  const stroke = 6;
  const r      = (size - stroke) / 2;
  const circ   = 2 * Math.PI * r;
  const color  = confidence >= 70 ? "#30d158" : confidence >= 40 ? "#ffd60a" : "#ff453a";

  const [pct, setPct]       = useState(0);
  const [glowing, setGlowing] = useState(false);

  useEffect(() => {
    setPct(0);
    setGlowing(false);
    const STEPS = 24, INTERVAL = 900 / STEPS;
    let step = 0;
    const id = setInterval(() => {
      step++;
      const eased = 1 - Math.pow(1 - step / STEPS, 2.5);
      if (step >= STEPS) {
        clearInterval(id);
        setPct(confidence);
        setGlowing(true);
        setTimeout(() => setGlowing(false), 600);
      } else {
        setPct(Math.round(eased * confidence));
      }
    }, INTERVAL);
    return () => clearInterval(id);
  }, [confidence]);

  const offset = circ - (pct / 100) * circ;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flexShrink: 0 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke={color}
            strokeWidth={glowing ? 9 : stroke}
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: glowing ? "stroke-width 0.4s ease, filter 0.5s ease" : "none", filter: glowing ? `drop-shadow(0 0 7px ${color})` : "none" }}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color, fontSize: 15, fontWeight: 700, letterSpacing: "-0.5px" }}>{pct}%</span>
        </div>
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: 500, letterSpacing: "-0.1px", marginBottom: 2 }}>
          {confidence >= 90 ? "High Confidence" : confidence >= 70 ? "Good Confidence" : confidence >= 50 ? "Medium Confidence" : "Low Confidence"}
        </div>
        <div style={{ color: "rgba(255,255,255,0.22)", fontSize: 10, lineHeight: 1.4 }}>
          {confidence >= 90 ? "More angles = better grade" : "Upload more photos"}
        </div>
      </div>
    </div>
  );
}

const VAGUE_CENTERING = [
  /slight\w* centering\w*/gi,
  /slight\w* off[- ]cent\w*/gi,
  /centering (concern|imbalance|issue|problem|deviation|variance|discrepancy)\w*/gi,
  /marginal centering\w*/gi,
  /off[- ]cent\w* by a (small|slight|minor|tiny)\w*/gi,
  /minor centering\w*/gi,
  /centering (appears?|seems?) (slightly|marginally|somewhat|a (bit|little))\w*/gi,
  /slightly (off|miscentered|uncentered)\w*/gi,
  /somewhat (off[- ]cent|miscentered)\w*/gi,
  /a (bit|little|touch|tad) off[- ]?cent\w*/gi,
];

function cleanCenteringText(text, cm) {
  if (!text) return text;
  let out = text;
  for (const re of VAGUE_CENTERING) {
    if (cm?.worstAxisRatio) {
      out = out.replace(re, `centering measures ${cm.worstAxisRatio} (within PSA 10 tolerance)`);
    } else {
      out = out.replace(re, "centering within tolerance");
    }
  }
  return out;
}

function computeCentering(cm) {
  if (!cm) return null;
  // support both old flat format and new {front, back} format
  const f = cm.front ?? cm;
  const b = cm.back ?? null;
  const lr = Math.max(f.leftPct ?? 50, f.rightPct ?? 50);
  const tb = Math.max(f.topPct ?? 50, f.bottomPct ?? 50);
  const worst = Math.max(lr, tb);
  const narrow = 100 - worst;
  const ratio = `${worst}/${narrow}`;
  let psaGrade, bgsSubgrade, color;
  if (worst <= 52) { psaGrade = "PSA 10"; bgsSubgrade = 10.0; color = "#30d158"; }
  else if (worst <= 55) { psaGrade = "PSA 10"; bgsSubgrade = 9.5; color = "#30d158"; }
  else if (worst <= 60) { psaGrade = "PSA 9"; bgsSubgrade = 9.0; color = "#ffd60a"; }
  else if (worst <= 65) { psaGrade = "PSA 8"; bgsSubgrade = 8.5; color = "#ffd60a"; }
  else if (worst <= 70) { psaGrade = "PSA 7"; bgsSubgrade = 8.0; color = "#ff453a"; }
  else { psaGrade = "PSA 6 or lower"; bgsSubgrade = 7.5; color = "#ff453a"; }

  // back centering — PSA is more lenient (75/25 = PSA 10)
  let backResult = null;
  if (b) {
    const blr = Math.max(b.leftPct ?? 50, b.rightPct ?? 50);
    const btb = Math.max(b.topPct ?? 50, b.bottomPct ?? 50);
    const bworst = Math.max(blr, btb);
    const bnarrow = 100 - bworst;
    const bcolor = bworst <= 75 ? "#30d158" : bworst <= 80 ? "#ffd60a" : "#ff453a";
    const bgrade = bworst <= 75 ? "PSA 10" : bworst <= 80 ? "PSA 9" : "PSA 8–";
    backResult = {
      lrRatio: `${blr}/${100 - blr}`,
      tbRatio: `${btb}/${100 - btb}`,
      worstRatio: `${bworst}/${bnarrow}`,
      psaGrade: bgrade,
      color: bcolor,
    };
  }

  return { lr, tb, worst, ratio, psaGrade, bgsSubgrade, color, back: backResult,
    lrRatio: `${lr}/${100 - lr}`,
    tbRatio: `${tb}/${100 - tb}`,
  };
}

const ROLE_LABEL = { front: 'Front', back: 'Back', detail: 'Detail' };
const ROLE_COLOR = { front: '#c9a84c', back: '#0a84ff', detail: 'rgba(255,255,255,0.28)' };

export default function GradeTab({ images, result, candidates, loading, error, onAddImages, onRemoveImage, onSetRole, onGrade, onConfirmCandidate, onSearch, onUpdateCentering }) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [gradePressed, setGradePressed] = useState(false);
  const fileInputRef = useRef(null);
  const [dismissedNegs, setDismissedNegs] = useState([]);
  const [dismissedDefects, setDismissedDefects] = useState([]);
  const [showCenteringEditor, setShowCenteringEditor] = useState(false);
  const handleDrop = (e) => { e.preventDefault(); onAddImages(e.dataTransfer.files); };

  const frontImg = result ? (images.find(img => img.role === 'front') ?? images[0] ?? null) : null;
  // Only treat centering as "user-confirmed" if they actually opened the editor and hit Confirm.
  // Auto-detection at upload populates frontImg.centering but doesn't count as confirmation.
  const userConfirmed = frontImg?.centeringConfirmedByUser === true;
  const userCentering = userConfirmed ? frontImg?.centering : null;
  const cm = userCentering;
  const activeNegs = (result?.negatives ?? [])
    .filter((_, i) => !dismissedNegs.includes(i));
  const activeDefects = (result?.defects ?? []).filter((_, i) => !dismissedDefects.includes(i));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Upload area */}
      <div style={images.length > 0 ? card : heroUploadCard}>
        {images.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-start" }}>
            {images.map((img, idx) => {
              const role = img.role ?? 'detail';
              return (
                <div key={idx} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                  <div style={{ position: "relative" }}>
                    <img
                      src={img.objectURL}
                      alt={`View ${idx + 1}`}
                      style={{ width: 68, height: 86, objectFit: "cover", borderRadius: 8, border: `1px solid ${ROLE_COLOR[role]}44`, display: "block" }}
                    />
                    <button
                      onClick={() => onRemoveImage(idx)}
                      style={{
                        position: "absolute", top: -6, right: -6,
                        width: 18, height: 18, borderRadius: "50%",
                        background: "#ff453a", border: "1.5px solid #000",
                        color: "#fff", fontSize: 9, fontWeight: 700,
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        padding: 0, lineHeight: 1,
                      }}
                    >✕</button>
                  </div>
                  <button
                    onClick={() => onSetRole(idx)}
                    title="Tap to change"
                    style={{
                      background: "none", border: "none", padding: 0,
                      color: ROLE_COLOR[role],
                      fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                      textTransform: "uppercase", cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {ROLE_LABEL[role]}
                  </button>
                </div>
              );
            })}
            {images.length < 10 && (
              <>
                <button
                  onClick={() => setCameraOpen(true)}
                  title="Take photo with alignment rectangle"
                  style={{
                    width: 68, height: 86, borderRadius: 8,
                    border: "1px solid rgba(201,168,76,0.4)",
                    background: "rgba(201,168,76,0.1)",
                    color: "#c9a84c", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                    textTransform: "uppercase", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "inherit",
                  }}
                >Camera</button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload existing photo"
                  style={{
                    width: 68, height: 86, borderRadius: 8,
                    border: "1px dashed rgba(255,255,255,0.14)",
                    background: "rgba(255,255,255,0.03)",
                    color: "rgba(255,255,255,0.25)", fontSize: 22,
                    cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >+</button>
              </>
            )}
          </div>
        ) : (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            style={{ padding: "36px 20px 32px", textAlign: "center", position: "relative" }}
          >
            {/* Ambient top glow */}
            <div style={{
              position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
              width: "130%", height: 180,
              background: "radial-gradient(ellipse 60% 100% at 50% 0%, rgba(201,168,76,0.22) 0%, transparent 100%)",
              pointerEvents: "none",
            }} />

            {/* Mock grade badges */}
            <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 28, position: "relative" }}>
              {[
                { company: "PSA", grade: "10", sub: "GEM MT" },
                { company: "BGS", grade: "9.5", sub: "GEM MINT" },
              ].map(({ company, grade, sub }) => (
                <div key={company} style={{
                  background: "rgba(0,0,0,0.5)",
                  border: "1px solid rgba(201,168,76,0.32)",
                  borderRadius: 18,
                  padding: "16px 22px",
                  minWidth: 95,
                  boxShadow: "0 4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)",
                }}>
                  <div style={{ color: "rgba(255,255,255,0.28)", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 6 }}>{company}</div>
                  <div style={{ color: "#c9a84c", fontSize: 42, fontWeight: 800, lineHeight: 1, letterSpacing: "-2.5px", textShadow: "0 0 28px rgba(201,168,76,0.6)" }}>{grade}</div>
                  <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 9, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", marginTop: 6 }}>{sub}</div>
                </div>
              ))}
            </div>

            {/* Headline */}
            <div style={{ color: "#fff", fontSize: 26, fontWeight: 800, letterSpacing: "-0.8px", lineHeight: 1.15, marginBottom: 10, position: "relative" }}>
              Grade Your Cards<br />with AI
            </div>

            {/* Subtitle */}
            <div style={{ color: "rgba(255,255,255,0.38)", fontSize: 13, letterSpacing: "-0.1px", lineHeight: 1.7, margin: "0 auto 28px", maxWidth: 250, position: "relative" }}>
              PSA & BGS grades, live eBay market comps, and submission ROI — from a photo.
            </div>

            {/* CTA buttons */}
            <div style={{ display: "flex", gap: 10, position: "relative" }}>
              <button
                onClick={() => setCameraOpen(true)}
                style={{
                  flex: 1, padding: "15px 0",
                  background: "#c9a84c", color: "#000",
                  border: "none", borderRadius: 14,
                  fontSize: 15, fontWeight: 700, letterSpacing: "-0.2px",
                  cursor: "pointer", fontFamily: "inherit",
                  boxShadow: "0 4px 24px rgba(201,168,76,0.45)",
                }}
              >Take Photo</button>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  flex: 1, padding: "15px 0",
                  background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.75)",
                  border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14,
                  fontSize: 15, fontWeight: 600, letterSpacing: "-0.2px",
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >Upload Photo</button>
            </div>
          </div>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => onAddImages(e.target.files)} />
      </div>

      {images.length === 0 && !result && !candidates && !loading && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            { title: "PSA + BGS Grades",  desc: "Both grading scales from one photo" },
            { title: "Live Market Data",  desc: "Real eBay prices per grade tier"     },
            { title: "Submission ROI",    desc: "Dollar math on whether to grade"     },
            { title: "Defect Detection",  desc: "AI finds flaws corner by corner"     },
          ].map(({ title, desc }, i) => (
            <div key={title} className={`result-card-${i}`} style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 16,
              padding: "14px 14px",
            }}>
              <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 13, fontWeight: 600, letterSpacing: "-0.2px", marginBottom: 4 }}>{title}</div>
              <div style={{ color: "rgba(255,255,255,0.28)", fontSize: 12, lineHeight: 1.5 }}>{desc}</div>
            </div>
          ))}
        </div>
      )}

      {cameraOpen && (
        <CameraCapture
          onCapture={(file) => { onAddImages([file]); setCameraOpen(false); }}
          onClose={() => setCameraOpen(false)}
        />
      )}

      {/* Grade button */}
      {images.length > 0 && (
        <button
          onClick={onGrade}
          disabled={loading}
          onPointerDown={() => !loading && setGradePressed(true)}
          onPointerUp={() => setGradePressed(false)}
          onPointerCancel={() => setGradePressed(false)}
          style={{
            width: "100%",
            padding: "14px 0",
            background: loading ? "rgba(255,255,255,0.05)" : "#c9a84c",
            color: loading ? "rgba(255,255,255,0.2)" : "#000",
            fontWeight: 600,
            fontSize: 15,
            letterSpacing: "-0.2px",
            border: "none",
            borderRadius: 14,
            cursor: loading ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            transition: "background 0.18s ease, color 0.18s ease, transform 0.08s ease",
            transform: gradePressed && !loading ? "scale(0.97)" : "scale(1)",
          }}
        >
          {loading ? "Analyzing…" : `Grade ${images.length > 1 ? `${images.length} Photos` : "Card"}`}
        </button>
      )}

      {/* Candidate picker */}
      {candidates && candidates.length > 0 && (
        <CandidatePicker candidates={candidates} onConfirm={onConfirmCandidate} loading={loading} onSearch={onSearch} />
      )}

      {/* Error */}
      {error && (
        <div style={{ ...card, borderColor: "rgba(255,69,58,0.3)", background: "rgba(255,69,58,0.06)" }}>
          <span style={{ color: "#ff453a", fontSize: 13 }}>{error}</span>
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Confidence + Card identity in one row */}
          <div className="result-card-0" style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "#fff", fontSize: 17, fontWeight: 700, letterSpacing: "-0.4px", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {result.player}
              </div>
              <div style={{ color: "rgba(255,255,255,0.38)", fontSize: 12, letterSpacing: "-0.1px" }}>
                {[result.year, result.set, result.variant, result.cardNumber && `#${result.cardNumber}`]
                  .filter(Boolean).join("  ·  ")}
              </div>
            </div>
            <ConfidenceArc confidence={result.confidence} />
          </div>

          {/* PSA | BGS hero */}
          <div className="result-card-1" data-grade-hero="true" style={card}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1px 1fr" }}>
              <GradeHalf
                label="PSA"
                grade={result.psa?.grade}
                sub={result.psa?.label}
                side="left"
              />
              <div style={{ background: "rgba(255,255,255,0.06)" }} />
              <GradeHalf
                label="BGS"
                grade={result.bgs?.overall}
                sub={result.bgs?.isBlackLabel ? "Black Label" : result.bgs?.overall === 10 ? "Pristine" : result.bgs?.overall === 9.5 ? "Gem Mint" : "Beckett"}
                side="right"
                blackLabel={result.bgs?.isBlackLabel}
              />
            </div>

            {/* BGS subgrades */}
            {(() => {
              // Single source of truth: result.bgs.centering. AI sets it initially; recomputeBgsAndPsa updates it on user confirm.
              const centeringDisplay = result.bgs?.centering ?? null;
              const isManual = userConfirmed;
              return (
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 22, paddingTop: 18, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                  <button
                    onClick={() => setShowCenteringEditor(v => !v)}
                    style={{ textAlign: "center", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Centering</div>
                    {centeringDisplay != null ? (
                      <>
                        <SubgradeNumber value={typeof centeringDisplay === "number" ? centeringDisplay : Number(centeringDisplay)} />
                        <div style={{ color: isManual ? "#30d158" : "rgba(255,255,255,0.25)", fontSize: 8, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 3 }}>
                          {isManual ? "✓ manual" : <>✓ ai <span style={{ opacity: 0.55 }}>· tap for manual</span></>}
                        </div>
                      </>
                    ) : (
                      <div style={{
                        display: "inline-block", marginTop: 2,
                        background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.3)",
                        borderRadius: 8, padding: "5px 10px",
                        color: "#c9a84c", fontSize: 11, fontWeight: 600, letterSpacing: "-0.1px",
                      }}>
                        Set
                      </div>
                    )}
                  </button>
                  {[
                    { label: "Corners", value: result.bgs?.corners },
                    { label: "Edges", value: result.bgs?.edges },
                    { label: "Surface", value: result.bgs?.surface },
                  ].map((s) => (
                    <div key={s.label} style={{ textAlign: "center" }}>
                      <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>{s.label}</div>
                      <SubgradeNumber value={s.value} />
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Centering breakdown — only shown when user has manually set centering */}
            {(() => {
              const raw = userCentering;
              if (!raw) return null;
              const f = raw.front ?? raw;
              const b = raw.back ?? null;
              if (!f?.leftPct) return null;

              const lrF = Math.max(f.leftPct, f.rightPct);
              const tbF = Math.max(f.topPct, f.bottomPct);
              const worstF = Math.max(lrF, tbF);
              const fColor = worstF <= 55 ? "#30d158" : worstF <= 65 ? "#ffd60a" : "#ff453a";
              const fPsa = worstF <= 55 ? "PSA 10" : worstF <= 60 ? "PSA 9" : worstF <= 65 ? "PSA 8" : "PSA 7";
              const fBgs = worstF <= 52 ? 10.0 : worstF <= 55 ? 9.5 : worstF <= 60 ? 9.0 : worstF <= 65 ? 8.5 : 8.0;

              const CenterBar = ({ pct, color }) => (
                <div style={{ position: "relative", height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 100, overflow: "hidden" }}>
                  <div style={{ position: "absolute", left: 0, width: `${pct}%`, height: "100%", background: color, borderRadius: 100, opacity: 0.7 }} />
                  <div style={{ position: "absolute", left: "50%", top: 0, width: 1, height: "100%", background: "rgba(255,255,255,0.25)" }} />
                </div>
              );

              return (
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 18, paddingTop: 16 }}>
                  <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
                    Centering — Measured
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

                    {/* Front */}
                    <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Front</div>
                    {[
                      { axis: "L / R", pct: lrF },
                      { axis: "T / B", pct: tbF },
                    ].map(({ axis, pct }) => {
                      const color = pct <= 55 ? "#30d158" : pct <= 65 ? "#ffd60a" : "#ff453a";
                      const label = pct <= 52 ? "✓ PSA 10 · BGS 10" : pct <= 55 ? "✓ PSA 10 · BGS 9.5" : pct <= 60 ? "PSA 9 · BGS 9" : pct <= 65 ? "PSA 8 · BGS 8.5" : pct <= 70 ? "PSA 7 · BGS 8" : "PSA 6– · BGS 7.5";
                      return (
                        <div key={axis}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{axis}</span>
                            <span style={{ color, fontSize: 12, fontWeight: 700 }}>
                              {pct}/{100-pct}
                              <span style={{ color: "rgba(255,255,255,0.25)", fontWeight: 400, marginLeft: 6 }}>{label}</span>
                            </span>
                          </div>
                          <CenterBar pct={pct} color={color} />
                        </div>
                      );
                    })}
                    <div style={{ color: fColor, fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                      Worst ({lrF >= tbF ? "L/R" : "T/B"}): {lrF >= tbF ? `${lrF}/${100-lrF}` : `${tbF}/${100-tbF}`} → {fPsa} / BGS {fBgs}
                    </div>

                    {/* Back */}
                    <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4 }}>
                      Back
                      <span style={{ color: "rgba(255,255,255,0.15)", textTransform: "none", fontWeight: 400, fontSize: 9, marginLeft: 6 }}>(PSA 10 = 75/25)</span>
                    </div>
                    {b ? (() => {
                      const lrB = Math.max(b.leftPct ?? 50, b.rightPct ?? 50);
                      const tbB = Math.max(b.topPct ?? 50, b.bottomPct ?? 50);
                      const worstB = Math.max(lrB, tbB);
                      const bColor = worstB <= 75 ? "#30d158" : worstB <= 80 ? "#ffd60a" : "#ff453a";
                      const bPsa = worstB <= 75 ? "PSA 10" : worstB <= 80 ? "PSA 9" : "PSA 8–";
                      return (
                        <>
                          {[
                            { axis: "L / R", pct: lrB },
                            { axis: "T / B", pct: tbB },
                          ].map(({ axis, pct }) => {
                            const color = pct <= 75 ? "#30d158" : pct <= 80 ? "#ffd60a" : "#ff453a";
                            const label = pct <= 75 ? "✓ PSA 10" : pct <= 80 ? "PSA 9" : "PSA 8–";
                            return (
                              <div key={axis}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                  <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{axis}</span>
                                  <span style={{ color, fontSize: 12, fontWeight: 700 }}>
                                    {pct}/{100-pct}
                                    <span style={{ color: "rgba(255,255,255,0.25)", fontWeight: 400, marginLeft: 6 }}>{label}</span>
                                  </span>
                                </div>
                                <CenterBar pct={pct} color={color} />
                              </div>
                            );
                          })}
                          <div style={{ color: bColor, fontSize: 12, fontWeight: 600 }}>
                            Worst: {worstB}/{100-worstB} → {bPsa}
                          </div>
                        </>
                      );
                    })() : (
                      <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 12, fontStyle: "italic" }}>
                        No data — upload back photo for full centering
                      </div>
                    )}

                    <button
                      onClick={() => setShowCenteringEditor(true)}
                      style={{
                        marginTop: 10,
                        background: "rgba(255,45,146,0.10)",
                        border: "1px solid rgba(255,45,146,0.35)",
                        borderRadius: 10,
                        padding: "10px 14px",
                        color: "#ff2d92",
                        fontSize: 12,
                        fontWeight: 600,
                        letterSpacing: "-0.1px",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        textAlign: "center",
                      }}
                    >
                      Centering wrong? Tap here to fix it →
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Centering editor */}
          {showCenteringEditor && frontImg && (
            <CenteringEditor
              imageURL={frontImg.objectURL}
              initialLines={frontImg.centeringLines}
              onConfirm={(centering, lines) => {
                onUpdateCentering(images.indexOf(frontImg), centering, lines);
                setShowCenteringEditor(false);
              }}
              onClose={() => setShowCenteringEditor(false)}
            />
          )}

          {/* Annotated card */}
          <div className="result-card-2"><AnnotatedCard images={images} defects={activeDefects} /></div>

          {/* Positives / Issues */}
          <div className="result-card-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={card}>
              <div style={{ ...sectionLabel, color: "#30d158", marginBottom: 12 }}>Positives</div>
              {result.positives?.length > 0
                ? result.positives.map((p, i) => <div key={i} style={listItem}>{p}</div>)
                : <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 13 }}>None noted</div>}
            </div>
            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ ...sectionLabel, color: "#ff453a" }}>Issues</div>
                {dismissedNegs.length > 0 && (
                  <button onClick={() => setDismissedNegs([])} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.2)", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>
                    Restore all
                  </button>
                )}
              </div>
              {activeNegs.length > 0
                ? (result.negatives ?? []).map((n, i) => dismissedNegs.includes(i) ? null : (
                  <div key={i} style={{ ...listItem, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <span>{n}</span>
                    <button onClick={() => setDismissedNegs(p => [...p, i])} title="Mark as incorrect" style={{ background: "none", border: "none", color: "rgba(255,255,255,0.18)", fontSize: 12, cursor: "pointer", flexShrink: 0, lineHeight: 1, padding: "2px 0" }}>✕</button>
                  </div>
                ))
                : <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 13 }}>None noted</div>}
            </div>
          </div>

          {/* Defect note */}
          {result.defects?.length > 0 && (
            <div style={{ ...card, paddingTop: 12, paddingBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "rgba(255,255,255,0.22)", fontSize: 11 }}>Tap ✕ on any defect marker to dismiss AI errors</span>
                {dismissedDefects.length > 0 && (
                  <button onClick={() => setDismissedDefects([])} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.2)", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>Restore</button>
                )}
              </div>
              {result.defects.map((d, i) => dismissedDefects.includes(i) ? null : (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flex: 1 }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.4)", color: "#c9a84c", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                    <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                      <span style={{ color: "#c9a84c", fontWeight: 600 }}>{d.label}</span>
                      <span style={{ color: "rgba(255,255,255,0.3)" }}> — {d.description}</span>
                    </div>
                  </div>
                  <button onClick={() => setDismissedDefects(p => [...p, i])} title="Dismiss" style={{ background: "none", border: "none", color: "rgba(255,255,255,0.18)", fontSize: 12, cursor: "pointer", flexShrink: 0, padding: "2px 0" }}>✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Verdict */}
          <div className="result-card-5" style={card}>
            <div style={{ ...sectionLabel, marginBottom: 12 }}>Expert Verdict</div>
            <p style={{ color: "rgba(255,255,255,0.5)", margin: 0, fontSize: 14, lineHeight: 1.75, letterSpacing: "-0.1px" }}>
              {cleanCenteringText(result.verdict, cm)}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function gradeColor(g, blackLabel) {
  if (blackLabel) return "#fff";
  if (!g && g !== 0) return "rgba(255,255,255,0.2)";
  if (g >= 10) return "#c9a84c";
  if (g >= 9)  return "#f0f0f0";
  if (g >= 8)  return "rgba(255,255,255,0.65)";
  return "rgba(255,255,255,0.38)";
}

function gradeGlow(g, blackLabel) {
  if (blackLabel) return "0 0 56px rgba(255,255,255,0.18)";
  if (!g) return "none";
  if (g >= 10) return "0 0 56px rgba(201,168,76,0.32)";
  if (g >= 9)  return "0 0 40px rgba(240,240,240,0.12)";
  return "none";
}

function GradeHalf({ label, grade: gradeProp, sub, side, blackLabel }) {
  const grade = gradeProp != null ? Number(gradeProp) : null;
  const isInt = grade != null && Number.isInteger(grade);
  const [display, setDisplay] = useState(null);
  const [landed, setLanded]   = useState(false);

  useEffect(() => {
    setLanded(false);
    if (grade == null) { setDisplay(null); return; }
    setDisplay(isInt ? 0 : 0.0);
    const STEPS = 22, INTERVAL = 1360 / STEPS;
    let step = 0;
    const id = setInterval(() => {
      step++;
      const eased = 1 - Math.pow(1 - step / STEPS, 2.5);
      if (step >= STEPS) {
        clearInterval(id);
        setDisplay(grade);
        setLanded(true);
      } else {
        setDisplay(isInt ? Math.floor(eased * grade) : Math.round(eased * grade * 2) / 2);
      }
    }, INTERVAL);
    return () => clearInterval(id);
  }, [grade]);

  const color = gradeColor(grade, blackLabel);
  const pad   = side === "left" ? "12px 20px 12px 0" : "12px 0 12px 20px";

  const displayStr = display == null ? "—" : isInt ? String(display) : Number(display).toFixed(1);
  const progress = (grade > 0 && display != null) ? Math.min(1, display / grade) : 0;
  const countScale = 0.3 + 0.7 * progress;

  return (
    <div style={{ textAlign: "center", padding: pad }}>
      <div style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
        textTransform: "uppercase", color: "rgba(255,255,255,0.25)", marginBottom: 12,
      }}>{label}</div>

      <div style={{
        display: "inline-block",
        color,
        fontSize: 72, fontWeight: 700, lineHeight: 1,
        letterSpacing: "-3px", marginBottom: 10,
        textShadow: landed ? gradeGlow(grade, blackLabel) : "none",
        transform: landed ? undefined : `scale(${countScale})`,
        animation: landed ? "gradeSlam 0.8s cubic-bezier(0.22,1,0.36,1) forwards" : "none",
      }}>{displayStr}</div>

      <div style={{
        display: "inline-block",
        background: blackLabel ? "rgba(255,255,255,0.08)" : grade >= 9 ? "rgba(201,168,76,0.1)" : "rgba(255,255,255,0.05)",
        border: `1px solid ${blackLabel ? "rgba(255,255,255,0.15)" : grade >= 9 ? "rgba(201,168,76,0.25)" : "rgba(255,255,255,0.08)"}`,
        borderRadius: 6, padding: "3px 9px",
        color: blackLabel ? "#fff" : grade >= 9 ? "#c9a84c" : "rgba(255,255,255,0.38)",
        fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase",
        opacity: landed ? 1 : 0,
        transition: "opacity 0.25s ease 0.2s",
      }}>{sub || "—"}</div>
    </div>
  );
}

const card = {
  background: "#1c1c1e",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 20,
  padding: "18px 18px",
  boxShadow: "0 2px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.09)",
};

const heroUploadCard = {
  background: "linear-gradient(180deg, rgba(201,168,76,0.11) 0%, #1c1c1e 52%)",
  border: "1px solid rgba(201,168,76,0.22)",
  borderRadius: 24,
  overflow: "hidden",
  boxShadow: "0 2px 40px rgba(201,168,76,0.10), inset 0 1px 0 rgba(255,255,255,0.08)",
};

const sectionLabel = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.3)",
};

const listItem = {
  color: "rgba(255,255,255,0.42)",
  fontSize: 13,
  lineHeight: 1.6,
  marginBottom: 6,
  paddingLeft: 10,
  borderLeft: "2px solid rgba(255,255,255,0.08)",
};
