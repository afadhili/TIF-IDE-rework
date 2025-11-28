import Docker from "dockerode";
import path from "path";
import { Server, Socket } from "socket.io";
import * as pty from "node-pty";
import * as os from "os";
import config from "../config";
import { getLanguage } from "../services/files.service";
import {
  checkDocker,
  createRoomContainer,
  ensureDockerImage,
  execCommandInContainer,
  removeRoomContainer,
  dockerAvailable,
  CONTAINER_WORKSPACE,
} from "../services/docker.service";

// ========================
// TYPE DEFINITIONS
// ========================

interface TerminalSession {
  roomId: string;
  activeUsers: Set<string>;
  workingDirectory: string;
}

interface LocalTerminalSession extends TerminalSession {
  type: "local";
  ptyProcess: pty.IPty;
}

interface DockerTerminalSession extends TerminalSession {
  type: "docker";
  container: Docker.Container;
  exec: Docker.Exec;
  stream: any;
}

// Map untuk menyimpan sesi terminal per user (key: `${roomId}-${userId}`)
type TerminalSessionMap = Map<
  string,
  LocalTerminalSession | DockerTerminalSession
>;

// Map untuk menyimpan container per room (key: roomId)
interface RoomContainerInfo {
  container: Docker.Container;
  hostRoomPath: string;
  activeSessions: number; // Jumlah sesi aktif dalam container ini
}

// ========================
// SESSION & CONTAINER MANAGEMENT
// ========================

export const terminalSessions: TerminalSessionMap = new Map();
export const roomContainers = new Map<string, RoomContainerInfo>();

/**
 * Cleanup a single session. Idempotent and async.
 * - Removes session from terminalSessions map immediately to avoid races.
 * - For docker sessions, attempts to end stream and decrements the container counter.
 * - If container counter reaches 0, removeRoomContainer is awaited and roomContainers entry deleted.
 */
export async function cleanupSession(sessionKey: string) {
  const session = terminalSessions.get(sessionKey);
  if (!session) return; // already cleaned

  // Remove immediately to avoid double-cleanup races
  terminalSessions.delete(sessionKey);

  try {
    if (session.type === "docker") {
      // End the stream politely (best-effort)
      try {
        session.stream?.end?.();
      } catch (err) {
        console.warn(`Failed to end docker stream for ${sessionKey}:`, err);
      }

      // Decrement container counter safely
      const roomId = session.roomId;
      const containerInfo = roomContainers.get(roomId);
      if (containerInfo) {
        // ensure we don't go negative
        containerInfo.activeSessions = Math.max(
          0,
          containerInfo.activeSessions - 1,
        );
        console.log(
          `Decremented activeSessions for room ${roomId}: ${containerInfo.activeSessions}`,
        );

        if (containerInfo.activeSessions <= 0) {
          try {
            console.log(
              `No active sessions left for room ${roomId}, removing container...`,
            );
            await removeRoomContainer(roomId);
            roomContainers.delete(roomId);
            console.log(`Container for room ${roomId} removed`);
          } catch (error) {
            console.error(
              `Error removing container for room ${roomId}:`,
              error,
            );
            // still delete map entry to avoid leaking inconsistent state
            roomContainers.delete(roomId);
          }
        }
      } else {
        console.warn(
          `cleanupSession: no containerInfo found for room ${session.roomId}`,
        );
      }
    } else {
      try {
        session.ptyProcess.kill?.();
      } catch (error) {
        console.error("Error killing PTY process:", error);
      }
    }
  } catch (err) {
    console.error(`Error during cleanupSession(${sessionKey}):`, err);
  }

  console.log(`Session ${sessionKey} cleaned up`);
}

export async function cleanupRoomContainer(roomId: string) {
  const containerInfo = roomContainers.get(roomId);
  if (!containerInfo) return;

  containerInfo.activeSessions = Math.max(0, containerInfo.activeSessions - 1);
  console.log(
    `cleanupRoomContainer: room ${roomId} activeSessions -> ${containerInfo.activeSessions}`,
  );

  if (containerInfo.activeSessions <= 0) {
    try {
      await removeRoomContainer(roomId);
      roomContainers.delete(roomId);
      console.log(`Container for room ${roomId} removed`);
    } catch (error) {
      console.error(`Error removing container for room ${roomId}:`, error);
      roomContainers.delete(roomId);
    }
  }
}

function getSession(sessionKey: string): TerminalSession | undefined {
  return terminalSessions.get(sessionKey);
}

