/**
 * Centralized Vietnamese API messages.
 *
 * Every user-facing API message lives here. Application code MUST NOT inline
 * Vietnamese notification strings (nestjs-i18n is intentionally not used).
 */
export const MESSAGES = {
  COMMON: {
    SUCCESS: "Thao tác thành công",
    BAD_REQUEST: "Yêu cầu không hợp lệ",
    UNAUTHORIZED: "Bạn cần đăng nhập để tiếp tục",
    FORBIDDEN: "Bạn không có quyền thực hiện thao tác này",
    NOT_FOUND: "Không tìm thấy tài nguyên yêu cầu",
    CONFLICT: "Dữ liệu bị xung đột, vui lòng thử lại",
    UNPROCESSABLE_ENTITY: "Dữ liệu không thể xử lý",
    TOO_MANY_REQUESTS: "Bạn đã gửi quá nhiều yêu cầu, vui lòng thử lại sau",
    INTERNAL_SERVER_ERROR: "Đã xảy ra lỗi hệ thống, vui lòng thử lại sau",
    SERVICE_UNAVAILABLE: "Dịch vụ tạm thời không khả dụng",
    GATEWAY_TIMEOUT: "Hệ thống xử lý quá thời gian, vui lòng thử lại",
    HEALTHY: "Hệ thống đang hoạt động bình thường",
  },
  AUTH: {
    TOKEN_MISSING: "Không tìm thấy access token trong yêu cầu",
    TOKEN_INVALID_OR_EXPIRED: "Access token không hợp lệ hoặc đã hết hạn",
    TOKEN_REVOKED: "Phiên đăng nhập đã bị thu hồi, vui lòng đăng nhập lại",
    REDIS_REVOCATION_UNAVAILABLE:
      "Không thể kiểm tra danh sách thu hồi token trên Redis, tạm thời cho phép yêu cầu",
    REDIS_REVOCATION_RECOVERED:
      "Đã kết nối lại Redis, tiếp tục kiểm tra danh sách thu hồi token",
  },
  VALIDATION: {
    INVALID_INPUT: "Dữ liệu gửi lên không đúng định dạng",
    INVALID_VALUE: "Giá trị không hợp lệ",
    REQUIRED: "Trường này là bắt buộc",
    INVALID_TYPE: "Kiểu dữ liệu không hợp lệ",
    INVALID_EMAIL: "Định dạng email không hợp lệ",
    INVALID_UUID: "Định dạng UUID không hợp lệ",
    INVALID_URL: "Định dạng URL không hợp lệ",
    INVALID_PHONE:
      "Số điện thoại không hợp lệ (yêu cầu 10 số di động Việt Nam)",
    INVALID_TAX_ID: "Mã số thuế không hợp lệ",
    PASSWORD_UPPERCASE: "Mật khẩu phải chứa ít nhất 1 chữ cái in hoa",
    PASSWORD_NUMBER: "Mật khẩu phải chứa ít nhất 1 chữ số",
    PASSWORD_SPECIAL: "Mật khẩu phải chứa ít nhất 1 ký tự đặc biệt",
    UNRECOGNIZED_KEY: "Trường không được hỗ trợ",
  },
  MEDIA: {
    FOLDER_ACCESS_DENIED: "Bạn không có quyền tải lên thư mục này",
    FILE_TOO_LARGE: "Kích thước tập tin vượt quá giới hạn cho phép",
    INVALID_UPLOAD_REQUEST: "Dữ liệu yêu cầu chữ ký tải lên không hợp lệ",
  },
  DATABASE: {
    IMMUTABLE_RECORD:
      "Bản ghi nhật ký canh tác là bất biến, không được phép sửa hoặc xóa",
    FOREIGN_KEY_VIOLATION:
      "Dữ liệu tham chiếu không tồn tại hoặc đang được sử dụng ở nơi khác",
    UNIQUE_VIOLATION: "Dữ liệu đã tồn tại, vui lòng kiểm tra lại",
    CHECK_VIOLATION: "Dữ liệu vi phạm ràng buộc toàn vẹn của hệ thống",
    CONCURRENCY_CONFLICT:
      "Dữ liệu vừa bị thay đổi bởi giao dịch khác, vui lòng thử lại",
    INVALID_TEXT_REPRESENTATION: "Định dạng dữ liệu gửi lên không hợp lệ",
  },
} as const;

/**
 * Static RFC 9457 problem type slugs served under `/errors/<slug>`.
 */
export const ERROR_SLUGS = {
  BAD_REQUEST: "bad-request",
  UNAUTHORIZED: "unauthorized",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not-found",
  CONFLICT: "conflict",
  UNPROCESSABLE_ENTITY: "unprocessable-entity",
  TOO_MANY_REQUESTS: "too-many-requests",
  INTERNAL_SERVER_ERROR: "internal-server-error",
  SERVICE_UNAVAILABLE: "service-unavailable",
  GATEWAY_TIMEOUT: "gateway-timeout",
} as const;

export type ErrorSlug = (typeof ERROR_SLUGS)[keyof typeof ERROR_SLUGS];
