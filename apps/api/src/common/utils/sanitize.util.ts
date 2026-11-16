import sanitizeHtml from "sanitize-html";

/**
 * Cleans the input text string by stripping all HTML tags (XSS protection)
 * using the industry-standard sanitize-html library.
 * Disallows all HTML tags and attributes.
 *
 * @param value The input value to sanitize
 * @returns Cleaned string without HTML markup
 */
export function sanitizeString(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  return sanitizeHtml(value, {
    allowedTags: [],
    allowedAttributes: {},
  }).trim();
}
