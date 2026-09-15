CREATE TABLE `body_weights` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`measured_on` text NOT NULL,
	`weight_kg` real NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`rev` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bw_user_date` ON `body_weights` (`user_id`,`measured_on`);--> statement-breakpoint
CREATE INDEX `bw_user_rev` ON `body_weights` (`user_id`,`rev`);--> statement-breakpoint
CREATE TABLE `exercise_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`rev` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exn_user_exercise` ON `exercise_notes` (`user_id`,`exercise_id`);--> statement-breakpoint
CREATE INDEX `exn_user_rev` ON `exercise_notes` (`user_id`,`rev`);--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`category` text,
	`level` text,
	`force` text,
	`mechanic` text,
	`equipment` text,
	`primary_muscles` text,
	`secondary_muscles` text,
	`instructions` text,
	`images` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`rev` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ex_owner_slug` ON `exercises` (`user_id`,`slug`);--> statement-breakpoint
CREATE INDEX `ex_user_rev` ON `exercises` (`user_id`,`rev`);--> statement-breakpoint
CREATE TABLE `program_days` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`program_id` text NOT NULL,
	`day_of_week` integer NOT NULL,
	`template_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`rev` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `workout_templates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pd_program_dow` ON `program_days` (`program_id`,`day_of_week`);--> statement-breakpoint
CREATE INDEX `pd_user_rev` ON `program_days` (`user_id`,`rev`);--> statement-breakpoint
CREATE TABLE `programs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`stage` text,
	`started_on` text NOT NULL,
	`ended_on` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`rev` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `prog_user_started` ON `programs` (`user_id`,`started_on`);--> statement-breakpoint
CREATE INDEX `prog_user_rev` ON `programs` (`user_id`,`rev`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`program_id` text,
	`template_id` text,
	`template_name` text NOT NULL,
	`scheduled_for` text NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`rev` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`template_id`) REFERENCES `workout_templates`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `sess_user_date` ON `sessions` (`user_id`,`scheduled_for`);--> statement-breakpoint
CREATE INDEX `sess_user_rev` ON `sessions` (`user_id`,`rev`);--> statement-breakpoint
CREATE TABLE `set_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`exercise_name` text NOT NULL,
	`position` integer NOT NULL,
	`set_index` integer NOT NULL,
	`target_reps` integer,
	`target_reps_max` integer,
	`target_weight_kg` real,
	`rest_sec` integer,
	`weight_kg` real,
	`reps` integer,
	`is_warmup` integer DEFAULT false NOT NULL,
	`completed_at` integer,
	`performed_at` integer NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`rev` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sl_natural` ON `set_logs` (`session_id`,`exercise_id`,`set_index`);--> statement-breakpoint
CREATE INDEX `sl_last_lifted` ON `set_logs` (`user_id`,`exercise_id`,`performed_at`);--> statement-breakpoint
CREATE INDEX `sl_session` ON `set_logs` (`session_id`,`position`,`set_index`);--> statement-breakpoint
CREATE INDEX `sl_user_rev` ON `set_logs` (`user_id`,`rev`);--> statement-breakpoint
CREATE TABLE `template_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`template_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`position` integer NOT NULL,
	`sets` integer DEFAULT 3 NOT NULL,
	`target_reps` integer DEFAULT 10 NOT NULL,
	`target_reps_max` integer,
	`target_weight_kg` real,
	`rest_sec` integer DEFAULT 90 NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`rev` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `workout_templates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ti_template_position` ON `template_items` (`template_id`,`position`);--> statement-breakpoint
CREATE INDEX `ti_user_rev` ON `template_items` (`user_id`,`rev`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text,
	`unit` text DEFAULT 'kg' NOT NULL,
	`sync_rev` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `workout_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`notes` text,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`rev` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tpl_user_rev` ON `workout_templates` (`user_id`,`rev`);