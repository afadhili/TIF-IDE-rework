import { relations, sql } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const usersTable = sqliteTable("users", {
  id: integer().primaryKey().unique(),
  nim: text().notNull().unique(),
  name: text().notNull(),
  role: text().notNull().default("user"),
  password: text().notNull(),
  lastOnline: integer({ mode: "timestamp" }),
  createdAt: integer({ mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer({ mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
});

export const usersRelations = relations(usersTable, ({ many }) => ({
  rooms: many(roomsTable),
  contributors: many(contributorsTable),
  activities: many(usersActivityTable),
}));

export const roomsTable = sqliteTable("rooms", {
  id: text().primaryKey().unique(),
  name: text().notNull(),
  description: text().notNull(),
  userId: integer()
    .notNull()
    .references(() => usersTable.id),
  createdAt: integer({ mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer({ mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
});

export const usersActivityType = [
  "file_create",
  "file_delete",
  "file_update",
  "room_create",
  "room_delete",
  "room_update",
  "room_download",
  "login",
  "logout",
] as const;

export const usersActivityTable = sqliteTable("users_activity", {
  id: integer().primaryKey().unique(),
  userId: integer()
    .notNull()
    .references(() => usersTable.id),
  type: text("type", { enum: usersActivityType }).notNull(),
  description: text().notNull(),
  details: text().notNull(),
  timestamp: integer({ mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const usersActivityRelations = relations(
  usersActivityTable,
  ({ one }) => ({
    user: one(usersTable, {
      fields: [usersActivityTable.userId],
      references: [usersTable.id],
    }),
  }),
);

export const roomsRelations = relations(roomsTable, ({ one, many }) => ({
  user: one(usersTable, {
    fields: [roomsTable.userId],
    references: [usersTable.id],
  }),
  contributors: many(contributorsTable),
}));

export const contributorsTable = sqliteTable("contributors", {
  userId: integer()
    .notNull()
    .references(() => usersTable.id),
  roomId: text()
    .notNull()
    .references(() => roomsTable.id),
});

export const contributorsRelations = relations(
  contributorsTable,
  ({ one }) => ({
    user: one(usersTable, {
      fields: [contributorsTable.userId],
      references: [usersTable.id],
    }),
    room: one(roomsTable, {
      fields: [contributorsTable.roomId],
      references: [roomsTable.id],
    }),
  }),
);
