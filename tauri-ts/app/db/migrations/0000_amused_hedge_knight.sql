CREATE TABLE `secret_update` (
	`id` text PRIMARY KEY NOT NULL,
	`vault_id` text NOT NULL,
	`secret_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'password' NOT NULL,
	`created_at` integer NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`secret_update_json` text NOT NULL,
	FOREIGN KEY (`vault_id`) REFERENCES `vault`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_secret_updates_vault_secret_time` ON `secret_update` (`vault_id`,`secret_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_secret_updates_name` ON `secret_update` (`name`);--> statement-breakpoint
CREATE INDEX `idx_secret_updates_type` ON `secret_update` (`type`);--> statement-breakpoint
CREATE TABLE `vault` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`encrypted_vault_key` text NOT NULL,
	`hashed_vault_key` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vault_name_unique` ON `vault` (`name`);