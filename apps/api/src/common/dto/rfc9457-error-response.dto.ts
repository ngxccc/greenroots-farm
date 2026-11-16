import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * RFC 9457 invalid parameter description representing validation errors.
 */
export class InvalidParamDto {
  @ApiProperty({
    description: "Invalid field name or payload property path",
    example: "email",
  })
  name!: string;

  @ApiProperty({
    description: "Detailed reason for the validation failure",
    example: "Invalid email format",
  })
  reason!: string;
}

/**
 * RFC 9457 Problem Details standard error response envelope.
 */
export class Rfc9457ErrorResponseDto {
  @ApiProperty({
    description: "Standard HTTP error type URI relative to error dictionary",
    example: "/errors/bad-request",
  })
  type!: string;

  @ApiProperty({
    description: "Standard HTTP error title",
    example: "Bad Request",
  })
  title!: string;

  @ApiProperty({
    description: "HTTP status code",
    example: 400,
  })
  status!: number;

  @ApiProperty({
    description:
      "Human-readable explanation specific to this occurrence of the problem",
    example: "Submitted data format is invalid",
  })
  detail!: string;

  @ApiProperty({
    description: "API request URI that triggered the error",
    example: "/api/v1/auth/register",
  })
  instance!: string;

  @ApiPropertyOptional({
    description: "Machine-readable error code",
    example: "INVALID_INPUT",
  })
  code?: string;

  @ApiPropertyOptional({
    description: "List of invalid parameters that failed validation",
    type: () => [InvalidParamDto],
  })
  invalidParams?: InvalidParamDto[];

  @ApiProperty({
    description: "Timestamp when error occurred in ISO 8601 format",
    example: "2026-11-16T00:00:00.000Z",
  })
  timestamp!: string;
}
