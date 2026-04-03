CREATE TABLE `secret_update` (
	`id` text PRIMARY KEY NOT NULL,
	`vault_id` text NOT NULL,
	`secret_id` text NOT NULL,
	`global_order` integer NOT NULL,
	`local_order` integer NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'password' NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`encrypted_blob` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`vault_id`) REFERENCES `vault`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_secret_updates_vault_global_order` ON `secret_update` (`vault_id`,`global_order`);--> statement-breakpoint
CREATE INDEX `idx_secret_updates_secret_local_order` ON `secret_update` (`secret_id`,`local_order`);--> statement-breakpoint
CREATE INDEX `idx_secret_updates_name` ON `secret_update` (`name`);--> statement-breakpoint
CREATE INDEX `idx_secret_updates_type` ON `secret_update` (`type`);--> statement-breakpoint
CREATE TABLE `vault` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`domain` text NOT NULL,
	`encrypted_vault_key` text NOT NULL,
	`vault_pubkeyhash` text NOT NULL,
	`last_sync_timestamp` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vault_name_domain_unique` ON `vault` (`name`,`domain`);--> statement-breakpoint
CREATE TABLE `vault_sync_state` (
	`vault_id` text PRIMARY KEY NOT NULL,
	`last_synced_global_order` integer DEFAULT 0 NOT NULL,
	`last_sync_attempt` integer,
	`last_sync_success` integer,
	`sync_error` text,
	FOREIGN KEY (`vault_id`) REFERENCES `vault`(`id`) ON UPDATE no action ON DELETE cascade
);
