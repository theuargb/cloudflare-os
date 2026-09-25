// Locale-aware timestamp formatting for chat UI tooltips.
//
// Use Ukrainian date order and month names consistently with the Workshop interface.
//
// The formatter instance is cached at module scope because constructing `Intl.DateTimeFormat` is
// surprisingly expensive and a chat view can render hundreds of timestamps.

let fullTimestampFormatter: Intl.DateTimeFormat | null = null;

function getFullTimestampFormatter(): Intl.DateTimeFormat {
  if (fullTimestampFormatter === null) {
    fullTimestampFormatter = new Intl.DateTimeFormat('uk-UA', {
      dateStyle: "short",
      timeStyle: "short",
    });
  }
  return fullTimestampFormatter;
}

/**
 * Format a short Ukrainian date and time for chat timestamp tooltips that need to disambiguate
 * which day a message belongs to.
 */
export function formatFullTimestamp(date: Date): string {
  return getFullTimestampFormatter().format(date);
}
