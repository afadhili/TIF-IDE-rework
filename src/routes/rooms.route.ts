import { Router, Request, Response } from "express";
import {
  exploreRooms,
  getRoom,
  getRooms,
  isRoomExists,
} from "../services/rooms.service";
import { zip, COMPRESSION_LEVEL } from "zip-a-folder";
import config from "../config";
import path from "path";
import fs from "fs";
import db from "../db";
import { eq } from "drizzle-orm";
import { usersTable } from "../db/schema";
import { createActivity } from "../services/users.service";

const router = Router();

// GET /
router.get("/", async (_req: Request, res: Response) => {
  const rooms = getRooms();
  return res.json(rooms);
});

// GET /check/:roomId
router.get("/check/:roomId", async (req: Request, res: Response) => {
  const { roomId } = req.params;
  const isExists = await isRoomExists(roomId);

  if (!isExists) {
    return res.status(404).json({ error: "Room not found" });
  }

  const room = await getRoom(roomId);
  return res.status(200).json({ room });
});

// GET /explore/:roomId
router.get("/explore/:roomId", async (req: Request, res: Response) => {
  const { roomId } = req.params;

  const fileTree = await exploreRooms(roomId);
  return res.status(200).json({ fileTree });
});

// GET /download/:roomId
router.get("/download/:roomId", async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const user = (req as any).user;

    if (!user) {
      console.error("No user on req");
      return res.status(401).json({ error: "Unauthorized" });
    }

    const roomPath = path.join(config.roomsPath, roomId);
    const zipPath = path.join(config.staticPath, "downloads", `${roomId}.zip`);

    if (!fs.existsSync(roomPath)) {
      return res.status(404).json({ error: "Room not found" });
    }

    if (fs.readdirSync(roomPath).length === 0) {
      return res.status(400).json({ error: "Room is empty" });
    }

    await zip(roomPath, zipPath);

    const filename = `${roomId}.zip`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/zip");

    res.download(zipPath, filename, (err) => {
      fs.unlink(zipPath, (unlinkErr) => {
        if (unlinkErr) console.error("Failed to delete zip:", unlinkErr);
      });

      if (err) {
        console.error("Download error:", err);
        if (!res.headersSent)
          return res.status(500).json({ error: "Failed to download room" });
      }
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: "Failed to download room" });
  }
});

export default router;
