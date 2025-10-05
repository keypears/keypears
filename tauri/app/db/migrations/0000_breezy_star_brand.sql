CREATE TABLE `password_updates` (
	`id` text PRIMARY KEY NOT NULL,
	`vault_id` text NOT NULL,
	`secret_id` text NOT NULL,
	`name` text NOT NULL,
	`domain` text,
	`username` text,
	`email` text,
	`notes` text,
	`encrypted_password` text,
	`created_at` integer NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_password_updates_vault_secret_time` ON `password_updates` (`vault_id`,`secret_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `vaults` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`encrypted_vault_key` text NOT NULL,
	`hashed_vault_key` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vaults_name_unique` ON `vaults` (`name`);