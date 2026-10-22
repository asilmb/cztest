(() => {
'use strict';

/* ---------- question bank (inlined by build.mjs from questions/questions.json) ---------- */
const QUESTIONS = /*@QUESTIONS*/[];

const MASTERED_STREAK = 2;      // correct answers in a row that mark a question as learned
const HISTORY_LIMIT = 300;      // finished runs kept in the shared document
const COUNT_MIN = 10, COUNT_MAX = 100;

/* ---------- self-snapshot: the page carries the latest shared state inside itself ----------
   PAGE is this page's own source with two tokens (filled in by build.mjs); SKELETON_HEAD is the
   document head the artifact service wraps every page in. Together they let the owner's view
   republish the page with the current progress embedded, so views without the shared database
   (signed out, or the page opened outside the claude.ai viewer) still open where you stopped. */
const PAGE = /*@PAGE*/"";
const SKELETON_HEAD = /*@SKELETON_HEAD*/"";
const TOK_PAGE = '"@@' + 'PAGE@@"', TOK_SNAP = '@@' + 'SNAPSHOT@@';
const jsonForScript = v => JSON.stringify(v).replace(/</g, '\\u003c');
const renderPage = snapJson => PAGE.replace(TOK_SNAP, () => snapJson).replace(TOK_PAGE, () => jsonForScript(PAGE));
const EMBEDDED = (() => { try { return JSON.parse(document.getElementById('cz-snapshot')?.textContent || 'null'); } catch { return null; } })();
const stampOf = st => st ? Math.max(st.progress?.updatedAt || 0, st.run?.updatedAt || 0) : 0;
const newest = (...states) => states.filter(x => x && (x.progress || x.run)).sort((a, b) => stampOf(b) - stampOf(a))[0] || null;

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const T = t => typeof t === 'string' ? { cs: t, ru: '' } : { cs: t?.cs || '', ru: t?.ru || '' };
const tx = (t, cls = '') => { const { cs, ru } = T(t); return `<span class="t ${cls}"><span class="cs">${esc(cs)}</span>${ru ? `<span class="ru" lang="ru">${esc(ru)}</span>` : ''}</span>`; };
const L = (cs, ru) => esc(ru);   // interface text is Russian; only questions are bilingual
const clone = o => JSON.parse(JSON.stringify(o));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sameSet = (a, b) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };
const fmtDate = t => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'numeric' });
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : (a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many); };
const nQ = n => `${n} ${plural(n, 'вопрос', 'вопроса', 'вопросов')}`;

const ICON = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  cross: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  soundOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/></svg>',
  soundOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
};

/* ---------- questions ---------- */
const kindOf = q => q.type === 'situation' || q.scenario ? 'situation' : (q.correct.length > 1 || q.type === 'multi' ? 'multi' : 'single');
const QS = QUESTIONS.map(q => ({ ...q, correct: [...q.correct].sort((a, b) => a - b) })).map(q => ({ ...q, kind: kindOf(q) }));
const QMAP = Object.fromEntries(QS.map(q => [q.id, q]));
const CATS = [...new Set(QS.map(q => q.category))];
const KINDS = [
  { id: 'single', cs: 'Jedna odpověď', ru: 'Один ответ' },
  { id: 'multi', cs: 'Více odpovědí', ru: 'Несколько ответов' },
  { id: 'situation', cs: 'Situace', ru: 'Ситуации' },
];
const HINT_EASY = 'У каждого вопроса написано, сколько в нём правильных ответов. Ответ засчитывается сразу: в вопросе с одним ответом — по первому нажатию, с несколькими — как только отмечено нужное число вариантов.';
const HINT_HARD = 'Не видно, сколько ответов правильные. Отметьте все варианты, которые считаете верными, и нажмите «Ответить».';
const MODES = {
  snowball: { cs: 'Sněhová koule', ru: 'Снежный ком',
    dcs: 'Projede všechny otázky bez ohledu na výsledky. Přednost mají ty, které jste viděli nejméně.',
    dru: 'Прокатывается по всем вопросам без оглядки на результаты. В приоритете те, что встречались реже всего.' },
  errors: { cs: 'Oprava chyb', ru: 'Работа над ошибками',
    dcs: 'Jen otázky, ve kterých jste někdy chybovali. Nejčastěji přijdou ty, které vám jdou nejhůř.',
    dru: 'Только вопросы, в которых вы ошибались. Чаще всего попадаются самые трудные для вас.' },
  review: { cs: 'Opakování', ru: 'Заучивание',
    dcs: 'Upevňuje otázky, které už vám jdou. Nejdřív ty, které jste nejdéle neviděli.',
    dru: 'Закрепляет вопросы, которые уже получаются. Сначала те, что вы давно не видели.' },
};

/* ---------- state ---------- */
const emptyProgress = () => ({ v: 1, q: {}, history: [], updatedAt: 0 });
const emptyRun = () => ({ active: false, updatedAt: 0 });
const DEFAULT_CFG = { cats: [], kinds: [], mode: 'snowball', hard: false, count: 20 };
const prefs = Object.assign({ sound: true, ru: false }, lsGet('cztest:prefs') || {});
prefs.cfg = Object.assign({}, DEFAULT_CFG, prefs.cfg || {});
prefs.cfg.cats = prefs.cfg.cats.filter(c => CATS.includes(c));
if (!MODES[prefs.cfg.mode]) prefs.cfg.mode = 'snowball';
const S = {
  progress: emptyProgress(),
  run: emptyRun(),
  screen: 'setup',
  sel: [],               // current selection before answering (saved into the run after a short pause)
  confirm: null,         // which inline confirmation is open
  resetText: '',
};
const savePrefs = () => lsSet('cztest:prefs', prefs);

/* ---------- Google Sheets backend (GitHub Pages build) ----------
   An Apps Script web app (apps-script/Code.gs) keeps the two documents in a spreadsheet.
   GET returns { progress, run }; POST { key, data } stores one of them unless the sheet already
   holds a newer copy, in which case it answers { stale: true, [key]: newer }. */
