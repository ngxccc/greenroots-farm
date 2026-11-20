ALTER TABLE "batches" ALTER COLUMN "harvest_date" SET DATA TYPE timestamp with time zone USING ("harvest_date"::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');--> statement-breakpoint
ALTER TABLE "batches" ALTER COLUMN "expiration_date" SET DATA TYPE timestamp with time zone USING ("expiration_date"::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_initial_quantity_positive" CHECK ("initial_quantity" > 0);--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_available_lte_initial" CHECK ("available_quantity" <= "initial_quantity");--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_expiration_after_harvest" CHECK ("expiration_date" > "harvest_date");