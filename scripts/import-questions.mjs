// Converts the exam export into the trainer's format (questions/questions.json).
//   questions/source/questions.json  [{ id, section, case, text, options, correct }] — `case` is the id of
//                                    the case study a question belongs to (section "Dovednosti")
//   questions/source/cases.json      [{ id, section, text }] — the case study texts
//   questions/source/topics.json     [{ section, key, cs, ru }] — topics, in the order the app lists them
//   questions/source/assign.json     { questions: { <question id>: <topic key> }, cases: { <case id>: <topic key> } }
//   questions/source/ru.json         optional Russian translations: { questions: { <id>: { question, options[] } },
//                                    cases: { <case id>: text } } — shown by the CZ/RU switch
// A case-study question takes its case's topic. Usage: node scripts/import-questions.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = name => JSON.parse(readFileSync(join(root, 'questions', 'source', name), 'utf8'));
const src = read('questions.json');
const topics = read('topics.json');
const assign = read('assign.json');
// the export lost paragraph breaks ("…4+1.Kupní cena…"); put them back so the case reads in paragraphs
const paragraphs = text => text.replace(/([.!?:])(?=[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽА-ЯЁ])/g, '$1\n').trim();
const cases = Object.fromEntries(read('cases.json').map(c => [String(c.id), paragraphs(c.text)]));
const ru = existsSync(join(root, 'questions', 'source', 'ru.json')) ? read('ru.json') : { questions: {}, cases: {} };
const both = (cs, tr) => (tr ? { cs, ru: tr } : cs);   // a plain string when there is no translation
const topicByKey = Object.fromEntries(topics.map(t => [t.key, t]));
const order = topics.map(t => t.key);

const problems = [];
const out = src.map(q => {
  const id = String(q.id);
  const caseId = q.case ? String(q.case) : null;
  const key = caseId ? assign.cases[caseId] : assign.questions[id];
  const topic = topicByKey[key];
  if (!topic) problems.push(`question ${id}: no topic`);
  if (caseId && !cases[caseId]) problems.push(`question ${id}: case ${caseId} has no text`);
  const item = {
    id,
    category: topic ? topic.ru : q.section,
    section: q.section,
    type: caseId ? 'situation' : (q.correct.length > 1 ? 'multi' : 'single'),
  };
  const tr = ru.questions[id];
  if (tr && tr.options.length !== q.options.length) problems.push(`question ${id}: translation has ${tr.options.length} options`);
  if (caseId) { item.case = caseId; item.scenario = both(cases[caseId] || '', ru.cases[caseId] && paragraphs(ru.cases[caseId])); }
  item.question = both(q.text, tr && tr.question);
  item.options = q.options.map((o, i) => both(o, tr && tr.options[i]));
  item.correct = q.correct;
  item.topic = key;
  return item;
});
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }

const rank = q => order.indexOf(q.topic);
out.sort((a, b) => rank(a) - rank(b) || Number(a.case || 0) - Number(b.case || 0) || Number(a.id) - Number(b.id));
out.forEach(q => delete q.topic);
writeFileSync(join(root, 'questions', 'questions.json'), JSON.stringify(out, null, 1) + '\n');
const counts = {}; out.forEach(q => counts[q.category] = (counts[q.category] || 0) + 1);
console.log(`Imported ${out.length} questions, ${Object.keys(cases).length} case studies; Russian: ${out.filter(q => typeof q.question === 'object').length} questions, ${Object.keys(ru.cases).length} cases`);
console.table(counts);
