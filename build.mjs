// Builds dist/cesky-trenazer.html — one self-contained page that is published as the artifact.
// Usage: node build.mjs [path/to/questions.json] [--snapshot state.json]
//   --snapshot embeds { progress, run } (the artifact's quiz/progress and quiz/run documents) so the page opens there.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : null; };
const snapPath = flag('--snapshot');
const qPath = args[0] || join(root, 'questions', 'questions.json');
const out = join(root, 'dist', 'cesky-trenazer.html');

const questions = JSON.parse(readFileSync(qPath, 'utf8'));
validate(questions);

// Same encoding and token handling as renderPage() in src/app.js — keep them in step.
const TOK_PAGE = '"@@PAGE@@"', TOK_SNAP = '@@SNAPSHOT@@';
const jsonForScript = v => JSON.stringify(v).replace(/</g, '\\u003c');

const snapshot = snapPath ? JSON.parse(readFileSync(snapPath, 'utf8')) : null;
const app = readFileSync(join(root, 'src', 'app.js'), 'utf8')
  .replace('/*@QUESTIONS*/[]', () => jsonForScript(questions))
  .replace('/*@SKELETON_HEAD*/""', () => jsonForScript(readFileSync(join(root, 'src', 'skeleton-head.html'), 'utf8')))
  .replace('/*@PAGE*/""', () => TOK_PAGE);
const page = readFileSync(join(root, 'src', 'template.html'), 'utf8')
  .replace('/*@STYLES*/', () => readFileSync(join(root, 'src', 'styles.css'), 'utf8'))
  .replace('/*@APP*/', () => app)
  .replace('/*@SNAPSHOT*/', () => TOK_SNAP);
for (const tok of [TOK_PAGE, TOK_SNAP]) if (page.split(tok).length !== 2) { console.error(`build: token ${tok} must occur exactly once`); process.exit(1); }
const html = page.replace(TOK_SNAP, () => jsonForScript(snapshot)).replace(TOK_PAGE, () => jsonForScript(page));

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`Built ${out} — ${questions.length} questions${snapshot ? ', with progress snapshot' : ''}, ${(html.length / 1024).toFixed(1)} KiB`);

function validate(qs) {
  if (!Array.isArray(qs) || !qs.length) fail('questions.json must be a non-empty array');
  const ids = new Set();
  const text = (t, where) => {
    if (typeof t === 'string' && t.trim()) return;
    if (t && typeof t.cs === 'string' && t.cs.trim()) return;
    fail(`${where}: expected a string or { "cs": "...", "ru": "..." }`);
  };
  qs.forEach((q, n) => {
    const at = `question #${n + 1} (${q?.id ?? 'no id'})`;
    if (!q.id || typeof q.id !== 'string') fail(`${at}: missing string "id"`);
    if (ids.has(q.id)) fail(`${at}: duplicate id`);
    ids.add(q.id);
    if (!q.category) fail(`${at}: missing "category"`);
    if (q.type && !['single', 'multi', 'situation'].includes(q.type)) fail(`${at}: "type" must be single, multi or situation`);
    text(q.question, `${at} question`);
    if (q.scenario) text(q.scenario, `${at} scenario`);
    if (q.explanation) text(q.explanation, `${at} explanation`);
    if (!Array.isArray(q.options) || q.options.length < 2) fail(`${at}: needs at least 2 options`);
    q.options.forEach((o, i) => text(o, `${at} option ${i}`));
    if (!Array.isArray(q.correct) || !q.correct.length) fail(`${at}: "correct" must list at least one option index`);
    q.correct.forEach(i => { if (!Number.isInteger(i) || i < 0 || i >= q.options.length) fail(`${at}: correct index ${i} is out of range`); });
    if (new Set(q.correct).size !== q.correct.length) fail(`${at}: duplicate index in "correct"`);
    if (q.type === 'single' && q.correct.length !== 1) fail(`${at}: type "single" needs exactly one correct index`);
  });
}
function fail(msg) { console.error(`questions.json: ${msg}`); process.exit(1); }
