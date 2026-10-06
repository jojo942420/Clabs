-- Independent, permanent patient and accession sequences. Internal keys stay stable.
CREATE TABLE IF NOT EXISTS knox.number_counters(collection text PRIMARY KEY, last_number bigint NOT NULL);
--> statement-breakpoint
DO $$
BEGIN
 PERFORM id FROM knox.storage_meta WHERE id=1 FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM knox.number_counters WHERE collection='patients') THEN
  WITH numbered AS (
   SELECT key,row_number() OVER(PARTITION BY collection ORDER BY coalesce(nullif(data::jsonb->>'created',''),updated),record_id) AS n
   FROM knox.clinical_records WHERE collection IN ('patients','orders')
  ) UPDATE knox.clinical_records r SET data=jsonb_set(r.data::jsonb,'{sequenceNumber}',to_jsonb(n.n))::text FROM numbered n WHERE r.key=n.key;
  INSERT INTO knox.number_counters(collection,last_number)
  SELECT c,coalesce((SELECT max((data::jsonb->>'sequenceNumber')::bigint) FROM knox.clinical_records WHERE collection=c),0)
  FROM unnest(ARRAY['patients','orders']) c;
  UPDATE knox.storage_meta SET revision=revision+1 WHERE id=1;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM knox.number_counters WHERE collection='ultrasoundReports') THEN
  WITH numbered AS (SELECT key,row_number() OVER(ORDER BY coalesce(nullif(data::jsonb->>'created',''),updated),record_id) n FROM knox.clinical_records WHERE collection='ultrasoundReports') UPDATE knox.clinical_records r SET data=jsonb_set(r.data::jsonb,'{sequenceNumber}',to_jsonb(n.n))::text FROM numbered n WHERE r.key=n.key;
  INSERT INTO knox.number_counters VALUES('ultrasoundReports',coalesce((SELECT max((data::jsonb->>'sequenceNumber')::bigint) FROM knox.clinical_records WHERE collection='ultrasoundReports'),0));
  UPDATE knox.storage_meta SET revision=revision+1 WHERE id=1;
 END IF;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION knox.assign_record_number() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
 IF NEW.collection NOT IN ('patients','orders','ultrasoundReports') THEN RETURN NEW; END IF;
 -- Upserts keep their original number; allocation rolls back with a failed save.
 SELECT (data::jsonb->>'sequenceNumber')::bigint INTO n FROM knox.clinical_records WHERE key=NEW.key;
 IF n IS NULL THEN
  UPDATE knox.number_counters SET last_number=last_number+1 WHERE collection=NEW.collection RETURNING last_number INTO n;
 END IF;
 IF n IS NULL THEN RAISE EXCEPTION 'Record numbering is not initialized'; END IF;
 NEW.data=jsonb_set(NEW.data::jsonb,'{sequenceNumber}',to_jsonb(n))::text;
 RETURN NEW;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='knox_record_number') THEN
  CREATE TRIGGER knox_record_number BEFORE INSERT OR UPDATE ON knox.clinical_records FOR EACH ROW EXECUTE FUNCTION knox.assign_record_number();
 END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS clinical_sequence_number ON knox.clinical_records(collection,((data::jsonb->>'sequenceNumber')::bigint)) WHERE collection IN ('patients','orders');

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ultrasound_sequence_number ON knox.clinical_records(((data::jsonb->>'sequenceNumber')::bigint)) WHERE collection='ultrasoundReports';
