CREATE TABLE `sync_conflicts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`table_name` text NOT NULL,
	`row_id` text NOT NULL,
	`reason` text NOT NULL,
	`lost` text NOT NULL,
	`winner_updated_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conflict_user` ON `sync_conflicts` (`user_id`,`created_at`);