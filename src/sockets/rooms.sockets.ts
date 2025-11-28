import { Server, Socket } from "socket.io";
import {
  createRoom,
  deleteRoom,
  exploreRooms,
  getRoom,
  getRooms,
  refreshRooms,
  updateRoom,
} from "../services/rooms.service";
import { randomHexColor } from "../lib/randomColor";
import db from "../db";
import { and, eq, InferSelectModel } from "drizzle-orm";
import { contributorsTable, roomsTable, usersTable } from "../db/schema";
import { createActivity } from "../services/users.service";

export type User = InferSelectModel<typeof usersTable>;
export type Room = InferSelectModel<typeof roomsTable>;
export type Contributor = InferSelectModel<typeof contributorsTable>;

export type UserWithContributor = User & {
  contributors: Contributor[];
  color: string;
};

export const activeUsers = new Map<string, UserWithContributor[]>();

export default function roomSocketsSetup(io: Server) {
  io.on(
    "connection",
    (
      socket: Socket & { user?: UserWithContributor; roomId?: string | null },
    ) => {
      socket.on("getRooms", async (broadcast: boolean = false) => {
        await refreshRooms();
        const rooms = getRooms();
        if (broadcast) {
          io.emit("rooms", rooms);
        } else {
          socket.emit("rooms", rooms);
        }
      });

      socket.on("createRoom", async (data, callback) => {
        const room = await createRoom(data);
        if (room) {
          callback({ success: true });
        } else {
          callback({ success: false });
        }
      });

      socket.on("updateRoom", async (data, callback) => {
        const success = await updateRoom(data);
        if (success) {
          callback({ success: true });
          io.to(data.roomId).emit("roomUpdated", data);
        } else {
          callback({ success: false });
        }
      });

      socket.on("deleteRoom", async ({ room, user }, callback) => {
        const success = await deleteRoom(room.id);
        if (success) {
          callback({ success: true });
          await createActivity({
            userId: user.id,
            type: "room_delete",
            description: `Room ${room.name} deleted`,
            details: JSON.stringify({
              "Room Name": room.name,
              "Room ID": room.id,
              "Room Description": room.description
                ? room.description
                : "No description",
            }),
          });
          io.to(room.id).emit("roomDeleted");
        } else {
          callback({ success: false });
        }
      });

      socket.on("downloadedRoom", async ({ room, user }) => {
        await createActivity({
          userId: user.id,
          type: "room_download",
          description: `Room ${room.name} downloaded`,
          details: JSON.stringify({
            "Room Name": room.name,
            "Room ID": room.id,
            "Room Description": room.description
              ? room.description
              : "No description",
          }),
        });
      });

      socket.on("joinRoom", async ({ roomId, user }, callback) => {
        socket.join(roomId);
        const userFromDB = await db.query.usersTable.findFirst({
          where: eq(usersTable.id, user.id),
          with: {
            contributors: {
              where: eq(contributorsTable.roomId, roomId),
              limit: 1,
            },
          },
        });

        const color = randomHexColor();

        const userWithColor = { ...userFromDB, color };

        socket.user = userWithColor as UserWithContributor;
        socket.roomId = roomId;

        const usersInRoom = activeUsers.get(roomId) || [];
        if (!usersInRoom.some((u) => u.id === user.id)) {
          activeUsers.set(roomId, [
            ...usersInRoom,
            userWithColor as UserWithContributor,
          ]);
        }
        const updatedUsers = activeUsers.get(roomId);

        io.to(roomId).emit("activeUsers", updatedUsers);
        io.to(roomId).emit("roomJoined", {
          roomId,
          users: updatedUsers,
        });
        io.emit("rooms", getRooms());

        if (typeof callback === "function") {
          callback(updatedUsers || []);
        }
      });

      socket.on("leaveRoom", async ({ roomId, user }) => {
        socket.roomId = null;
        const users = activeUsers.get(roomId);
        if (users) {
          const updatedUsers = users.filter((u) => u.id !== user.id);
          activeUsers.set(roomId, updatedUsers);

          io.to(roomId).emit("activeUsers", updatedUsers);
          io.to(roomId).emit("roomLeft", {
            roomId,
            users: updatedUsers,
          });

          if (updatedUsers.length === 0) {
            activeUsers.delete(roomId);
          }
        }

        io.emit("rooms", getRooms());
        socket.leave(roomId);
      });

      socket.on("exploreRoom", async ({ roomId, broadcast }, callback) => {
        const fileTree = await exploreRooms(roomId);

        if (broadcast) {
          io.to(roomId).emit("fileTree", {
            roomId,
            users: activeUsers.get(roomId),
            fileTree,
          });
        }
        if (typeof callback === "function") {
          callback(fileTree);
        }
      });

      socket.on("giveAccess", async ({ room, userId }, callback) => {
        const roomId = room.id;
        try {
          if (!roomId || !userId) {
            if (typeof callback === "function") {
              callback({ success: false, error: "Missing roomId or userId" });
            }
            return;
          }

          const existingContributor = await db
            .select()
            .from(contributorsTable)
            .where(
              and(
                eq(contributorsTable.roomId, roomId),
                eq(contributorsTable.userId, userId),
              ),
            )
            .limit(1);

          if (existingContributor.length > 0) {
            if (typeof callback === "function") {
              callback({ success: false, error: "User already has access" });
            }
            return;
          }

          await db.insert(contributorsTable).values({
            roomId: roomId,
            userId: userId,
          });

          const users = activeUsers.get(roomId);
          if (users) {
            const user = users.find((u) => u.id === userId);
            if (user) {
              const newContributor: Contributor = { userId: user.id, roomId };
              user.contributors = [
                ...(user.contributors || []),
                newContributor,
              ];

              const updatedUsers = users.map((u) =>
                u.id === userId ? user : u,
              );
              activeUsers.set(roomId, updatedUsers);

              io.to(roomId).emit("activeUsers", updatedUsers);

              const userSockets = await io.in(roomId).fetchSockets();
              const targetSocket = userSockets.find(
                (s) => (s as any).user?.id === userId,
              );
              if (targetSocket) {
                targetSocket.emit("accessGranted", roomId);
                targetSocket.emit("roomUpdated", await getRoom(roomId));
              }
            }
          }

          if (typeof callback === "function") {
            callback({ success: true });
          }
        } catch (error: any) {
          console.error("Error in giveAccess:", error);
          if (typeof callback === "function") {
            callback({
              success: false,
              error: error.message || "Internal server error",
            });
          }
        }
      });

      socket.on("removeAccess", async ({ room, userId }, callback) => {
        const roomId = room.id;
        try {
          if (!roomId || !userId) {
            if (typeof callback === "function") {
              callback({ success: false, error: "Missing roomId or userId" });
            }
            return;
          }

          await db
            .delete(contributorsTable)
            .where(
              and(
                eq(contributorsTable.roomId, roomId),
                eq(contributorsTable.userId, userId),
              ),
            );

          const users = activeUsers.get(roomId);
          if (users) {
            const updatedUsers = users.map((u) => {
              if (u.id === userId) {
                return {
                  ...u,
                  contributors: u.contributors.filter(
                    (c) => c.roomId !== roomId,
                  ),
                };
              }
              return u;
            });

            activeUsers.set(roomId, updatedUsers);

            io.to(roomId).emit("activeUsers", updatedUsers);

            const userSockets = await io.in(roomId).fetchSockets();
            const targetSocket = userSockets.find(
              (s) => (s as any).user?.id === userId,
            );
            if (targetSocket) {
              targetSocket.emit("accessRevoked", roomId);
              targetSocket.emit("roomUpdated", await getRoom(roomId));
            }
          }

          if (typeof callback === "function") {
            callback({ success: true });
          }
        } catch (error: any) {
          console.error("Error in removeAccess:", error);
          if (typeof callback === "function") {
            callback({
              success: false,
              error: error.message || "Internal server error",
            });
          }
        }
      });

      socket.on("disconnect", async () => {
        if (!socket.roomId) return;
        const users = activeUsers.get(socket.roomId);
        if (users) {
          const updatedUsers = users.filter((u) => u.id !== socket.user?.id);
          activeUsers.set(socket.roomId, updatedUsers);

          io.to(socket.roomId).emit("activeUsers", updatedUsers);
          io.to(socket.roomId).emit("roomLeft", {
            roomId: socket.roomId,
            users: updatedUsers,
          });

          if (updatedUsers.length === 0) {
            activeUsers.delete(socket.roomId);
          }
        }

        io.emit("rooms", getRooms());
        socket.leave(socket.roomId);
      });
    },
  );
}
