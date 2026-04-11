/**
 * Benchmark BLAKE3 hashing rate for whitepaper calculations.
 * Measures how many BLAKE3-MAC rounds per second this machine can compute.
 * Usage: bun src/bench-blake3.ts (from packages/whitepaper-bench)
 */
import { blake3Mac } from "@webbuf/blake3";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";

const DURATION_MS = 5_000;
const KEY = FixedBuf.fromRandom(32);
let data: WebBuf = FixedBuf.fromRandom(32).buf;

console.log("Benchmarking BLAKE3-MAC rounds per second...");
console.log(`Duration: ${DURATION_MS / 1000}s\n`);

const start = performance.now();
let rounds = 0;

while (performance.now() - start < DURATION_MS) {
  const result = blake3Mac(KEY, data);
  data = result.buf;
  rounds++;
}

const elapsed = (performance.now() - start) / 1000;
const roundsPerSecond = Math.round(rounds / elapsed);

console.log(`Rounds completed: ${rounds.toLocaleString()}`);
console.log(`Elapsed: ${elapsed.toFixed(2)}s`);
console.log(`Rate: ${roundsPerSecond.toLocaleString()} rounds/s`);
console.log();

const roundsPerGuess = 300_000;
const timePerGuessMs = (roundsPerGuess / roundsPerSecond) * 1000;
console.log(`--- Password brute-force (${roundsPerGuess.toLocaleString()} rounds/guess) ---`);
console.log(`Time per guess: ${timePerGuessMs.toFixed(2)}ms`);
console.log();
console.log(`BLAKE3_ROUNDS_PER_SECOND=${roundsPerSecond}`);
