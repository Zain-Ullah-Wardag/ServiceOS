-- Add measurementId to tailoring_order
ALTER TABLE tailoring_order ADD COLUMN measurement_id VARCHAR(255) REFERENCES measurement(id) ON DELETE SET NULL;
