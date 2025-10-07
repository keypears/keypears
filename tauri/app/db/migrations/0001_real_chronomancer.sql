ALTER TABLE `secret_update` ADD `parent_id` text;--> statement-breakpoint
CREATE INDEX `idx_secret_updates_parent_id` ON `secret_update` (`parent_id`);