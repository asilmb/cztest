// Converts the exam export (questions/source/questions.json) into the trainer's format (questions/questions.json).
// Source item: { id, section, case, text, options: [string], correct: [index] }; `case` is the id of a
// case study shared by several questions. Case texts, when available, go in questions/source/cases.json
// as { "<case id>": "text" } or { "<case id>": { "cs": "...", "ru": "..." } } and are shown above each of its questions.
// Topics come from questions/source/topics.json ({ "<question id>": "<topic key>" }); a question without
// one falls back to its exam section. Questions are written in topic order, which is the order of the
// category chips in the app.
// Usage: node scripts/import-questions.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = JSON.parse(readFileSync(join(root, 'questions', 'source', 'questions.json'), 'utf8'));
const casesPath = join(root, 'questions', 'source', 'cases.json');
const cases = existsSync(casesPath) ? JSON.parse(readFileSync(casesPath, 'utf8')) : {};
const topicsPath = join(root, 'questions', 'source', 'topics.json');
const topics = existsSync(topicsPath) ? JSON.parse(readFileSync(topicsPath, 'utf8')) : {};

const TOPICS = {
  regulace: 'Участники рынка и надзор ČNB',
  informace: 'Информирование и реклама',
  smlouva: 'Договор о потребкредите',
  uveruschopnost: 'Кредитоспособность и реестры',
  matematika: 'Финансовая математика и RPSN',
  produkty: 'Кредитные продукты',
  nemovitosti: 'Недвижимость и обеспечение',
  pravo: 'Гражданское право и споры',
  pojisteni: 'Страхование',
  ostatni: 'Налоги, AML и персональные данные',
};
const order = Object.keys(TOPICS);

const out = src.map(q => {
  const item = {
    id: String(q.id),
    category: TOPICS[topics[q.id]] || q.section,
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

const rank = q => { const i = order.indexOf(topics[q.id]); return i < 0 ? order.length : i; };
out.sort((a, b) => rank(a) - rank(b) || Number(a.id) - Number(b.id));
writeFileSync(join(root, 'questions', 'questions.json'), JSON.stringify(out, null, 1) + '\n');
const unknown = out.filter(q => !TOPICS[topics[q.id]]).length;
if (unknown) console.warn(`${unknown} questions have no topic in questions/source/topics.json and keep their exam section`);
const counts = {}; out.forEach(q => counts[q.category] = (counts[q.category] || 0) + 1);
console.table(counts);
const missing = new Set(out.filter(q => q.case && !q.scenario).map(q => q.case));
console.log(`Imported ${out.length} questions` + (missing.size ? `; ${missing.size} case studies have no text in questions/source/cases.json` : ''));
