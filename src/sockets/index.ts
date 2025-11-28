import { Server, Socket } from "socket.io";
import roomSocketsSetup, { User } from "./rooms.sockets";
import fileSocketSetup from "./files.sockets";
import terminalSocketsSetup from "./terminal.sockets";
import db from "../db";
import { usersTable } from "../db/schema";
import { eq } from "drizzle-orm";

export const onlineUsers = new Set<string | number>();

export default function setupSocket(io: Server) {
  io.on("connection", (socket: Socket & { user?: User | null }) => {
    socket.on("init", ({ user }: { user: User | null }) => {
      if (!user) return;
      socket.join(String(user.id));
      socket.user = user;
      onlineUsers.add(user.id);
    });

    socket.on("disconnect", async () => {
      if (!socket.user) return;
      try {
        onlineUsers.delete(socket.user.id);
        await db
          .update(usersTable)
          .set({ lastOnline: new Date() })
          .where(eq(usersTable.id, socket.user.id));
      } catch (error) {
        console.error("Error updating user lastOnline:", error);
      }
    });
  });

  roomSocketsSetup(io);
  fileSocketSetup(io);
  terminalSocketsSetup(io);
}
