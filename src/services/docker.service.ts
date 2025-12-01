import Docker from "dockerode";
import path from "path";
import fs from "fs";
import config from "../config"

export const isRunningInDocker = process.env.RUNNING_IN_DOCKER === "true";
export const projectDir = process.env.PROJECT_DIR || process.cwd();

function sanitizeEnvPath(p?: string) {
  if (!p) return undefined;
  p = p.trim().replace(/^["']|["']$/g, "");
  return p;
}

let roomsPath = process.env.ROOMS_PATH || config.roomsPath;

let docker: Docker;
let dockerAvailable = false;

console.log(
  `Project dir resolved as: ${projectDir} (runningInDocker=${isRunningInDocker})`,
);
console.log(`Rooms path resolved as: ${roomsPath}`)

const SOCKET_PATHS = [
  "/var/run/docker.sock",
  "/mnt/wsl/docker-desktop/shared-sockets/guest-services/docker.sock",
];

function getDockerSocket() {
  for (const p of SOCKET_PATHS) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

try {
  const socketPath = getDockerSocket();
  if (!socketPath) throw new Error("Docker socket not found");

  docker = new Docker({ socketPath });
  dockerAvailable = true;
  console.log(`✓ Docker initialized (${socketPath})`);
} catch (err) {
  try {
    docker = new Docker();
    dockerAvailable = true;
    console.log("✓ Docker initialized (default socket)");
  } catch (error: Error | any) {
    console.warn("✗ Docker not available:", error.message);
    dockerAvailable = false;
  }
}

export const CONTAINER_WORKSPACE = "/workspace";
export const CONTAINER_IMAGE = "collab-terminal-image";

// Test koneksi Docker
export async function checkDocker() {
  if (!dockerAvailable) return false;

  try {
    await docker.ping();
    return true;
  } catch (err: Error | any) {
    console.warn("Docker not running:", err.message);
    return false;
  }
}

// Build image jika belum ada
export async function ensureDockerImage() {
  if (!(await checkDocker())) {
    throw new Error("Docker not available");
  }

  try {
    await docker.getImage(CONTAINER_IMAGE).inspect();
    console.log("✓ Docker image found");
    return true;
  } catch {
    console.log("Building Docker image...");

    return new Promise((resolve, reject) => {
      docker.buildImage(
        { context: process.cwd(), src: ["Dockerfile.terminal"] },
        { t: CONTAINER_IMAGE },
        (err, stream) => {
          if (err) return reject(err);

          if (!stream) return reject(new Error("Stream is null"));

          docker.modem.followProgress(stream, (err) => {
            if (err) {
              console.error("Error building image:", err);
              reject(err);
            } else {
              console.log("✓ Docker image built");
              resolve(true);
            }
          });
        },
      );
    });
  }
}

// Buat container untuk room
export async function createRoomContainer(
  roomId: string,
  hostRoomPath: string,
) {
  if (!(await checkDocker())) throw new Error("Docker not available");

  let finalHostPath = hostRoomPath;

  if (isRunningInDocker) {
    finalHostPath = path.join(roomsPath, roomId);
  } else {
    finalHostPath = path.resolve(hostRoomPath);
  }

  try {
    try {
      const old = docker.getContainer(`collab-room-${roomId}`);
      await old.stop().catch(() => {});
      await old.remove().catch(() => {});
    } catch {}

    const container = await docker.createContainer({
      Image: CONTAINER_IMAGE,
      name: `collab-room-${roomId}`,
      HostConfig: {
        Binds: [`${finalHostPath}:${CONTAINER_WORKSPACE}`],
        CapDrop: ["ALL"],
        SecurityOpt: ["no-new-privileges:true"],
        Memory: 512 * 1024 * 1024,
        MemorySwap: 1024 * 1024 * 1024,
        CpuShares: 512,
        NetworkMode: "none",
        AutoRemove: true,
      },
      WorkingDir: CONTAINER_WORKSPACE,
      Tty: true,
      OpenStdin: true,
      StdinOnce: false,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Cmd: ["/bin/bash", "-l"],
      Env: [
        "TERM=xterm-256color",
        "PS1=\\u@\\h:\\w\\$ ",
        "LANG=C.UTF-8",
        "LC_ALL=C.UTF-8",
      ],
      NetworkDisabled: true,
    });

    await container.start();
    return container;
  } catch (err) {
    console.error("Error creating container:", err);
    throw err;
  }
}

export async function removeRoomContainer(roomId: string) {
  if (!(await checkDocker())) return;

  try {
    const container = docker.getContainer(`collab-room-${roomId}`);
    await container.stop({ t: 1 }).catch(() => {});
    await container.remove().catch(() => {});
  } catch (err: Error | any) {
    if (err.statusCode !== 404) console.error("Error removing container:", err);
  }
}

export async function cleanupAllContainers() {
  if (!(await checkDocker())) return;

  try {
    const containers = await docker.listContainers({
      all: true,
      filters: { name: ["collab-room-"] },
    });

    for (const c of containers) {
      const container = docker.getContainer(c.Id);
      await container.stop({ t: 1 }).catch(() => {});
      await container.remove().catch(() => {});
    }
  } catch (err) {
    console.error("Error during container cleanup:", err);
  }
}

export { dockerAvailable };
