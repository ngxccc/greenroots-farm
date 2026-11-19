import { BUSINESS_RULES } from "./business.constants";

/**
 * Standard machine-readable error codes shared between Backend (NestJS)
 * and Clients (Next.js Storefront, React Backoffice).
 */
export const API_ERROR_CODES = {
  // Common HTTP & Request Errors
  BAD_REQUEST: "BAD_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  UNPROCESSABLE_ENTITY: "UNPROCESSABLE_ENTITY",
  TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  GATEWAY_TIMEOUT: "GATEWAY_TIMEOUT",
  NETWORK_ERROR: "NETWORK_ERROR",

  // Validation Error Codes (RFC 9457 invalidParams)
  VALIDATION_FAILED: "VALIDATION_FAILED",
  REQUIRED: "REQUIRED",
  INVALID_TYPE: "INVALID_TYPE",
  INVALID_FORMAT: "INVALID_FORMAT",
  INVALID_EMAIL: "INVALID_EMAIL",
  INVALID_PHONE: "INVALID_PHONE",
  INVALID_TAX_ID: "INVALID_TAX_ID",
  INVALID_UUID: "INVALID_UUID",
  INVALID_URL: "INVALID_URL",
  TOO_SMALL: "TOO_SMALL",
  TOO_BIG: "TOO_BIG",
  INVALID_VALUE: "INVALID_VALUE",
  UNRECOGNIZED_KEYS: "UNRECOGNIZED_KEYS",
  CUSTOM_VALIDATION_ERROR: "CUSTOM_VALIDATION_ERROR",

  // Authentication & Access Control
  AUTH_INVALID_CREDENTIALS: "AUTH_INVALID_CREDENTIALS",
  AUTH_TOKEN_INVALID_OR_EXPIRED: "AUTH_TOKEN_INVALID_OR_EXPIRED",
  AUTH_ACCOUNT_SUSPENDED: "AUTH_ACCOUNT_SUSPENDED",
  AUTH_EMAIL_NOT_VERIFIED: "AUTH_EMAIL_NOT_VERIFIED",
  AUTH_EMAIL_ALREADY_EXISTS: "AUTH_EMAIL_ALREADY_EXISTS",
  AUTH_VERIFICATION_TOKEN_INVALID: "AUTH_VERIFICATION_TOKEN_INVALID",
  AUTH_RESET_TOKEN_INVALID: "AUTH_RESET_TOKEN_INVALID",

  // Business & Domain Errors
  INSUFFICIENT_STOCK: "INSUFFICIENT_STOCK",
  OUT_OF_DELIVERY_RADIUS: "OUT_OF_DELIVERY_RADIUS",
  FARMING_LOG_IMMUTABLE: "FARMING_LOG_IMMUTABLE",
  ADDRESS_NOT_FOUND: "ADDRESS_NOT_FOUND",
  ADDRESS_LIMIT_REACHED: "ADDRESS_LIMIT_REACHED",
  DISTRICT_CODE_INVALID: "DISTRICT_CODE_INVALID",

  // Persistence, Concurrency & Database Violations
  CONFLICT_RECORD: "CONFLICT_RECORD",
  CONCURRENCY_CONFLICT: "CONCURRENCY_CONFLICT",
  FOREIGN_KEY_VIOLATION: "FOREIGN_KEY_VIOLATION",
  UNIQUE_VIOLATION: "UNIQUE_VIOLATION",
  CHECK_VIOLATION: "CHECK_VIOLATION",
} as const;

