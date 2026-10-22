# Český trenažér

Trenažér zkouškových otázek v češtině. Celá aplikace se sestaví do jedné HTML stránky
`dist/cesky-trenazer.html`, která se publikuje jako Claude artefakt.

## Sestavení

```sh
node build.mjs                      # použije questions/questions.json
node build.mjs cesta/k/otazkam.json # jiná sada otázek
```

Skript otázky zkontroluje (unikátní `id`, platné indexy správných odpovědí…) a vloží je do stránky.

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
