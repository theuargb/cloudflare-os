// Bounds of the user's UI preferences (sidebar layout, finished tours, gatekeeper app preferences),
// stored as one key → string map in the user's Durable Object. Values come from the browser and, for
// `app:*` keys, from untrusted app frames, so every write is validated and the whole map is capped.

const KEY_PATTERN = /^[a-z][a-z0-9.:-]{0,79}$/;
const MAX_VALUE_LENGTH = 32_768;
const MAX_KEYS = 200;
/** Sum of every key's and value's length. */
const MAX_TOTAL_LENGTH = 131_072;

/** `current` with `key` set to `value` (null deletes); throws on an invalid or oversized preference. */
export function withUiPreference(
  current: Readonly<Record<string, string>>,
  key: unknown,
  value: unknown,
): Record<string, string> {
  if (typeof key !== "string" || !KEY_PATTERN.test(key)) throw new Error("Invalid UI preference key.");
  if (value !== null && (typeof value !== "string" || value.length > MAX_VALUE_LENGTH)) {
    throw new Error("Invalid UI preference value.");
  }
  const next = { ...current };
  if (value === null) delete next[key];
  else next[key] = value;
  const entries = Object.entries(next);
  if (entries.length > MAX_KEYS) throw new Error("Too many UI preferences.");
  const total = entries.reduce((sum, [name, stored]) => sum + name.length + stored.length, 0);
  if (total > MAX_TOTAL_LENGTH) throw new Error("UI preferences are too large.");
  return next;
}
