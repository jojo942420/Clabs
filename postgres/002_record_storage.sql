CREATE TABLE IF NOT EXISTS knox.storage_meta(id integer PRIMARY KEY,revision integer NOT NULL,settings text NOT NULL,activity text NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS knox.storage_guard(id integer PRIMARY KEY,revision integer NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS clinical_request_lookup ON knox.clinical_records(collection,((data::jsonb)->>'requestId'),record_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS clinical_linked_order ON knox.clinical_records(collection,((data::jsonb)->>'orderId'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS clinical_patient_global ON knox.clinical_records(patient_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS clinical_active_receipt ON knox.clinical_records(((data::jsonb)->>'orderId')) WHERE collection='sales' AND (data::jsonb)->>'status'<>'Cancelled';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS clinical_prefix_search ON knox.clinical_records(collection,search_name text_pattern_ops,record_id);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION knox.protect_legacy_workspace() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM knox.storage_meta WHERE id=1) THEN
  RAISE EXCEPTION 'Record storage is active. Refresh the website before saving.';
 END IF;
 RETURN NEW;
END;
$$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='knox_workspace_migrated') THEN
  CREATE TRIGGER knox_workspace_migrated BEFORE UPDATE OR DELETE ON knox.workspace FOR EACH ROW EXECUTE FUNCTION knox.protect_legacy_workspace();
 END IF;
END $$;