export type ApiErrorCode =
  (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

/**
 * Vietnamese user-facing dictionary mapping machine error codes to localized copy.
 * Used across both Storefront and Backoffice clients for presentation rendering.
 */
export const API_ERROR_DICTIONARY: Record<ApiErrorCode, string> = {
  // Common HTTP & Request
  [API_ERROR_CODES.BAD_REQUEST]:
    "Yêu cầu không hợp lệ hoặc dữ liệu gửi lên sai quy cách.",
  [API_ERROR_CODES.UNAUTHORIZED]: "Vui lòng đăng nhập để tiếp tục thao tác.",
  [API_ERROR_CODES.FORBIDDEN]: "Bạn không có quyền thực hiện thao tác này.",
  [API_ERROR_CODES.NOT_FOUND]:
    "Không tìm thấy dữ liệu yêu cầu hoặc tài nguyên không tồn tại.",
  [API_ERROR_CODES.CONFLICT]:
    "Đã xảy ra xung đột dữ liệu với trạng thái hiện tại của hệ thống.",
  [API_ERROR_CODES.UNPROCESSABLE_ENTITY]:
    "Dữ liệu hợp lệ về cú pháp nhưng vi phạm quy tắc nghiệp vụ.",
  [API_ERROR_CODES.TOO_MANY_REQUESTS]:
    "Bạn đã gửi quá nhiều yêu cầu trong thời gian ngắn. Vui lòng thử lại sau.",
  [API_ERROR_CODES.INTERNAL_SERVER_ERROR]:
    "Hệ thống gặp sự cố ngoài dự kiến. Vui lòng thử lại sau ít phút.",
  [API_ERROR_CODES.SERVICE_UNAVAILABLE]:
    "Hệ thống đang bảo trì hoặc tạm thời gián đoạn kết nối.",
  [API_ERROR_CODES.GATEWAY_TIMEOUT]: "Yêu cầu xử lý quá thời gian quy định.",
  [API_ERROR_CODES.NETWORK_ERROR]:
    "Không thể kết nối tới máy chủ GreenRoots Farm.",

  // Validation
  [API_ERROR_CODES.VALIDATION_FAILED]:
    "Vui lòng kiểm tra lại thông tin đã nhập.",
  [API_ERROR_CODES.REQUIRED]: "Trường này là bắt buộc.",
  [API_ERROR_CODES.INVALID_TYPE]: "Kiểu dữ liệu không hợp lệ.",
  [API_ERROR_CODES.INVALID_FORMAT]: "Định dạng dữ liệu không đúng quy định.",
  [API_ERROR_CODES.INVALID_EMAIL]: "Địa chỉ email không đúng định dạng.",
  [API_ERROR_CODES.INVALID_PHONE]:
    "Số điện thoại không hợp lệ (yêu cầu 10 chữ số).",
  [API_ERROR_CODES.INVALID_TAX_ID]:
    "Mã số thuế doanh nghiệp không hợp lệ (yêu cầu 10 hoặc 13 số).",
  [API_ERROR_CODES.INVALID_UUID]: "Mã định danh không đúng định dạng UUID.",
  [API_ERROR_CODES.INVALID_URL]: "Địa chỉ đường dẫn URL không hợp lệ.",
  [API_ERROR_CODES.TOO_SMALL]:
    "Giá trị hoặc độ dài quá nhỏ so với giới hạn tối thiểu.",
  [API_ERROR_CODES.TOO_BIG]: "Giá trị hoặc độ dài vượt quá giới hạn tối đa.",
  [API_ERROR_CODES.INVALID_VALUE]: "Giá trị được chọn không hợp lệ.",
  [API_ERROR_CODES.UNRECOGNIZED_KEYS]: "Dữ liệu chứa trường không được phép.",
  [API_ERROR_CODES.CUSTOM_VALIDATION_ERROR]:
    "Dữ liệu không thỏa mãn điều kiện kiểm tra.",

  // Authentication & Access Control
  [API_ERROR_CODES.AUTH_INVALID_CREDENTIALS]:
    "Email hoặc mật khẩu không chính xác.",
  [API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED]:
    "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.",
  [API_ERROR_CODES.AUTH_ACCOUNT_SUSPENDED]:
    "Tài khoản của bạn đã bị tạm khóa. Vui lòng liên hệ hỗ trợ.",
  [API_ERROR_CODES.AUTH_EMAIL_NOT_VERIFIED]:
    "Địa chỉ email chưa được xác thực. Vui lòng kiểm tra hộp thư để kích hoạt tài khoản.",
  [API_ERROR_CODES.AUTH_EMAIL_ALREADY_EXISTS]:
    "Địa chỉ email này đã được đăng ký trong hệ thống.",
  [API_ERROR_CODES.AUTH_VERIFICATION_TOKEN_INVALID]:
    "Mã xác thực email không hợp lệ hoặc đã hết hạn.",
  [API_ERROR_CODES.AUTH_RESET_TOKEN_INVALID]:
    "Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.",

  // Business & Domain
  [API_ERROR_CODES.INSUFFICIENT_STOCK]:
    "Số lượng nông sản còn lại trong kho không đủ cho yêu cầu này.",
  [API_ERROR_CODES.OUT_OF_DELIVERY_RADIUS]: `Địa chỉ nhận hàng vượt quá bán kính giao hỏa tốc ${BUSINESS_RULES.SHIPPING.MAX_RADIUS_KM} km từ nông trại.`,
  [API_ERROR_CODES.FARMING_LOG_IMMUTABLE]:
    "Nhật ký canh tác đã khóa bất biến, không thể chỉnh sửa hoặc xóa.",
  [API_ERROR_CODES.ADDRESS_NOT_FOUND]:
    "Không tìm thấy địa chỉ giao hàng yêu cầu.",
  [API_ERROR_CODES.ADDRESS_LIMIT_REACHED]: `Bạn chỉ được lưu tối đa ${BUSINESS_RULES.MAX_USER_ADDRESSES} địa chỉ giao hàng.`,
  [API_ERROR_CODES.DISTRICT_CODE_INVALID]:
    "Mã quận/huyện không hợp lệ hoặc nằm ngoài khu vực giao hàng TP. Hồ Chí Minh.",

  // Persistence & Database
  [API_ERROR_CODES.CONFLICT_RECORD]: "Dữ liệu này đã tồn tại trong hệ thống.",
  [API_ERROR_CODES.CONCURRENCY_CONFLICT]:
    "Đã xảy ra xung đột khi nhiều người cùng thao tác đồng thời. Vui lòng thử lại.",
  [API_ERROR_CODES.FOREIGN_KEY_VIOLATION]:
    "Dữ liệu liên quan không tồn tại hoặc đang được liên kết với bản ghi khác.",
  [API_ERROR_CODES.UNIQUE_VIOLATION]:
    "Thông tin này đã được đăng ký trong hệ thống.",
  [API_ERROR_CODES.CHECK_VIOLATION]:
    "Dữ liệu vi phạm ràng buộc toàn vẹn của hệ thống.",
};

/**
 * Resolves a human-readable Vietnamese message from an error code,
 * optional dynamic interpolation params or fallback detail.
 */
export function resolveSharedApiErrorMessage(
  code?: string,
  paramsOrDetail?: Record<string, unknown> | string,
  fallbackDetail?: string,
): string {
  const params =
    typeof paramsOrDetail === "object" && paramsOrDetail !== null
      ? paramsOrDetail
      : undefined;
  const detail =
    typeof paramsOrDetail === "string" ? paramsOrDetail : fallbackDetail;

  if (code && code in API_ERROR_DICTIONARY) {
    const baseMessage = API_ERROR_DICTIONARY[code as ApiErrorCode];

    if (params) {
      if (code === API_ERROR_CODES.TOO_SMALL) {
        if (params["origin"] === "string" && params["minimum"] !== undefined) {
          return `Độ dài tối thiểu là ${String(params["minimum"])} ký tự.`;
        }
        if (params["origin"] === "number" && params["minimum"] !== undefined) {
          return `Giá trị phải lớn hơn hoặc bằng ${String(params["minimum"])}.`;
        }
        if (params["origin"] === "array" && params["minimum"] !== undefined) {
          return `Danh sách phải có tối thiểu ${String(params["minimum"])} phần tử.`;
        }
      }

      if (code === API_ERROR_CODES.TOO_BIG) {
        if (params["origin"] === "string" && params["maximum"] !== undefined) {
          return `Độ dài tối đa là ${String(params["maximum"])} ký tự.`;
        }
        if (params["origin"] === "number" && params["maximum"] !== undefined) {
          return `Giá trị phải nhỏ hơn hoặc bằng ${String(params["maximum"])}.`;
        }
        if (params["origin"] === "array" && params["maximum"] !== undefined) {
          return `Danh sách tối đa ${String(params["maximum"])} phần tử.`;
        }
      }
    }

    return baseMessage;
  }

  return detail || API_ERROR_DICTIONARY[API_ERROR_CODES.NETWORK_ERROR];
}
