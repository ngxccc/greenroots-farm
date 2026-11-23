/**
 * Formats an integer VND amount for storefront pricing display.
 */
export function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString("vi-VN")}đ`;
}

/**
 * Formats an ISO date string into `DD/MM/YYYY` in `Asia/Ho_Chi_Minh`.
 */
export function formatViDate(isoDate: string): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }
  return parsed.toLocaleDateString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Derives up to two uppercase initials from a customer's full name for compact avatar badges.
 *
 * @param fullName Customer display name.
 * @returns One or two uppercase initials (e.g. `"Nguyễn Minh Anh"` -> `"MA"`).
 */
export function getUserInitials(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "GR";
  }

  if (words.length === 1) {
    const firstWord = Array.from(words[0] ?? "");
    return (firstWord[0] ?? "G").toLocaleUpperCase("vi-VN");
  }

  const secondLastChar = Array.from(words.at(-2) ?? "")[0] ?? "";
  const lastChar = Array.from(words.at(-1) ?? "")[0] ?? "";
  return `${secondLastChar}${lastChar}`.toLocaleUpperCase("vi-VN");
}
