import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { apiReference } from "@scalar/nestjs-api-reference";
import type { INestApplication } from "@nestjs/common";
import type { Request, Response } from "express";
import { API_VERSION } from "./version.config";
import { cleanupOpenApiDoc } from "nestjs-zod";

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
    .addTag(
      "admin-users",
      "Admin staff account lifecycle and access governance",
    )
    .addTag("farms", "Farm settings, plots, seasons and traceability")
    .addTag("catalog", "Categories, products and subscription plans")
    .addTag("inventory", "Batches, FEFO allocations and waste write-offs")
    .addTag("media", "Signed media uploads and storage rules")
    .addTag("health", "Service health and readiness probes")
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

  const rawDocument = SwaggerModule.createDocument(app, config);
  const document = cleanupOpenApiDoc(rawDocument);

  // Clean redundant allOf pattern wrappers emitted by zod-to-json-schema on password fields
  const schemas = (
    document as { components?: { schemas?: Record<string, unknown> } }
  ).components?.schemas;
  if (schemas) {
    for (const schema of Object.values(schemas)) {
      const properties = (schema as { properties?: Record<string, unknown> })
        .properties;
      if (properties) {
        for (const prop of Object.values(properties)) {
          const p = prop as Record<string, unknown>;
          if (p["format"] === "password" && "allOf" in p) {
            delete p["allOf"];
            if (!("type" in p)) {
              p["type"] = "string";
            }
          }
        }
      }
    }
  }

  return document;
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
      theme: "deepSpace",
    }),
  );
}
