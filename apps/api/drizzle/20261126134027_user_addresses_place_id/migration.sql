ALTER TABLE "user_addresses" ADD COLUMN "place_id" varchar(255);--> statement-breakpoint
UPDATE "user_addresses" SET "place_id" = 'mock_place_' || replace("district_code", '-', '_') WHERE "place_id" IS NULL;--> statement-breakpoint
UPDATE "user_addresses" SET "latitude" = '10.73400000', "longitude" = '106.72180000' WHERE "latitude" IS NULL OR "longitude" IS NULL;--> statement-breakpoint
ALTER TABLE "user_addresses" ALTER COLUMN "place_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_addresses" DROP COLUMN "district_code";--> statement-breakpoint
ALTER TABLE "user_addresses" ALTER COLUMN "latitude" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_addresses" ALTER COLUMN "longitude" SET NOT NULL;