ALTER TABLE "user_addresses" ADD COLUMN "district_code" varchar(50);--> statement-breakpoint
UPDATE "user_addresses" SET "district_code" = 'quan-7', "latitude" = '10.73400000', "longitude" = '106.72180000' WHERE "district" = 'Quận 7' AND "district_code" IS NULL;--> statement-breakpoint
ALTER TABLE "user_addresses" ALTER COLUMN "district_code" SET NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "user_addresses_default_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "user_addresses_default_uidx" ON "user_addresses" ("user_id") WHERE "is_default" = true;