const TARGET = /*@TARGET*/"artifact";
const REMOTE_URL = /*@REMOTE_URL*/"";
const REMOTE_POLL_MS = 15000;
async function fetchJson(url, opts = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch(url, { ...opts, signal: ctl.signal, redirect: 'follow', cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const body = await res.json();
    if (body && body.error) throw new Error(body.error);
    return body;
  } finally { clearTimeout(timer); }
}
const remote = {
  get: () => fetchJson(REMOTE_URL + (REMOTE_URL.includes('?') ? '&' : '?') + 't=' + Date.now()),
  // text/plain body keeps this a "simple" request, so the browser sends no CORS preflight Apps Script can't answer
  post: (key, data) => fetchJson(REMOTE_URL, { method: 'POST', body: JSON.stringify({ key, data }) }),
};

/* ---------- storage: shared progress when reachable, this device otherwise ---------- */
const store = {
  mode: 'connecting',    // connecting | shared | readonly | local
  reason: '',            // why the view is not shared: nodb | nowrite | remote | noconfig
  backend: '',           // db | remote
  db: null, refs: {}, unsubs: [], writing: {}, again: {}, seen: {}, dirty: {}, newer: {}, pollTimer: null,

  async init() {
    const mirror = lsGet('cztest:mirror');
    const local = lsGet('cztest:local');
    const start = newest(mirror, EMBEDDED);
    if (start) { S.progress = start.progress || S.progress; S.run = start.run || S.run; S.sel = S.run.sel || []; }
    let db = null;
    try { db = window.claude?.use ? await window.claude.use('db') : null; } catch { db = null; }
    if (!db && TARGET === 'pages') return this.initRemote(local, mirror);
    if (!db) { this.reason = 'nodb'; return this.useLocal(newest(local, mirror, EMBEDDED)); }
    this.backend = 'db';
    let canWrite = null, user = null;
    try { user = await window.claude.use('user'); canWrite = user ? await user.can('data.write') : null; } catch { canWrite = null; }
    this.db = db;
    this.refs.progress = db.doc('quiz/progress');
    this.refs.run = db.doc('quiz/run');
    if (canWrite === false) {
      // read-only viewer: continue from whichever is newer, the shared state or this device's own copy
      let shared = null;
      try { const [p, r] = await Promise.all([this.refs.progress.get(), this.refs.run.get()]); shared = { progress: p.exists ? p.data() : null, run: r.exists ? r.data() : null }; } catch { shared = null; }
      const own = newest(local, EMBEDDED);
      this.reason = 'nowrite';
      if (own && stampOf(own) > stampOf(shared)) return this.useLocal(own);
    }
    this.mode = canWrite === false ? 'readonly' : 'shared';
    if (this.mode === 'shared') snapshot.init(user);
    for (const key of ['progress', 'run']) {
      this.unsubs.push(this.refs[key].onSnapshot(snap => this.onSnap(key, snap), () => this.useLocalFromCurrent()));
    }
    renderChrome();
  },

  async initRemote(local, mirror) {
    if (!REMOTE_URL) { this.reason = 'noconfig'; return this.useLocal(newest(local, mirror)); }
    let data;
    try { data = await remote.get(); }
    catch { this.reason = 'remote'; return this.useLocal(newest(local, mirror)); }
    this.backend = 'remote';
    this.mode = 'shared';
    this.applyRemote(data);
    const poll = async () => {
      clearTimeout(this.pollTimer);
      if (document.visibilityState === 'visible' && this.mode === 'shared') {
        for (const key of ['progress', 'run']) if (this.dirty[key] && !this.writing[key]) { this.dirty[key] = false; this.flush(key); }
        try { this.applyRemote(await remote.get()); } catch { /* offline for now; try again on the next tick */ }
      }
      this.pollTimer = setTimeout(poll, REMOTE_POLL_MS);
    };
    this.pollTimer = setTimeout(poll, REMOTE_POLL_MS);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') poll(); });
    renderChrome();
  },

  applyRemote(data) {
    for (const key of ['progress', 'run']) {
      const d = data && data[key];
      this.onSnap(key, { exists: !!d, data: () => d });
    }
  },

  useLocal(local) {
    this.unsubs.forEach(u => { try { u(); } catch { /* already closed */ } });
    this.unsubs = [];
    clearTimeout(this.pollTimer);
    if (local) { S.progress = clone(local.progress || emptyProgress()); S.run = clone(local.run || emptyRun()); S.sel = S.run.sel || []; }
    this.mode = 'local';
    this.persistLocal();
    if (S.run.active && !S.run.finished) S.screen = 'quiz';
    renderChrome(); render();
  },

  onSnap(key, snap) {
    if (this.mode === 'local') return;
    const d = snap.exists ? snap.data() : null;
    const first = !this.seen[key];
    this.seen[key] = true;
    const cur = key === 'progress' ? S.progress : S.run;
    if (first && this.dirty[key] && (cur.updatedAt || 0) > (d?.updatedAt || 0)) {
      // answered while still connecting: push the newer local state instead of dropping it
      this.dirty[key] = false;
      if (this.mode === 'shared') this.flush(key); else this.useLocalFromCurrent();
      return;
    }
    if (!d) { if (first) { S[key] = key === 'progress' ? emptyProgress() : emptyRun(); } else return; }
    else if (first || (d.updatedAt || 0) >= (cur.updatedAt || 0)) {
      if (this.writing[key] && !first) return;   // our own newer write is on its way
      S[key] = clone(d);
    } else return;
    lsSet('cztest:mirror', { progress: S.progress, run: S.run });
    onRemoteChange(key, first);
  },

  save(key) {
    const obj = key === 'progress' ? S.progress : S.run;
    obj.updatedAt = Date.now();
    if (this.mode === 'readonly') { this.useLocalFromCurrent(); return; }
    if (this.mode === 'connecting') { this.dirty[key] = true; lsSet('cztest:mirror', { progress: S.progress, run: S.run }); return; }
    if (this.mode === 'local') { this.persistLocal(); return; }
    lsSet('cztest:mirror', { progress: S.progress, run: S.run });
    this.flush(key);
  },

  async flush(key) {
    if (this.writing[key]) { this.again[key] = true; return; }
    this.writing[key] = true;
    try {
      do {
        this.again[key] = false;
        await this.write(key);
      } while (this.again[key]);
    } catch (e) {
      if (this.backend === 'remote') { this.dirty[key] = true; toast('Нет связи с общим прогрессом. Повторю сохранение автоматически.'); }
      else if (e?.code === 'invalid_argument' || e?.code === 'not_granted' || e?.code === 'revoked' || e?.code === 'capability_disabled') { this.reason = this.reason || 'nowrite'; this.useLocalFromCurrent(); }
      else toast('Не удалось сохранить. Попробуйте ещё раз.');
    } finally { this.writing[key] = false; }
    if (this.newer[key]) {
      // the sheet held a newer copy than ours: take it, as if it had arrived by polling
      const d = this.newer[key]; this.newer[key] = null;
      this.onSnap(key, { exists: true, data: () => d });
    }
  },

  async write(key) {
    const data = clone(key === 'progress' ? S.progress : S.run);
    if (this.backend === 'remote') {
      const res = await remote.post(key, data);
      if (res && res.stale && res[key]) this.newer[key] = res[key];
      return;
    }
    try { await this.refs[key].set(data); }
    catch (e) {
      if (e?.code !== 'unavailable') throw e;
      await new Promise(r => setTimeout(r, 600 + Math.random() * 900));
      await this.refs[key].set(data);
    }
  },

  useLocalFromCurrent() {
    this.unsubs.forEach(u => { try { u(); } catch { /* already closed */ } });
    this.unsubs = [];
    clearTimeout(this.pollTimer);
    this.mode = 'local';
    this.persistLocal();
    render();
  },

  persistLocal() { lsSet('cztest:local', { progress: S.progress, run: S.run }); },
};

/* Owner/editor views republish the page with the current state embedded when they go to the
   background, so the link opens at the latest point even where the database is unreachable. */
const snapshot = {
  artifact: null, busy: false,
  async init(user) {
    try {
      if (!user || !(await user.canEdit())) return;
      this.artifact = await window.claude.use('artifact');
    } catch { this.artifact = null; }
    if (!this.artifact || !PAGE || !SKELETON_HEAD) return;
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.publish(); });
    window.addEventListener('pagehide', () => this.publish());
  },
  async publish() {
    if (!this.artifact || this.busy || store.mode !== 'shared') return;
    const state = { progress: S.progress, run: S.run };
    if (stampOf(state) <= stampOf(EMBEDDED)) return;
    this.busy = true;
    try {
      const content = renderPage(jsonForScript(state));
      await this.artifact.publish(SKELETON_HEAD + content + '\n</body></html>');
    } catch { /* conflict, rate limit or no permission: the shared database still holds the state */ }
    finally { this.busy = false; }
  },
};

