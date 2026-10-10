// Lists the English strings a locale map lacks: node src/report.ts <locale> <srcDir…>
//
// Run it after taking in upstream changes. Only files that already have a translated unit are
// reported, because a file with none is untranslated on purpose (an admin screen, a debug panel),
// while a file with some and a few misses is an upstream string that arrived since.

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { collectUnits, parseLocaleMap } from "./units.ts";

/** Identifier-like text (`some-key`, `a.b:c`) and text without letters is not for a reader. */
function isUserText(key: string): boolean {
  return /\p{L}/u.test(key) && !/^[a-z][\w.:/-]*$/.test(key);
}

let [locale, ...directories] = process.argv.slice(2);
if (!locale || directories.length === 0) {
  console.error("usage: node src/report.ts <locale> <srcDir…>");
  process.exit(2);
}
let map = parseLocaleMap(
    JSON.parse(readFileSync(new URL(`../locales/${locale}.json`, import.meta.url), "utf8")));

// `pnpm --filter` runs this from the package directory; the paths are the caller's.
let base = process.env.INIT_CWD ?? process.cwd();
let missing = 0;
for (let directory of directories) {
  for (let entry of readdirSync(resolve(base, directory), { recursive: true, encoding: "utf8" }).toSorted()) {
    if (!/\.tsx?$/.test(entry) || entry.includes(".test.")) continue;
    let file = join(directory, entry);
    let units = collectUnits(readFileSync(resolve(base, file), "utf8"), file);
    if (!units.some(unit => map.has(unit.key))) continue;
    for (let unit of units) {
      if (map.has(unit.key) || !isUserText(unit.key)) continue;
      console.log(`${file}:${unit.line}: ${JSON.stringify(unit.key)}`);
      missing++;
    }
  }
}
console.log(`${missing} untranslated unit${missing === 1 ? "" : "s"}`);
