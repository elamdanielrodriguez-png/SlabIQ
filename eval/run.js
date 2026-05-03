// SlabIQ eval harness — runs every card in eval/dataset/ through /api/grade
// and writes a results JSON + a JS wrapper the dashboard can load via file://.
//
// Usage:
//   node eval/run.js                       # hits http://localhost:3001 by default
//   EVAL_API=http://localhost:3001 node eval/run.js
//   node eval/run.js --only mahomes-2017   # filter to one card folder
//
// Requires the SlabIQ server to be running (npm run server in another terminal).

import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const DATASET_DIR = join(ROOT, 'dataset');
const RESULTS_DIR = join(ROOT, 'results');
const API_BASE = process.env.EVAL_API || 'http://localhost:3001';
const ONLY = (() => {
  const i = process.argv.indexOf('--only');
  return i >= 0 ? process.argv[i + 1] : null;
})();

const IMAGE_EXT = /\.(jpe?g|png)$/i;

function colour(s, code) { return `\x1b[${code}m${s}\x1b[0m`; }
const dim = s => colour(s, 90);
const green = s => colour(s, 32);
const red = s => colour(s, 31);
const yellow = s => colour(s, 33);
const bold = s => colour(s, 1);

async function listCardDirs() {
  if (!existsSync(DATASET_DIR)) return [];
  const entries = await readdir(DATASET_DIR, { withFileTypes: true });
  const dirs = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('.') || e.name === 'EXAMPLE_CARD') continue;
    if (ONLY && !e.name.toLowerCase().includes(ONLY.toLowerCase())) continue;
    const truthPath = join(DATASET_DIR, e.name, 'truth.json');
    if (!existsSync(truthPath)) {
      console.log(yellow(`  skip ${e.name}: no truth.json`));
      continue;
    }
    dirs.push({ name: e.name, dir: join(DATASET_DIR, e.name), truthPath });
  }
  return dirs;
}

async function loadCard({ name, dir, truthPath }) {
  const truthRaw = await readFile(truthPath, 'utf8');
  const truth = JSON.parse(truthRaw);

  // Resolve image list — explicit list wins, otherwise auto-discover
  let imageNames = Array.isArray(truth.images) && truth.images.length
    ? truth.images
    : (await readdir(dir)).filter(n => IMAGE_EXT.test(n)).sort();

  const images = [];
  for (const fname of imageNames) {
    const p = join(dir, fname);
    if (!existsSync(p)) {
      console.log(yellow(`  ${name}: missing image ${fname}, skipping it`));
      continue;
    }
    const buf = await readFile(p);
    images.push({ name: fname, base64: buf.toString('base64') });
  }

  return { name, dir, truth, images };
}

