-- Phase 1: email verification fields

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "email_verified" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "verification_token" TEXT;

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "verification_expires" TIMESTAMP(3);


-- Customer indexes

CREATE INDEX IF NOT EXISTS "customers_tenant_id_phone_idx"
ON "customers"("tenant_id", "phone");

CREATE INDEX IF NOT EXISTS "customers_tenant_id_created_at_idx"
ON "customers"("tenant_id", "created_at");


-- Order indexes

CREATE INDEX IF NOT EXISTS "orders_tenant_id_status_idx"
ON "orders"("tenant_id", "status");

CREATE INDEX IF NOT EXISTS "orders_tenant_id_created_at_idx"
ON "orders"("tenant_id", "created_at");


-- Booking indexes

CREATE INDEX IF NOT EXISTS "bookings_tenant_id_start_time_status_idx"
ON "bookings"("tenant_id", "start_time", "status");


-- Invoice indexes

CREATE INDEX IF NOT EXISTS "invoices_tenant_id_status_idx"
ON "invoices"("tenant_id", "status");


-- Payment indexes

CREATE INDEX IF NOT EXISTS "payments_tenant_id_paid_at_idx"
ON "payments"("tenant_id", "paid_at");


-- Garment indexes

CREATE INDEX IF NOT EXISTS "garments_tenant_id_status_idx"
ON "garments"("tenant_id", "status");


-- Tailoring order indexes

CREATE INDEX IF NOT EXISTS "tailoring_orders_tenant_id_status_idx"
ON "tailoring_orders"("tenant_id", "status");