export const EGYPT_TIMEZONE = 'Africa/Cairo';

const egyptDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: EGYPT_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const egyptDateTimePartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: EGYPT_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const ISO_DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

function extractPartsMap(
  formatter: Intl.DateTimeFormat,
  date: Date
): Record<string, string> {
  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }
  return map;
}

/**
 * Formats a Date instant into YYYY-MM-DD in Egypt local timezone (Africa/Cairo).
 */
export function formatInstantInEgyptDate(date: Date = new Date()): string {
  const parts = extractPartsMap(egyptDateFormatter, date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Returns today's YYYY-MM-DD calendar date in Egypt local timezone (Africa/Cairo).
 */
export function getEgyptTodayIsoDate(now: Date = new Date()): string {
  return formatInstantInEgyptDate(now);
}

/**
 * Returns Egypt local year, 1-based month, day, and time components for an instant.
 */
export function getEgyptDateTimeParts(now: Date = new Date()): {
  year: number;
  month: number;
  monthIndex: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  isoDate: string;
} {
  const parts = extractPartsMap(egyptDateTimePartsFormatter, now);
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const rawHour = Number(parts.hour);
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = Number(parts.minute);
  const second = Number(parts.second);

  return {
    year,
    month,
    monthIndex: month - 1,
    day,
    hour,
    minute,
    second,
    isoDate: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/**
 * Normalizes a stored booking/expense date (`YYYY-MM-DD`) or ISO timestamp (`TIMESTAMPTZ`)
 * into a canonical Egypt local calendar date (`YYYY-MM-DD`).
 *
 * - Pure `YYYY-MM-DD` strings are treated as Egypt calendar dates directly (no UTC shift).
 * - Full timestamps (e.g. `2026-11-22T22:30:00Z`) are converted to their Egypt local date.
 */
export function normalizeToEgyptDateString(
  value: string | Date | null | undefined
): string {
  if (!value) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return formatInstantInEgyptDate(value);
  }

  const trimmed = value.trim();
  if (!trimmed) return '';

  if (ISO_DATE_ONLY_REGEX.test(trimmed)) {
    return trimmed;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return formatInstantInEgyptDate(parsed);
  }

  const prefixMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  return prefixMatch ? prefixMatch[1] : '';
}

/**
 * Adds (or subtracts) calendar days relative to an instant or YYYY-MM-DD date in Egypt.
 * Uses pure calendar math after resolving the Egypt date so DST transitions never skip/double days.
 */
export function addEgyptDays(base: Date | string, days: number): string {
  const baseDateStr =
    base instanceof Date
      ? formatInstantInEgyptDate(base)
      : normalizeToEgyptDateString(base);

  const match = baseDateStr.match(ISO_DATE_ONLY_REGEX);
  if (!match) return '';

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Computes whole calendar nights between checkIn and checkOut using Egypt calendar dates,
 * immune to browser timezone offsets and DST transitions.
 */
export function computeEgyptNights(checkIn: string, checkOut: string): number {
  const ciStr = normalizeToEgyptDateString(checkIn);
  const coStr = normalizeToEgyptDateString(checkOut);
  const ciMatch = ciStr.match(ISO_DATE_ONLY_REGEX);
  const coMatch = coStr.match(ISO_DATE_ONLY_REGEX);
  if (!ciMatch || !coMatch) return 0;

  const ciUtc = Date.UTC(
    Number(ciMatch[1]),
    Number(ciMatch[2]) - 1,
    Number(ciMatch[3])
  );
  const coUtc = Date.UTC(
    Number(coMatch[1]),
    Number(coMatch[2]) - 1,
    Number(coMatch[3])
  );

  const diff = Math.round((coUtc - ciUtc) / 86400000);
  return diff > 0 ? diff : 0;
}
