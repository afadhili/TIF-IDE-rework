import { eq, InferSelectModel } from "drizzle-orm";
import db from "../db";
import { User } from "../sockets/rooms.sockets";
import {
  contributorsTable,
  roomsTable,
  usersActivityTable,
  usersTable,
} from "../db/schema";
import { onlineUsers } from "../sockets";
import { io } from "..";

export type UserActivity = InferSelectModel<typeof usersActivityTable>;
type CreateActivityInput = Pick<
  UserActivity,
  "userId" | "type" | "description"
> & {
  details?: string | null;
};

export const createUser = async (
  data: Partial<User>,
): Promise<User | null | undefined> => {
  try {
    const user = await db
      .insert(usersTable)
      .values({
        name: data.name || "",
        nim: data.nim || "",
        password: data.password || "",
      })
      .returning();
    return user[0];
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const getUsers = async (): Promise<User[] | null> => {
  try {
    const users = await db.query.usersTable.findMany({
      with: {
        rooms: true,
        contributors: true,
      },
    });

    let usersWithStatus = users.map((user) => {
      const status = onlineUsers.has(user.nim) ? "active" : "offline";
      return { ...user, status };
    });

    return usersWithStatus;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const getUserById = async (
  id: string,
): Promise<(User & { status: string }) | null | undefined> => {
  try {
    const userId = parseInt(id);
    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, userId),
      with: {
        activities: true,
        contributors: true,
        rooms: true,
      },
    });

    if (!user) return null;

    return {
      ...user,
      status: onlineUsers.has(user.nim) ? "active" : "offline",
    };
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const updateUserById = async (
  id: string,
  data: Partial<User>,
): Promise<User | null | undefined> => {
  try {
    const userId = parseInt(id);
    const user = await db
      .update(usersTable)
      .set(data)
      .where(eq(usersTable.id, userId))
      .limit(1)
      .returning();
    return user[0];
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const deleteUserById = async (
  id: string,
): Promise<User | null | undefined> => {
  try {
    const userId = Number(id);
    await db.delete(roomsTable).where(eq(roomsTable.userId, userId));
    await db
      .delete(usersActivityTable)
      .where(eq(usersActivityTable.userId, userId));
    await db
      .delete(contributorsTable)
      .where(eq(contributorsTable.userId, userId));
    const user = await db
      .delete(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1)
      .returning();
    if (!user) {
      return null;
    }
    return user[0];
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const createActivity = async (
  data: CreateActivityInput,
): Promise<UserActivity | null> => {
  try {
    const activity = await db
      .insert(usersActivityTable)
      .values({
        userId: data.userId,
        type: data.type,
        description: data.description,
        details: data.details ?? "",
      })
      .returning();

    if (activity)
      io.to("admin").emit("userActivity", { activity: activity[0] });

    return activity[0] ?? null;
  } catch (error) {
    console.error("Failed to create activity:", error);
    return null;
  }
};

export const getActivities = async (): Promise<any[] | null> => {
  try {
    const activities = await db.query.usersActivityTable.findMany();
    return activities;
  } catch (error) {
    console.error(error);
    return null;
  }
};
