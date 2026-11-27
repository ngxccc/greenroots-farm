import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { MEDIA_RESOURCE_TYPES } from "../media.constant";

export const deleteComplaintMediaQuerySchema = z
  .object({
    url: z
      .url("Invalid Cloudinary media URL")
      .describe(
        "Cloudinary secure URL of the unsubmitted complaint media asset",
      ),
    resourceType: z
      .enum(MEDIA_RESOURCE_TYPES)
      .describe("Cloudinary resource type: image or video"),
  })
  .strict();

export type DeleteComplaintMediaQuery = z.infer<
  typeof deleteComplaintMediaQuerySchema
>;

export class DeleteComplaintMediaQueryDto extends createZodDto(
  deleteComplaintMediaQuerySchema,
) {}
