import path from "path";

type Config = {
  roomsPath: string;
  staticPath: string;
  usingDocker: boolean;
};

const config: Config = {
  roomsPath: path.resolve(__dirname, "../rooms"),
  staticPath: path.resolve(__dirname, "../static"),
  usingDocker: true,
};

export default config;
