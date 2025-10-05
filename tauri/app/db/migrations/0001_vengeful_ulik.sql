PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_vaults` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_vaults`("id", "name") SELECT "id", "name" FROM `vaults`;--> statement-breakpoint
DROP TABLE `vaults`;--> statement-breakpoint
ALTER TABLE `__new_vaults` RENAME TO `vaults`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `vaults_name_unique` ON `vaults` (`name`);