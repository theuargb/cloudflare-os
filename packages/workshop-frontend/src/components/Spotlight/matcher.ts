/** Fuzzy matching for Ukrainian and English text: normalisation, wrong-layout fallback, boosts. */

import type { ReactNode } from 'react'

// QWERTY → ЙЦУКЕН transliteration map (lowercase). Users who forget to switch layout.
const QWERTY_TO_JCUKEN: Record<string, string> = {
  q: 'й', w: 'ц', e: 'у', r: 'к', t: 'е', y: 'н', u: 'г', i: 'ш', o: 'щ', p: 'з',
  '[': 'х', ']': 'ї', a: 'ф', s: 'і', d: 'в', f: 'а', g: 'п', h: 'р', j: 'о', k: 'л',
  l: 'д', ';': 'ж', "'": 'є', z: 'я', x: 'ч', c: 'с', v: 'м', b: 'и', n: 'т', m: 'ь',
  ',': 'б', '.': 'ю', '/': '.', '`': "'",
}

/** Transliterate QWERTY to ЙЦУКЕН layout (lowercase input). */
function qwertyToJcuken(text: string): string {
  let out = ''
  for (const ch of text) {
    out += QWERTY_TO_JCUKEN[ch] ?? ch
  }
  return out
}

/**
 * Normalise Ukrainian text for matching: lowercase, fold apostrophe variants, normalise
 * confusable Cyrillic pairs so queries like «іменна» match «именна» and «єврика» matches «еврика».
 */
function normalizeUkrainian(text: string): string {
  let out = ''
  for (const ch of text.toLowerCase()) {
    switch (ch) {
      case '\u2019': // '
      case '\u02BC': // ʼ
      case '\u0027': // '
        out += "'"
        break
      case 'ґ':
        out += 'г'
        break
      case 'ї':
      case 'і':
        out += 'и'
        break
      case 'є':
        out += 'е'
        break
      default:
        out += ch
    }
  }
  return out
}

export type MatchResult = { score: number; indices: number[] }

/**
 * Subsequence fuzzy match over normalised text: matched indices and a score (higher is better).
 * Consecutive runs and word starts score up, so «прих кас» ranks «Прихідний касовий ордер» high.
 */
function fuzzyMatchNormalized(text: string, query: string): MatchResult | null {
  const indices: number[] = []
  let score = 0
  let consecutive = 0
  let prevMatch = -2
  let from = 0
  for (const ch of query) {
    const found = text.indexOf(ch, from)
    if (found === -1) return null
    indices.push(found)
    if (found === prevMatch + 1) {
      consecutive += 1
      score += 5 + consecutive
    } else {
      consecutive = 0
      score += 1
    }
    if (found === 0 || /[\s\-_/]/.test(text[found - 1])) score += 10
    prevMatch = found
    from = found + 1
  }
  // Prefer matches that start earlier in the string.
  score -= indices[0]
  return { score, indices }
}

/**
 * Score one entry against a query. Matches against title, keywords, and subtitle. Returns the
 * best match (title > keywords > subtitle), or null. Also tries the QWERTY→ЙЦУКЕН layout
 * transliteration of the query.
 */
export function scoreEntry(
  title: string,
  keywords: string[] | undefined,
  subtitle: string | undefined,
  query: string,
): MatchResult | null {
  const normalized = normalizeUkrainian(query)
  const layout = qwertyToJcuken(query.toLowerCase())
  const queries = [normalized]
  // Add layout variant only if it produces something different.
  if (layout !== normalized) queries.push(normalizeUkrainian(layout))

  let best: MatchResult | null = null
  const normTitle = normalizeUkrainian(title)

  for (const q of queries) {
    // Title match (primary, highest boost)
    const tm = fuzzyMatchNormalized(normTitle, q)
    if (tm) {
      // Prefix boost: the query starts the title
      if (normTitle.startsWith(q)) tm.score += 20
      if (!best || tm.score > best.score) best = tm
    }

    // Keywords match
    if (keywords) {
      for (const kw of keywords) {
        const km = fuzzyMatchNormalized(normalizeUkrainian(kw), q)
        if (km) {
          // Keywords are secondary — score relative to title, but capped lower
          const adjusted = { score: km.score - 5, indices: [] as number[] }
          if (!best || adjusted.score > best.score) best = adjusted
        }
      }
    }

    // Subtitle match
    if (subtitle) {
      const sm = fuzzyMatchNormalized(normalizeUkrainian(subtitle), q)
      if (sm) {
        const adjusted = { score: sm.score - 8, indices: [] as number[] }
        if (!best || adjusted.score > best.score) best = adjusted
      }
    }
  }
  return best
}

/**
 * Whether the query looks like a create intent (starts with "new"/"create", or «нов»/«створ»), used to boost
 * `kind: "create"` actions.
 */
export function isCreateQuery(query: string): boolean {
  const q = normalizeUkrainian(query)
  return q.startsWith('new') || q.startsWith('create') || q.startsWith('нов') || q.startsWith('створ')
}

/** Render a label with the fuzzy-matched characters emphasized. */
export function highlightIndices(
  label: string,
  indices: number[],
  createElement: (key: number, text: string, bold: boolean) => ReactNode,
): ReactNode[] {
  if (indices.length === 0) return [createElement(0, label, false)]
  const matched = new Set(indices)
  const out: ReactNode[] = []
  let buf = ''
  let bufMatched = false
  const flush = () => {
    if (!buf) return
    out.push(createElement(out.length, buf, bufMatched))
    buf = ''
  }
  for (let i = 0; i < label.length; i++) {
    const isMatch = matched.has(i)
    if (isMatch !== bufMatched) {
      flush()
      bufMatched = isMatch
    }
    buf += label[i]
  }
  flush()
  return out
}
