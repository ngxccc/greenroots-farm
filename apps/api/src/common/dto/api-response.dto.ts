import { ApiProperty } from "@nestjs/swagger";

/**
 * Standard pagination metadata DTO at the root envelope level.
 */
export class PaginationMetaDto {
  @ApiProperty({
    description: "Current page index (1-based)",
    example: 1,
  })
  page!: number;

  @ApiProperty({
    description: "Number of records per page",
    example: 20,
  })
  limit!: number;

  @ApiProperty({
    description: "Total number of matching records",
    example: 100,
  })
  total!: number;

  @ApiProperty({
    description: "Total number of calculated pages",
    example: 5,
  })
  totalPages!: number;

  @ApiProperty({
    description: "Indicates if there is a next page available",
    example: true,
  })
  hasNextPage!: boolean;

  @ApiProperty({
    description: "Indicates if there is a previous page available",
    example: false,
  })
  hasPrevPage!: boolean;
}

/**
 * Standard successful single-resource API response DTO envelope.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export class ApiResponseDto<T> {
  @ApiProperty({
    description: "Operation success status flag",
    example: true,
  })
  success!: boolean;

  data!: T;
}

/**
 * Standard successful paginated resource API response DTO envelope.
 */
export class PaginatedApiResponseDto<T> {
  @ApiProperty({
    description: "Operation success status flag",
    example: true,
  })
  success!: boolean;

  data!: T[];

  @ApiProperty({
    description: "Pagination metadata",
    type: () => PaginationMetaDto,
  })
  meta!: PaginationMetaDto;
}
