# @gadgets/ui-locale

Serves the Workshop UI in another language without touching its sources. A Vite plugin replaces the
English strings of `workshop-frontend/src` and `ui/src` with the entries of `locales/<locale>.json`
as they are built, and sets `<html lang>`.

```sh
VITE_UI_LOCALES=uk,ka pnpm exec vp run --no-cache -F @gadgets/workshop-frontend build
```

Without `VITE_UI_LOCALES` the build and every test stay English.

## The map

`locales/<locale>.json` maps English source text to its translation. Keys are:

- JSX text, with whitespace runs collapsed to one space and trimmed;
- a string or plain template literal, exactly;
- a template literal with each `${…}` written `{0}`, `{1}`, … in order. A translation may reorder
  the placeholders but must use the same ones; strings inside the expressions are translated too.

A string with no entry stays English. Code-like strings are never touched: import specifiers,
property names, comparison and `case` operands, literal types, and the values of JSX attributes and
object properties such as `className`, `href`, `type`, `role`, `data-*`.

The map cannot express plurals or genders. Text assembled from a count and a noun (`pluralize`) is
left English rather than translated into something ungrammatical.

## After taking in upstream changes

```sh
pnpm --filter @gadgets/ui-locale report uk packages/workshop-frontend/src packages/ui/src
```

lists the English units that files with at least one translation still lack. Translate the ones
meant for readers and add them to the map.

## Several languages at once

`VITE_UI_LOCALES=uk,ka` (comma-separated, the first is the default) builds every language into one
bundle: each translated unit becomes a choice resolved from the runtime locale, so switching language
needs a reload but no second build. `<html lang>` starts as the first locale; the Workshop frontend
reads the user's `ui.locale` preference and `LocaleMenu` switches it. `VITE_UI_LOCALES=uk` (or the
legacy single value) inlines the one language and renders no menu. A locale needs its own
`locales/<locale>.json` with the same keys as `uk.json`; a missing entry stays English.

The plugin is reusable outside the Workshop: `uiLocalePlugin({ locales, mapFor, runtime })` takes a
per-file map lookup, so a host project can translate its own sources (PEAK does, from
Ukrainian, with per-package `locales/ka.json` maps).