function onRemoteChange(key, first) {
  if (key === 'run') {
    if (first && S.run.active && !S.run.finished) S.screen = 'quiz';
    const sig = runSig();
    if (sig !== S.lastRunSig || first) { S.lastRunSig = sig; S.sel = S.run.sel || []; if (S.screen !== 'stats') render(); }
  } else if (S.screen !== 'quiz' || first) render();
  renderChrome();
}
const runSig = () => { const r = S.run; return r.active ? `${r.id}:${r.pos}:${r.order.length}:${(r.log || []).filter(Boolean).length}:${r.finished}` : 'none'; };

/* ---------- per-question statistics ---------- */
const st = id => S.progress.q[id];
function statusOf(id) {
  const s = st(id);
  if (!s || !s.s) return 'new';
  if (s.k >= MASTERED_STREAK) return 'done';
  if (s.w > 0) return 'err';
  return 'learn';
}
function record(id, ok) {
  const s = S.progress.q[id] || (S.progress.q[id] = { s: 0, r: 0, w: 0, k: 0, t: 0 });
  s.s++; s.t = Date.now();
  if (ok) { s.r++; s.k++; } else { s.w++; s.k = 0; }
}
const difficulty = s => (1 + 2 * s.w) / (1 + s.r) * (s.k >= MASTERED_STREAK ? 0.2 : 1);

/* ---------- picking questions for a run ---------- */
function filtered(cfg) {
  return QS.filter(q => (!cfg.cats.length || cfg.cats.includes(q.category)) && (!cfg.kinds.length || cfg.kinds.includes(q.kind)));
}
function poolFor(mode, list) {
  if (mode === 'errors') return list.filter(q => (st(q.id)?.w || 0) > 0);
  if (mode === 'review') return list.filter(q => (st(q.id)?.r || 0) > 0);
  return list;
}
function pick(mode, list, n) {
  const pool = poolFor(mode, list);
  let ranked;
  if (mode === 'errors') {
    // weighted sampling without replacement: the harder a question is for you, the likelier it comes up
    ranked = pool.map(q => [q.id, Math.pow(Math.random(), 1 / difficulty(st(q.id)))]).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  } else if (mode === 'review') {
    ranked = shuffle(pool.slice()).sort((a, b) => (st(a.id).t || 0) - (st(b.id).t || 0)).map(q => q.id);
  } else {
    ranked = shuffle(pool.slice()).sort((a, b) => (st(a.id)?.s || 0) - (st(b.id)?.s || 0)).map(q => q.id);
  }
  return shuffle(ranked.slice(0, n));
}
function countBounds(avail) {
  const max = Math.min(COUNT_MAX, avail);
  return { min: Math.min(COUNT_MIN, max), max };
}

