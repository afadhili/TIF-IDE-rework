import path from "path";

type Config = {
  roomsPath: string;
  staticPath: string;
  usingDocker: boolean;
  isProduction: boolean;
};

const config: Config = {
  roomsPath: path.resolve(__dirname, "../rooms"),
  staticPath: path.resolve(__dirname, "../static"),
  usingDocker: true,
  isProduction: process.env.PRODUCTION === "true" || false,
};

export default config;
