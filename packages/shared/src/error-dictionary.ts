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
  AUTH_SURFACE_FORBIDDEN: "AUTH_SURFACE_FORBIDDEN",

  // Business & Domain Errors
  INSUFFICIENT_STOCK: "INSUFFICIENT_STOCK",
  OUT_OF_DELIVERY_RADIUS: "OUT_OF_DELIVERY_RADIUS",
  ORDER_BELOW_MINIMUM_VALUE: "ORDER_BELOW_MINIMUM_VALUE",
  ORDER_COD_DISABLED: "ORDER_COD_DISABLED",
  ORDER_PAYOS_DISABLED: "ORDER_PAYOS_DISABLED",
  ORDER_NOT_FOUND: "ORDER_NOT_FOUND",
  ORDER_INVALID_STATUS_TRANSITION: "ORDER_INVALID_STATUS_TRANSITION",
  ORDER_PAID_CANCELLATION_FORBIDDEN: "ORDER_PAID_CANCELLATION_FORBIDDEN",
  ORDER_PICK_LIST_STATUS_INVALID: "ORDER_PICK_LIST_STATUS_INVALID",
  ORDER_ACTIVE_ALLOCATIONS_MISSING: "ORDER_ACTIVE_ALLOCATIONS_MISSING",
  ORDER_PENDING_LIMIT_EXCEEDED: "ORDER_PENDING_LIMIT_EXCEEDED",
  ORDER_PAYOS_PENDING_LIMIT_EXCEEDED: "ORDER_PAYOS_PENDING_LIMIT_EXCEEDED",
  ORDER_PAYOS_ZERO_AMOUNT: "ORDER_PAYOS_ZERO_AMOUNT",
  ORDER_PAYMENT_REQUIRED: "ORDER_PAYMENT_REQUIRED",
  PAYMENT_GATEWAY_ERROR: "PAYMENT_GATEWAY_ERROR",
  PAYMENT_WEBHOOK_SIGNATURE_INVALID: "PAYMENT_WEBHOOK_SIGNATURE_INVALID",
  PAYMENT_NOT_FOUND: "PAYMENT_NOT_FOUND",
  PAYMENT_AMOUNT_MISMATCH: "PAYMENT_AMOUNT_MISMATCH",
  PAYMENT_COD_NOT_ELIGIBLE: "PAYMENT_COD_NOT_ELIGIBLE",
  PAYMENT_INVALID_STATUS_TRANSITION: "PAYMENT_INVALID_STATUS_TRANSITION",
  ORDER_COMPLAINT_NOT_ELIGIBLE: "ORDER_COMPLAINT_NOT_ELIGIBLE",
  ORDER_COMPLAINT_WINDOW_EXPIRED: "ORDER_COMPLAINT_WINDOW_EXPIRED",
  ORDER_COMPLAINT_ALREADY_EXISTS: "ORDER_COMPLAINT_ALREADY_EXISTS",
  COMPLAINT_MEDIA_INVALID: "COMPLAINT_MEDIA_INVALID",
  FARMING_LOG_IMMUTABLE: "FARMING_LOG_IMMUTABLE",
  FARMING_LOG_CORRECTION_TARGET_INVALID:
    "FARMING_LOG_CORRECTION_TARGET_INVALID",
  FARMING_LOG_SEASON_STATUS_INVALID: "FARMING_LOG_SEASON_STATUS_INVALID",
  ADDRESS_NOT_FOUND: "ADDRESS_NOT_FOUND",
  ADDRESS_LIMIT_REACHED: "ADDRESS_LIMIT_REACHED",
  DISTRICT_CODE_INVALID: "DISTRICT_CODE_INVALID",
  STAFF_NOT_FOUND: "STAFF_NOT_FOUND",
  LAST_SUPER_ADMIN: "LAST_SUPER_ADMIN",
  SELF_MODIFICATION_FORBIDDEN: "SELF_MODIFICATION_FORBIDDEN",
  STAFF_ROLE_INVALID: "STAFF_ROLE_INVALID",
  FARM_NOT_FOUND: "FARM_NOT_FOUND",
  FARM_PAYMENT_METHOD_REQUIRED: "FARM_PAYMENT_METHOD_REQUIRED",
  FARM_FLASH_SALE_CONFIG_INVALID: "FARM_FLASH_SALE_CONFIG_INVALID",
  FARM_SHIPPING_SUBSCRIPTION_RADIUS_INVALID:
    "FARM_SHIPPING_SUBSCRIPTION_RADIUS_INVALID",
  FARM_SHIPPING_FREE_THRESHOLD_INVALID: "FARM_SHIPPING_FREE_THRESHOLD_INVALID",
  PLOT_NOT_FOUND: "PLOT_NOT_FOUND",
  PLOT_CODE_ALREADY_EXISTS: "PLOT_CODE_ALREADY_EXISTS",
  PLOT_HAS_ACTIVE_SEASONS: "PLOT_HAS_ACTIVE_SEASONS",
  SEASON_NOT_FOUND: "SEASON_NOT_FOUND",
  SEASON_INVALID_STATUS_TRANSITION: "SEASON_INVALID_STATUS_TRANSITION",
  SEASON_INVALID_DATE_RANGE: "SEASON_INVALID_DATE_RANGE",
  SEASON_PLOT_ACTIVE_CONFLICT: "SEASON_PLOT_ACTIVE_CONFLICT",
  SEASON_NOT_DELETABLE: "SEASON_NOT_DELETABLE",
  BATCH_NOT_FOUND: "BATCH_NOT_FOUND",
  BATCH_SEASON_STATUS_INVALID: "BATCH_SEASON_STATUS_INVALID",
  BATCH_HARVEST_DATE_INVALID: "BATCH_HARVEST_DATE_INVALID",
  BATCH_EXPIRED_AT_INTAKE: "BATCH_EXPIRED_AT_INTAKE",
  WASTE_LOG_NOT_FOUND: "WASTE_LOG_NOT_FOUND",
  WASTE_LOG_BATCH_NOT_ELIGIBLE: "WASTE_LOG_BATCH_NOT_ELIGIBLE",
  WASTE_LOG_QUANTITY_EXCEEDS_AVAILABLE: "WASTE_LOG_QUANTITY_EXCEEDS_AVAILABLE",
  WASTE_LOG_ALREADY_REVIEWED: "WASTE_LOG_ALREADY_REVIEWED",
  WASTE_LOG_SELF_REVIEW_FORBIDDEN: "WASTE_LOG_SELF_REVIEW_FORBIDDEN",
  CATEGORY_NOT_FOUND: "CATEGORY_NOT_FOUND",
  CATEGORY_SLUG_ALREADY_EXISTS: "CATEGORY_SLUG_ALREADY_EXISTS",
  CATEGORY_NAME_ALREADY_EXISTS: "CATEGORY_NAME_ALREADY_EXISTS",
  CATEGORY_HAS_CHILDREN: "CATEGORY_HAS_CHILDREN",
  CATEGORY_HAS_PRODUCTS: "CATEGORY_HAS_PRODUCTS",
  CATEGORY_HIERARCHY_INVALID: "CATEGORY_HIERARCHY_INVALID",
  PRODUCT_NOT_FOUND: "PRODUCT_NOT_FOUND",
  PRODUCT_SLUG_ALREADY_EXISTS: "PRODUCT_SLUG_ALREADY_EXISTS",
  PRODUCT_PRICE_INVALID: "PRODUCT_PRICE_INVALID",
  SUBSCRIPTION_PLAN_NOT_FOUND: "SUBSCRIPTION_PLAN_NOT_FOUND",
  SUBSCRIPTION_PLAN_SLUG_CONFLICT: "SUBSCRIPTION_PLAN_SLUG_CONFLICT",
  SUBSCRIPTION_PLAN_INACTIVE: "SUBSCRIPTION_PLAN_INACTIVE",
  SUBSCRIPTION_NOT_FOUND: "SUBSCRIPTION_NOT_FOUND",
  SUBSCRIPTION_PAYOS_DISABLED: "SUBSCRIPTION_PAYOS_DISABLED",
  SUBSCRIPTION_PENDING_LIMIT_REACHED: "SUBSCRIPTION_PENDING_LIMIT_REACHED",

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
  [API_ERROR_CODES.AUTH_SURFACE_FORBIDDEN]:
    "Tài khoản này không được phép đăng nhập trên cổng hiện tại.",

  // Business & Domain
  [API_ERROR_CODES.INSUFFICIENT_STOCK]:
    "Số lượng nông sản còn lại trong kho không đủ cho yêu cầu này.",
  [API_ERROR_CODES.OUT_OF_DELIVERY_RADIUS]:
    "Địa chỉ nhận hàng vượt quá bán kính giao hỏa tốc cho phép từ nông trại.",
  [API_ERROR_CODES.ORDER_BELOW_MINIMUM_VALUE]: `Giá trị đơn hàng chưa đạt mức tối thiểu ${BUSINESS_RULES.MIN_ORDER_VALUE_VND.toLocaleString("vi-VN")}đ (không tính phí giao hàng).`,
  [API_ERROR_CODES.ORDER_COD_DISABLED]:
    "Phương thức thanh toán khi nhận hàng (COD) hiện đang tạm ngưng.",
  [API_ERROR_CODES.ORDER_PAYOS_DISABLED]:
    "Phương thức thanh toán trực tuyến PayOS hiện đang tạm ngưng.",
  [API_ERROR_CODES.ORDER_NOT_FOUND]: "Không tìm thấy đơn hàng yêu cầu.",
  [API_ERROR_CODES.ORDER_INVALID_STATUS_TRANSITION]:
    "Trạng thái hiện tại của đơn hàng không cho phép thực hiện chuyển đổi này.",
  [API_ERROR_CODES.ORDER_PAID_CANCELLATION_FORBIDDEN]:
    "Đơn hàng đã thanh toán hoặc không phải COD không thể hủy trực tiếp; vui lòng xử lý qua quy trình hoàn tiền.",
  [API_ERROR_CODES.ORDER_PICK_LIST_STATUS_INVALID]:
    "Chỉ có thể xem phiếu lấy hàng cho đơn đã xác nhận, đang đóng gói hoặc đang giao hàng.",
  [API_ERROR_CODES.ORDER_ACTIVE_ALLOCATIONS_MISSING]:
    "Đơn hàng hiện chưa có dữ liệu phân bổ lô nông sản đang hoạt động.",
  [API_ERROR_CODES.ORDER_PENDING_LIMIT_EXCEEDED]: `Bạn đang có tối đa ${BUSINESS_RULES.MAX_PENDING_COD_ORDERS_PER_CUSTOMER} đơn hàng COD chờ xác nhận. Vui lòng hoàn tất hoặc hủy bớt đơn trước khi đặt thêm.`,
  [API_ERROR_CODES.ORDER_PAYOS_PENDING_LIMIT_EXCEEDED]: `Bạn đang có tối đa ${BUSINESS_RULES.MAX_PENDING_PAYOS_ORDERS_PER_CUSTOMER} đơn hàng PayOS chờ thanh toán. Vui lòng thanh toán hoặc hủy bớt đơn trước khi đặt thêm.`,
  [API_ERROR_CODES.ORDER_PAYOS_ZERO_AMOUNT]:
    "Không thể thanh toán qua PayOS cho đơn hàng có tổng thanh toán bằng 0đ.",
  [API_ERROR_CODES.ORDER_PAYMENT_REQUIRED]:
    "Đơn hàng cần được xác nhận đã thanh toán trước khi chuyển sang trạng thái hoàn tất.",
  [API_ERROR_CODES.PAYMENT_GATEWAY_ERROR]:
    "Không thể khởi tạo liên kết thanh toán PayOS. Vui lòng thử lại sau.",
  [API_ERROR_CODES.PAYMENT_WEBHOOK_SIGNATURE_INVALID]:
    "Chữ ký xác thực webhook thanh toán không hợp lệ.",
  [API_ERROR_CODES.PAYMENT_NOT_FOUND]:
    "Không tìm thấy giao dịch thanh toán tương ứng với mã đơn hàng.",
  [API_ERROR_CODES.PAYMENT_AMOUNT_MISMATCH]:
    "Số tiền thanh toán từ cổng PayOS không khớp với giá trị đơn hàng.",
  [API_ERROR_CODES.PAYMENT_COD_NOT_ELIGIBLE]:
    "Giao dịch này không đủ điều kiện xác nhận thu tiền hộ (COD).",
  [API_ERROR_CODES.PAYMENT_INVALID_STATUS_TRANSITION]:
    "Trạng thái hiện tại của giao dịch thanh toán không cho phép thực hiện thao tác này.",
  [API_ERROR_CODES.ORDER_COMPLAINT_NOT_ELIGIBLE]:
    "Chỉ có thể gửi khiếu nại cho đơn hàng đã giao thành công.",
  [API_ERROR_CODES.ORDER_COMPLAINT_WINDOW_EXPIRED]: `Đã quá thời hạn ${BUSINESS_RULES.COMPLAINT_WINDOW_HOURS} giờ kể từ lúc giao hàng để gửi khiếu nại.`,
  [API_ERROR_CODES.ORDER_COMPLAINT_ALREADY_EXISTS]:
    "Đơn hàng này đã có khiếu nại được ghi nhận.",
  [API_ERROR_CODES.COMPLAINT_MEDIA_INVALID]:
    "Hình ảnh hoặc video minh chứng không hợp lệ hoặc vượt quá giới hạn cho phép.",
  [API_ERROR_CODES.FARMING_LOG_IMMUTABLE]:
    "Nhật ký canh tác đã khóa bất biến, không thể chỉnh sửa hoặc xóa.",
  [API_ERROR_CODES.FARMING_LOG_CORRECTION_TARGET_INVALID]:
    "Bản ghi đính chính không hợp lệ hoặc không thuộc cùng mùa vụ.",
  [API_ERROR_CODES.FARMING_LOG_SEASON_STATUS_INVALID]:
    "Trạng thái mùa vụ hiện tại không cho phép ghi nhận hành động canh tác này.",
  [API_ERROR_CODES.ADDRESS_NOT_FOUND]:
    "Không tìm thấy địa chỉ giao hàng yêu cầu.",
  [API_ERROR_CODES.ADDRESS_LIMIT_REACHED]: `Bạn chỉ được lưu tối đa ${BUSINESS_RULES.MAX_USER_ADDRESSES} địa chỉ giao hàng.`,
  [API_ERROR_CODES.DISTRICT_CODE_INVALID]:
    "Mã quận/huyện không hợp lệ hoặc nằm ngoài khu vực giao hàng TP. Hồ Chí Minh.",
  [API_ERROR_CODES.STAFF_NOT_FOUND]:
    "Không tìm thấy tài khoản nhân viên yêu cầu.",
  [API_ERROR_CODES.LAST_SUPER_ADMIN]:
    "Không thể hạ quyền hoặc tạm khóa quản trị viên tối cao đang hoạt động cuối cùng.",
  [API_ERROR_CODES.SELF_MODIFICATION_FORBIDDEN]:
    "Bạn không thể tự thay đổi vai trò, trạng thái hoặc đặt lại thông tin đăng nhập của chính mình.",
  [API_ERROR_CODES.STAFF_ROLE_INVALID]:
    "Vai trò được chọn không hợp lệ cho tài khoản nhân viên.",
  [API_ERROR_CODES.FARM_NOT_FOUND]:
    "Không tìm thấy cấu hình nông trại trong hệ thống.",
  [API_ERROR_CODES.FARM_PAYMENT_METHOD_REQUIRED]:
    "Phải bật ít nhất một phương thức thanh toán (PayOS hoặc COD).",
  [API_ERROR_CODES.FARM_FLASH_SALE_CONFIG_INVALID]:
    "Cấu hình ngưỡng giờ flash sale của nông trại không hợp lệ.",
  [API_ERROR_CODES.FARM_SHIPPING_SUBSCRIPTION_RADIUS_INVALID]:
    "Bán kính miễn phí giao hàng định kỳ không được vượt quá bán kính giao hàng tối đa.",
  [API_ERROR_CODES.FARM_SHIPPING_FREE_THRESHOLD_INVALID]:
    "Ngưỡng km miễn phí giao hàng không được vượt quá bán kính giao hàng tối đa.",
  [API_ERROR_CODES.PLOT_NOT_FOUND]: "Không tìm thấy lô đất yêu cầu.",
  [API_ERROR_CODES.PLOT_CODE_ALREADY_EXISTS]:
    "Mã lô đất này đã tồn tại trên một lô đất đang hoạt động.",
  [API_ERROR_CODES.PLOT_HAS_ACTIVE_SEASONS]:
    "Không thể xóa lô đất khi vẫn còn mùa vụ đang lập kế hoạch hoặc đang canh tác.",
  [API_ERROR_CODES.SEASON_NOT_FOUND]: "Không tìm thấy mùa vụ yêu cầu.",
  [API_ERROR_CODES.SEASON_INVALID_STATUS_TRANSITION]:
    "Không thể chuyển trạng thái hoặc chỉnh sửa mùa vụ ở giai đoạn hiện tại.",
  [API_ERROR_CODES.SEASON_INVALID_DATE_RANGE]:
    "Ngày bắt đầu mùa vụ phải nhỏ hơn hoặc bằng ngày thu hoạch dự kiến.",
  [API_ERROR_CODES.SEASON_PLOT_ACTIVE_CONFLICT]:
    "Lô đất này đã có một mùa vụ đang canh tác.",
  [API_ERROR_CODES.SEASON_NOT_DELETABLE]:
    "Chỉ có thể xóa mùa vụ đang lập kế hoạch và chưa phát sinh lô hàng hoặc nhật ký canh tác.",
  [API_ERROR_CODES.BATCH_NOT_FOUND]:
    "Không tìm thấy lô nông sản với mã truy xuất yêu cầu.",
  [API_ERROR_CODES.BATCH_SEASON_STATUS_INVALID]:
    "Chỉ có thể nhập lô từ mùa vụ đang canh tác hoặc đã thu hoạch.",
  [API_ERROR_CODES.BATCH_HARVEST_DATE_INVALID]:
    "Thời điểm thu hoạch không được vượt quá hiện tại và phải từ ngày bắt đầu mùa vụ.",
  [API_ERROR_CODES.BATCH_EXPIRED_AT_INTAKE]:
    "Lô nông sản đã hết hạn sử dụng so với thời điểm hiện tại.",
  [API_ERROR_CODES.WASTE_LOG_NOT_FOUND]:
    "Không tìm thấy phiếu đề xuất xuất hủy yêu cầu.",
  [API_ERROR_CODES.WASTE_LOG_BATCH_NOT_ELIGIBLE]:
    "Lô nông sản đã bán hết hoặc không còn tồn khả dụng để báo hủy.",
  [API_ERROR_CODES.WASTE_LOG_QUANTITY_EXCEEDS_AVAILABLE]:
    "Số lượng đề xuất hủy vượt quá tồn kho khả dụng chưa có phiếu chờ duyệt.",
  [API_ERROR_CODES.WASTE_LOG_ALREADY_REVIEWED]:
    "Phiếu đề xuất xuất hủy này đã được thẩm định trước đó.",
  [API_ERROR_CODES.WASTE_LOG_SELF_REVIEW_FORBIDDEN]:
    "Bạn không thể tự phê duyệt hoặc từ chối phiếu xuất hủy do chính mình tạo.",
  [API_ERROR_CODES.CATEGORY_NOT_FOUND]:
    "Không tìm thấy danh mục sản phẩm yêu cầu.",
  [API_ERROR_CODES.CATEGORY_SLUG_ALREADY_EXISTS]:
    "Đường dẫn (slug) này đã tồn tại trên một danh mục đang hoạt động.",
  [API_ERROR_CODES.CATEGORY_NAME_ALREADY_EXISTS]:
    "Tên danh mục này đã tồn tại trên một danh mục đang hoạt động.",
  [API_ERROR_CODES.CATEGORY_HAS_CHILDREN]:
    "Không thể xóa danh mục khi vẫn còn danh mục con đang hoạt động.",
  [API_ERROR_CODES.CATEGORY_HAS_PRODUCTS]:
    "Không thể xóa danh mục khi vẫn còn sản phẩm đang liên kết.",
  [API_ERROR_CODES.CATEGORY_HIERARCHY_INVALID]:
    "Cấu trúc phân cấp danh mục không hợp lệ (chỉ hỗ trợ tối đa 2 cấp và không tự tham chiếu).",
  [API_ERROR_CODES.PRODUCT_NOT_FOUND]: "Không tìm thấy sản phẩm yêu cầu.",
  [API_ERROR_CODES.PRODUCT_SLUG_ALREADY_EXISTS]:
    "Đường dẫn (slug) này đã tồn tại trên một sản phẩm đang hoạt động.",
  [API_ERROR_CODES.PRODUCT_PRICE_INVALID]:
    "Giá khuyến mãi phải nhỏ hơn hoặc bằng giá gốc và không được âm.",
  [API_ERROR_CODES.SUBSCRIPTION_PLAN_NOT_FOUND]:
    "Không tìm thấy gói đăng ký định kỳ yêu cầu.",
  [API_ERROR_CODES.SUBSCRIPTION_PLAN_SLUG_CONFLICT]:
    "Đường dẫn này đã tồn tại trên một gói đăng ký đang hoạt động.",
  [API_ERROR_CODES.SUBSCRIPTION_PLAN_INACTIVE]:
    "Gói đăng ký định kỳ này hiện đã ngừng mở bán.",
  [API_ERROR_CODES.SUBSCRIPTION_NOT_FOUND]:
    "Không tìm thấy gói đăng ký định kỳ của bạn.",
  [API_ERROR_CODES.SUBSCRIPTION_PAYOS_DISABLED]:
    "Thanh toán trực tuyến PayOS hiện đang tạm ngưng trên hệ thống.",
  [API_ERROR_CODES.SUBSCRIPTION_PENDING_LIMIT_REACHED]:
    "Bạn đã đạt giới hạn tối đa gói đăng ký đang chờ thanh toán. Vui lòng hoàn tất hoặc chờ hết hạn trước khi tạo mới.",

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

      if (
        code === API_ERROR_CODES.ORDER_BELOW_MINIMUM_VALUE &&
        typeof params["minOrderValueVnd"] === "number"
      ) {
        return `Giá trị đơn hàng chưa đạt mức tối thiểu ${params["minOrderValueVnd"].toLocaleString("vi-VN")}đ (không tính phí giao hàng).`;
      }
    }

    return baseMessage;
  }

  return detail || API_ERROR_DICTIONARY[API_ERROR_CODES.NETWORK_ERROR];
}
