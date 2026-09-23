-- A9: order-specific fabric & design details (1:1 with TailoringOrder).
-- Purely additive: no existing table or column is modified; existing orders
-- remain valid without a details row (GET returns the empty state).
CREATE TABLE "tailoring_order_details" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenant_id" TEXT NOT NULL,
    "tailoring_order_id" TEXT NOT NULL,
    "fabric_source" TEXT NOT NULL,
    "fabric_type" TEXT,
    "fabric_color" TEXT,
    "fabric_quantity" DECIMAL(12, 2),
    "fabric_unit" TEXT NOT NULL DEFAULT 'meter',
    "design_fields" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "special_instructions" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "tailoring_order_details_tailoringOrderId_key" ON "tailoring_order_details"("tailoring_order_id");
CREATE INDEX "tailoring_order_details_tenantId_idx" ON "tailoring_order_details"("tenant_id");
ALTER TABLE "tailoring_order_details" ADD CONSTRAINT "tailoring_order_details_tenantId_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tailoring_order_details" ADD CONSTRAINT "tailoring_order_details_tailoringOrderId_fkey" FOREIGN KEY ("tailoring_order_id") REFERENCES "tailoring_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
