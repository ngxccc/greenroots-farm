/**
 * Developer-facing RFC 9457 English messages and status descriptions.
 * User-facing localized copy is mapped on the client via @greenroots/shared API_ERROR_DICTIONARY.
 */
export const MESSAGES = {
  COMMON: {
    SUCCESS: "Operation completed successfully.",
    BAD_REQUEST: "The request payload failed validation or was malformed.",
    UNAUTHORIZED: "Authentication credentials are required or invalid.",
    FORBIDDEN: "You do not have permission to access this resource.",
    NOT_FOUND: "The requested resource was not found.",
    CONFLICT: "The request conflicts with current server state.",
    UNPROCESSABLE_ENTITY:
      "The request is syntactically valid but cannot be processed.",
    TOO_MANY_REQUESTS:
      "Too many requests. Please slow down and try again later.",
    INTERNAL_SERVER_ERROR: "An unexpected internal server error occurred.",
    SERVICE_UNAVAILABLE: "The service is temporarily unavailable.",
    GATEWAY_TIMEOUT: "The gateway timed out waiting for upstream services.",
    HEALTHY: "System is healthy.",
  },
  IDEMPOTENCY: {
    KEY_REQUIRED: "Idempotency-Key UUID header is required for this request.",
    KEY_INVALID_UUID:
      "Invalid Idempotency-Key format; a valid UUID is required.",
    SERVICE_UNAVAILABLE: "Idempotency service is temporarily unavailable.",
    RECORD_INVALID: "Idempotency record is invalid; please retry.",
    KEY_IN_PROGRESS:
      "A request with this Idempotency-Key is currently being processed.",
    PAYLOAD_MISMATCH:
      "Idempotency-Key was already used with a different request payload.",
  },
  AUTH: {
    TOKEN_MISSING: "Access token is missing from authorization header.",
    TOKEN_INVALID_OR_EXPIRED: "Access token is invalid or expired.",
    TOKEN_REVOKED: "Session has been revoked. Please sign in again.",
    REDIS_REVOCATION_UNAVAILABLE:
      "Unable to verify token revocation with Redis. Failing open temporarily.",
    REDIS_REVOCATION_RECOVERED: "Redis token revocation connection restored.",
    INVALID_CREDENTIALS: "Email or password is incorrect.",
    ACCOUNT_SUSPENDED:
      "Your account has been suspended. Please contact customer support.",
    EMAIL_NOT_VERIFIED:
      "Email address is not verified. Please verify your email before logging in.",
    EMAIL_ALREADY_EXISTS: "An account with this email address already exists.",
    VERIFICATION_TOKEN_INVALID: "Verification token is invalid or has expired.",
    RESET_TOKEN_INVALID: "Password reset token is invalid or has expired.",
    RESEND_COOLDOWN_ACTIVE:
      "Please wait before requesting another verification email.",
    REGISTER_SUCCESS:
      "Account registered successfully. Please check your email for the verification link.",
    EMAIL_VERIFIED_SUCCESS: "Email verified successfully. You may now log in.",
    VERIFICATION_EMAIL_SENT:
      "If the email address is associated with an unverified account, a verification link has been sent.",
    PASSWORD_RESET_SENT:
      "If the email address exists in our system, password reset instructions have been sent.",
    PASSWORD_RESET_SUCCESS:
      "Password has been reset successfully. Please log in with your new password.",
    LOGOUT_SUCCESS: "Successfully logged out.",
    LOGOUT_ALL_SUCCESS: "Successfully logged out from all devices.",
  },
  VALIDATION: {
    INVALID_INPUT: "The request payload failed schema validation.",
    INVALID_VALUE: "The provided value is invalid.",
    REQUIRED: "Field is required.",
    INVALID_TYPE: "Invalid data type provided.",
    INVALID_EMAIL: "Invalid email address format.",
    INVALID_UUID: "Invalid UUID format.",
    INVALID_URL: "Invalid URL format.",
    INVALID_PHONE: "Invalid phone number format.",
    INVALID_TAX_ID: "Invalid tax identification number.",
    PASSWORD_MIN_LENGTH: "Password must be at least 8 characters long.",
    PASSWORD_MAX_LENGTH: "Password cannot exceed 128 characters.",
    PASSWORD_UPPERCASE: "Password must contain at least 1 uppercase letter.",
    PASSWORD_NUMBER: "Password must contain at least 1 number.",
    PASSWORD_SPECIAL: "Password must contain at least 1 special character.",
    PASSWORDS_MUST_MATCH: "Passwords do not match.",
    MUST_ACCEPT_TERMS: "You must accept the terms of service.",
    MIN_LENGTH: "Field length is below minimum required characters.",
    MAX_LENGTH: "Field length exceeds maximum allowed characters.",
    INTEGER: "Value must be an integer.",
    MIN_VALUE: "Value is below minimum allowed value.",
    MAX_VALUE: "Value exceeds maximum allowed value.",
    UNRECOGNIZED_KEY: "Unrecognized field in request payload.",
    AT_LEAST_ONE_FIELD: "At least one profile field must be provided.",
    AT_LEAST_ONE_ADDRESS_FIELD: "At least one address field must be provided.",
    AT_LEAST_ONE_STAFF_FIELD: "At least one staff field must be provided.",
    AT_LEAST_ONE_FARM_SETTING_FIELD:
      "At least one farm setting field must be provided.",
    AT_LEAST_ONE_PLOT_FIELD: "At least one plot field must be provided.",
    AT_LEAST_ONE_SEASON_FIELD: "At least one season field must be provided.",
    SEASON_DATE_RANGE_INVALID:
      "Start date must be on or before expected harvest date.",
    DUPLICATE_MEDIA_URL: "Duplicate media URLs are not allowed.",
    INVALID_BATCH_CODE:
      "Batch code must be 3 to 100 alphanumeric, hyphen, or underscore characters.",
    INVALID_SLUG:
      "Slug must contain only lowercase alphanumeric segments separated by single hyphens.",
    AT_LEAST_ONE_CATEGORY_FIELD:
      "At least one category field must be provided.",
    AT_LEAST_ONE_PRODUCT_FIELD: "At least one product field must be provided.",
    PRICE_RANGE_INVALID: "Minimum price cannot exceed maximum price.",
    CONFLICTING_CATEGORY_FILTER:
      "Provide either categoryId or categorySlug, not both.",
    CONFLICTING_ROOT_CATEGORY_FILTER:
      "Cannot combine parentId with rootOnly=true.",
    DUPLICATE_PRODUCT_IMAGE_URL:
      "Duplicate product image URLs are not allowed.",
    INVALID_QUANTITY_PRECISION: "Quantity may have at most 2 decimal places.",
    SHIPPING_QUOTE_TARGET_XOR:
      "Provide either addressId or districtCode, not both.",
  },
  FARMS: {
    NOT_FOUND: "Farm settings record not found.",
    PAYMENT_METHOD_REQUIRED:
      "At least one payment method (PayOS or COD) must remain enabled.",
    FLASH_SALE_CONFIG_INVALID:
      "Farm flash-sale hoursThreshold must be configured as a positive number.",
  },
  PLOTS: {
    NOT_FOUND: "Plot not found.",
    CODE_ALREADY_EXISTS: "An active plot with this plot code already exists.",
    HAS_ACTIVE_SEASONS:
      "Cannot delete a plot that still has planning or active seasons.",
  },
  SEASONS: {
    NOT_FOUND: "Season not found.",
    INVALID_STATUS_TRANSITION: "Invalid season status transition.",
    COMPLETED_IMMUTABLE:
      "Completed seasons are terminal and cannot be modified.",
    FIELD_LOCKED:
      "Cannot modify plotId or startDate once the season has left planning status.",
    INVALID_DATE_RANGE:
      "Start date must be on or before expected harvest date.",
    PLOT_ACTIVE_CONFLICT: "The target plot already has an active season.",
    NOT_DELETABLE_STATUS: "Only planning seasons can be deleted.",
    NOT_DELETABLE_BATCHES: "Cannot delete a season that already has batches.",
    NOT_DELETABLE_LOGS: "Cannot delete a season that already has farming logs.",
  },
  FARMING_LOGS: {
    CORRECTION_TARGET_MISSING_OR_CROSS_SEASON:
      "Correction target log was not found in this season.",
    CORRECTION_ID_NOT_ALLOWED_FOR_ACTION:
      "correctsLogId may only be provided when actionType is correction.",
    SELF_CORRECTION_FORBIDDEN: "A correction log cannot reference itself.",
    SEASON_STATUS_DISALLOWS_ACTION:
      "The requested farming action is not allowed in the current season status.",
  },
  BATCHES: {
    NOT_FOUND: "Batch not found.",
    SEASON_STATUS_INVALID:
      "Batches can only be created for active or harvested seasons.",
    HARVEST_BEFORE_SEASON_START:
      "Harvest date cannot precede the season start date.",
    HARVEST_IN_FUTURE: "Harvest timestamp cannot be in the future.",
    EXPIRED_AT_INTAKE:
      "Computed expiration timestamp must be strictly in the future at intake.",
    CODE_GENERATION_EXHAUSTED:
      "Failed to allocate a unique batch code after maximum retries.",
  },
  WASTE_LOGS: {
    NOT_FOUND: "Waste log not found.",
    BATCH_NOT_ELIGIBLE:
      "Cannot propose waste for a batch that is sold out or has no remaining available quantity.",
    QUANTITY_EXCEEDS_AVAILABLE:
      "Discarded quantity exceeds available batch stock minus pending waste proposals.",
    ALREADY_REVIEWED:
      "This waste log has already been reviewed and cannot be modified.",
    SELF_REVIEW_FORBIDDEN:
      "Reporters cannot approve or reject their own waste log proposals.",
    INSUFFICIENT_STOCK:
      "Batch available quantity is insufficient to approve this waste write-off.",
  },
  CATEGORIES: {
    NOT_FOUND: "Category not found.",
    SLUG_ALREADY_EXISTS: "An active category with this slug already exists.",
    NAME_ALREADY_EXISTS: "An active category with this name already exists.",
    HAS_CHILDREN:
      "Cannot delete a category that still has non-deleted child categories.",
    HAS_PRODUCTS:
      "Cannot delete a category that still has non-deleted products.",
    HIERARCHY_INVALID:
      "Category hierarchy cannot exceed two levels or reference itself.",
  },
  PRODUCTS: {
    NOT_FOUND: "Product not found.",
    SLUG_ALREADY_EXISTS: "An active product with this slug already exists.",
    PRICE_INVALID:
      "Sale price must be non-negative and less than or equal to base price.",
  },
  ORDERS: {
    BELOW_MINIMUM_VALUE:
      "Order merchandise subtotal is below the minimum order value.",
    COD_DISABLED: "Cash on delivery is currently disabled in farm settings.",
    INSUFFICIENT_STOCK:
      "Requested quantity exceeds available sellable batch stock.",
    OUT_OF_DELIVERY_RADIUS:
      "Delivery address exceeds the farm maximum delivery radius.",
    CODE_GENERATION_EXHAUSTED:
      "Failed to allocate a unique order code after maximum retries.",
    CLIENT_TOTAL_MISMATCH_PREFIX:
      "Client-submitted total differs from server-computed total and was ignored.",
  },
  ADDRESS: {
    NOT_FOUND: "Address not found.",
    LIMIT_REACHED: "You can save at most 10 delivery addresses.",
    DISTRICT_CODE_INVALID:
      "District code is not a valid Ho Chi Minh City delivery district.",
  },
  STAFF: {
    NOT_FOUND: "Staff member not found.",
    LAST_SUPER_ADMIN:
      "Cannot demote, deactivate, or suspend the last active super admin.",
    SELF_MODIFICATION_FORBIDDEN:
      "Actors cannot change their own role or status, or reset their own credentials.",
    ROLE_INVALID:
      "Role must be one of farm_staff, sales, admin, or super_admin.",
    CANNOT_RESET_INACTIVE_ACCOUNT:
      "Cannot reset credentials for a suspended or inactive staff account.",
  },
  MEDIA: {
    FOLDER_ACCESS_DENIED:
      "You do not have permission to upload to this folder.",
    FILE_TOO_LARGE: "File size exceeds the allowed limit.",
    INVALID_UPLOAD_REQUEST: "Upload signature request parameters are invalid.",
  },
  DATABASE: {
    IMMUTABLE_RECORD:
      "Farming log records are immutable and cannot be modified or deleted.",
    STAFF_AUDIT_IMMUTABLE:
      "Staff audit log records are immutable and cannot be modified or deleted.",
    FOREIGN_KEY_VIOLATION:
      "Referenced entity does not exist or is constrained by an existing relationship.",
    UNIQUE_VIOLATION:
      "A record with this identifier or unique attribute already exists.",
    CHECK_VIOLATION: "A database constraint violation occurred.",
    CONCURRENCY_CONFLICT:
      "A concurrency conflict occurred. Please retry the transaction.",
    INVALID_TEXT_REPRESENTATION: "Invalid data representation encountered.",
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
