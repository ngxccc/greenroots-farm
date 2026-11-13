import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { apiReference } from "@scalar/nestjs-api-reference";
import type { INestApplication } from "@nestjs/common";
import type { Request, Response } from "express";
import { API_VERSION } from "./version.config";

/**
 * Builds the OpenAPI 3.1 document for the GreenRoots Farm API.
 */
export function createOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle("GreenRoots Farm API")
    .setDescription(
      "GreenRoots Farm - Single-farm D2C commerce and operations API: authentication, users, farm traceability, catalog and FEFO inventory.",
    )
    .setVersion(API_VERSION)
    .setOpenAPIVersion("3.1.0")
    .addTag("auth", "Authentication, sessions and password recovery")
    .addTag("users", "Profiles, staff accounts and delivery addresses")
    .addTag("farms", "Farm settings, plots, seasons and traceability")
    .addTag("catalog", "Categories, products and subscription plans")
    .addTag("inventory", "Batches, FEFO allocations and waste write-offs")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Format: Bearer <access_token>",
      },
      "bearer",
    )
    .build();

  return SwaggerModule.createDocument(app, config);
}

/**
 * Serves the raw OpenAPI JSON at `/openapi.json` and interactive Scalar
 * documentation at `/api/docs`.
 */
export function setupOpenApiAndScalar(app: INestApplication): void {
  const document = createOpenApiDocument(app);

  app.use("/openapi.json", (_request: Request, response: Response) => {
    response.setHeader("Content-Type", "application/json");
    response.json(document);
  });

  app.use(
    "/api/docs",
    apiReference({
      content: document,
      theme: "saturn",
    }),
  );
}