/* ---------- run lifecycle ---------- */
function startRun() {
  const cfg = prefs.cfg;
  const list = filtered(cfg);
  const avail = poolFor(cfg.mode, list).length;
  if (!avail) return;
  const { min, max } = countBounds(avail);
  const ids = pick(cfg.mode, list, clamp(cfg.count, min, max));
  S.run = {
    active: true, id: Date.now().toString(36), startedAt: Date.now(), mode: cfg.mode, hard: cfg.hard,
    cats: cfg.cats.slice(), kinds: cfg.kinds.slice(), main: ids.length, order: ids, pos: 0, log: [],
    firstOk: 0, firstBad: 0, finished: false, updatedAt: 0,
  };
  S.sel = []; S.confirm = null; S.screen = 'quiz'; S.lastRunSig = runSig();
  store.save('run');
  render(); window.scrollTo(0, 0);
}
function currentQ() {
  const r = S.run;
  while (r.pos < r.order.length && !QMAP[r.order[r.pos]]) r.pos++;   // skip questions removed from the bank
  return r.pos < r.order.length ? QMAP[r.order[r.pos]] : null;
}
function submit() {
  const r = S.run, q = currentQ();
  if (!q || r.log[r.pos] || !S.sel.length) return;
  const picked = S.sel.slice().sort((a, b) => a - b);
  const ok = sameSet(picked, q.correct);
  r.log[r.pos] = { p: picked, ok };
  r.sel = [];
  clearTimeout(selTimer);
  if (r.pos < r.main) ok ? r.firstOk++ : r.firstBad++;
  if (!ok && !r.order.slice(r.pos + 1).includes(q.id)) r.order.push(q.id);   // ask again until answered correctly
  record(q.id, ok);
  playSound(ok);
  S.lastRunSig = runSig();
  store.save('run'); store.save('progress');
  render();
  if (!ok) $('.opts')?.classList.add('shake');
  $('.answer-bar')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function next() {
  const r = S.run;
  if (!r.log[r.pos]) return;
  r.pos++;
  S.sel = []; r.sel = [];
  if (!currentQ()) finishRun();
  S.lastRunSig = runSig();
  store.save('run');
  render(); window.scrollTo(0, 0);
}
function finishRun() {
  const r = S.run;
  r.finished = true;
  r.mainDone = r.log.slice(0, r.main).filter(Boolean).length;
  const h = S.progress.history;
  h.push({ t: Date.now(), mode: r.mode, n: r.mainDone, ok: r.firstOk, extra: r.order.length - r.main, hard: !!r.hard });
  if (h.length > HISTORY_LIMIT) h.splice(0, h.length - HISTORY_LIMIT);
  store.save('progress');
}
function discardRun() {
  S.run = emptyRun(); S.sel = []; S.confirm = null; S.lastRunSig = runSig();
  store.save('run');
}

/* ---------- sound ---------- */
let actx = null;
function playSound(ok) {
  if (!prefs.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const t0 = actx.currentTime;
    const notes = ok ? [[659.25, 0, .22], [987.77, .09, .3]] : [[196, 0, .22], [146.83, .13, .32]];
    for (const [f, d, len] of notes) {
      const o = actx.createOscillator(), g = actx.createGain(), lp = actx.createBiquadFilter();
      o.type = ok ? 'sine' : 'sawtooth';
      o.frequency.setValueAtTime(f, t0 + d);
      lp.type = 'lowpass'; lp.frequency.value = ok ? 4000 : 700;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(ok ? 0.22 : 0.18, t0 + d + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + len);
      o.connect(lp).connect(g).connect(actx.destination);
      o.start(t0 + d); o.stop(t0 + d + len + 0.05);
    }
  } catch { /* audio unavailable */ }
}

/* ---------- chrome (header) ---------- */
function renderChrome() {
  const app = $('#app');
  app.classList.toggle('show-ru', !!prefs.ru);
  $('#ru-switch').setAttribute('aria-checked', String(!!prefs.ru));
  const sb = $('#sound-btn');
  sb.setAttribute('aria-checked', String(!!prefs.sound));
  sb.innerHTML = prefs.sound ? ICON.soundOn : ICON.soundOff;
  sb.title = prefs.sound ? 'Звуки включены' : 'Звуки выключены';
  $('#brand-sub').textContent = `${nQ(QS.length)} · ${CATS.length} ${plural(CATS.length, 'категория', 'категории', 'категорий')}`;
  const onQuiz = S.screen !== 'stats';
  $('#tab-setup').setAttribute('aria-current', onQuiz ? 'page' : 'false');
  $('#tab-stats').setAttribute('aria-current', onQuiz ? 'false' : 'page');
  const pill = $('#store-pill');
  const labels = {
    connecting: ['Подключение…', 'Загружаю общий прогресс'],
    shared: ['Общий прогресс', store.backend === 'remote' ? 'Прогресс хранится в общей Google-таблице' : 'Прогресс видят и сохраняют все, кто открывает эту ссылку'],
    readonly: ['Общий прогресс · только чтение', 'Ваши ответы сохранятся только на этом устройстве'],
    local: ['Только это устройство', 'Прогресс сохраняется только в этом браузере'],
  };
  const [label, title] = labels[store.mode];
  pill.textContent = label; pill.title = title; pill.dataset.mode = store.mode;
}

/* ---------- views ---------- */
function localBanner() {
  if (S.bannerClosed || (store.mode !== 'local' && store.mode !== 'readonly')) return '';
  const texts = {
    nowrite: `<strong>У вашего аккаунта доступ только на просмотр.</strong>
      Вы видите общий прогресс, но ваши ответы сохраняются только в этом браузере.
      Чтобы отвечать в общий прогресс, владелец должен пригласить вас по email с правом редактирования (Editor).`,
    remote: `<strong>Нет связи с общим прогрессом.</strong>
      Google-таблица сейчас недоступна, поэтому ответы сохраняются только в этом браузере.
      Обновите страницу, когда появится интернет.`,
    noconfig: `<strong>Общий прогресс не подключён.</strong>
      В <b>config.json</b> не указан адрес веб-приложения Apps Script, поэтому ответы сохраняются только в этом браузере.`,
    nodb: `<strong>Прогресс сохраняется только в этом браузере.</strong>
      Общий прогресс доступен, только если открыть ссылку <b>claude.ai/artifact/…</b> после входа в аккаунт claude.ai.
      Здесь тест продолжается с последнего общего сохранения, но новые ответы в общий прогресс не попадут.`,
  };
  const text = texts[store.reason] || texts.nodb;
  return `<div class="notice" role="status"><div>${text}</div>
    <button type="button" class="notice-x" data-action="close-banner" aria-label="Скрыть">${ICON.cross}</button></div>`;
}

function render() {
  hideTip();
  renderChrome();
  const v = $('#view');
  const status = `<p class="store-line" data-mode="${store.mode}">${esc($('#store-pill').textContent)}</p>`;
  if (S.screen === 'stats') v.innerHTML = localBanner() + status + viewStats();
  else if (S.screen === 'quiz' && S.run.active) v.innerHTML = localBanner() + (S.run.finished ? viewResults() : viewQuiz());
  else { S.screen = 'setup'; v.innerHTML = localBanner() + status + viewSetup(); }
}

function viewSetup() {
  const cfg = prefs.cfg;
  const list = filtered(cfg);
  const avail = poolFor(cfg.mode, list).length;
  const { min, max } = countBounds(avail);
  const count = clamp(cfg.count, min, max);
  const r = S.run;
  const resume = r.active && !r.finished ? `
    <div class="card resume stack">
      <div>
        <p class="section-label">${L('Rozpracovaný test', 'Незавершённый тест')}</p>
        <h3>${esc(MODES[r.mode]?.ru || '')} · <span class="num">${Math.min(r.pos + 1, r.order.length)} / ${r.order.length}</span></h3>
        <p class="small muted">${r.hard ? 'Сложный уровень' : 'Лёгкий уровень'} · начат ${fmtDate(r.startedAt)}</p>
      </div>
      <div class="row">
        <button type="button" class="btn primary" data-action="resume">${L('Pokračovat', 'Продолжить')}</button>
        <button type="button" class="btn ghost sm" data-action="ask" data-what="discard">Удалить</button>
      </div>
      ${S.confirm === 'discard' ? `<div class="confirm"><span>${L('Opravdu zahodit rozpracovaný test? Odpovědi zůstanou ve statistice.', 'Точно удалить незавершённый тест? Ответы останутся в статистике.')}</span>
        <div class="row"><button type="button" class="btn danger sm" data-action="discard">Да, удалить</button><button type="button" class="btn ghost sm" data-action="ask" data-what="">Нет</button></div></div>` : ''}
    </div>` : '';

  const catChips = [`<button type="button" class="chip" data-action="cat" data-cat="" aria-pressed="${!cfg.cats.length}">${L('Všechny kategorie', 'Все категории')} <span class="count">${QS.length}</span></button>`]
    .concat(CATS.map(c => {
      const n = QS.filter(q => q.category === c).length;
      const done = QS.filter(q => q.category === c && statusOf(q.id) === 'done').length;
      return `<button type="button" class="chip" data-action="cat" data-cat="${esc(c)}" aria-pressed="${cfg.cats.includes(c)}">${esc(c)} <span class="count">${done}/${n}</span></button>`;
    })).join('');
  const kindChips = KINDS.map(k => `<button type="button" class="chip" data-action="kind" data-kind="${k.id}" aria-pressed="${!cfg.kinds.length || cfg.kinds.includes(k.id)}">${L(k.cs, k.ru)} <span class="count">${QS.filter(q => q.kind === k.id).length}</span></button>`).join('');

  const modeCards = Object.entries(MODES).map(([id, m]) => {
    const a = poolFor(id, list).length;
    return `<button type="button" class="mode" role="radio" data-action="mode" data-mode="${id}" aria-checked="${cfg.mode === id}">
      <span class="dot"></span><b>${L(m.cs, m.ru)}</b><span class="avail">${nQ(a)}</span>
      <span class="desc">${L(m.dcs, m.dru)}</span></button>`;
  }).join('');

  const emptyMsg = cfg.mode === 'errors' ? L('Zatím nemáte žádné chyby. Projeďte nejdřív sněhovou kouli.', 'Ошибок пока нет. Сначала пройдите «Снежный ком».')
    : cfg.mode === 'review' ? L('Zatím nemáte žádné zvládnuté otázky k opakování.', 'Пока нет освоенных вопросов для повторения.')
    : L('Výběru neodpovídá žádná otázka. Upravte kategorie nebo typy.', 'Под выбор не подходит ни один вопрос. Измените категории или типы.');
  const startLabel = r.active && !r.finished ? L('Začít nový test', 'Начать новый тест') : L('Začít test', 'Начать тест');

  return `
  <div class="grid-2">
    <div class="stack">
      ${resume}
      <section class="card stack">
        <div><p class="section-label">${L('Kategorie', 'Категории')}</p><div class="chips">${catChips}</div></div>
        <div><p class="section-label">${L('Typ otázek', 'Тип вопросов')}</p><div class="chips">${kindChips}</div></div>
      </section>
    </div>
    <div class="stack">
      <section class="card stack">
        <div><p class="section-label">${L('Režim', 'Режим')}</p><div class="modes" role="radiogroup">${modeCards}</div></div>
        <div>
          <p class="section-label label-row">${L('Obtížnost', 'Сложность')}
            <button type="button" class="hint-btn" data-action="hint" aria-expanded="${!!S.hintOpen}" aria-controls="level-hint" aria-label="Что означают уровни сложности">?</button></p>
          ${S.hintOpen ? `<div class="hint-panel" id="level-hint"><p><b>Лёгкий.</b> ${HINT_EASY}</p><p><b>Сложный.</b> ${HINT_HARD}</p></div>` : ''}
          <div class="seg" role="radiogroup">
            <button type="button" role="radio" data-action="hard" data-val="0" aria-checked="${!cfg.hard}">Лёгкий</button>
            <button type="button" role="radio" data-action="hard" data-val="1" aria-checked="${cfg.hard}">Сложный</button>
          </div>
          <p class="small muted" style="margin:8px 0 0">${cfg.hard
            ? L('', 'Не видно, сколько ответов правильные. Отмечаете варианты и нажимаете «Ответить».')
            : L('', 'Видно, сколько ответов правильные. Ответ засчитывается сразу по нажатию.')}</p>
        </div>
        <div>
          <p class="section-label">${L('Počet otázek', 'Количество вопросов')}</p>
          ${avail ? `<div class="count-row">
            <input type="range" id="count" min="${min}" max="${max}" step="1" value="${count}" ${min === max ? 'disabled' : ''} aria-label="Количество вопросов">
            <span class="count-val" id="count-val">${count}</span>
          </div>
          <p class="small muted" style="margin:6px 0 0">Доступно: ${nQ(avail)}${avail < COUNT_MIN ? ' — в тест попадут все' : ''}.</p>` : `<div class="empty">${emptyMsg}</div>`}
        </div>
        ${S.confirm === 'replace' ? `<div class="confirm"><span>${L('Nový test nahradí rozpracovaný. Pokračovat?', 'Новый тест заменит незавершённый. Продолжить?')}</span>
          <div class="row"><button type="button" class="btn danger sm" data-action="start-force">Да, начать новый</button><button type="button" class="btn ghost sm" data-action="ask" data-what="">Нет</button></div></div>` : ''}
        <button type="button" class="btn primary block" data-action="start" ${avail ? '' : 'disabled'}>${startLabel}</button>
      </section>
    </div>
  </div>`;
}

function viewQuiz() {
  const r = S.run, q = currentQ();
  if (!q) return viewResults();
  const entry = r.log[r.pos];
  const answered = !!entry;
  const inFix = r.pos >= r.main;
  const left = r.order.length - r.pos - (answered ? 1 : 0);
  const showKind = !r.hard;
  const nCorrect = q.correct.length;
  const multiUI = r.hard || q.correct.length > 1;
  const kindBadge = !showKind ? '' : q.correct.length > 1
    ? `<span class="badge kind">Несколько ответов · ${nCorrect} ${plural(nCorrect, 'правильный', 'правильных', 'правильных')}</span>`
    : `<span class="badge kind">Один правильный ответ</span>`;
  const sel = answered ? entry.p : S.sel;

  const opts = q.options.map((o, i) => {
    const picked = sel.includes(i), isCorrect = q.correct.includes(i);
    let cls = '', mark = String(i + 1), note = '';
    if (answered) {
      if (picked && isCorrect) { cls = 'is-ok'; mark = ICON.check; }
      else if (picked) { cls = 'is-bad'; mark = ICON.cross; note = 'Ваш ответ'; }
      else if (isCorrect) { cls = 'is-missed'; mark = ICON.check; note = 'Правильный ответ'; }
      else cls = 'is-dim';
    }
    return `<button type="button" class="opt ${cls}" data-action="opt" data-i="${i}" aria-pressed="${!answered && picked}" ${answered ? 'disabled' : ''}>
      <span class="mk ${multiUI ? 'square' : 'round'}">${mark}</span>
      <span>${tx(o)}${note ? `<span class="opt-note">${note}</span>` : ''}</span></button>`;
  }).join('');

  const last = r.pos + 1 >= r.order.length;
  const bar = answered
    ? `<div class="answer-bar ${entry.ok ? 'ok' : 'bad'}">
        <span class="verdict"><span class="vi">${entry.ok ? ICON.check : ICON.cross}</span><span><strong>${entry.ok ? 'Правильно!' : 'Неправильно'}</strong>${entry.ok ? '' : '<small>Вопрос повторится в этом тесте</small>'}</span></span>
        <button type="button" class="btn primary" data-action="next">${last ? 'Завершить' : 'Дальше'}</button></div>`
    : r.hard
      ? `<div class="answer-bar"><span class="pick-hint">Отметьте все правильные варианты</span><button type="button" class="btn primary" data-action="submit" ${S.sel.length ? '' : 'disabled'}>Ответить</button></div>`
      : q.correct.length > 1 ? `<div class="answer-bar"><span class="pick-hint" id="pick-hint">${pickHint(q)}</span></div>` : '';
  const explanation = answered && q.explanation ? `<div class="explain">${tx(q.explanation)}</div>` : '';
  const mainDone = Math.min(r.pos + (answered ? 1 : 0), r.main);

  return `
  <div class="quiz">
    <div class="qhead">
      <span class="pos">${inFix ? 'Исправление' : `${r.pos + 1} / ${r.main}`}</span>
      <span>${esc(MODES[r.mode]?.ru || '')} · ${r.hard ? 'сложный' : 'лёгкий'}</span>
      <span style="margin-left:auto" class="row">
        <span class="score ok" title="Верно с первой попытки">${ICON.check}${r.firstOk}</span>
        <span class="score bad" title="Ошибки">${ICON.cross}${r.firstBad}</span>
      </span>
    </div>
    <div class="pbar" aria-hidden="true"><i style="width:${pct(mainDone, r.main)}%"></i></div>
    ${inFix ? `<div class="phase">${L(`Oprava chyb: ${answered ? 'zbývá ještě' : 'zbývá'} ${left}. Test skončí, až všechny chyby opravíte.`, `Работа над ошибками: осталось ${left}. Тест закончится, когда все ошибки будут исправлены.`)}</div>` : ''}
    <div class="badges"><span class="badge">${esc(q.category)}</span>${q.kind === 'situation' ? '<span class="badge">Ситуация</span>' : ''}${kindBadge}</div>
    ${q.scenario ? `<div class="scenario">${tx(q.scenario)}</div>` : ''}
    <h2 class="qtext">${tx(q.question)}</h2>
    <div class="opts">${opts}</div>
    ${bar}
    ${explanation}
    <div class="row" style="justify-content:space-between">
      <span class="kbd-hint">Клавиши 1–${q.options.length} выбирают ответ, Enter — дальше.</span>
      <span class="row" style="gap:16px"><button type="button" class="link-btn small" data-action="goto-setup">Выбор теста</button>
      <button type="button" class="link-btn small" data-action="ask" data-what="end">Завершить тест</button></span>
    </div>
    ${S.confirm === 'end' ? `<div class="confirm"><span>${L('Ukončit test? Dosavadní odpovědi zůstanou ve statistice.', 'Завершить тест? Ответы останутся в статистике.')}</span>
      <div class="row"><button type="button" class="btn danger sm" data-action="end">Да, завершить</button><button type="button" class="btn ghost sm" data-action="ask" data-what="">Нет</button></div></div>` : ''}
  </div>`;
}

function viewResults() {
  const r = S.run;
  const n = r.mainDone ?? r.main;
  const score = pct(r.firstOk, n);
  const wrongIds = [...new Set(r.order.slice(0, r.main).filter((id, i) => r.log[i] && !r.log[i].ok))];
  const list = wrongIds.map(id => QMAP[id]).filter(Boolean);
  return `
  <div class="quiz">
    <section class="card stack">
      <p class="section-label">${L('Test dokončen', 'Тест завершён')}</p>
      <div class="result-hero">
        <span class="big">${score}<span style="font-size:.5em"> %</span></span>
        <div>
          <strong>${r.firstOk} из ${n}</strong> ${L('správně napoprvé', 'правильно с первого раза')}
          <p class="small muted" style="margin:4px 0 0">${esc(MODES[r.mode]?.ru || '')} · ${r.hard ? 'сложный' : 'лёгкий'} · повторов для исправления: ${r.order.length - r.main}</p>
        </div>
      </div>
      ${list.length ? `<div><p class="section-label">${n < r.main ? L('Chyby v tomto testu', 'Ошибки в этом тесте') : L('Chyby v tomto testu (všechny opraveny)', 'Ошибки в этом тесте (все исправлены)')}</p>
        <ul class="qlist">${list.map(q => `<li>${tx(q.question)}<span class="badge">${esc(q.category)}</span></li>`).join('')}</ul></div>`
        : `<p>${L('Bez jediné chyby. Skvělá práce!', 'Ни одной ошибки. Отличная работа!')}</p>`}
    </section>
    <div class="actionbar-spacer"></div>
  </div>
  <div class="actionbar"><div class="actionbar-in">
    <button type="button" class="btn" data-action="nav" data-screen="stats">Статистика</button>
    <button type="button" class="btn primary" data-action="new">Новый тест</button>
  </div></div>`;
}

function statusCounts(qs) {
  const c = { done: 0, learn: 0, err: 0, new: 0 };
  qs.forEach(q => c[statusOf(q.id)]++);
  return c;
}
function statBar(c, total, cls = '') {
  const seg = (k) => c[k] ? `<i class="s-${k}" style="width:${c[k] / total * 100}%"></i>` : '';
  return `<div class="statbar ${cls}" role="img" aria-label="Освоено ${c.done}, в процессе ${c.learn}, ошибки ${c.err}, без ответа ${c.new}">${seg('done')}${seg('learn')}${seg('err')}${seg('new')}</div>`;
}

function viewStats() {
  const total = QS.length;
  const c = statusCounts(QS);
  const all = Object.values(S.progress.q);
  const answers = all.reduce((a, s) => a + s.s, 0);
  const right = all.reduce((a, s) => a + s.r, 0);
  const hist = S.progress.history;
  const recent = hist.slice(-24);

  const legend = `<div class="legend">
    <span><i class="sw s-done"></i>Освоено <b class="num">${c.done}</b></span>
    <span><i class="sw s-learn"></i>В процессе <b class="num">${c.learn}</b></span>
    <span><i class="sw s-err"></i>Ошибки к исправлению <b class="num">${c.err}</b></span>
    <span><i class="sw s-new"></i>Без ответа <b class="num">${c.new}</b></span></div>`;

  const cats = CATS.map(cat => {
    const qs = QS.filter(q => q.category === cat);
    const cc = statusCounts(qs);
    return `<div class="cat-row"><span>${esc(cat)}</span><span class="num">${cc.done}/${qs.length}</span>${statBar(cc, qs.length, 'sm')}</div>`;
  }).join('');

  const chart = recent.length ? `
    <div class="chart">
      <div class="yax"><span>100 %</span><span>50 %</span><span>0 %</span></div>
      <div class="plot">
        <div class="grid-line" style="top:0"></div><div class="grid-line" style="top:50%"></div>
        ${recent.map((h, i) => { const p = pct(h.ok, h.n); return `<div class="bar" data-tip="${i}" tabindex="0" aria-label="${fmtDate(h.t)}: ${p} %"><i style="height:${Math.max(p, 1)}%"></i></div>`; }).join('')}
      </div>
      <div class="xax"><span>${fmtDate(recent[0].t)}</span><span>${recent.length > 1 ? fmtDate(recent[recent.length - 1].t) : ''}</span></div>
    </div>` : `<div class="empty">${L('Graf se zobrazí po prvním dokončeném testu.', 'График появится после первого завершённого теста.')}</div>`;

  const hardest = QS.filter(q => (st(q.id)?.w || 0) > 0).sort((a, b) => difficulty(st(b.id)) - difficulty(st(a.id))).slice(0, 6);

  return `
  <div class="grid-2">
    <div class="stack">
      <section class="card stack">
        <p class="section-label">${L('Celkový postup', 'Общий прогресс')}</p>
        <div class="hero-num"><span class="big">${pct(c.done, total)}<span style="font-size:.5em"> %</span></span><span>${L(`zvládnuto ${c.done} z ${total} otázek`, `освоено ${c.done} из ${total} вопросов`)}</span></div>
        ${statBar(c, total)}
        ${legend}
        <p class="small muted" style="margin:0">Вопрос считается освоенным, когда вы ответили на него правильно ${MASTERED_STREAK} раза подряд.</p>
        <div class="kpis">
          <div class="kpi"><div class="v">${answers}</div><div class="l">ответов всего</div></div>
          <div class="kpi"><div class="v">${pct(right, answers)} %</div><div class="l">верных ответов</div></div>
          <div class="kpi"><div class="v">${hist.length}</div><div class="l">завершённых тестов</div></div>
        </div>
      </section>
      <section class="card stack">
        <p class="section-label">${L('Úspěšnost napoprvé v posledních testech', 'Успешность с первой попытки в последних тестах')}</p>
        ${chart}
      </section>
    </div>
    <div class="stack">
      <section class="card stack">
        <p class="section-label">${L('Podle kategorií', 'По категориям')}</p>
        <div class="cat-rows">${cats}</div>
      </section>
      <section class="card stack hard-list">
        <p class="section-label">${L('Nejtěžší otázky', 'Самые трудные вопросы')}</p>
        ${hardest.length ? `<ul class="qlist">${hardest.map(q => { const s = st(q.id); return `<li>${tx(q.question)}<span class="num" title="ошибок / верных">${s.w}× / ${s.r}×</span></li>`; }).join('')}</ul>`
          : `<div class="empty">${L('Zatím žádné chyby.', 'Пока ошибок нет.')}</div>`}
      </section>
      <section class="card stack danger-zone">
        <p class="section-label">${L('Smazání postupu', 'Сброс прогресса')}</p>
        <p class="small muted" style="margin:0">${store.mode === 'shared' ? 'Удалит статистику и незавершённый тест для всех, кто пользуется этой ссылкой.' : 'Удалит статистику и незавершённый тест на этом устройстве.'}</p>
        ${S.confirm === 'reset' ? `<div class="confirm">
            <label for="reset-input">${L('', 'Для подтверждения введите слово УДАЛИТЬ')}</label>
            <input id="reset-input" autocomplete="off" autocapitalize="characters" placeholder="УДАЛИТЬ" value="${esc(S.resetText)}">
            <div class="row"><button type="button" class="btn danger sm" data-action="reset" id="reset-go" ${S.resetText.trim().toUpperCase() === 'УДАЛИТЬ' ? '' : 'disabled'}>Удалить весь прогресс</button>
            <button type="button" class="btn ghost sm" data-action="ask" data-what="">Отмена</button></div></div>`
          : `<div><button type="button" class="btn sm" data-action="ask" data-what="reset">Сбросить прогресс…</button></div>`}
      </section>
    </div>
  </div>`;
}

/* ---------- toast ---------- */
let toastTimer;
function toast(msg) {
  const el = $('#tooltip');
  el.textContent = msg; el.hidden = false;
  el.style.left = '50%'; el.style.top = 'auto'; el.style.bottom = 'calc(90px + env(safe-area-inset-bottom, 0px))'; el.style.transform = 'translateX(-50%)';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; el.style.bottom = ''; el.style.transform = ''; }, 3200);
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-action]');
  if (!b || b.disabled) return;
  const a = b.dataset.action, cfg = prefs.cfg;
  switch (a) {
    case 'nav':
      S.screen = b.dataset.screen === 'stats' ? 'stats' : (S.run.active ? 'quiz' : 'setup');
      if (b.dataset.screen === 'setup' && S.run.active && S.run.finished) S.screen = 'quiz';
      S.confirm = null; render(); window.scrollTo(0, 0); return;
    case 'cat': {
      const c = b.dataset.cat;
      if (!c) cfg.cats = [];
      else cfg.cats = cfg.cats.includes(c) ? cfg.cats.filter(x => x !== c) : [...cfg.cats, c];
      if (cfg.cats.length === CATS.length) cfg.cats = [];
      break;
    }
    case 'kind': {
      const k = b.dataset.kind;
      let ks = cfg.kinds.length ? cfg.kinds.slice() : KINDS.map(x => x.id);
      ks = ks.includes(k) ? ks.filter(x => x !== k) : [...ks, k];
      cfg.kinds = ks.length === KINDS.length || !ks.length ? [] : ks;
      break;
    }
    case 'mode': cfg.mode = b.dataset.mode; break;
    case 'hard': cfg.hard = b.dataset.val === '1'; break;
    case 'start':
      if (S.run.active && !S.run.finished) { S.confirm = 'replace'; break; }
      startRun(); return;
    case 'start-force': startRun(); return;
    case 'hint': S.hintOpen = !S.hintOpen; render(); return;
    case 'close-banner': S.bannerClosed = true; render(); return;
    case 'goto-setup': S.screen = 'setup'; S.confirm = null; render(); window.scrollTo(0, 0); return;
    case 'resume': S.screen = 'quiz'; S.confirm = null; render(); window.scrollTo(0, 0); return;
    case 'ask': S.confirm = b.dataset.what || null; S.resetText = ''; render();
      if (S.confirm === 'reset') $('#reset-input')?.focus();
      return;
    case 'discard': discardRun(); render(); return;
    case 'end':
      S.confirm = null;
      if (S.run.log.some(Boolean)) { finishRun(); store.save('run'); } else discardRun();
      render(); window.scrollTo(0, 0); return;
    case 'opt': toggleOpt(+b.dataset.i); return;
    case 'submit': submit(); return;
    case 'next': next(); return;
    case 'new': discardRun(); S.screen = 'setup'; render(); window.scrollTo(0, 0); return;
    case 'reset':
      S.progress = emptyProgress(); S.run = emptyRun(); S.confirm = null; S.sel = []; S.lastRunSig = runSig();
      store.save('progress'); store.save('run');
      render(); toast('Прогресс сброшен.'); return;
    default: return;
  }
  savePrefs(); render();
});

