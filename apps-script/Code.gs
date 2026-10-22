/**
 * Shared progress store for Чешский тренажёр (GitHub Pages build).
 *
 * Paste into Extensions → Apps Script of a Google Sheet and deploy as a web app
 * (Execute as: Me, Who has access: Anyone). Two documents are kept:
 *   progress — per-question statistics and finished runs
 *   run      — the test in progress
 * Each is JSON, split into chunks on the hidden-ish sheet "data" (a cell holds at most 50 000
 * characters). The sheet "Статистика" is a readable copy of the per-question numbers.
 *
 * GET  → { progress, run }
 * POST { key, data } → { ok: true } or, when the sheet already holds a newer copy,
 *                      { ok: false, stale: true, [key]: storedCopy }
 */

var KEYS = ['progress', 'run'];
var DATA_SHEET = 'data';
var STATS_SHEET = 'Статистика';
var CHUNK = 40000;
var PREFIX = '~'; // keeps the sheet from reading a chunk as a number or a formula

function doGet() {
  return json_({ progress: read_('progress'), run: read_('run') });
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ error: 'bad json' }); }
  var key = body && body.key;
  var data = body && body.data;
  if (KEYS.indexOf(key) < 0 || !data || typeof data !== 'object') return json_({ error: 'bad request' });

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var stored = read_(key);
    if (stored && (stored.updatedAt || 0) > (data.updatedAt || 0)) {
      var out = { ok: false, stale: true };
      out[key] = stored;
      return json_(out);
    }
    write_(key, data);
    if (key === 'progress') writeStats_(data);
    return json_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

function sheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function rows_() {
  var sh = sheet_(DATA_SHEET);
  var n = sh.getLastRow();
  return n ? sh.getRange(1, 1, n, 3).getValues() : [];
}

function read_(key) {
  var parts = rows_().filter(function (r) { return r[0] === key; })
    .sort(function (a, b) { return a[1] - b[1]; })
    .map(function (r) { return String(r[2]).slice(PREFIX.length); });
  if (!parts.length) return null;
  try { return JSON.parse(parts.join('')); } catch (err) { return null; }
}

function write_(key, data) {
  var text = JSON.stringify(data);
  var keep = rows_().filter(function (r) { return r[0] !== key && r[0] !== ''; });
  for (var i = 0, n = 0; i < text.length; i += CHUNK, n++) keep.push([key, n, PREFIX + text.slice(i, i + CHUNK)]);
  var sh = sheet_(DATA_SHEET);
  sh.clearContents();
  if (keep.length) sh.getRange(1, 1, keep.length, 3).setNumberFormat('@').setValues(keep);
}

function writeStats_(progress) {
  var sh = sheet_(STATS_SHEET);
  var q = progress.q || {};
  var rows = [['Вопрос', 'Показов', 'Верно', 'Ошибок', 'Верно подряд', 'Последний ответ']];
  Object.keys(q).sort().forEach(function (id) {
    var s = q[id];
    rows.push([id, s.s || 0, s.r || 0, s.w || 0, s.k || 0, s.t ? new Date(s.t) : '']);
  });
  sh.clearContents();
  sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
