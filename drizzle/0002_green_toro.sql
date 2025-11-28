CREATE TABLE `users_activity` (
	`id` integer PRIMARY KEY NOT NULL,
	`userId` integer NOT NULL,
	`type` text NOT NULL,
	`description` text NOT NULL,
	`details` text NOT NULL,
	`timestamp` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_activity_id_unique` ON `users_activity` (`id`);