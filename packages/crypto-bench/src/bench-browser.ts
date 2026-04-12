/**
 * Browser-side crypto benchmark.
 *
 * Mounted by index.html. Compares @webbuf/* (WASM) against
 * window.crypto.subtle (native) for the eight cases defined in cases.ts.
 *
 * Includes a main-thread blocking test: a requestAnimationFrame counter
 * runs throughout each benchmark. The webbuf path (synchronous WASM)
 * should stall the rAF loop during long PBKDF2 runs; the Web Crypto path
 * should not.
 */

import { bench, formatComparison, type BenchResult } from "./bench-util";
import { CASES, initAllKeys } from "./cases";

const statusEl = document.getElementById("status")!;
const resultsEl = document.getElementById("results")!;
const startBtn = document.getElementById("start") as HTMLButtonElement;
const spinnerEl = document.getElementById("spinner")!;
const rafEl = document.getElementById("raf-counter")!;

let rafFrameCount = 0;
let rafRunning = false;
let rafLastReport = 0;

function startRafLoop() {
  rafRunning = true;
  rafFrameCount = 0;
  rafLastReport = performance.now();
  const tick = () => {
    if (!rafRunning) return;
    rafFrameCount++;
    const now = performance.now();
    if (now - rafLastReport >= 100) {
      rafEl.textContent = `${rafFrameCount} frames`;
      rafLastReport = now;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function stopRafLoop(): number {
  rafRunning = false;
  return rafFrameCount;
}

function log(msg: string) {
  statusEl.textContent = msg;
}

async function runBenchmark() {
  startBtn.disabled = true;
  spinnerEl.classList.add("spinning");
  resultsEl.style.display = "block";
  resultsEl.textContent = "";

  const lines: string[] = [];
  lines.push("=== KeyPears Crypto Bench (browser) ===");
  lines.push(`User agent: ${navigator.userAgent}`);
  lines.push("");
  resultsEl.textContent = lines.join("\n");

  log("Initializing keys...");
  await initAllKeys();

  for (const c of CASES) {
    log(`Running ${c.name} (webbuf)...`);
    startRafLoop();
    const wb = await bench(`${c.name} (webbuf)`, c.iters, c.webbuf);
    const wbFrames = stopRafLoop();

    log(`Running ${c.name} (webCrypto)...`);
    startRafLoop();
    const wc: BenchResult = await bench(
      `${c.name} (webCrypto)`,
      c.iters,
      c.webCrypto,
    );
    const wcFrames = stopRafLoop();

    // Theoretical frames we'd see if running at ~60fps during the bench
    const expectedFramesWb = Math.max(1, Math.floor((wb.totalMs / 1000) * 60));
    const expectedFramesWc = Math.max(1, Math.floor((wc.totalMs / 1000) * 60));
    const wbDroppedPct = Math.max(
      0,
      Math.round((1 - wbFrames / expectedFramesWb) * 100),
    );
    const wcDroppedPct = Math.max(
      0,
      Math.round((1 - wcFrames / expectedFramesWc) * 100),
    );

    lines.push(formatComparison(wb, wc));
    lines.push(
      `  main thread:  webbuf ${wbFrames}/${expectedFramesWb} frames (${wbDroppedPct}% dropped)   webCrypto ${wcFrames}/${expectedFramesWc} frames (${wcDroppedPct}% dropped)`,
    );
    lines.push("");
    resultsEl.textContent = lines.join("\n");
  }

  lines.push("=== Done ===");
  resultsEl.textContent = lines.join("\n");
  log("Benchmark complete.");
  spinnerEl.classList.remove("spinning");
  startBtn.disabled = false;
}

startBtn.addEventListener("click", runBenchmark);