let selTimer;
const pickHint = q => { const n = q.correct.length - S.sel.length; return `Отметьте ещё ${n} ${plural(n, 'вариант', 'варианта', 'вариантов')}`; };
function toggleOpt(i) {
  const r = S.run, q = currentQ();
  if (!q || r.log[r.pos]) return;
  const multiUI = r.hard || q.correct.length > 1;
  if (multiUI) S.sel = S.sel.includes(i) ? S.sel.filter(x => x !== i) : [...S.sel, i];
  else S.sel = [i];
  if (!r.hard && S.sel.length >= q.correct.length) { submit(); return; }
  document.querySelectorAll('.opt').forEach(el => el.setAttribute('aria-pressed', String(S.sel.includes(+el.dataset.i))));
  const sb = $('[data-action="submit"]');
  if (sb) sb.disabled = !S.sel.length;
  const ph = $('#pick-hint');
  if (ph) ph.textContent = pickHint(q);
  // keep the ticked options too, so another device opens on exactly the same screen
  clearTimeout(selTimer);
  const runId = r.id, pos = r.pos;
  selTimer = setTimeout(() => { if (S.run.id === runId && S.run.pos === pos && !S.run.log[pos]) { S.run.sel = S.sel.slice(); store.save('run'); } }, 800);
}

