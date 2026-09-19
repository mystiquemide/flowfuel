ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "generations" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "result_ciphertext" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "activation_tx_hash" text;--> statement-breakpoint
UPDATE "runs" AS r
SET "activation_tx_hash" = (
  SELECT a."transaction_hash"
  FROM "activations" AS a
  WHERE a."client_id" = r."client_id"
    AND a."status" = 'confirmed'
    AND a."created_at" <= r."started_at"
  ORDER BY a."created_at" DESC
  LIMIT 1
)
WHERE r."activation_tx_hash" IS NULL;
