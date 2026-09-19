CREATE TYPE "public"."refuel_execution_status" AS ENUM('requested', 'submitted', 'confirmed', 'indexing', 'indexed', 'failed', 'blocked_no_reserve', 'blocked_weekly_cap', 'blocked_policy');--> statement-breakpoint
ALTER TYPE "public"."run_status" ADD VALUE 'refuel_pending' BEFORE 'client_unfunded';--> statement-breakpoint
CREATE TABLE "client_refuel_policies" (
	"client_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"threshold_usd" numeric(20, 6) NOT NULL,
	"refill_amount_usdg" numeric(20, 6) NOT NULL,
	"weekly_cap_usdg" numeric(20, 6) NOT NULL,
	"executor_address" text NOT NULL,
	"max_slippage_bps" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refuel_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"run_id" uuid,
	"workflow_run_id" text,
	"trigger_balance" numeric(20, 6) NOT NULL,
	"threshold" numeric(20, 6) NOT NULL,
	"requested_amount" numeric(20, 6) NOT NULL,
	"transaction_hash" text,
	"status" "refuel_execution_status" DEFAULT 'requested' NOT NULL,
	"quote_credit_out" numeric(30, 0),
	"quote_usdg_spent" numeric(30, 0),
	"quote_fee_atoms" numeric(30, 0),
	"quote_fills" numeric(30, 0),
	"quote_reason" integer,
	"min_credit_out" numeric(30, 0),
	"usdg_spent" numeric(30, 0),
	"credit_out" numeric(30, 0),
	"activation_id" text,
	"beneficiary_address" text NOT NULL,
	"error_code" text,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"indexed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "client_refuel_policies" ADD CONSTRAINT "client_refuel_policies_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refuel_executions" ADD CONSTRAINT "refuel_executions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refuel_executions" ADD CONSTRAINT "refuel_executions_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "refuel_executions_tx_unique" ON "refuel_executions" USING btree ("transaction_hash");--> statement-breakpoint
CREATE INDEX "refuel_executions_client_idx" ON "refuel_executions" USING btree ("client_id","started_at");--> statement-breakpoint
CREATE INDEX "refuel_executions_active_idx" ON "refuel_executions" USING btree ("client_id","status");