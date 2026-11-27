import { formatViDateTime } from "@/lib/format";

const MOBILE_DEVICE_RE = /iphone|ipad|ipod|android|mobile/i;
const RAW_USER_AGENT_RE = /^(?:Mozilla\/|Opera\/)|AppleWebKit\/|Gecko\//i;

const BROWSER_RULES: readonly (readonly [RegExp, string])[] = [
  [/Edg(?:A|iOS)?\//i, "Microsoft Edge"],
  [/(?:OPR|Opera)\//i, "Opera"],
  [/SamsungBrowser\//i, "Samsung Internet"],
  [/(?:Firefox|FxiOS)\//i, "Firefox"],
  [/(?:Chrome|CriOS)\//i, "Chrome"],
  [/Safari\//i, "Safari"],
];

const OS_RULES: readonly (readonly [RegExp, string])[] = [
  [/iPhone/i, "iPhone"],
  [/iPad/i, "iPad"],
  [/Android/i, "Android"],
  [/Windows/i, "Windows"],
  [/Macintosh|Mac OS X/i, "macOS"],
  [/CrOS/i, "ChromeOS"],
  [/Linux/i, "Linux"],
];

function stripControlCharacters(value: string): string {
  let result = "";
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code >= 0x20 && code !== 0x7f) {
      result += ch;
    }
  }
  return result;
}

function sanitizeDisplayText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = stripControlCharacters(value).trim();
  return cleaned.length > 0 ? cleaned : null;
}

function matchFirstRule(
  value: string,
  rules: readonly (readonly [RegExp, string])[],
): string | null {
  for (const [pattern, label] of rules) {
    if (pattern.test(value)) {
      return label;
    }
  }
  return null;
}

/**
 * Formats a nullable `ActiveSessionDto.deviceName` (`User-Agent` or device label)
 * into a concise Vietnamese-safe display name with fallback for null/blank metadata.
 *
 * @param deviceName Raw `deviceName` from `GET /api/v1/auth/customer/sessions`.
 * @returns Readable device/browser label or `"Thiết bị không xác định"`.
 */
export function formatSessionDeviceLabel(deviceName: string | null): string {
  const cleaned = sanitizeDisplayText(deviceName);
  if (!cleaned) {
    return "Thiết bị không xác định";
  }

  if (!RAW_USER_AGENT_RE.test(cleaned)) {
    return cleaned;
  }

  const browser = matchFirstRule(cleaned, BROWSER_RULES);
  const os = matchFirstRule(cleaned, OS_RULES);

  if (browser && os) {
    return `${browser} · ${os}`;
  }
  if (browser) {
    return browser;
  }
  if (os) {
    return `Trình duyệt trên ${os}`;
  }
  return cleaned;
}

/**
 * Classifies whether a session `deviceName` represents a mobile/tablet device.
 *
 * @param deviceName Raw `deviceName` from `ActiveSessionDto`.
 * @returns `true` when mobile/tablet tokens are detected.
 */
export function isMobileSessionDevice(deviceName: string | null): boolean {
  const cleaned = sanitizeDisplayText(deviceName);
  return cleaned ? MOBILE_DEVICE_RE.test(cleaned) : false;
}

/**
 * Formats a nullable session IP address with fallback copy when absent.
 *
 * @param ipAddress Raw `ipAddress` from `ActiveSessionDto`.
 * @returns Sanitized IP string or `"IP không xác định"`.
 */
export function formatSessionIpAddress(ipAddress: string | null): string {
  return sanitizeDisplayText(ipAddress) ?? "IP không xác định";
}

/**
 * Formats an ISO-8601 session timestamp (`createdAt` / `expiresAt`) in `Asia/Ho_Chi_Minh`,
 * falling back safely if missing or unparseable.
 *
 * @param isoDate ISO-8601 datetime string from `ActiveSessionDto`.
 * @returns Formatted `HH:mm, DD/MM/YYYY` timestamp or `"Không xác định"`.
 */
export function formatSessionTimestamp(
  isoDate: string | null | undefined,
): string {
  const cleaned = sanitizeDisplayText(isoDate);
  if (!cleaned || Number.isNaN(new Date(cleaned).getTime())) {
    return "Không xác định";
  }
  return formatViDateTime(cleaned);
}
