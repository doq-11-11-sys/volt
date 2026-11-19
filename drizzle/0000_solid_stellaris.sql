CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text,
	`actor_id` text NOT NULL,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_activity_ticket_created` ON `activity` (`ticket_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_attachments_ticket` ON `attachments` (`ticket_id`);--> statement-breakpoint
CREATE TABLE `equipment` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`location` text NOT NULL,
	`category` text NOT NULL,
	`condition` text DEFAULT 'normal' NOT NULL,
	`notes` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_code_unique` ON `equipment` (`code`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`equipment_id` text,
	`location` text NOT NULL,
	`start_date` text NOT NULL,
	`interval_days` integer NOT NULL,
	`occurrences` integer NOT NULL,
	`estimated_hours` real NOT NULL,
	`assignee_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tickets` (
	`number` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`location` text NOT NULL,
	`equipment_id` text,
	`priority` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`kind` text DEFAULT 'request' NOT NULL,
	`creator_id` text NOT NULL,
	`assignee_id` text,
	`due_date` text NOT NULL,
	`scheduled_date` text NOT NULL,
	`estimated_hours` real DEFAULT 2 NOT NULL,
	`actual_hours` real,
	`result` text DEFAULT '' NOT NULL,
	`plan_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`closed_at` text,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tickets_id_unique` ON `tickets` (`id`);--> statement-breakpoint
CREATE INDEX `idx_tickets_creator` ON `tickets` (`creator_id`);--> statement-breakpoint
CREATE INDEX `idx_tickets_assignee_status` ON `tickets` (`assignee_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_tickets_due` ON `tickets` (`due_date`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`department` text NOT NULL,
	`position` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`role` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL
);
