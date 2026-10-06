CREATE TABLE `stock_items` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`unit` text NOT NULL,
	`minimum` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stock_links` (
	`item_id` text NOT NULL,
	`test_id` text NOT NULL,
	`per_test` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stock_link_unique` ON `stock_links` (`item_id`,`test_id`);--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`kind` text NOT NULL,
	`quantity` integer NOT NULL,
	`order_id` text,
	`test_id` text,
	`reason` text NOT NULL,
	`actor` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stock_order_once` ON `stock_movements` (`item_id`,`order_id`);--> statement-breakpoint
CREATE INDEX `stock_history` ON `stock_movements` (`item_id`,`created`);--> statement-breakpoint
CREATE TABLE `stock_write_guard` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL
);
