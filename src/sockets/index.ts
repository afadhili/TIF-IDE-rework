import { Server, Socket } from "socket.io";
import roomSocketsSetup, { User } from "./rooms.sockets";
import fileSocketSetup from "./files.sockets";
import terminalSocketsSetup from "./terminal.sockets";
import db from "../db";
import { usersTable } from "../db/schema";
import { eq } from "drizzle-orm";

export const onlineUsers = new Set<string | string>();

export default function setupSocket(io: Server) {
  io.on("connection", (socket: Socket & { user?: User | null }) => {
    socket.on("init", ({ user }: { user: User | null }) => {
      if (!user) return;
      if (user.role === "admin") socket.join("admin");
      socket.join(String(user.id));
      socket.user = user;
      onlineUsers.add(user.nim);
      io.to("admin").emit("userState", { userId: user.id, status: "active" });
    });

    socket.on("disconnect", async () => {
      if (!socket.user) return;
      try {
        onlineUsers.delete(socket.user.nim);
        await db
          .update(usersTable)
          .set({ lastOnline: new Date() })
          .where(eq(usersTable.id, socket.user.id));
        io.to("admin").emit("userState", {
          userId: socket.user.id,
          status: "offline",
        });
      } catch (error) {
        console.error("Error updating user lastOnline:", error);
      }
    });
  });

  roomSocketsSetup(io);
  fileSocketSetup(io);
  terminalSocketsSetup(io);
}
