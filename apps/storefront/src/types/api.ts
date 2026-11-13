/**
 * RFC 9457 Problem Details payload returned by the GreenRoots API.
 */
export interface ApiProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance: string;
  readonly code?: string;
  readonly invalidParams?: readonly {
    readonly name: string;
    readonly reason: string;
  }[];
  readonly timestamp?: string;
}

/**
 * Standard API success envelope returned by `apiSuccess()` in NestJS.
 */
export interface ApiSuccessResponse<T> {
  readonly success: true;
  readonly data: T;
  readonly meta?: {
    readonly page: number;
    readonly limit: number;
    readonly total: number;
    readonly totalPages: number;
    readonly hasNextPage: boolean;
    readonly hasPrevPage: boolean;
  };
}
