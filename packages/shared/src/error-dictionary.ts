import { BUSINESS_RULES } from "./business.constants";

/**
 * Shared RFC 9457 error dictionary mapping API error codes to Vietnamese user-facing messages.
 * Used across both Storefront and Backoffice.
 */
export const API_ERROR_DICTIONARY = {
  INSUFFICIENT_STOCK:
    "Số lượng nông sản còn lại trong kho không đủ cho yêu cầu này.",
  OUT_OF_DELIVERY_RADIUS: `Địa chỉ nhận hàng vượt quá bán kính giao hỏa tốc ${BUSINESS_RULES.SHIPPING.MAX_RADIUS_KM} km từ nông trại.`,
  AUTH_INVALID_CREDENTIALS: "Email hoặc mật khẩu không chính xác.",
  AUTH_TOKEN_INVALID_OR_EXPIRED:
    "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.",
  FARMING_LOG_IMMUTABLE:
    "Nhật ký canh tác đã khóa bất biến, không thể chỉnh sửa hoặc xóa.",
  VALIDATION_FAILED: "Vui lòng kiểm tra lại thông tin đã nhập.",
  NETWORK_ERROR: "Không thể kết nối tới máy chủ GreenRoots Farm.",
} as const;

const ERROR_MESSAGES: Record<string, string> = API_ERROR_DICTIONARY;

/**
 * Resolves a human-readable Vietnamese message from an error code and fallback detail.
 */
export function resolveSharedApiErrorMessage(
  code?: string,
  detail?: string,
): string {
  const mapped = code ? ERROR_MESSAGES[code] : undefined;
  return mapped ?? (detail || API_ERROR_DICTIONARY.NETWORK_ERROR);
}
