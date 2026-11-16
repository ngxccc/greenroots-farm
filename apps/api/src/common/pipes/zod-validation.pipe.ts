import {
  BadRequestException,
  Injectable,
  Optional,
  type ArgumentMetadata,
  type PipeTransform,
} from "@nestjs/common";
import { API_ERROR_CODES } from "@greenroots/shared";
import type { ZodError, ZodType } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";

export interface InvalidParam {
  name: string;
  reason: string;
  code: string;
  params?: Record<string, unknown>;
}

export type ZodIssue = ZodError["issues"][number];

interface SchemaHolder {
  zodSchema?: ZodType;
  schema?: ZodType;
}

const DEFAULT_ZOD_PATTERNS = [
  /^Invalid input: expected/i,
  /^Too small: expected/i,
  /^Too big: expected/i,
  /^Invalid option: expected/i,
  /^Invalid enum value/i,
  /^Invalid email address/i,
  /^Invalid UUID/i,
  /^Invalid URL/i,
  /^Required$/i,
  /^Expected /i,
  /^String must contain/i,
  /^Number must be/i,
  /^Unrecognized key/i,
];

function formatBoundValue(value: unknown): string {
  if (typeof value === "number" || typeof value === "string") {
    return String(value);
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  return "";
}

function formatValueList(values: unknown): string {
  if (Array.isArray(values)) {
    return values
      .map((val) =>
        typeof val === "string" || typeof val === "number" ? String(val) : "",
      )
      .filter((val) => val.length > 0)
      .join(", ");
  }
  return "";
}

/**
 * Checks if a Zod issue has an explicit custom message provided by the developer.
 */
export function isCustomZodMessage(issue: ZodIssue): boolean {
  const msg = issue.message;
  if (!msg) return false;
  return !DEFAULT_ZOD_PATTERNS.some((pattern) => pattern.test(msg));
}

export interface FormattedZodIssue {
  code: string;
  reason: string;
  params?: Record<string, unknown>;
}

/**
 * Maps a Zod issue into a standardized machine error code, English developer reason,
 * and dynamic constraint metadata for client-side interpolation.
 */
export function formatZodIssue(issue: ZodIssue): FormattedZodIssue {
  const issueRecord = issue as unknown as Record<string, unknown>;

  if (isCustomZodMessage(issue)) {
    const isExplicitCode = Object.values(API_ERROR_CODES).includes(
      issue.message as unknown as (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES],
    );

    return {
      code: isExplicitCode
        ? issue.message
        : API_ERROR_CODES.CUSTOM_VALIDATION_ERROR,
      reason: issue.message,
    };
  }

  switch (issue.code) {
    case "invalid_type": {
      if (
        issueRecord["received"] === "undefined" ||
        issue.message.includes("received undefined")
      ) {
        return {
          code: API_ERROR_CODES.REQUIRED,
          reason: MESSAGES.VALIDATION.REQUIRED,
        };
      }
      return {
        code: API_ERROR_CODES.INVALID_TYPE,
        reason: `Expected ${String(issueRecord["expected"])}, received ${String(issueRecord["received"])}.`,
        params: {
          expected: issueRecord["expected"],
          received: issueRecord["received"],
        },
      };
    }

    case "too_small": {
      const origin = issueRecord["origin"] ?? issueRecord["type"];
      const minimum = formatBoundValue(issueRecord["minimum"]);
      const inclusive = issueRecord["inclusive"] !== false;
      const numMin =
        typeof issueRecord["minimum"] === "number"
          ? issueRecord["minimum"]
          : Number(minimum);

      if (origin === "number") {
        return {
          code: API_ERROR_CODES.TOO_SMALL,
          reason: inclusive
            ? `Number must be greater than or equal to ${minimum}.`
            : `Number must be greater than ${minimum}.`,
          params: { origin: "number", minimum: numMin, inclusive },
        };
      }

      if (origin === "string") {
        if (minimum === "1" && inclusive) {
          return {
            code: API_ERROR_CODES.REQUIRED,
            reason: MESSAGES.VALIDATION.REQUIRED,
          };
        }
        return {
          code: API_ERROR_CODES.TOO_SMALL,
          reason: inclusive
            ? `String must contain at least ${minimum} character(s).`
            : `String must contain more than ${minimum} character(s).`,
          params: { origin: "string", minimum: numMin, inclusive },
        };
      }

      if (origin === "array") {
        return {
          code: API_ERROR_CODES.TOO_SMALL,
          reason: `Array must contain at least ${minimum} element(s).`,
          params: { origin: "array", minimum: numMin, inclusive },
        };
      }

      return {
        code: API_ERROR_CODES.TOO_SMALL,
        reason: "Value is too small.",
        params: { minimum: numMin },
      };
    }

    case "too_big": {
      const origin = issueRecord["origin"] ?? issueRecord["type"];
      const maximum = formatBoundValue(issueRecord["maximum"]);
      const inclusive = issueRecord["inclusive"] !== false;
      const numMax =
        typeof issueRecord["maximum"] === "number"
          ? issueRecord["maximum"]
          : Number(maximum);

      if (origin === "number") {
        return {
          code: API_ERROR_CODES.TOO_BIG,
          reason: inclusive
            ? `Number must be less than or equal to ${maximum}.`
            : `Number must be less than ${maximum}.`,
          params: { origin: "number", maximum: numMax, inclusive },
        };
      }

      if (origin === "string") {
        return {
          code: API_ERROR_CODES.TOO_BIG,
          reason: inclusive
            ? `String must contain at most ${maximum} character(s).`
            : `String must contain fewer than ${maximum} character(s).`,
          params: { origin: "string", maximum: numMax, inclusive },
        };
      }

      if (origin === "array") {
        return {
          code: API_ERROR_CODES.TOO_BIG,
          reason: `Array must contain at most ${maximum} element(s).`,
          params: { origin: "array", maximum: numMax, inclusive },
        };
      }

      return {
        code: API_ERROR_CODES.TOO_BIG,
        reason: "Value is too large.",
        params: { maximum: numMax },
      };
    }

    case "invalid_value": {
      const formattedList = formatValueList(issueRecord["values"]);
      return {
        code: API_ERROR_CODES.INVALID_VALUE,
        reason:
          formattedList.length > 0
            ? `Invalid value. Expected one of: ${formattedList}.`
            : MESSAGES.VALIDATION.INVALID_VALUE,
        params: issueRecord["values"]
          ? { values: issueRecord["values"] }
          : undefined,
      };
    }

    case "invalid_format": {
      const format = issueRecord["format"];
      if (format === "email") {
        return {
          code: API_ERROR_CODES.INVALID_EMAIL,
          reason: MESSAGES.VALIDATION.INVALID_EMAIL,
        };
      }
      if (format === "uuid") {
        return {
          code: API_ERROR_CODES.INVALID_UUID,
          reason: MESSAGES.VALIDATION.INVALID_UUID,
        };
      }
      if (format === "url") {
        return {
          code: API_ERROR_CODES.INVALID_URL,
          reason: MESSAGES.VALIDATION.INVALID_URL,
        };
      }
      return {
        code: API_ERROR_CODES.INVALID_FORMAT,
        reason: `Invalid format: ${String(format)}.`,
        params: { format },
      };
    }

    case "unrecognized_keys": {
      return {
        code: API_ERROR_CODES.UNRECOGNIZED_KEYS,
        reason: MESSAGES.VALIDATION.UNRECOGNIZED_KEY,
      };
    }

    default:
      return {
        code: API_ERROR_CODES.INVALID_VALUE,
        reason: issue.message || MESSAGES.VALIDATION.INVALID_VALUE,
      };
  }
}

/**
 * Returns the human-readable English reason for a Zod issue.
 */
export function formatZodIssueReason(issue: ZodIssue): string {
  return formatZodIssue(issue).reason;
}

/**
 * Formats a Zod issue path into dot/bracket notation (`items[2].price`).
 */
export function formatZodIssuePath(path?: readonly PropertyKey[]): string {
  if (!path || path.length === 0) return "";

  return path.reduce<string>((accumulator, segment, index) => {
    const value = String(segment);
    if (typeof segment === "number") {
      return `${accumulator}[${value}]`;
    }
    return index === 0 ? value : `${accumulator}.${value}`;
  }, "");
}

/**
 * Validates request payloads with Zod and converts issues into RFC 9457
 * `invalidParams` entries with standardized error codes, English reasons, and interpolation metadata.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(@Optional() private readonly schema?: ZodType) {}

  transform(value: unknown, metadata?: ArgumentMetadata): unknown {
    const activeSchema = this.resolveSchema(metadata);

    if (!activeSchema) {
      return value;
    }

    const result = activeSchema.safeParse(value);

    if (result.success) {
      return result.data;
    }

    throw new BadRequestException({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      detail: MESSAGES.VALIDATION.INVALID_INPUT,
      invalidParams: this.formatZodErrors(result.error),
    });
  }

  private resolveSchema(metadata?: ArgumentMetadata): ZodType | undefined {
    if (this.schema) return this.schema;

    const metatype = metadata?.metatype;
    if (metatype && typeof metatype === "function") {
      const holder = metatype as unknown as SchemaHolder;
      return holder.zodSchema ?? holder.schema;
    }

    return undefined;
  }

  private formatZodErrors(error: ZodError): InvalidParam[] {
    const params: InvalidParam[] = [];

    for (const issue of error.issues) {
      const formatted = formatZodIssue(issue);

      if (issue.code === "unrecognized_keys" && issue.keys.length > 0) {
        const prefix = formatZodIssuePath(issue.path);
        for (const key of issue.keys) {
          params.push({
            name: prefix ? `${prefix}.${String(key)}` : String(key),
            code: formatted.code,
            reason: formatted.reason,
            params: formatted.params,
          });
        }
        continue;
      }

      const fieldPath = formatZodIssuePath(issue.path);
      params.push({
        name: fieldPath || "payload",
        code: formatted.code,
        reason: formatted.reason,
        params: formatted.params,
      });
    }

    return params;
  }
}