async function initializeDockerSession(
  sessionKey: string,
  container: Docker.Container,
  socket: Socket,
  io: Server,
  roomId: string,
): Promise<DockerTerminalSession> {
  const exec = await container.exec({
    Cmd: ["/bin/bash"],
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    WorkingDir: CONTAINER_WORKSPACE,
    Env: ["TERM=xterm-256color"],
  });

  const stream = await exec.start({ hijack: true, stdin: true, Tty: true });

  // initialize shell
  const initCommands = ["export TERM=xterm-256color", "stty -ixon", "clear"];
  try {
    // If the stream expects raw data, write init
    stream.write(initCommands.join("\n") + "\n");
  } catch (err) {
    console.warn("Unable to write init commands to docker exec stream:", err);
  }

  // stream handlers — these should call cleanupSession which decrements activeSessions
  stream.on("data", (chunk: Buffer) => {
    // Emit to the specific socket that owns this session.
    // If you intend to broadcast to all activeUsers, change this to io.to(roomSocketId...).emit
    try {
      socket.emit("terminal-output", chunk.toString());
    } catch (err) {
      console.warn("Error emitting container data to socket:", err);
    }
  });

  stream.on("end", async () => {
    try {
      socket.emit("terminal-error", {
        error: "\r\n\x1b[33m⚙️ Session terminated by container\x1b[0m\r\n",
      });
    } catch (err) {
      console.warn("Error emitting termination message:", err);
    }
    await cleanupSession(sessionKey);
  });

  stream.on("error", async (err: Error) => {
    console.error(`Container stream error [${sessionKey}]:`, err);
    try {
      socket.emit(
        "terminal-output",
        `\r\n\x1b[31m⚠️ Container error: ${err.message}\x1b[0m\r\n`,
      );
    } catch (e) {
      // ignore
    }
    await cleanupSession(sessionKey);
  });

  return {
    type: "docker",
    roomId,
    container,
    exec,
    stream,
    activeUsers: new Set([socket.id]),
    workingDirectory: CONTAINER_WORKSPACE,
  };
}

function initializeLocalSession(
  sessionKey: string,
  workingDir: string,
  socket: Socket,
  io: Server,
  roomId: string,
): LocalTerminalSession {
  const shell = os.platform() === "win32" ? "powershell.exe" : "bash";
  const ptyProcess = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: 80,
    rows: 30,
    cwd: workingDir,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      LANG: "en_US.UTF-8",
      LC_ALL: "en_US.UTF-8",
    },
  });

  ptyProcess.onData((data: string) => {
    try {
      socket.emit("terminal-output", data);
    } catch (err) {
      console.warn("Error emitting pty data to socket:", err);
    }
  });

  ptyProcess.onExit(async ({ exitCode }) => {
    try {
      socket.emit(
        "terminal-output",
        `\r\n\x1b[33m⚙️ Session terminated (code: ${exitCode})\x1b[0m\r\n`,
      );
    } catch (err) {
      console.warn("Error emitting pty exit message:", err);
    }
    await cleanupSession(sessionKey);
  });

  return {
    type: "local",
    roomId,
    ptyProcess,
    activeUsers: new Set([socket.id]),
    workingDirectory: workingDir,
  };
}

// ========================
// COMMAND EXECUTION
// ========================

const LANGUAGE_COMMANDS: Record<string, (filePath: string) => string> = {
  java: (file) =>
    `javac $(find . -name "*.java") && java ${file.replace(/\.java$/, "")}`,
  python: (file) => `python3 ${file}`,
  cpp: (file) => {
    const exe = file.replace(/\.cpp$/, "");
    return `g++ -std=c++17 -O2 ${file} -o ${exe} && ./${exe}`;
  },
  javascript: (file) => `node ${file}`,
  typescript: (file) => {
    const jsFile = file.replace(/\.ts$/, ".js");
    return `tsc ${file} && node ${jsFile}`;
  },
};

function getRunCommand(
  file: { name: string; path: string },
  roomId: string,
): string | null {
  const idx = file.path.indexOf(roomId);
  if (idx === -1) return null;
  const relativePath = file.path.slice(idx + roomId.length);
  const language = getLanguage(file.name);
  if (!language || !(language in LANGUAGE_COMMANDS)) return null;
  const normalizedPath = relativePath.replace(/\\/g, "/");
  const cleaned = normalizedPath.replace(/^\/+/, "");
  return LANGUAGE_COMMANDS[language](cleaned);
}

async function executeFileInContainer(
  session: DockerTerminalSession,
  command: string,
  roomId: string,
  socket: Socket,
) {
  socket.emit(
    "terminal-output",
    `\r\n\x1b[36mᐅ Running: ${command}\x1b[0m\r\n`,
  );

  await execCommandInContainer(
    session.container,
    command,
    (data: Buffer) => {
      try {
        socket.emit("terminal-output", data.toString());
      } catch (e) {
        console.warn("Error emitting exec data to socket:", e);
      }
    },
    () =>
      socket.emit(
        "terminal-output",
        "\r\n\x1b[32m✅ Execution completed\x1b[0m\r\n",
      ),
    (err: Error) =>
      socket.emit(
        "terminal-output",
        `\r\n\x1b[31m❌ Execution failed: ${err.message}\x1b[0m\r\n`,
      ),
  );
}

