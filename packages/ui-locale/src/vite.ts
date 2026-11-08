import { readFileSync } from "node:fs";
import type { Plugin } from "vite";
import { parseLocaleMap, translate, UI_LOCALE_MODULE } from "./units.ts";

/** The sources translated: the Workshop's own and the shared UI package's, never their tests. */
const TRANSLATED_SOURCES = /\/packages\/(workshop-frontend|ui)\/src\/.+\.tsx?$/;

const RESOLVED_UI_LOCALE_MODULE = `\0${UI_LOCALE_MODULE}`;

export type UiLocaleOptions = {
  /** Locales the bundle serves; a single one is inlined, several compile into a choice on `uiLocale`. */
  locales: readonly string[];
  /** Map of an absolute source file for one locale, or null where the file keeps its source text in it. */
  mapFor: (file: string, locale: string) => ReadonlyMap<string, string> | null;
  /** Absolute path of the module exporting `uiLocale: string`, the page's locale. */
  runtime: string;
};

/**
 * Vite plugin that serves an app in several languages without touching its sources: it replaces
 * the strings that `mapFor` has translations for as the source is built. With several locales each
 * string becomes a choice on `uiLocale`, which `virtual:ui-locale` re-exports from `runtime`.
 */
export function uiLocalePlugin(options: UiLocaleOptions): Plugin {
  let { locales, mapFor, runtime } = options;
  return {
    name: "ui-locale",
    enforce: "pre",
    resolveId: id => (id === UI_LOCALE_MODULE ? RESOLVED_UI_LOCALE_MODULE : undefined),
    load: id => (id === RESOLVED_UI_LOCALE_MODULE ? `export { uiLocale } from ${JSON.stringify(runtime)};` : undefined),
    transform(code, id) {
      let file = id.split("?")[0];
      if (file === runtime) return null;
      let texts = locales.map(locale => ({ locale, map: mapFor(file, locale) }));
      if (texts.every(({ map }) => map === null)) return null;
      return translate(code, file, texts);
    },
  };
}

/**
 * The Workshop frontend's plugin: `workshop-frontend/src` and `ui/src` translated from
 * `locales/<locale>.json` (English text to translation). The page's `lang` starts as the first
 * locale, the default; `runtime` sets the user's own at load. A string with no entry stays
 * English. Dates and numbers keep following the browser's locale.
 */
export function workshopUiLocale(locales: readonly string[], runtime: string): Plugin {
  let maps = new Map<string, ReadonlyMap<string, string>>();
  let load = (locale: string) => {
    let map = maps.get(locale);
    if (!map) {
      map = parseLocaleMap(
          JSON.parse(readFileSync(new URL(`../locales/${locale}.json`, import.meta.url), "utf8")));
      maps.set(locale, map);
    }
    return map;
  };
  let plugin = uiLocalePlugin({
    locales,
    runtime,
    mapFor: (file, locale) =>
        TRANSLATED_SOURCES.test(file) && !file.includes(".test.") ? load(locale) : null,
  });
  return {
    ...plugin,
    transformIndexHtml: html => html.replace(/(<html\b[^>]*\blang=)"[^"]*"/, `$1"${locales[0]}"`),
  };
}
