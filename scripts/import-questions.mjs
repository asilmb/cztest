// Converts the exam export (questions/source/questions.json) into the trainer's format (questions/questions.json).
// Source item: { id, section, case, text, options: [string], correct: [index] }; `case` is the id of a
// case study shared by several questions. Case texts, when available, go in questions/source/cases.json
// as { "<case id>": "text" } or { "<case id>": { "cs": "...", "ru": "..." } } and are shown above each of its questions.
// Usage: node scripts/import-questions.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = JSON.parse(readFileSync(join(root, 'questions', 'source', 'questions.json'), 'utf8'));
const casesPath = join(root, 'questions', 'source', 'cases.json');
const cases = existsSync(casesPath) ? JSON.parse(readFileSync(casesPath, 'utf8')) : {};

const out = src.map(q => {
  const item = {
    id: String(q.id),
    category: q.section,
    type: q.case ? 'situation' : (q.correct.length > 1 ? 'multi' : 'single'),
  };
  if (q.case) {
    item.case = String(q.case);
    if (cases[q.case]) item.scenario = cases[q.case];
  }
  item.question = q.text;
  item.options = q.options;
  item.correct = q.correct;
  return item;
});

writeFileSync(join(root, 'questions', 'questions.json'), JSON.stringify(out, null, 1) + '\n');
const missing = new Set(out.filter(q => q.case && !q.scenario).map(q => q.case));
console.log(`Imported ${out.length} questions` + (missing.size ? `; ${missing.size} case studies have no text in questions/source/cases.json` : ''));
