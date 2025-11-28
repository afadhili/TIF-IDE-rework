PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`userId` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_rooms`("id", "name", "description", "userId", "createdAt", "updatedAt") SELECT "id", "name", "description", "userId", "createdAt", "updatedAt" FROM `rooms`;--> statement-breakpoint
DROP TABLE `rooms`;--> statement-breakpoint
ALTER TABLE `__new_rooms` RENAME TO `rooms`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_id_unique` ON `rooms` (`id`);--> statement-breakpoint
CREATE TABLE `__new_users_activity` (
	`id` integer PRIMARY KEY NOT NULL,
	`userId` integer NOT NULL,
	`type` text NOT NULL,
	`description` text NOT NULL,
	`details` text NOT NULL,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_users_activity`("id", "userId", "type", "description", "details", "timestamp") SELECT "id", "userId", "type", "description", "details", "timestamp" FROM `users_activity`;--> statement-breakpoint
DROP TABLE `users_activity`;--> statement-breakpoint
ALTER TABLE `__new_users_activity` RENAME TO `users_activity`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_activity_id_unique` ON `users_activity` (`id`);--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` integer PRIMARY KEY NOT NULL,
	`nim` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`password` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "nim", "name", "role", "password", "createdAt", "updatedAt") SELECT "id", "nim", "name", "role", "password", "createdAt", "updatedAt" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_nim_unique` ON `users` (`nim`);