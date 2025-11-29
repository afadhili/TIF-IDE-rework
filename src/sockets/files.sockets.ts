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

import chokidar from "chokidar";
import config from "../config";
import path from "path";

export const fileConnections = new Map<string, Set<string>>();

export default function fileSocketSetup(io: Server) {
  io.on("connection", (socket: Socket) => {
    socket.on("removeFile", async ({ roomId, file }, user, callback) => {
      const result = await deleteFileOrFolder(file.path);
      if (typeof callback === "function") {
        callback({ success: result });
      }
      if (result) {
        const fileId = file.path.replaceAll("\\", "_").replaceAll("/", "_");

        cleanupYDoc(fileId);
        fileConnections.delete(fileId);

        io.to(roomId).emit("removedFile", file);

        await createActivity({
          userId: user.id,
          type: "file_delete",
          description: `Deleted ${file.type} ${file.name} from room ${roomId}`,
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
  chokidarInit(io);
}


function chokidarInit(io: Server) {
  const roomsPath = config.roomsPath;
  const watcher = chokidar.watch(roomsPath, {
    persistent: true,
    ignoreInitial: true,
    usePolling: process.env.RUNNING_IN_DOCKER === "true",
    interval: process.env.RUNNING_IN_DOCKER === "true" ? 1000 : 100,
    binaryInterval: process.env.RUNNING_IN_DOCKER === "true" ? 1000 : 300,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100,
    },
  });

  watcher.on("ready", () => console.log("Chokidar ready"));
  watcher.on("error", (err) => console.error("Chokidar error:", err));

  watcher.on("all", async (event, p) => {
    const relativePath = path.relative(roomsPath, p);
    const parts = relativePath.split(path.sep);
    const roomId = parts[0];
    const filePath = parts.slice(1).join("/");

    if (p.endsWith(roomId)) {
      return;
    };

    if (event === "add" || event === "addDir") {
      if (roomId && filePath) {
        io.to(roomId).emit("fileTree", await exploreRooms(roomId));
      }
    }

    if (event === "unlink" || event === "unlinkDir") {
      const fileType = event === "unlink" ? "file" : "directory";
      const fileName = path.basename(filePath);
      const fileId = p.replaceAll("\\", "_").replaceAll("/", "_");

      const file = {
        name: fileName,
        type: fileType,
        path: p,
        children: [],
      }

      cleanupYDoc(fileId);
      fileConnections.delete(fileId);

      io.to(roomId).emit("fileTree", await exploreRooms(roomId));
      io.to(roomId).emit("removedFile", file);
    }
  });
}
