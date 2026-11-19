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
