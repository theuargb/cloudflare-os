import { describe, expect, it } from "vitest";
import { collectUnits, parseLocaleMap, translate } from "./units.ts";

const rewrite = (code: string, entries: Record<string, string>, file = "x.tsx") =>
    translate(code, file, parseLocaleMap(entries))?.code;

describe("translate", () => {
  it("translates JSX text across lines and keeps its surrounding whitespace", () => {
    let code = `const a = (\n  <p>\n    Save   your\n    changes\n  </p>\n);`;
    expect(rewrite(code, { "Save your changes": "Зберегти зміни" }))
        .toBe(`const a = (\n  <p>\n    Зберегти зміни\n  </p>\n);`);
  });

  it("translates a placeholder attribute but not className", () => {
    let code = `const a = <input className="Search" placeholder="Search" aria-label="Search" data-x="Search" />;`;
    expect(rewrite(code, { Search: "Пошук" }))
        .toBe(`const a = <input className="Search" placeholder={"Пошук"} aria-label={"Пошук"} data-x="Search" />;`);
  });

  it("leaves identifier-like object properties alone", () => {
    let code = `const a = { role: "Search", label: "Search" };`;
    expect(rewrite(code, { Search: "Пошук" })).toBe(`const a = { role: "Search", label: "Пошук" };`);
  });

  it("moves reordered template placeholders with their expressions", () => {
    let code = "const a = `Deleted ${count} of ${total} items`;";
    expect(rewrite(code, { "Deleted {0} of {1} items": "З {1} видалено {0}" }))
        .toBe("const a = `З ${total} видалено ${count}`;");
  });

  it("escapes what a template would read as syntax", () => {
    let code = "const a = `Price ${p}`;";
    expect(rewrite(code, { "Price {0}": "Ціна `{0}` ${x}" }))
        .toBe("const a = `Ціна \\`${p}\\` \\${x}`;");
  });

  it("translates strings inside a translated template's expressions", () => {
    let code = "const a = `Failed to ${on ? \"enable\" : \"disable\"} hook`;";
    expect(rewrite(code, { "Failed to {0} hook": "Не вдалося {0} тригер", enable: "увімкнути", disable: "вимкнути" }))
        .toBe("const a = `Не вдалося ${on ? \"увімкнути\" : \"вимкнути\"} тригер`;");
  });

  it("leaves import specifiers, comparisons and cases alone", () => {
    let code = `import x from "Save";\nif (mode === "Save") {}\nswitch (m) { case "Save": break; }\nconst y = "Save";`;
    expect(rewrite(code, { Save: "Зберегти" }))
        .toBe(`import x from "Save";\nif (mode === "Save") {}\nswitch (m) { case "Save": break; }\nconst y = "Зберегти";`);
  });

  it("emits text with JSX syntax characters as an expression", () => {
    expect(rewrite(`const a = <b>Total</b>;`, { Total: "A < B" })).toBe(`const a = <b>{"A < B"}</b>;`);
  });

  it("returns null when nothing matches", () => {
    expect(translate(`const a = "x";`, "x.ts", new Map())).toBeNull();
  });
});

describe("collectUnits", () => {
  it("reports the line and the key of each unit", () => {
    let units = collectUnits("const a = 1;\nconst b = <i>Hello  there</i>;", "x.tsx");
    expect(units).toMatchObject([{ kind: "jsx", key: "Hello there", line: 2 }]);
  });
});

describe("parseLocaleMap", () => {
  it("rejects a translation whose placeholders differ from its key's", () => {
    expect(() => parseLocaleMap({ "Delete {0}": "Видалити" }))
        .toThrow('Invalid ui-locale entry "Delete {0}": placeholders differ');
  });
});
