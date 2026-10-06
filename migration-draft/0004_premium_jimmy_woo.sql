CREATE TABLE `storage_guard` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `storage_meta` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`settings` text NOT NULL,
	`activity` text NOT NULL
);