document.addEventListener('input', e => {
  if (e.target.id === 'count') {
    prefs.cfg.count = +e.target.value; $('#count-val').textContent = e.target.value; savePrefs();
  } else if (e.target.id === 'reset-input') {
    S.resetText = e.target.value;
    $('#reset-go').disabled = S.resetText.trim().toUpperCase() !== 'УДАЛИТЬ';
  }
});

document.addEventListener('keydown', e => {
  if (S.screen !== 'quiz' || !S.run.active || S.run.finished || e.target.matches('input, textarea')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const q = currentQ(); if (!q) return;
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= q.options.length) { toggleOpt(n - 1); e.preventDefault(); }
  else if (e.key === 'Enter' && !e.target.closest('button')) { S.run.log[S.run.pos] ? next() : submit(); e.preventDefault(); }
});

$('#ru-switch').addEventListener('click', () => { prefs.ru = !prefs.ru; savePrefs(); renderChrome(); });
$('#sound-btn').addEventListener('click', () => { prefs.sound = !prefs.sound; savePrefs(); renderChrome(); if (prefs.sound) playSound(true); });

/* tooltips: chart bars and difficulty hints */
function placeTip(el, html) {
  const tip = $('#tooltip');
  tip.innerHTML = html;
  tip.style.bottom = ''; tip.style.transform = '';
  tip.hidden = false;
  const rc = el.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
  tip.style.left = clamp(rc.left + rc.width / 2 - tw / 2, 8, window.innerWidth - tw - 8) + 'px';
  tip.style.top = (rc.top - th - 8 >= 8 ? rc.top - th - 8 : rc.bottom + 8) + 'px';
}
function showTip(bar) {
  const h = S.progress.history.slice(-24)[+bar.dataset.tip];
  if (!h) return;
  placeTip(bar, `<b>${new Date(h.t).toLocaleString('ru-RU', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}</b><br>
    ${esc(MODES[h.mode]?.ru || '')} · ${h.hard ? 'сложный' : 'лёгкий'}<br>
    С первой попытки верно <span class="num">${h.ok}/${h.n}</span> (<span class="num">${pct(h.ok, h.n)} %</span>)`);
  document.querySelectorAll('.bar.on').forEach(x => x.classList.remove('on'));
  bar.classList.add('on');
}
function hideTip() { if (!$('#tooltip').hidden && toastTimer && $('#tooltip').style.bottom) return; $('#tooltip').hidden = true; document.querySelectorAll('.bar.on').forEach(x => x.classList.remove('on')); }
document.addEventListener('pointerover', e => { const b = e.target.closest('.bar[data-tip]'); if (b) showTip(b); });
document.addEventListener('pointerout', e => { if (e.target.closest('.bar[data-tip]')) hideTip(); });
document.addEventListener('focusin', e => { const b = e.target.closest('.bar[data-tip]'); if (b) showTip(b); });
document.addEventListener('focusout', e => { if (e.target.closest('.bar[data-tip]')) hideTip(); });
window.addEventListener('scroll', () => { if ($('.bar.on')) hideTip(); }, { passive: true });

/* ---------- boot ---------- */
S.lastRunSig = runSig();
store.init().then(() => { if (store.mode !== 'local') render(); });
if (S.run.active && !S.run.finished) S.screen = 'quiz';
render();
})();
