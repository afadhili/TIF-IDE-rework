ALTER TABLE `rooms` ADD `updatedAt` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL;--> statement-breakpoint
ALTER TABLE `rooms` ADD `createdAt` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `createdAt` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `updatedAt` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL;