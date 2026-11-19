import { applyDecorators, type Type } from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  getSchemaPath,
} from "@nestjs/swagger";
import {
  ApiResponseDto,
  PaginatedApiResponseDto,
  PaginationMetaDto,
} from "../dto/api-response.dto";

export { ApiResponseDto, PaginatedApiResponseDto, PaginationMetaDto };

export interface ApiResponseOptions {
  isArray?: boolean;
}

/**
 * Creates generic ApiResponse Swagger documentation using OpenAPI `allOf` schema composition.
 */
const createApiResponseGeneric = (
  responseDecorator: typeof ApiOkResponse,
  model?: Type,
  options?: ApiResponseOptions,
) => {
  if (!model) {
    return applyDecorators(
      ApiExtraModels(ApiResponseDto),
      responseDecorator({
        schema: {
          allOf: [
            { $ref: getSchemaPath(ApiResponseDto) },
            {
              required: ["data"],
              properties: {
                data: {
                  type: "null",
                  default: null,
                },
              },
            },
          ],
        },
      }),
    );
  }

  const isArray = options?.isArray ?? false;
  const dataSchema = isArray
    ? {
        type: "array",
        items: { $ref: getSchemaPath(model) },
      }
    : {
        $ref: getSchemaPath(model),
      };

  return applyDecorators(
    ApiExtraModels(ApiResponseDto, model),
    responseDecorator({
      schema: {
        allOf: [
          { $ref: getSchemaPath(ApiResponseDto) },
          {
            required: ["data"],
            properties: {
              data: dataSchema,
            },
          },
        ],
      },
    }),
  );
};

/**
 * Documents a 200 OK response wrapped in the standard `ApiResponseDto` envelope.
 */
export const ApiOkResponseGeneric = (
  model?: Type,
  options?: ApiResponseOptions,
) => createApiResponseGeneric(ApiOkResponse, model, options);

/**
 * Documents a 201 Created response wrapped in the standard `ApiResponseDto` envelope.
 */
export const ApiCreatedResponseGeneric = (
  model?: Type,
  options?: ApiResponseOptions,
) => createApiResponseGeneric(ApiCreatedResponse, model, options);

/**
 * Creates paginated ApiResponse Swagger documentation with root-level `meta`.
 */
const createApiPaginatedResponse = (
  responseDecorator: typeof ApiOkResponse,
  model: Type,
) => {
  return applyDecorators(
    ApiExtraModels(PaginatedApiResponseDto, PaginationMetaDto, model),
    responseDecorator({
      schema: {
        allOf: [
          { $ref: getSchemaPath(PaginatedApiResponseDto) },
          {
            required: ["data", "meta"],
            properties: {
              data: {
                type: "array",
                items: { $ref: getSchemaPath(model) },
              },
              meta: {
                $ref: getSchemaPath(PaginationMetaDto),
              },
            },
          },
        ],
      },
    }),
  );
};

/**
 * Documents a 200 OK paginated response wrapped in `PaginatedApiResponseDto`.
 */
export const ApiOkResponsePaginated = (model: Type) =>
  createApiPaginatedResponse(ApiOkResponse, model);

/**
 * Documents a 201 Created paginated response wrapped in `PaginatedApiResponseDto`.
 */
export const ApiCreatedResponsePaginated = (model: Type) =>
  createApiPaginatedResponse(ApiCreatedResponse, model);
