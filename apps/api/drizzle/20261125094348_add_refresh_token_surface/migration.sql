CREATE TYPE "auth_surface" AS ENUM('customer', 'staff');--> statement-breakpoint
DELETE FROM "refresh_tokens";--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN "surface" "auth_surface" NOT NULL;