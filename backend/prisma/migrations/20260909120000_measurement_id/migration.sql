-- Add optional measurement relation to tailoring_orders
ALTER TABLE "tailoring_orders"
ADD COLUMN "measurement_id" TEXT;

ALTER TABLE "tailoring_orders"
ADD CONSTRAINT "tailoring_orders_measurement_id_fkey"
FOREIGN KEY ("measurement_id")
REFERENCES "measurements"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
