// Finds the user-visible strings in a TypeScript or TSX source file and rewrites them from a
// locale map. The map is keyed by the English source text, so a string with no entry stays English
// and the source files themselves never change.

import ts from "typescript6";
import MagicString, { type SourceMap } from "magic-string";

/**
 * One translatable piece of source text. `key` is what a locale map is keyed by: JSX text with
 * whitespace runs collapsed to one space and trimmed, a string literal's exact value, or a template
 * literal's text with each `${…}` written as `{0}`, `{1}`, … in order. `start` and `end` are the
 * offsets of the text a translation replaces, and `line` is 1-based.
 */
export type Unit = {
  kind: "jsx" | "string" | "template";
  key: string;
  start: number;
  end: number;
  line: number;
};

/** A unit plus what rewriting it needs. */
type ScannedUnit = Unit & {
  /** Where a template's expressions are in the source, in `{n}` order. */
  expressions: { start: number; end: number }[];
  /** Whether the unit is the whole value of a JSX attribute, which has no escape sequences. */
  isJsxAttributeValue: boolean;
};

/**
 * JSX attributes, and object properties of the same name, whose string values are identifiers, URLs
 * or styling, never text for a reader.
 */
const NON_TEXT_ATTRIBUTES: Record<string, true> = {
  className: true, class: true, key: true, id: true, href: true, to: true, src: true, type: true,
  name: true, value: true, role: true, htmlFor: true, target: true, rel: true, variant: true,
  size: true, mode: true, method: true, autoComplete: true, inputMode: true, pattern: true,
};

const COMPARISON_OPERATORS: Record<number, true> = {
  [ts.SyntaxKind.EqualsEqualsToken]: true,
  [ts.SyntaxKind.ExclamationEqualsToken]: true,
  [ts.SyntaxKind.EqualsEqualsEqualsToken]: true,
  [ts.SyntaxKind.ExclamationEqualsEqualsToken]: true,
};

const PLACEHOLDER = /\{(\d+)\}/g;

function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map(match => match[1]))].toSorted();
}

function isModuleSpecifier(node: ts.Node): boolean {
  let parent = node.parent;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) return true;
  if (ts.isExternalModuleReference(parent) || ts.isImportTypeNode(parent)) return true;
  if (ts.isCallExpression(parent) && parent.arguments[0] === node) {
    return parent.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(parent.expression) && parent.expression.text === "require");
  }
  return false;
}

function isCodeLiteral(node: ts.Node): boolean {
  let parent = node.parent;
  // Names and indexes, not text.
  if ((ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) ||
       ts.isPropertyDeclaration(parent) || ts.isMethodDeclaration(parent) ||
       ts.isEnumMember(parent)) && parent.name === node) {
    return true;
  }
  if (ts.isPropertyAssignment(parent) && parent.initializer === node &&
      (ts.isIdentifier(parent.name) || ts.isStringLiteral(parent.name)) &&
      Object.hasOwn(NON_TEXT_ATTRIBUTES, parent.name.text)) {
    return true;
  }
  if (ts.isComputedPropertyName(parent)) return true;
  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) return true;
  if (ts.isLiteralTypeNode(parent)) return true;
  // What the code compares against, branches on or tests membership of.
  if (ts.isBinaryExpression(parent) && (
      Object.hasOwn(COMPARISON_OPERATORS, parent.operatorToken.kind) ||
      (parent.operatorToken.kind === ts.SyntaxKind.InKeyword && parent.left === node))) {
    return true;
  }
  if (ts.isCaseClause(parent) && parent.expression === node) return true;
  // Directives such as "use client".
  if (ts.isExpressionStatement(parent)) return true;
  if (ts.isTaggedTemplateExpression(parent) && parent.template === node) return true;
  if (ts.isJsxAttribute(parent)) {
    let name = ts.isIdentifier(parent.name) ? parent.name.text : parent.name.getText();
    return Object.hasOwn(NON_TEXT_ATTRIBUTES, name) || name.startsWith("data-");
  }
  return false;
}

