/**
 * Node-side crypto benchmark.
 *
 * Usage (from packages/crypto-bench):
 *   pnpm run bench:node
 *
 * Compares @webbuf/* (WASM) against Node's crypto.subtle (native) for the
 * eight cases defined in cases.ts.
 */

import { bench, formatComparison } from "./bench-util";
import { CASES, initAllKeys } from "./cases";

console.log("=== KeyPears Crypto Bench (server / Node) ===");
console.log(`Node ${process.version}`);
console.log(`Platform: ${process.platform} ${process.arch}`);
console.log();

await initAllKeys();

for (const c of CASES) {
  console.log(`Running ${c.name}...`);
  const wb = await bench(`${c.name} (webbuf)`, c.iters, c.webbuf);
  const wc = await bench(`${c.name} (webCrypto)`, c.iters, c.webCrypto);
  console.log(formatComparison(wb, wc));
  console.log();
}

console.log("=== Done ===");
