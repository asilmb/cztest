# Český trenažér

Trenažér zkouškových otázek v češtině. Rozhraní je v ruštině, otázky v češtině (s volitelným ruským překladem). Sestaví se do dvou stránek: `dist/cesky-trenazer.html` (Claude artefakt) a `docs/index.html` (GitHub Pages).

## Сайт на GitHub Pages с общим прогрессом в Google-таблице

Версия для GitHub Pages лежит в `docs/index.html`. Общий прогресс она хранит в Google-таблице
через веб-приложение Apps Script (`apps-script/Code.gs`). Аккаунты для этого не нужны: любой,
кто открыл ссылку, видит и пополняет один общий прогресс.

### 1. Google-таблица и Apps Script
1. Создайте новую Google-таблицу (sheets.new).
2. Откройте «Расширения → Apps Script», удалите заготовку и вставьте содержимое `apps-script/Code.gs`. Сохраните.
3. «Начать развёртывание → Новое развёртывание» → тип «Веб-приложение».
   - Запуск от имени: **я**
   - У кого есть доступ: **все**
4. Разрешите доступ к таблице и скопируйте URL веб-приложения (заканчивается на `/exec`).

### 2. Адрес в config.json и сборка
```sh
# config.json
{ "appsScriptUrl": "https://script.google.com/macros/s/…/exec" }
node build.mjs
```
Закоммитьте и запушьте `config.json` и `docs/`.

### 3. Включить GitHub Pages
Settings → Pages → Build and deployment → Source: «Deploy from a branch», ветка с этим кодом, папка `/docs`.

Прогресс хранится на листе `data` (служебные данные, не редактируйте) и дублируется в читаемом виде на листе
`Статистика`. Записывать может любой, у кого есть ссылка на сайт. Если после изменения `Code.gs` создать
новое развёртывание, URL изменится: обновите `config.json`. Чтобы URL остался прежним, используйте
«Управление развёртываниями → изменить → новая версия».

### Версия на странице
Внизу каждого экрана написано «Версия X · сборка дата время». Номер берётся из `version` в `package.json`
(увеличивайте его при каждой правке), время сборки проставляет `build.mjs`. Так видно, обновился ли сайт.

## Sestavení

```sh
node build.mjs                      # použije questions/questions.json
node build.mjs cesta/k/otazkam.json # jiná sada otázek
```

Skript otázky zkontroluje (unikátní `id`, platné indexy správných odpovědí…) a vloží je do stránky.

### Snímek postupu ve stránce

Stránka v sobě nese poslední sdílený stav (`<script id="cz-snapshot">`). Zobrazení vlastníka ji při odchodu
ze stránky znovu publikuje s aktuálním stavem, takže i bez přístupu k databázi (bez přihlášení, mimo prohlížeč
claude.ai) se test otevře tam, kde skončil. Před ručním publikováním nové verze uložte dokumenty `quiz/progress`
a `quiz/run` do `state.json` jako `{ "progress": …, "run": … }` a sestavte `node build.mjs --snapshot state.json`.

### Новые вопросы
Исходные файлы лежат в `questions/source/`:
- `questions.json` — вопросы экзамена (`id, section, case, text, options, correct`);
- `cases.json` — тексты кейсов (`id, section, text`);
- `topics.json` — темы с названиями на чешском и русском, в порядке показа;
- `assign.json` — тема каждого вопроса (`questions`) и каждого кейса (`cases`).

```sh
node scripts/import-questions.mjs   # → questions/questions.json
node build.mjs
```
Прогресс сбрасывается сам, только если меняется набор вопросов или правильные ответы (отпечаток по id и ответам).
Перегруппировка и правка формулировок прогресс не трогают.

## Formát otázek (`questions/questions.json`)

```json
{
  "id": "q011",
  "category": "Historie",
  "type": "single",
  "scenario": { "cs": "Popis situace…", "ru": "Описание ситуации…" },
  "question": { "cs": "Text otázky?", "ru": "Текст вопроса?" },
  "options": [ { "cs": "Možnost A", "ru": "Вариант A" }, { "cs": "Možnost B", "ru": "Вариант B" } ],
  "correct": [0],
  "explanation": { "cs": "Volitelné vysvětlení.", "ru": "Необязательное пояснение." }
}
```

- `type`: `single` (jedna odpověď), `multi` (více odpovědí), `situation` (řešení situace; může mít jednu i více správných odpovědí).
- `correct`: indexy správných možností, počítáno od 0.
- `scenario` a `explanation` jsou nepovinné. Místo `{ "cs", "ru" }` lze psát i prostý řetězec (jen česky, bez překladu).
- `id` musí zůstat stabilní: statistika se k otázkám váže přes něj.

## Jak to funguje

- **Režimy**: Sněhová koule (nejméně viděné otázky), Oprava chyb (otázky s chybou, vážené podle obtížnosti
  `(1 + 2·chyby) / (1 + správně)`), Opakování (zvládnuté otázky, nejdéle neviděné první).
- **Obtížnost**: lehká ukazuje, kolik odpovědí je správně; těžká ne a vždy dovolí vybrat více možností.
- Špatně zodpovězená otázka se v testu opakuje, dokud na ni neodpovíte správně.
- Otázka je **zvládnutá** po 2 správných odpovědích za sebou.
- Postup a rozpracovaný test se ukládají do sdílené databáze artefaktu (`quiz/progress`, `quiz/run`).
  Kdo do ní nemůže zapisovat (nepřihlášený nebo jen prohlížející), má postup uložený jen ve svém prohlížeči.
- Překlad do ruštiny, zvuky a nastavení testu jsou osobní volby uložené v prohlížeči.
