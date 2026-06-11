// eval/tune.mjs — overnight prompt tuning loop
// Runs eval, asks Claude to analyze failures, improves prompts, re-evals, keeps best.
// Usage: node eval/tune.mjs
// Requires: server/.env with ANTHROPIC_API_KEY, and cards in eval/dataset/

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PROMPTS_DIR = join(ROOT, 'server', 'prompts');
const SYSTEM_FILE = join(PROMPTS_DIR, 'system.txt');
const GRADING_FILE = join(PROMPTS_DIR, 'grading.txt');
const RESULTS_DIR = join(__dirname, 'results');
const TUNE_LOG = join(__dirname, 'tune-log.json');

const MAX_ITERATIONS = 3;
const SERVER_PORT = process.env.PORT || 3001;
const API_BASE = `http://localhost:${SERVER_PORT}`;

const anthropic = new Anthropic();

const bold  = s => `\x1b[1m${s}\x1b[0m`;
const green = s => `\x1b[32m${s}\x1b[0m`;
const red   = s => `\x1b[31m${s}\x1b[0m`;
const yellow= s => `\x1b[33m${s}\x1b[0m`;
const dim   = s => `\x1b[90m${s}\x1b[0m`;

function log(msg) { console.log(`${dim('[tune]')} ${msg}`); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Server lifecycle ─────────────────────────────────────────

let serverProc = null;

async function startServer() {
  log('Starting server...');
  serverProc = spawn('node', ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProc.stdout.on('data', d => process.stdout.write(dim(`  [server] ${d}`)));
  serverProc.stderr.on('data', d => process.stderr.write(dim(`  [server] ${d}`)));

  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    try {
      const res = await fetch(`${API_BASE}/api/grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (res.status < 500) { log(green('Server ready')); return; }
    } catch {}
  }
  throw new Error('Server did not become ready after 30s');
}

function stopServer() {
  if (serverProc) { serverProc.kill(); serverProc = null; log('Server stopped'); }
}

// ── Run eval, return parsed results ──────────────────────────

async function runEval() {
  log('Running eval...');
  await new Promise((resolve, reject) => {
    const child = spawn('node', ['eval/run.js'], {
      cwd: ROOT,
      env: { ...process.env, EVAL_API: API_BASE },
      stdio: 'inherit',
    });
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`Eval exited ${code}`)));
  });
  return JSON.parse(readFileSync(join(RESULTS_DIR, 'latest.json'), 'utf8'));
}

// ── Score: higher is better ───────────────────────────────────

function score(result) {
  const p = result.report?.psa;
  const b = result.report?.bgs;
  let total = 0, weight = 0;
  if (p?.n) { total += (p.within1Pct ?? 0) * 2 + (p.exactPct ?? 0); weight += 3; }
  for (const k of ['corners', 'edges', 'surface', 'centering']) {
    const s = b?.[k];
    if (s?.n) { total += s.withinPct ?? 0; weight += 1; }
  }
  return weight ? total / weight : 0;
}

// ── Build a human-readable failure report ─────────────────────

function buildFailureReport(result) {
  const failures = result.rows.filter(r =>
    !r.error &&
    ((r.actual?.psa != null && r.predicted?.psa !== r.actual?.psa) ||
     (r.actual?.bgs?.overall != null && r.predicted?.bgs?.overall !== r.actual?.bgs?.overall))
  );
  if (!failures.length) return null;

  return failures.map(r => {
    const psaDiff  = r.actual?.psa != null
      ? `PSA predicted=${r.predicted?.psa} actual=${r.actual?.psa} (diff=${((r.predicted?.psa ?? 0) - r.actual.psa).toFixed(1)})`
      : '';
    const bgsDiff  = r.actual?.bgs?.overall != null
      ? `BGS predicted=${r.predicted?.bgs?.overall} actual=${r.actual?.bgs?.overall}`
      : '';
    const zones    = (r.full?.zones ?? []).filter(z => z.severity).map(z => `${z.zone}:${z.severity}`).join(', ');
    const notes    = r.full?.physicalNotes ? `AI notes: "${r.full.physicalNotes.slice(0, 300)}"` : '';
    return `Card: ${r.name}\n  ${psaDiff} ${bgsDiff}\n  Flagged zones: ${zones || 'none'}\n  ${notes}`;
  }).join('\n\n');
}

// ── Ask Claude Opus to improve the prompts ────────────────────

async function improvePrompts(systemPrompt, gradingPrompt, failureReport, report) {
  log('Asking Claude Opus to improve prompts...');

  const biasLines = [];
  const p = report.psa;
  if (p?.n) biasLines.push(`PSA  exact=${p.exactPct}%  within±1=${p.within1Pct}%  bias=${p.meanBias > 0 ? '+' : ''}${p.meanBias}  MAE=${p.mae}`);
  for (const k of ['corners', 'edges', 'surface', 'centering']) {
    const s = report.bgs?.[k];
    if (s?.n) biasLines.push(`BGS ${k.padEnd(10)} exact=${s.exactPct}%  within±0.5=${s.withinPct}%  bias=${s.meanBias > 0 ? '+' : ''}${s.meanBias}`);
  }

  // Only send the instruction half of the grading prompt (stop before JSON schema)
  const schemaMarker = 'Return ONLY raw JSON';
  const schemaIdx = gradingPrompt.indexOf(schemaMarker);
  const gradingInstructions = schemaIdx >= 0 ? gradingPrompt.slice(0, schemaIdx).trim() : gradingPrompt;

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `You are improving the grading prompts for an AI sports card grader (CardGradeOrNot).
Analyze the failures below and make SPECIFIC, targeted changes to reduce error.

CURRENT ACCURACY:
${biasLines.join('\n')}

GRADING FAILURES (predicted vs actual PSA/BGS grades):
${failureReport}

CURRENT SYSTEM PROMPT:
${systemPrompt}

CURRENT GRADING PROMPT (instruction section only — do NOT include or modify the JSON schema):
${gradingInstructions}

Rules for your changes:
- Positive bias (AI grades too HIGH) → tighten severity thresholds, add stricter defect rules
- Negative bias (AI grades too LOW) → reduce false-positive detection, clarify what is NOT a flaw
- If a specific zone (corners/edges/surface) is consistently off → add zone-specific calibration
- Do NOT change the JSON output format, market data, or pop report sections
- Keep changes surgical — do not rewrite everything, just fix what's causing the failures

Return ONLY this JSON (no prose, no markdown):
{
  "analysis": "2-3 sentences explaining root cause of the failures",
  "newSystemPrompt": "<full updated system prompt>",
  "newGradingInstructions": "<updated instruction section only — stops before 'Return ONLY raw JSON'>"
}`,
    }],
  });

  const text = response.content[0].text.trim();
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Could not parse Claude improvement response');
  return JSON.parse(m[0]);
}

// ── Tune log ─────────────────────────────────────────────────

function loadLog() {
  return existsSync(TUNE_LOG) ? JSON.parse(readFileSync(TUNE_LOG, 'utf8')) : { runs: [] };
}
function saveLog(data) { writeFileSync(TUNE_LOG, JSON.stringify(data, null, 2)); }

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log(bold('\nCardGradeOrNot — Overnight Prompt Tuner\n'));

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(red('ERROR: ANTHROPIC_API_KEY not set in .env'));
    process.exit(1);
  }
  if (!existsSync(SYSTEM_FILE) || !existsSync(GRADING_FILE)) {
    console.log(red(`ERROR: Prompt files missing. Expected:\n  ${SYSTEM_FILE}\n  ${GRADING_FILE}`));
    process.exit(1);
  }
  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

  const tuneLog = loadLog();
  const runEntry = { startedAt: new Date().toISOString(), iterations: [] };

  try {
    await startServer();

    const baseline = await runEval();
    const baselineScore = score(baseline);

    const hasGroundTruth = baseline.rows.some(r =>
      !r.error && (r.actual?.psa != null || r.actual?.bgs?.overall != null)
    );

    if (!hasGroundTruth) {
      log(yellow('No ground-truth cards in dataset yet.'));
      log(yellow('Add cards to eval/dataset/ — each needs photos and a truth.json with actual PSA/BGS grades.'));
      log(yellow('The tuner is ready and will run automatically once you have cards.'));
      return;
    }

    log(`Baseline score: ${bold(baselineScore.toFixed(1))}`);

    let currentScore = baselineScore;
    let currentSystem  = readFileSync(SYSTEM_FILE, 'utf8');
    let currentGrading = readFileSync(GRADING_FILE, 'utf8');

    // Preserve the JSON schema section — tuner only touches the instruction half
    const schemaMarker = 'Return ONLY raw JSON';
    const schemaIdx = currentGrading.indexOf(schemaMarker);
    const schemaSection = schemaIdx >= 0 ? '\n\n' + currentGrading.slice(schemaIdx) : '';

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      console.log(bold(`\n── Iteration ${i + 1} / ${MAX_ITERATIONS} ──`));

      const evalResult = i === 0 ? baseline : await runEval();
      const failures = buildFailureReport(evalResult);

      if (!failures) {
        log(green('No failures — prompts are already accurate for this dataset!'));
        break;
      }

      const backupSystem  = currentSystem;
      const backupGrading = currentGrading;

      let improvement;
      try {
        improvement = await improvePrompts(currentSystem, currentGrading, failures, evalResult.report);
      } catch (err) {
        log(red(`Claude failed: ${err.message}`));
        break;
      }

      log(`Analysis: ${improvement.analysis}`);

      if (!improvement.newSystemPrompt && !improvement.newGradingInstructions) {
        log(yellow('Claude suggested no changes'));
        break;
      }

      // Write new prompts
      if (improvement.newSystemPrompt) {
        writeFileSync(SYSTEM_FILE, improvement.newSystemPrompt);
      }
      if (improvement.newGradingInstructions) {
        writeFileSync(GRADING_FILE, improvement.newGradingInstructions.trimEnd() + schemaSection);
      }

      // Restart server with new prompts
      stopServer();
      await sleep(1500);
      await startServer();

      const newResult = await runEval();
      const newScore  = score(newResult);

      log(`Score: ${currentScore.toFixed(1)} → ${bold(newScore.toFixed(1))}`);

      const kept = newScore >= currentScore;
      runEntry.iterations.push({
        iteration: i + 1,
        analysis: improvement.analysis,
        scoreBefore: currentScore,
        scoreAfter: newScore,
        kept,
      });

      if (kept) {
        log(green('Improved — keeping changes'));
        currentScore   = newScore;
        currentSystem  = readFileSync(SYSTEM_FILE, 'utf8');
        currentGrading = readFileSync(GRADING_FILE, 'utf8');
      } else {
        log(yellow('Score dropped — reverting'));
        writeFileSync(SYSTEM_FILE, backupSystem);
        writeFileSync(GRADING_FILE, backupGrading);
        currentSystem  = backupSystem;
        currentGrading = backupGrading;
        // Restart server back to the good prompts
        stopServer();
        await sleep(1500);
        await startServer();
      }
    }

    console.log(bold(`\nFinal score: ${currentScore.toFixed(1)} (baseline was ${baselineScore.toFixed(1)})`));

  } finally {
    stopServer();
    runEntry.finishedAt = new Date().toISOString();
    tuneLog.runs.push(runEntry);
    saveLog(tuneLog);
    log(`Log saved → eval/tune-log.json`);
  }
}

process.on('SIGINT',  () => { stopServer(); process.exit(0); });
process.on('SIGTERM', () => { stopServer(); process.exit(0); });

main().catch(e => {
  console.error(red('Fatal:'), e.message);
  stopServer();
  process.exit(1);
});