function scan(code: string, file: string): ScannedUnit[] {
  let tsx = file.endsWith(".tsx");
  let source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true,
      tsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let units: ScannedUnit[] = [];

  let add = (kind: Unit["kind"], key: string, start: number, end: number, expressions: ScannedUnit["expressions"],
             isJsxAttributeValue: boolean) => {
    let line = source.getLineAndCharacterOfPosition(start).line + 1;
    units.push({ kind, key, start, end, line, expressions, isJsxAttributeValue });
  };

  let visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      let text = code.slice(node.pos, node.end);
      let key = text.replace(/\s+/g, " ").trim();
      if (key) {
        let start = node.pos + text.length - text.trimStart().length;
        add("jsx", key, start, node.pos + text.trimEnd().length, [], false);
      }
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!isModuleSpecifier(node) && !isCodeLiteral(node)) {
        add(ts.isStringLiteral(node) ? "string" : "template", node.text,
            node.getStart(source), node.end, [], ts.isJsxAttribute(node.parent));
      }
    } else if (ts.isTemplateExpression(node)) {
      if (!isCodeLiteral(node)) {
        let key = node.head.text;
        let expressions: ScannedUnit["expressions"] = [];
        node.templateSpans.forEach((span, index) => {
          expressions.push({ start: span.expression.getStart(source), end: span.expression.end });
          key += `{${index}}${span.literal.text}`;
        });
        add("template", key, node.getStart(source), node.end, expressions, false);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return units;
}

/**
 * Every translatable unit in `code`, in source order. Code-like strings are not units: module
 * specifiers, property names, comparison operands, `case` labels, literal types, tagged templates,
 * directives, and the JSX attributes and object properties that carry identifiers rather than text
 * (`className`, `href`, `type`, `role`, `data-*`, …).
 */
export function collectUnits(code: string, file: string): Unit[] {
  return scan(code, file).map(({ kind, key, start, end, line }) => ({ kind, key, start, end, line }));
}

/**
 * Parses a locale map, an object of English source text to translation. Throws if an entry is not
 * a string, or if the translation does not use exactly the `{n}` placeholders its key has.
 */
export function parseLocaleMap(json: unknown): Map<string, string> {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new Error("A ui-locale map must be an object of English text to translation.");
  }
  let map = new Map<string, string>();
  for (let [key, value] of Object.entries(json)) {
    if (typeof value !== "string") throw new Error(`Invalid ui-locale entry "${key}": not a string`);
    if (placeholders(key).join() !== placeholders(value).join()) {
      throw new Error(`Invalid ui-locale entry "${key}": placeholders differ`);
    }
    map.set(key, value);
  }
  return map;
}

/** `code[from, to)` with every outermost translated unit inside it replaced. */
function render(code: string, units: ScannedUnit[], from: number, to: number,
                map: Map<string, string>): string {
  let result = "";
  let position = from;
  for (let unit of units) {
    let translation = map.get(unit.key);
    if (translation === undefined || unit.start < position || unit.end > to) continue;
    result += code.slice(position, unit.start) + replacement(code, units, unit, translation, map);
    position = unit.end;
  }
  return result + code.slice(position, to);
}

function templateSource(code: string, units: ScannedUnit[], unit: ScannedUnit, translation: string,
                        map: Map<string, string>): string {
  let escape = (text: string) => text.replace(/[\\`]|\$\{/g, match => "\\" + match);
  let result = "";
  let last = 0;
  for (let match of translation.matchAll(PLACEHOLDER)) {
    // Strings inside an expression are translated too: `${on ? "enable" : "disable"}`.
    let { start, end } = unit.expressions[Number(match[1])];
    result += escape(translation.slice(last, match.index)) + "${" + render(code, units, start, end, map) + "}";
    last = match.index + match[0].length;
  }
  return "`" + result + escape(translation.slice(last)) + "`";
}

function replacement(code: string, units: ScannedUnit[], unit: ScannedUnit, translation: string,
                     map: Map<string, string>): string {
  if (unit.kind === "jsx") {
    // Braces and angle brackets are JSX syntax, so text holding them travels as an expression.
    return /[{}<>]/.test(translation) ? `{${JSON.stringify(translation)}}` : translation;
  }
  // A JSX attribute value has no escape sequences, so a quoted string would not do.
  if (unit.isJsxAttributeValue) return `{${JSON.stringify(translation)}}`;
  if (unit.kind === "template" && unit.expressions.length > 0) {
    return templateSource(code, units, unit, translation, map);
  }
  return JSON.stringify(translation);
}

/**
 * Rewrites the units of `code` that `map` has a translation for. Returns null when nothing
 * changed. Strings inside a translated template's expressions are translated as well, but they
 * carry no source map.
 */
export function translate(code: string, file: string, map: Map<string, string>)
    : { code: string; map: SourceMap } | null {
  let units = scan(code, file);
  let output = new MagicString(code);
  let rewrittenUntil = 0;
  for (let unit of units) {
    let translation = map.get(unit.key);
    if (translation === undefined || unit.start < rewrittenUntil) continue;
    output.overwrite(unit.start, unit.end, replacement(code, units, unit, translation, map));
    rewrittenUntil = unit.end;
  }
  if (rewrittenUntil === 0) return null;
  return { code: output.toString(), map: output.generateMap({ source: file, hires: true, includeContent: true }) };
}
