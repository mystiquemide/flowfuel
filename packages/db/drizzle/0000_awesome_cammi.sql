CREATE TYPE "public"."activation_status" AS ENUM('pending', 'confirmed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."audit_actor_type" AS ENUM('client', 'agency', 'workflow', 'system');--> statement-breakpoint
CREATE TYPE "public"."client_status" AS ENUM('pending', 'ready', 'unfunded', 'paused', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."nonce_purpose" AS ENUM('connect', 'register_credential', 'rotate_credential');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'succeeded', 'client_unfunded', 'quota_exceeded', 'provider_failed', 'validation_failed');--> statement-breakpoint
CREATE TABLE "activations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"transaction_hash" text NOT NULL,
	"activation_id" integer,
	"amount_usd" numeric(20, 6) NOT NULL,
	"block_number" bigint,
	"status" "activation_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid,
	"actor_type" "audit_actor_type" NOT NULL,
	"event_type" text NOT NULL,
	"public_data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_credentials" (
	"client_id" uuid PRIMARY KEY NOT NULL,
	"wallet_address" text NOT NULL,
	"epoch" integer NOT NULL,
	"ciphertext" text NOT NULL,
	"fingerprint" text NOT NULL,
	"verified_balance" numeric(20, 6),
	"verified_at" timestamp with time zone,
	"rotated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"wallet_address" text NOT NULL,
	"chain_id" integer DEFAULT 4663 NOT NULL,
	"status" "client_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"workflow_run_id" text,
	"task_type" text NOT NULL,
	"model" text NOT NULL,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"generation_id" text,
	"balance_before" numeric(20, 6),
	"balance_after" numeric(20, 6),
	"cost_usd" numeric(20, 6),
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"error_code" text,
	"upstream_status" integer,
	"task_hash" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "wallet_nonces" (
	"nonce" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"purpose" "nonce_purpose" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "activations" ADD CONSTRAINT "activations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_credentials" ADD CONSTRAINT "client_credentials_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_nonces" ADD CONSTRAINT "wallet_nonces_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activations_tx_unique" ON "activations" USING btree ("transaction_hash");--> statement-breakpoint
CREATE INDEX "activations_client_idx" ON "activations" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "audit_events_client_idx" ON "audit_events" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_slug_unique" ON "clients" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_wallet_unique" ON "clients" USING btree ("wallet_address");--> statement-breakpoint
CREATE UNIQUE INDEX "runs_idempotency_unique" ON "runs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "runs_client_idx" ON "runs" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "runs_client_started_idx" ON "runs" USING btree ("client_id","started_at");--> statement-breakpoint
CREATE INDEX "wallet_nonces_client_idx" ON "wallet_nonces" USING btree ("client_id");