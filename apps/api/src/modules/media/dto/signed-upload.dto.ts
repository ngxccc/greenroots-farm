import { createZodDto } from "nestjs-zod";
import { signedUploadSchema } from "../media.interface";

export class SignedUploadDto extends createZodDto(signedUploadSchema) {}
