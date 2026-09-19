ALTER TYPE "public"."nonce_purpose" ADD VALUE IF NOT EXISTS 'pause_client';--> statement-breakpoint
ALTER TYPE "public"."nonce_purpose" ADD VALUE IF NOT EXISTS 'revoke_credential';
