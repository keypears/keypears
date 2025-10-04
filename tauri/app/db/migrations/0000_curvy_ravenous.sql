CREATE TABLE `vaults` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vaults_name_unique` ON `vaults` (`name`);