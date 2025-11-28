import fs from "fs";
import path from "path";
import config from "../config";
import db from "../db";
import { roomsTable } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import { activeUsers, User } from "../sockets/rooms.sockets";
import { createActivity } from "./users.service";

const roomsPath = config.roomsPath;
if (!fs.existsSync(roomsPath)) {
  fs.mkdirSync(roomsPath);
}

type FileTree = {
  name: string;
  type: "file" | "directory";
  path: string;
  children?: FileTree[] | null;
};

export const isRoomExists = async (roomId: string): Promise<boolean> => {
  try {
    await fs.promises.access(path.join(roomsPath, roomId));
    return true;
  } catch (error) {
    return false;
  }
};

type Room = {
  name: string;
  description: string;
  userId: number;
  id: string;
  path: string;
  user: {
    name: string;
    id: number;
    nim: string;
    role: string;
  };
};

let rooms: Room[] = [];

export const refreshRooms = async () => {
  try {
    const initRooms = await db.query.roomsTable.findMany({
      with: {
        user: {
          columns: {
            password: false,
          },
        },
      },
      orderBy: [desc(roomsTable.id)],
    });

    if (!initRooms) {
      return;
    }

    rooms = initRooms.map((room) => ({
      ...room,
      path: path.join(roomsPath, room.id),
    }));
  } catch (err) {
    console.error(err);
  }
};

export const getRooms = () => {
  try {
    let roomsWithUsers = rooms.map((room) => {
      const users = activeUsers.get(room.id);
      return {
        ...room,
        activeUsers: users || [],
      };
    });
    return roomsWithUsers;
  } catch (err) {
    console.error(err);
    return [];
  }
};

export const getRoom = async (roomId: string): Promise<Room | null> => {
  try {
    const room = await db.query.roomsTable.findFirst({
      with: {
        user: {
          columns: {
            password: false,
          },
        },
        contributors: true,
      },
      where: eq(roomsTable.id, roomId),
    });

    if (!room) {
      return null;
    }

    return { ...room, path: path.join(roomsPath, room.id) };
  } catch (err) {
    console.error(err);
    return null;
  }
};

const exploreDirectory = async (dirPath: string): Promise<FileTree[]> => {
  const items = await fs.promises.readdir(dirPath);
  const directories: FileTree[] = [];
  const files: FileTree[] = [];

  for (const item of items) {
    const itemPath = path.join(dirPath, item);
    const stats = await fs.promises.stat(itemPath);

    if (stats.isDirectory()) {
      directories.push({
        name: item,
        type: "directory",
        path: itemPath,
        children: await exploreDirectory(itemPath),
      });
    } else {
      if (!(item.endsWith(".class") || item.endsWith(".exe"))) {
        files.push({
          name: item,
          type: "file",
          path: itemPath,
        });
      }
    }
  }

  directories.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));

  return [...directories, ...files];
};

export const exploreRooms = async (
  roomId: string,
): Promise<FileTree[] | null> => {
  if (!(await isRoomExists(roomId))) return null;

  const roomPath = path.join(roomsPath, roomId);
  return await exploreDirectory(roomPath);
};

export const createRoom = async ({
  name,
  description,
  user,
}: {
  name: string;
  description: string;
  user: User;
}): Promise<boolean> => {
  try {
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, "") + "-" + Date.now();
    await fs.promises.mkdir(path.join(roomsPath, id));

    await db.insert(roomsTable).values({
      id: id,
      name: name,
      description: description,
      userId: user.id,
    });

    await createActivity({
      type: "room_create",
      userId: user.id,
      description: `New room created by user ${user.name}`,
      details: JSON.stringify({
        "Room Name": name,
        "Room ID": id,
        "Room Description": description
          ? description
          : "No description provided",
      }),
    });

    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
};

export const deleteRoom = async (roomId: string): Promise<boolean> => {
  try {
    await db.delete(roomsTable).where(eq(roomsTable.id, roomId));
    await fs.promises.rmdir(path.join(roomsPath, roomId), { recursive: true });
    return true;
  } catch (error) {
    return false;
  }
};

export const updateRoom = async ({
  roomId,
  name,
  description,
  user,
}: {
  roomId: string;
  name: string;
  description: string;
  user: User;
}): Promise<boolean> => {
  try {
    if (description) {
      await db
        .update(roomsTable)
        .set({ name, description })
        .where(eq(roomsTable.id, roomId));
    } else {
      await db
        .update(roomsTable)
        .set({ name })
        .where(eq(roomsTable.id, roomId));
    }

    await createActivity({
      type: "room_update",
      userId: user.id,
      description: `Room ${roomId} updated by user`,
      details: JSON.stringify({
        "Room Name": name,
        "Room ID": roomId,
        "Room Description": description
          ? description
          : "No description provided",
      }),
    });

    return true;
  } catch (error) {
    return false;
  }
};
