import { TIME_IN_MS, TIME_IN_SECONDS } from "@/common/constants/time.constant";

/**
 * Converts seconds to equivalent milliseconds.
 *
 * @param seconds Number of seconds
 * @returns Milliseconds
 */
export function secondsToMs(seconds: number): number {
  return seconds * TIME_IN_MS.SECOND;
}

/**
 * Converts minutes to equivalent seconds.
 *
 * @param minutes Number of minutes
 * @returns Seconds
 */
export function minutesToSeconds(minutes: number): number {
  return minutes * TIME_IN_SECONDS.MINUTE;
}

/**
 * Converts minutes to equivalent milliseconds.
 *
 * @param minutes Number of minutes
 * @returns Milliseconds
 */
export function minutesToMs(minutes: number): number {
  return minutes * TIME_IN_MS.MINUTE;
}

/**
 * Converts hours to equivalent seconds.
 *
 * @param hours Number of hours
 * @returns Seconds
 */
export function hoursToSeconds(hours: number): number {
  return hours * TIME_IN_SECONDS.HOUR;
}

/**
 * Converts hours to equivalent milliseconds.
 *
 * @param hours Number of hours
 * @returns Milliseconds
 */
export function hoursToMs(hours: number): number {
  return hours * TIME_IN_MS.HOUR;
}

/**
 * Converts days to equivalent seconds.
 *
 * @param days Number of days
 * @returns Seconds
 */
export function daysToSeconds(days: number): number {
  return days * TIME_IN_SECONDS.DAY;
}

/**
 * Converts days to equivalent milliseconds.
 *
 * @param days Number of days
 * @returns Milliseconds
 */
export function daysToMs(days: number): number {
  return days * TIME_IN_MS.DAY;
}

/**
 * Parses a duration string (e.g. "7d", "15m", "2h", "30s") or raw seconds into milliseconds.
 *
 * @param duration Duration string or number of seconds
 * @param defaultMs Fallback milliseconds if parsing fails
 * @returns Equivalent duration in milliseconds
 */
export function parseDuration(
  duration: string | number,
  defaultMs: number = 7 * TIME_IN_MS.DAY,
): number {
  if (typeof duration === "number") {
    return duration * TIME_IN_MS.SECOND;
  }

  const trimmed = duration.trim();
  const value = parseInt(trimmed, 10);
  const unit = trimmed.slice(-1).toLowerCase();

  if (Number.isNaN(value)) {
    return defaultMs;
  }

  switch (unit) {
    case "s":
      return value * TIME_IN_MS.SECOND;
    case "m":
      return value * TIME_IN_MS.MINUTE;
    case "h":
      return value * TIME_IN_MS.HOUR;
    case "d":
      return value * TIME_IN_MS.DAY;
    case "w":
      return value * TIME_IN_MS.WEEK;
    default:
      return Number.isNaN(Number(trimmed)) ? defaultMs : Number(trimmed);
  }
}

/**
 * Calculates a future Date from a duration string (e.g. "7d", "15m") or number of seconds.
 *
 * @param duration Duration string or number of seconds
 * @param fromDate Starting Date (defaults to Date.now())
 * @returns Future Date instance
 */
export function getExpiryDate(
  duration: string | number,
  fromDate: Date = new Date(),
): Date {
  return new Date(fromDate.getTime() + parseDuration(duration));
}

/**
 * Calculates a past Date from a duration string (e.g. "7d", "15m") or number of seconds.
 *
 * @param duration Duration string or number of seconds
 * @param fromDate Starting Date (defaults to Date.now())
 * @returns Past Date instance
 */
export function getPastDate(
  duration: string | number,
  fromDate: Date = new Date(),
): Date {
  return new Date(fromDate.getTime() - parseDuration(duration));
}
