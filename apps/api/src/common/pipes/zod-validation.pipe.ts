import {
  BadRequestException,
  Injectable,
  Optional,
  type ArgumentMetadata,
  type PipeTransform,
} from "@nestjs/common";
import type { ZodError, ZodType } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";

export interface InvalidParam {
  name: string;
  reason: string;
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

/**
 * Translates a Zod issue into a standardized Vietnamese RFC 9457 reason string.
 * Preserves custom developer-supplied messages when present.
 */
export function formatZodIssueReason(issue: ZodIssue): string {
  if (isCustomZodMessage(issue)) {
    return issue.message;
  }

  const issueRecord = issue as unknown as Record<string, unknown>;

  switch (issue.code) {
    case "invalid_type": {
      if (
        issueRecord["received"] === "undefined" ||
        issue.message.includes("received undefined")
      ) {
        return MESSAGES.VALIDATION.REQUIRED;
      }
      return MESSAGES.VALIDATION.INVALID_TYPE;
    }

    case "too_small": {
      const origin = issueRecord["origin"] ?? issueRecord["type"];
      const minimum = formatBoundValue(issueRecord["minimum"]);
      const inclusive = issueRecord["inclusive"] !== false;

      if (origin === "number") {
        return inclusive
          ? `Giá trị phải lớn hơn hoặc bằng ${minimum}`
          : `Giá trị phải lớn hơn ${minimum}`;
      }

      if (origin === "string") {
        if (minimum === "1" && inclusive) {
          return MESSAGES.VALIDATION.REQUIRED;
        }
        return inclusive
          ? `Độ dài tối thiểu là ${minimum} ký tự`
          : `Độ dài phải lớn hơn ${minimum} ký tự`;
      }

      if (origin === "array") {
        return `Danh sách phải có tối thiểu ${minimum} phần tử`;
      }

      return MESSAGES.VALIDATION.INVALID_VALUE;
    }

    case "too_big": {
      const origin = issueRecord["origin"] ?? issueRecord["type"];
      const maximum = formatBoundValue(issueRecord["maximum"]);
      const inclusive = issueRecord["inclusive"] !== false;

      if (origin === "number") {
        return inclusive
          ? `Giá trị phải nhỏ hơn hoặc bằng ${maximum}`
          : `Giá trị phải nhỏ hơn ${maximum}`;
      }

      if (origin === "string") {
        return inclusive
          ? `Độ dài tối đa là ${maximum} ký tự`
          : `Độ dài phải nhỏ hơn ${maximum} ký tự`;
      }

      if (origin === "array") {
        return `Danh sách tối đa ${maximum} phần tử`;
      }

      return MESSAGES.VALIDATION.INVALID_VALUE;
    }

    // Zod enum / literal mismatch
    case "invalid_value": {
      const formattedList = formatValueList(issueRecord["values"]);
      if (formattedList.length > 0) {
        return `Giá trị không hợp lệ. Phải là một trong: ${formattedList}`;
      }
      return MESSAGES.VALIDATION.INVALID_VALUE;
    }

    // Zod string formats (email, uuid, url)
    case "invalid_format": {
      const format = issueRecord["format"];
      if (format === "email") return MESSAGES.VALIDATION.INVALID_EMAIL;
      if (format === "uuid") return MESSAGES.VALIDATION.INVALID_UUID;
      if (format === "url") return MESSAGES.VALIDATION.INVALID_URL;
      return MESSAGES.VALIDATION.INVALID_VALUE;
    }

    case "unrecognized_keys": {
      return MESSAGES.VALIDATION.UNRECOGNIZED_KEY;
    }

    default:
      return issue.message || MESSAGES.VALIDATION.INVALID_VALUE;
  }
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
 * `invalidParams` entries with Vietnamese localized messages consumed by GlobalExceptionFilter.
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
      const reason = formatZodIssueReason(issue);

      if (issue.code === "unrecognized_keys" && issue.keys.length > 0) {
        const prefix = formatZodIssuePath(issue.path);
        for (const key of issue.keys) {
          params.push({
            name: prefix ? `${prefix}.${String(key)}` : String(key),
            reason,
          });
        }
        continue;
      }

      const fieldPath = formatZodIssuePath(issue.path);
      params.push({
        name: fieldPath || "payload",
        reason,
      });
    }

    return params;
  }
}
