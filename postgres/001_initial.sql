CREATE SCHEMA IF NOT EXISTS knox;
SET search_path TO knox;
CREATE TABLE "audit" (
	"id" text PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"created" text NOT NULL
);

CREATE TABLE "interfaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"model" text NOT NULL,
	"protocol" text NOT NULL,
	"token_hash" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"mapping" text NOT NULL,
	"last_seen" text,
	"created" text NOT NULL
);

CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"interface_id" text NOT NULL,
	"message_id" text NOT NULL,
	"sample_id" text NOT NULL,
	"payload" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created" text NOT NULL
);

CREATE UNIQUE INDEX "messages_interface_message" ON "messages" ("interface_id","message_id");
CREATE TABLE "staff" (
	"email" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"created" text NOT NULL
);

CREATE TABLE "workspace" (
	"id" integer PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"data" text NOT NULL
);

ALTER TABLE "staff" ADD "password_hash" text;
CREATE TABLE "clinical_records" (
	"key" text PRIMARY KEY NOT NULL,
	"collection" text NOT NULL,
	"record_id" text NOT NULL,
	"patient_id" text,
	"search_name" text DEFAULT '' NOT NULL,
	"data" text NOT NULL,
	"updated" text NOT NULL
);

CREATE UNIQUE INDEX "clinical_collection_id" ON "clinical_records" ("collection","record_id");
CREATE INDEX "clinical_patient_lookup" ON "clinical_records" ("collection","patient_id","record_id");
CREATE INDEX "clinical_name_lookup" ON "clinical_records" ("collection","search_name","record_id");
CREATE TABLE migration_state (id integer PRIMARY KEY, status text NOT NULL, manifest jsonb NOT NULL, completed_at timestamptz NOT NULL DEFAULT now());
