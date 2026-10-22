// Builds dist/cesky-trenazer.html (published as the Claude artifact) and docs/index.html (served by GitHub Pages).
// Usage: node build.mjs [path/to/questions.json] [--snapshot state.json]
//   --snapshot embeds { progress, run } (the artifact's quiz/progress and quiz/run documents) so the page opens there.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : null; };
const snapPath = flag('--snapshot');
const qPath = args[0] || join(root, 'questions', 'questions.json');

const questions = JSON.parse(readFileSync(qPath, 'utf8'));
validate(questions);

// Same encoding and token handling as renderPage() in src/app.js — keep them in step.
const TOK_PAGE = '"@@PAGE@@"', TOK_SNAP = '@@SNAPSHOT@@';
const jsonForScript = v => JSON.stringify(v).replace(/</g, '\\u003c');

const snapshot = snapPath ? JSON.parse(readFileSync(snapPath, 'utf8')) : null;
const config = existsSync(join(root, 'config.json')) ? JSON.parse(readFileSync(join(root, 'config.json'), 'utf8')) : {};
const skeletonHead = readFileSync(join(root, 'src', 'skeleton-head.html'), 'utf8');

// Artifact build: the artifact service adds the document skeleton itself; the page can republish
// itself with a progress snapshot, so it carries its own source (PAGE).
const artifact = assemble('artifact');
if (artifact.split(TOK_PAGE).length !== 2 || artifact.split(TOK_SNAP).length !== 2) { console.error('build: PAGE/SNAPSHOT tokens must occur exactly once'); process.exit(1); }
write(join(root, 'dist', 'cesky-trenazer.html'), artifact.replace(TOK_SNAP, () => jsonForScript(snapshot)).replace(TOK_PAGE, () => jsonForScript(artifact)));

// GitHub Pages build: a full document that keeps its progress in the Google Sheet behind config.appsScriptUrl.
const pages = assemble('pages').replace(TOK_SNAP, 'null').replace(TOK_PAGE, '""');
write(join(root, 'docs', 'index.html'), skeletonHead + pages + '\n</body></html>\n');
if (!config.appsScriptUrl) console.warn('config.json has no "appsScriptUrl": the GitHub Pages build keeps progress only in each browser.');

function assemble(target) {
  const app = readFileSync(join(root, 'src', 'app.js'), 'utf8')
    .replace('/*@QUESTIONS*/[]', () => jsonForScript(questions))
    .replace('/*@SKELETON_HEAD*/""', () => target === 'artifact' ? jsonForScript(skeletonHead) : '""')
    .replace('/*@TARGET*/"artifact"', () => JSON.stringify(target))
    .replace('/*@REMOTE_URL*/""', () => jsonForScript(target === 'pages' ? (config.appsScriptUrl || '') : ''))
    .replace('/*@PAGE*/""', () => TOK_PAGE);
  return readFileSync(join(root, 'src', 'template.html'), 'utf8')
    .replace('/*@STYLES*/', () => readFileSync(join(root, 'src', 'styles.css'), 'utf8'))
    .replace('/*@APP*/', () => app)
    .replace('/*@SNAPSHOT*/', () => TOK_SNAP);
}
function write(file, html) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  console.log(`Built ${file} — ${questions.length} questions, ${(html.length / 1024).toFixed(1)} KiB`);
}

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
