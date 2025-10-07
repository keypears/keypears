CREATE TABLE `secret_updates` (
	`id` text PRIMARY KEY NOT NULL,
	`vault_id` text NOT NULL,
	`secret_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'password' NOT NULL,
	`created_at` integer NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`secret_update_json` text NOT NULL,
	FOREIGN KEY (`vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_secret_updates_vault_secret_time` ON `secret_updates` (`vault_id`,`secret_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_secret_updates_name` ON `secret_updates` (`name`);--> statement-breakpoint
CREATE INDEX `idx_secret_updates_type` ON `secret_updates` (`type`);--> statement-breakpoint
CREATE TABLE `vaults` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`encrypted_vault_key` text NOT NULL,
	`hashed_vault_key` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vaults_name_unique` ON `vaults` (`name`);