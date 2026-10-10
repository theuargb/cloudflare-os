import { readFileSync } from "node:fs";
import type { Plugin } from "vite";
import { parseLocaleMap, translate } from "./units.ts";

/** The sources translated: the Workshop's own and the shared UI package's, never their tests. */
const TRANSLATED_SOURCES = /\/packages\/(workshop-frontend|ui)\/src\/.+\.tsx?$/;

/**
 * Vite plugin that serves the Workshop UI in another language without touching its sources: it
 * replaces the English strings of `locales/<locale>.json` (English text to translation) in the
 * source as it is built, and sets the page's `lang`. A string with no entry stays English. Dates
 * and numbers keep following the browser's locale.
 */
export function uiLocale(locale: string): Plugin {
  let map = parseLocaleMap(
      JSON.parse(readFileSync(new URL(`../locales/${locale}.json`, import.meta.url), "utf8")));
  return {
    name: "ui-locale",
    enforce: "pre",
    transform(code, id) {
      let file = id.split("?")[0];
      if (!TRANSLATED_SOURCES.test(file) || file.includes(".test.")) return null;
      return translate(code, file, map);
    },
    transformIndexHtml: html => html.replace(/(<html\b[^>]*\blang=)"[^"]*"/, `$1"${locale}"`),
  };
}
