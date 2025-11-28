import * as os from "os";

export function getNetworkAddresses() {
  const nets = os.networkInterfaces();
  const results = [];

  for (const name of Object.keys(nets)) {
    // @ts-ignore
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        results.push(net.address);
      }
    }
  }

  return results;
}
