// Builds dist/cesky-trenazer.html — one self-contained page that is published as the artifact.
// Usage: node build.mjs [path/to/questions.json]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const qPath = process.argv[2] || join(root, 'questions', 'questions.json');
const out = join(root, 'dist', 'cesky-trenazer.html');

const questions = JSON.parse(readFileSync(qPath, 'utf8'));
validate(questions);

const json = JSON.stringify(questions).replace(/</g, '\\u003c');
const app = readFileSync(join(root, 'src', 'app.js'), 'utf8').replace('/*@QUESTIONS*/[]', () => json);
const css = readFileSync(join(root, 'src', 'styles.css'), 'utf8');
const html = readFileSync(join(root, 'src', 'template.html'), 'utf8')
  .replace('/*@STYLES*/', () => css)
  .replace('/*@APP*/', () => app);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`Built ${out} — ${questions.length} questions, ${(html.length / 1024).toFixed(1)} KiB`);

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
