import "dotenv/config";
import { getNetworkAddresses } from "./lib/network";

const port = process.env.PORT || 3000;

(async function main() {
  console.log(`\n ➜  Local:   \x1b[36mhttp://localhost:${port}\x1b[0m`);

  const networks = getNetworkAddresses();
  networks.forEach((ip) => {
    console.log(` ➜  Network: \x1b[36mhttp://${ip}:${port}\x1b[0m`);
  });
})();
