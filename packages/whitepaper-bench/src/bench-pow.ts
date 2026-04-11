import { Pow5_64b_Wgsl, targetFromDifficulty, hashMeetsTarget } from "@keypears/pow5";
import { FixedBuf } from "@webbuf/fixedbuf";

const GRID_SIZE = 128 as const;
const HASHES_PER_BATCH = 256 * GRID_SIZE; // 32,768

const statusEl = document.getElementById("status")!;
const resultsEl = document.getElementById("results")!;
const startBtn = document.getElementById("start") as HTMLButtonElement;

function log(msg: string) {
  statusEl.textContent = msg;
}

async function measureHashRate(): Promise<{
  hashRate: number;
  totalHashes: number;
  elapsed: number;
}> {
  const header = FixedBuf.fromRandom(64);
  const target = FixedBuf.fromHex(32, "00".repeat(32));

  const pow5 = new Pow5_64b_Wgsl(header, target, GRID_SIZE);
  await pow5.init();

  // Warm up
  log("Warming up GPU...");
  let currentHeader = header;
  for (let i = 0; i < 5; i++) {
    await pow5.work();
    const newBuf = currentHeader.buf.clone();
    newBuf.set(FixedBuf.fromRandom(32).buf, 0);
    currentHeader = FixedBuf.fromBuf(64, newBuf);
    await pow5.setInput(currentHeader, target, GRID_SIZE);
  }

  // Benchmark for 10 seconds
  log("Benchmarking GPU hash rate (10 seconds)...");
  const durationMs = 10_000;
  const start = performance.now();
  let totalHashes = 0;

  while (performance.now() - start < durationMs) {
    await pow5.work();
    totalHashes += HASHES_PER_BATCH;

    const newBuf = currentHeader.buf.clone();
    newBuf.set(FixedBuf.fromRandom(32).buf, 0);
    currentHeader = FixedBuf.fromBuf(64, newBuf);
    await pow5.setInput(currentHeader, target, GRID_SIZE);

    if (totalHashes % (HASHES_PER_BATCH * 50) === 0) {
      const elapsed = (performance.now() - start) / 1000;
      const rate = Math.round(totalHashes / elapsed);
      log(
        `Benchmarking... ${rate.toLocaleString()} hashes/s (${elapsed.toFixed(1)}s)`,
      );
    }
  }

  const elapsed = (performance.now() - start) / 1000;
  const hashRate = totalHashes / elapsed;
  return { hashRate, totalHashes, elapsed };
}

async function mineAtDifficulty(
  difficulty: number,
): Promise<{ timeMs: number; hashes: number }> {
  const header = FixedBuf.fromRandom(64);
  const target = targetFromDifficulty(BigInt(difficulty));

  const pow5 = new Pow5_64b_Wgsl(header, target, GRID_SIZE);
  await pow5.init();

  const start = performance.now();
  let totalHashes = 0;
  let currentHeader = header;

  while (true) {
    const result = await pow5.work();
    totalHashes += HASHES_PER_BATCH;

    const isZero = result.hash.buf.every((b: number) => b === 0);
    if (!isZero && hashMeetsTarget(result.hash, target)) {
      return { timeMs: performance.now() - start, hashes: totalHashes };
    }

    const newBuf = currentHeader.buf.clone();
    newBuf.set(FixedBuf.fromRandom(32).buf, 0);
    currentHeader = FixedBuf.fromBuf(64, newBuf);
    await pow5.setInput(currentHeader, target, GRID_SIZE);

    if (totalHashes % (HASHES_PER_BATCH * 20) === 0) {
      const elapsed = (performance.now() - start) / 1000;
      log(
        `Mining difficulty ${difficulty.toLocaleString()}... ${totalHashes.toLocaleString()} hashes (${elapsed.toFixed(1)}s)`,
      );
    }
  }
}

async function runBenchmark() {
  startBtn.disabled = true;
  const lines: string[] = [];

  try {
    // 1. Measure raw hash rate
    const { hashRate, totalHashes, elapsed } = await measureHashRate();
    const hashRateRounded = Math.round(hashRate);

    lines.push("=== KeyPears PoW GPU Benchmark ===");
    lines.push(`GPU hash rate: ${hashRateRounded.toLocaleString()} hashes/s`);
    lines.push(`Total hashes: ${totalHashes.toLocaleString()}`);
    lines.push(`Elapsed: ${elapsed.toFixed(2)}s`);
    lines.push("");

    // 2. Mine at difficulty 7M (3 trials)
    lines.push("--- Difficulty 7,000,000 (login) ---");
    const trials7m: number[] = [];
    for (let i = 0; i < 3; i++) {
      log(`Mining difficulty 7M, trial ${i + 1}/3...`);
      const result = await mineAtDifficulty(7_000_000);
      trials7m.push(result.timeMs);
      lines.push(
        `  Trial ${i + 1}: ${(result.timeMs / 1000).toFixed(2)}s (${result.hashes.toLocaleString()} hashes)`,
      );
    }
    const avg7m = trials7m.reduce((a, b) => a + b, 0) / trials7m.length;
    lines.push(`  Average: ${(avg7m / 1000).toFixed(2)}s`);
    lines.push("");

    // 3. Mine at difficulty 70M (3 trials)
    lines.push("--- Difficulty 70,000,000 (account creation) ---");
    const trials70m: number[] = [];
    for (let i = 0; i < 3; i++) {
      log(`Mining difficulty 70M, trial ${i + 1}/3...`);
      const result = await mineAtDifficulty(70_000_000);
      trials70m.push(result.timeMs);
      lines.push(
        `  Trial ${i + 1}: ${(result.timeMs / 1000).toFixed(2)}s (${result.hashes.toLocaleString()} hashes)`,
      );
    }
    const avg70m = trials70m.reduce((a, b) => a + b, 0) / trials70m.length;
    lines.push(`  Average: ${(avg70m / 1000).toFixed(2)}s`);
    lines.push("");

    // Summary
    lines.push("=== Summary (copy this) ===");
    lines.push(`GPU_HASH_RATE=${hashRateRounded}`);
    lines.push(`AVG_7M_SECONDS=${(avg7m / 1000).toFixed(2)}`);
    lines.push(`AVG_70M_SECONDS=${(avg70m / 1000).toFixed(2)}`);

    log("Benchmark complete. Copy the results below.");
    resultsEl.style.display = "block";
    resultsEl.textContent = lines.join("\n");
  } catch (err) {
    log(`Error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    startBtn.disabled = false;
  }
}

startBtn.addEventListener("click", runBenchmark);
