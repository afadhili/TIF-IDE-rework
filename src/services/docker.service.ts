import Docker from "dockerode";
import path from "path";
import fs from "fs";

export const isRunningInDocker = process.env.RUNNING_IN_DOCKER === "true";
export const projectDir = process.env.PROJECT_DIR || process.cwd();

let docker: Docker;
let dockerAvailable = false;

console.log(
  `Project dir resolved as: ${projectDir} (runningInDocker=${isRunningInDocker})`,
);

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
        { context: process.cwd(), src: ["Dockerfile"] },
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
    finalHostPath = path.join(projectDir, "rooms", roomId);
    console.log(`Running in Docker: using host path ${finalHostPath}`);
  } else {
    finalHostPath = path.resolve(hostRoomPath);
    console.log(`Running locally: using path ${finalHostPath}`);
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

// KEY FIX: Demultiplex Docker stream
function demuxDockerStream(
  stream: any,
  onStdout: Function,
  onStderr: Function,
) {
  let buffer = Buffer.alloc(0);

  stream.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length >= 8) {
      const header = buffer.slice(0, 8);
      const streamType = header[0];
      const payloadLength = header.readUInt32BE(4);

      if (buffer.length < 8 + payloadLength) {
        // Not enough data yet, wait for more
        break;
      }

      const payload = buffer.slice(8, 8 + payloadLength);
      buffer = buffer.slice(8 + payloadLength);

      // streamType: 0=stdin, 1=stdout, 2=stderr
      if (streamType === 1 && onStdout) {
        onStdout(payload);
      } else if (streamType === 2 && onStderr) {
        onStderr(payload);
      }
    }
  });
}

export async function execInContainer(container: any, socket: any) {
  if (!(await checkDocker())) throw new Error("Docker not available");

  try {
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

    // Send initialization commands
    stream.write("export TERM=xterm-256color\n");
    stream.write("stty -ixon\n");
    stream.write("clear\n");

    // KEY FIX: When Tty: true, stream is NOT multiplexed - just pipe it directly
    stream.on("data", (chunk: Buffer) => {
      socket.emit("terminal-output", chunk);
    });

    stream.on("error", (err: Error) => {
      console.error("Container exec error:", err);
      socket.emit(
        "terminal-output",
        Buffer.from(`\r\n⚠️ Container error: ${err.message}\r\n`),
      );
    });

    stream.on("end", () => {
      socket.emit(
        "terminal-output",
        Buffer.from("\r\n⚙️ Container session ended\r\n"),
      );
    });

    return stream;
  } catch (err) {
    console.error("Error executing in container:", err);
    throw err;
  }
}

export async function execCommandInContainer(
  container: any,
  command: string,
  onData: Function,
  onEnd: Function,
  onError: Function,
) {
  try {
    const exec = await container.exec({
      Cmd: ["/bin/bash", "-c", command],
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
    });

    const stream = await exec.start({});

    demuxDockerStream(
      stream,
      (data: Buffer) => {
        if (onData) onData(data);
      },
      (data: Buffer) => {
        if (onData) onData(data);
      },
    );

    stream.on("end", () => {
      if (onEnd) onEnd();
    });

    stream.on("error", (err: Error) => {
      if (onError) onError(err);
    });

    return stream;
  } catch (err) {
    if (onError) onError(err);
    throw err;
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
