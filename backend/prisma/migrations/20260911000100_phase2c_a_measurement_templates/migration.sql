CREATE TABLE "measurement_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT,
    "default_unit" TEXT NOT NULL DEFAULT 'inch',
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "measurement_templates_tenantId_code_key" ON "measurement_templates"("tenant_id", "code");
ALTER TABLE "measurement_templates" ADD CONSTRAINT "measurement_templates_tenantId_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "measurement_template_fields" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "template_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "section" TEXT,
    "type" TEXT NOT NULL DEFAULT 'number',
    "unit" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX "measurement_template_fields_templateId_name_key" ON "measurement_template_fields"("template_id", "name");
ALTER TABLE "measurement_template_fields" ADD CONSTRAINT "measurement_template_fields_templateId_fkey" FOREIGN KEY ("template_id") REFERENCES "measurement_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "services" ADD COLUMN "measurement_template_id" TEXT REFERENCES "measurement_templates"("id") ON DELETE SET NULL;
ALTER TABLE "garments" ADD COLUMN "measurement_template_id" TEXT REFERENCES "measurement_templates"("id") ON DELETE SET NULL;
ALTER TABLE "measurements" ADD COLUMN "template_id" TEXT REFERENCES "measurement_templates"("id") ON DELETE SET NULL;
ALTER TABLE "measurements" ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'inch';