function executeFileLocally(
  session: LocalTerminalSession,
  command: string,
  socket: Socket,
) {
  socket.emit(
    "terminal-output",
    `\r\n\x1b[36mᐅ Running: ${command}\x1b[0m\r\n`,
  );
  session.ptyProcess.write(`${command}\n`);
}

export default function ptyTerminalSocketSetup(io: Server) {
  io.on("connection", (socket: Socket) => {
    let currentRoomId: string | null = null;
    let currentUserId: string | null = null;

    socket.on(
      "init-terminal",
      async ({
        roomId,
        userId,
        sessionKey,
      }: {
        roomId: string;
        userId: string;
        sessionKey: string;
      }) => {
        try {
          currentRoomId = roomId;
          currentUserId = userId;

          if (terminalSessions.has(sessionKey)) {
            await cleanupSession(sessionKey);
          }

          const hostRoomPath = path.join(config.roomsPath, roomId);
          let session: LocalTerminalSession | DockerTerminalSession;
          let containerInfo: RoomContainerInfo | undefined;

          if (dockerAvailable && (await checkDocker())) {
            containerInfo = roomContainers.get(roomId);

            if (!containerInfo) {
              await ensureDockerImage();

              const container = await createRoomContainer(roomId, hostRoomPath);
              containerInfo = {
                container,
                hostRoomPath,
                activeSessions: 0,
              };
              roomContainers.set(roomId, containerInfo);
            }

            // Increase active sessions
            containerInfo.activeSessions++;

            // Create exec session (docker) for this user
            session = await initializeDockerSession(
              sessionKey,
              containerInfo.container,
              socket,
              io,
              roomId,
            );
          } else {
            session = initializeLocalSession(
              sessionKey,
              hostRoomPath,
              socket,
              io,
              roomId,
            );
          }

          terminalSessions.set(sessionKey, session);
          console.log(`Terminal session initialized for ${sessionKey}`);
        } catch (error) {
          console.error("Terminal initialization failed:", error);
          socket.emit("terminal-error", {
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      },
    );

    socket.on(
      "terminal-input",
      async ({
        data,
        roomId,
        userId,
        sessionKey,
      }: {
        data: string;
        roomId: string;
        userId: string;
        sessionKey: string;
      }) => {
        try {
          const session = terminalSessions.get(sessionKey);
          if (!session) {
            console.warn(`Session not found for key: ${sessionKey}`);
            return;
          }

          if (session.type === "docker") {
            session.stream?.write(data);
          } else {
            session.ptyProcess.write(data);
          }
        } catch (error) {
          console.error(
            `Error handling terminal input for ${sessionKey}:`,
            error,
          );
          socket.emit("terminal-error", {
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      },
    );

    // Resize terminal handler
    socket.on(
      "resize-terminal",
      async ({
        cols,
        rows,
        roomId,
        userId,
      }: {
        cols: number;
        rows: number;
        roomId: string;
        userId: string;
      }) => {
        try {
          const sessionKey = `${roomId}-${userId}`;
          const session = terminalSessions.get(sessionKey);
          if (!session) return;

          if (session.type === "docker") {
            try {
              await session.exec.resize({ h: rows, w: cols });
            } catch (err) {
              console.error(`Resize failed [${sessionKey}]:`, err);
            }
          } else {
            session.ptyProcess.resize(cols, rows);
          }
        } catch (error) {
          console.error("Error resizing terminal:", error);
        }
      },
    );

    socket.on(
      "run-file",
      async (
        file: { name: string; path: string },
        roomId: string,
        userId: string,
      ) => {
        try {
          const sessionKey = `${roomId}-${userId}`;
          const session = terminalSessions.get(sessionKey);
          if (!session) {
            socket.emit("terminal-error", { error: "Session not initialized" });
            return;
          }

          const command = getRunCommand(file, roomId);
          if (!command) {
            socket.emit("terminal-error", { error: "Unsupported file type" });
            return;
          }

          if (session.type === "docker") {
            await executeFileInContainer(
              session as DockerTerminalSession,
              command,
              roomId,
              socket,
            );
          } else {
            executeFileLocally(
              session as LocalTerminalSession,
              command,
              socket,
            );
          }
        } catch (error) {
          console.error("File execution failed:", error);
          socket.emit("terminal-error", {
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      },
    );

    // Session cleanup handlers
    socket.on(
      "leave-terminal",
      async ({ roomId, userId }: { roomId: string; userId: string }) => {
        const sessionKey = `${roomId}-${userId}`;
        await cleanupSession(sessionKey);
        // cleanupRoomContainer is optional now because cleanupSession handles decrement/removal for docker sessions
        console.log(`User ${userId} left terminal in room ${roomId}`);
      },
    );

    socket.on("disconnect", async () => {
      if (currentRoomId && currentUserId) {
        const sessionKey = `${currentRoomId}-${currentUserId}`;
        await cleanupSession(sessionKey);
        console.log(
          `User ${currentUserId} disconnected from terminal in room ${currentRoomId}`,
        );
      }
    });
  });
}
