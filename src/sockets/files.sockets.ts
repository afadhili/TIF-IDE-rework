import { Server, Socket } from "socket.io";
import {
  createFileOrFolder,
  deleteFileOrFolder,
  getFile,
  renameFileOrFolder,
  saveFile,
} from "../services/files.service";
import {
  initializeYDoc,
  applyUpdate,
  getDocumentState,
  scheduleFileSave,
  cleanupYDoc,
} from "../services/yjs.service";
import { exploreRooms } from "../services/rooms.service";
import { createActivity } from "../services/users.service";

// Track which sockets are in which files
const fileConnections = new Map<string, Set<string>>();

export default function fileSocketSetup(io: Server) {
  io.on("connection", (socket: Socket) => {
    socket.on("removeFile", async ({ roomId, file }, user, callback) => {
      const result = await deleteFileOrFolder(file.path);
      if (typeof callback === "function") {
        callback({ success: result });
      }
      if (result) {
        const fileId = file.path.replaceAll("\\", "_").replaceAll("/", "_");

        io.to(fileId).emit("fileRemoved", file);

        cleanupYDoc(fileId);
        fileConnections.delete(fileId);

        io.to(roomId).emit("fileTree", await exploreRooms(roomId));
        io.to(roomId).emit("removedFile", file);
        await createActivity({
          userId: user.id,
          type: "file_delete",
          description: `Deleted file ${file.name} from room ${roomId}`,
          details: JSON.stringify({
            user: `${user.name} | ${user.nim}`,
            type: file.type === "directory" ? "directory" : "file",
            path: file.path.split(roomId)[1],
          }),
        });
      }
    });

    socket.on(
      "renameFile",
      async ({ roomId, file, newPath }, user, callback) => {
        const result = await renameFileOrFolder(file.path, newPath);
        if (typeof callback === "function") {
          callback({ success: result });
        }
        if (result) {
          io.to(roomId).emit("fileTree", await exploreRooms(roomId));
          io.to(roomId).emit("renamedFile", { oldPath: file.path, newPath });
          await createActivity({
            userId: user.id,
            type: "file_update",
            description: `Renamed file ${file.name} to ${newPath} in room ${roomId}`,
            details: JSON.stringify({
              user: `${user.name} | ${user.nim}`,
              type: file.type === "directory" ? "directory" : "file",
              oldPath: file.path.split(roomId)[1],
              newPath: newPath.split(roomId)[1],
            }),
          });
        }
      },
    );

    socket.on(
      "createFile",
      async ({ roomId, pathName, isDir }, user, callback) => {
        const result = await createFileOrFolder(pathName, isDir);
        if (typeof callback === "function") {
          callback({ success: result });
        }
        if (result) {
          io.to(roomId).emit("fileTree", await exploreRooms(roomId));
          await createActivity({
            userId: user.id,
            type: "file_create",
            description: `New file created at ${roomId}`,
            details: JSON.stringify({
              user: `${user.name} | ${user.nim}`,
              type: isDir ? "directory" : "file",
              path: pathName.split(roomId)[1],
            }),
          });
        }
      },
    );

    socket.on("joinFile", async ({ roomId, file }, callback) => {
      const fileId = file.path.replaceAll("\\", "_").replaceAll("/", "_");

      try {
        const fileContent = await getFile(file.path);
        const doc = initializeYDoc(fileId, fileContent);
        const state = getDocumentState(fileId);

        if (!fileConnections.has(fileId)) {
          fileConnections.set(fileId, new Set());
        }
        fileConnections.get(fileId)!.add(socket.id);

        socket.join(fileId);

        if (typeof callback === "function") {
          callback({
            success: true,
            content: fileContent,
            state: Array.from(state),
          });
        }
      } catch (error) {
        console.error("Error joining file:", error);
        if (typeof callback === "function") {
          callback({ success: false, content: "", state: [] });
        }
      }
    });

    socket.on("leaveFile", async ({ roomId, file }) => {
      const fileId = file.path.replaceAll("\\", "_").replaceAll("/", "_");

      const connections = fileConnections.get(fileId);
      if (connections) {
        connections.delete(socket.id);

        if (connections.size === 0) {
          setTimeout(() => {
            const stillEmpty = fileConnections.get(fileId);
            if (stillEmpty && stillEmpty.size === 0) {
              cleanupYDoc(fileId);
              fileConnections.delete(fileId);
            }
          }, 30000);
        }
      }

      socket.leave(fileId);
    });

    socket.on("yjs-update", ({ fileId, filePath, update }) => {
      try {
        const updateArray = new Uint8Array(update);

        applyUpdate(fileId, updateArray);

        socket.to(fileId).emit("yjs-update", { update });

        scheduleFileSave(filePath, fileId, (success) => {
          if (!success) {
            console.error(`Failed to save file: ${filePath}`);
            io.to(fileId).emit("saveFailed", { filePath });
          } else {
            io.to(fileId).emit("saveSuccess", { filePath });
          }
        });
      } catch (error) {
        console.error("Error handling yjs-update:", error);
      }
    });

    socket.on("save-file", async (fileId, filePath, callback) => {
      try {
        scheduleFileSave(
          filePath,
          fileId,
          (success) => {
            if (!success) {
              console.error(`Failed to save file: ${filePath}`);
              io.to(fileId).emit("saveFailed", { filePath });
            } else {
              io.to(fileId).emit("saveSuccess", { filePath });
              callback();
            }
          },
          100,
        );
      } catch (error) {
        console.error(`Failed to save file: ${filePath}`);
        io.to(filePath).emit("saveFailed", { filePath });
      }
    });

    socket.on("disconnect", () => {
      fileConnections.forEach((connections, fileId) => {
        if (connections.has(socket.id)) {
          connections.delete(socket.id);

          if (connections.size === 0) {
            setTimeout(() => {
              const stillEmpty = fileConnections.get(fileId);
              if (stillEmpty && stillEmpty.size === 0) {
                cleanupYDoc(fileId);
                fileConnections.delete(fileId);
              }
            }, 30000);
          }
        }
      });
    });
  });
}
