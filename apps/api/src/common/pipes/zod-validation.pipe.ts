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

interface SchemaHolder {
  zodSchema?: ZodType;
  schema?: ZodType;
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
 * `invalidParams` entries consumed by GlobalExceptionFilter.
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
      if (issue.code === "unrecognized_keys" && issue.keys.length > 0) {
        const prefix = formatZodIssuePath(issue.path);
        for (const key of issue.keys) {
          params.push({
            name: prefix ? `${prefix}.${key}` : key,
            reason: issue.message || MESSAGES.VALIDATION.INVALID_VALUE,
          });
        }
        continue;
      }

      const fieldPath = formatZodIssuePath(issue.path);
      params.push({
        name: fieldPath || "payload",
        reason: issue.message || MESSAGES.VALIDATION.INVALID_VALUE,
      });
    }

    return params;
  }
}
