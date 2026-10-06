CREATE TABLE `clinical_records` (
	`key` text PRIMARY KEY NOT NULL,
	`collection` text NOT NULL,
	`record_id` text NOT NULL,
	`patient_id` text,
	`search_name` text DEFAULT '' NOT NULL,
	`data` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clinical_collection_id` ON `clinical_records` (`collection`,`record_id`);