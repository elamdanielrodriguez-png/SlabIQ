import { useState } from 'react'

export default function HistoryPanel({ onRestore }) {
  const [gradings, setGradings] = useState(() => {
    try { return JSON.parse(localStorage.getItem('slabiq_history') || '[]'); }
    catch { return []; }
  });

  const deleteGrading = (id) => {
    const updated = gradings.filter(g => g.id !== id);
    setGradings(updated);
    localStorage.setItem('slabiq_history', JSON.stringify(updated));
  };

  if (gradings.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 80, gap: 12 }}>
        <div style={{ fontSize: 36 }}>📭</div>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, textAlign: 'center' }}>
          No grades saved yet. Grade a card to get started.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ color: 'rgba(255,255,255,0.22)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
        {gradings.length} saved {gradings.length === 1 ? 'grade' : 'grades'}
      </div>
      {gradings.map((g, i) => (
        <div key={g.id} className={`result-card-${Math.min(i, 6)}`}>
          <HistoryItem
            grading={g}
            onDelete={() => deleteGrading(g.id)}
            onRestore={() => onRestore(g.result)}
          />
        </div>
      ))}
    </div>
  );
}

function HistoryItem({ grading, onDelete, onRestore }) {
  const { player, year, set_name, variant, psa_grade, bgs_overall, raw_value, savedAt } = grading;
  const date = new Date(savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  const psaColor = psa_grade >= 9 ? '#c9a84c' : psa_grade >= 7 ? 'rgba(255,255,255,0.6)' : 'rgba(255,69,58,0.8)';
  const bgsColor = bgs_overall >= 9 ? '#c9a84c' : bgs_overall >= 7 ? 'rgba(255,255,255,0.6)' : 'rgba(255,69,58,0.8)';

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontSize: 14, fontWeight: 600, letterSpacing: '-0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {player}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {[year, set_name, variant].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {psa_grade && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: psaColor, fontSize: 16, fontWeight: 700, letterSpacing: '-0.5px', lineHeight: 1 }}>{psa_grade}</div>
              <div style={{ color: 'rgba(255,255,255,0.22)', fontSize: 9, marginTop: 2 }}>PSA</div>
            </div>
          )}
          {bgs_overall && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: bgsColor, fontSize: 16, fontWeight: 700, letterSpacing: '-0.5px', lineHeight: 1 }}>{bgs_overall}</div>
              <div style={{ color: 'rgba(255,255,255,0.22)', fontSize: 9, marginTop: 2 }}>BGS</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {raw_value && (
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
              Raw: <span style={{ color: 'rgba(255,255,255,0.55)' }}>${raw_value.toLocaleString()}</span>
            </span>
          )}
          <span style={{ color: 'rgba(255,255,255,0.22)', fontSize: 11 }}>{date}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onRestore} style={actionBtn('#c9a84c')}>View</button>
          <button onClick={onDelete} style={actionBtn('rgba(255,69,58,0.7)')}>Delete</button>
        </div>
      </div>
    </div>
  );
}

const card = {
  background: '#1c1c1e',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 14,
  padding: '14px 16px',
};

const actionBtn = (color) => ({
  background: 'transparent',
  border: `1px solid ${color}40`,
  borderRadius: 8,
  padding: '4px 10px',
  color,
  fontSize: 11,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
});