async function gradeOne(card) {
  const c = card.truth.card || {};
  const body = {
    images: card.images.map(i => i.base64),
    confirmedCard: {
      player: c.player ?? '',
      year: c.year ?? '',
      set: c.set ?? '',
      variant: c.variant ?? 'Base',
      cardNumber: c.cardNumber ?? null,
    },
    // No zoneCrops — running headless without a browser canvas. The server
    // accepts a missing/empty zoneCrops and the AI does whole-image inspection.
  };

  const t0 = Date.now();
  const res = await fetch(`${API_BASE}/api/grade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const elapsedMs = Date.now() - t0;

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error);

  const text = data.content?.[0]?.text || '';
  let parsed = null;
  try { parsed = JSON.parse(text); }
  catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
  }
  if (!parsed) throw new Error('Could not parse grading response JSON');
  return { parsed, elapsedMs };
}

// ── Metrics ──────────────────────────────────────────────────────────────
// PSA: exact, within 0.5, within 1.0 (PSA grades are integers, so within-0.5
// and exact are equivalent; we keep within-1 for "off by one" tolerance).
// BGS subgrades: per-dimension exact / within-0.5 accuracy + signed bias.

function safeNum(x) { return typeof x === 'number' && !Number.isNaN(x) ? x : null; }

function classify(predicted, actual, tol = 0.5) {
  const p = safeNum(predicted), a = safeNum(actual);
  if (p == null || a == null) return null;
  return { diff: p - a, withinTol: Math.abs(p - a) <= tol, exact: p === a };
}

function summarise(comparisons) {
  // comparisons: array of {diff, withinTol, exact} (or null) for one metric
  const valid = comparisons.filter(Boolean);
  if (!valid.length) return { n: 0 };
  const n = valid.length;
  const exact = valid.filter(c => c.exact).length;
  const within = valid.filter(c => c.withinTol).length;
  const diffs = valid.map(c => c.diff);
  const meanBias = diffs.reduce((a, b) => a + b, 0) / n;
  const mae = diffs.reduce((a, b) => a + Math.abs(b), 0) / n;
  return {
    n,
    exact,
    exactPct: Math.round((exact / n) * 100),
    within,
    withinPct: Math.round((within / n) * 100),
    meanBias: Number(meanBias.toFixed(2)),
    mae: Number(mae.toFixed(2)),
  };
}

function buildReport(rows) {
  const psaCmp = rows.map(r => classify(r.predicted?.psa, r.actual?.psa, 0.5));
  const psaWithin1 = rows
    .map(r => classify(r.predicted?.psa, r.actual?.psa, 1.0))
    .filter(Boolean)
    .filter(c => c.withinTol).length;

  const bgsKeys = ['overall', 'centering', 'corners', 'edges', 'surface'];
  const bgs = {};
  for (const k of bgsKeys) {
    bgs[k] = summarise(rows.map(r => classify(r.predicted?.bgs?.[k], r.actual?.bgs?.[k], 0.5)));
  }

  return {
    psa: {
      ...summarise(psaCmp),
      within1Pct: psaCmp.length ? Math.round((psaWithin1 / psaCmp.length) * 100) : 0,
    },
    bgs,
  };
}

// ── Pretty-print summary ─────────────────────────────────────────────────

function printSummary(report, rows) {
  console.log('');
  console.log(bold('━━━ SUMMARY ━━━'));

  const p = report.psa;
  if (p.n) {
    console.log(`${bold('PSA')}    n=${p.n}  exact=${p.exactPct}%  within±1=${p.within1Pct}%  bias=${p.meanBias > 0 ? '+' : ''}${p.meanBias}  MAE=${p.mae}`);
  } else {
    console.log(`${bold('PSA')}    no ground-truth PSA grades found`);
  }

  console.log(bold('BGS subgrades'));
  for (const [k, s] of Object.entries(report.bgs)) {
    if (!s.n) { console.log(`  ${k.padEnd(10)} —`); continue; }
    const biasStr = s.meanBias > 0 ? `+${s.meanBias}` : `${s.meanBias}`;
    const biasColor = Math.abs(s.meanBias) < 0.25 ? green : yellow;
    console.log(`  ${k.padEnd(10)} n=${s.n}  exact=${s.exactPct}%  within±0.5=${s.withinPct}%  bias=${biasColor(biasStr)}  MAE=${s.mae}`);
  }

  console.log('');
  console.log(bold('Per-card'));
  for (const r of rows) {
    if (r.error) {
      console.log(`  ${red('✗')} ${r.name}  ${dim(r.error)}`);
      continue;
    }
    const psaA = r.actual?.psa, psaP = r.predicted?.psa;
    const bgsA = r.actual?.bgs?.overall, bgsP = r.predicted?.bgs?.overall;
    const psaStr = psaA != null ? `PSA ${psaP ?? '?'}/${psaA}` : `PSA ${psaP ?? '?'}/–`;
    const bgsStr = bgsA != null ? `BGS ${bgsP ?? '?'}/${bgsA}` : `BGS ${bgsP ?? '?'}/–`;
    const ok = (psaA == null || psaP === psaA) && (bgsA == null || bgsP === bgsA);
    const mark = ok ? green('✓') : yellow('~');
    console.log(`  ${mark} ${r.name.padEnd(35)} ${psaStr}   ${bgsStr}   ${dim(r.elapsedMs + 'ms')}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log(bold('SlabIQ eval'));
  console.log(dim(`API: ${API_BASE}`));
  console.log(dim(`Dataset: ${DATASET_DIR}`));
  if (ONLY) console.log(dim(`Filter: --only ${ONLY}`));
  console.log('');

  const dirs = await listCardDirs();
  if (!dirs.length) {
    console.log(yellow('No cards in dataset/. Add a folder under eval/dataset/ with photos and a truth.json — see eval/dataset/EXAMPLE_CARD for the schema.'));
    process.exit(0);
  }

  // Probe API up front so we fail fast if the server isn't running
  try {
    const probe = await fetch(`${API_BASE}/api/grade`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    // 400 is expected (missing images) — confirms the server is up
    if (probe.status >= 500) throw new Error(`Server returned ${probe.status}`);
  } catch (e) {
    console.log(red(`Cannot reach ${API_BASE} — is the SlabIQ server running? (npm run server)`));
    console.log(red(`Error: ${e.message}`));
    process.exit(1);
  }

  const rows = [];
  for (let i = 0; i < dirs.length; i++) {
    const d = dirs[i];
    process.stdout.write(`[${i + 1}/${dirs.length}] ${d.name} ... `);
    try {
      const card = await loadCard(d);
      if (!card.images.length) {
        console.log(yellow('no images, skipping'));
        rows.push({ name: d.name, error: 'no images', truth: card.truth });
        continue;
      }
      const { parsed, elapsedMs } = await gradeOne(card);
      const predicted = {
        psa: safeNum(parsed?.psa?.grade),
        bgs: parsed?.bgs ? {
          overall: safeNum(parsed.bgs.overall),
          centering: safeNum(parsed.bgs.centering),
          corners: safeNum(parsed.bgs.corners),
          edges: safeNum(parsed.bgs.edges),
          surface: safeNum(parsed.bgs.surface),
          isBlackLabel: !!parsed.bgs.isBlackLabel,
        } : null,
      };
      const actual = {
        psa: safeNum(card.truth?.actual?.psa),
        bgs: card.truth?.actual?.bgs || null,
      };
      rows.push({
        name: d.name,
        elapsedMs,
        truth: card.truth,
        predicted,
        actual,
        full: parsed,
        images: card.images.map(i => i.name),
      });
      const psaA = actual.psa, psaP = predicted.psa;
      const bgsA = actual.bgs?.overall, bgsP = predicted.bgs?.overall;
      const ok = (psaA == null || psaP === psaA) && (bgsA == null || bgsP === bgsA);
      console.log(ok ? green('ok') : yellow(`pred PSA ${psaP}/BGS ${bgsP}`));
    } catch (e) {
      console.log(red(`ERROR ${e.message}`));
      rows.push({ name: d.name, error: e.message });
    }
  }

  const report = buildReport(rows.filter(r => !r.error));
  printSummary(report, rows);

  // Persist results
  if (!existsSync(RESULTS_DIR)) await mkdir(RESULTS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const payload = {
    runAt: new Date().toISOString(),
    api: API_BASE,
    nCards: rows.length,
    nErrors: rows.filter(r => r.error).length,
    report,
    rows,
  };

  const jsonPath = join(RESULTS_DIR, `run-${ts}.json`);
  await writeFile(jsonPath, JSON.stringify(payload, null, 2));

  // Latest pointer (JSON for programmatic use, JS wrapper for the file:// dashboard)
  await writeFile(join(RESULTS_DIR, 'latest.json'), JSON.stringify(payload, null, 2));
  await writeFile(
    join(RESULTS_DIR, 'latest.js'),
    'window.SLABIQ_EVAL_RESULTS = ' + JSON.stringify(payload) + ';\n'
  );

  console.log('');
  console.log(green(`Saved ${jsonPath}`));
  console.log(dim(`Open eval/dashboard.html in a browser to view.`));
}

main().catch(e => {
  console.error(red('Fatal:'), e);
  process.exit(1);
});
