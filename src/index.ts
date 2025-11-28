import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import { Server as SocketIOServer } from "socket.io";

import routes from "./routes";
import setupSockets from "./sockets";
import path from "path";
import {
  cleanupRoomContainer,
  cleanupSession,
  roomContainers,
  terminalSessions,
} from "./sockets/terminal.sockets";
import config from "./config";
import morgan from "morgan";

export const PORT = Number(process.env.PORT) || 3000;
const app = express();

app.use(morgan("tiny"));
app.use(express.json());
app.use(cors({ origin: "*", credentials: true }));
app.use(express.static(config.staticPath));

app.use("/api", routes);

app.use((req, res) => {
  res.sendFile(path.join(config.staticPath, "index.html"));
});

const httpServer = http.createServer(app);

const io = new SocketIOServer(httpServer, {
  path: "/socket.io",
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

setupSockets(io);

function start(): Promise<http.Server> {
  return new Promise((resolve) => {
    httpServer.listen(PORT, "0.0.0.0", () => {
      console.log(`Server berjalan di http://localhost:${PORT}`);
      resolve(httpServer);
    });
  });
}

export { app, httpServer, io, start };

start();

const shutdownHandler = async (event: string) => {
  console.log(`Received ${event} event`);
  console.log("Cleaning up terminal sessions...");

  terminalSessions.forEach((_, sessionKey) => {
    cleanupSession(sessionKey);
  });

  roomContainers.forEach((_, roomId) => {
    cleanupRoomContainer(roomId);
  });

  console.log("Server shutting down...");
  process.exit();
};

process.on("SIGINT", shutdownHandler);
process.on("SIGTERM", shutdownHandler);

process.on("uncaughtException", (err: any) => {
  if (err.code === "EPIPE") {
    console.warn("EPIPE ignored session closed");
  } else {
    console.error(err);
  }
});
