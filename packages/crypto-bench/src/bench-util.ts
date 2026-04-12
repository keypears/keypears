/**
 * Shared timing helper for crypto benchmarks.
 *
 * Runs `fn` some number of warmup iterations (untimed), then the requested
 * number of measured iterations. Returns total time, per-op time, and
 * ops/sec.
 */

export interface BenchResult {
  name: string;
  iterations: number;
  totalMs: number;
  perOpMs: number;
  opsPerSec: number;
}

export async function bench(
  name: string,
  iterations: number,
  fn: () => void | Promise<void>,
): Promise<BenchResult> {
  // Warmup: prime JIT caches and WASM instantiation
  for (let i = 0; i < 3; i++) {
    await fn();
  }

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    await fn();
  }
  const totalMs = performance.now() - start;

  return {
    name,
    iterations,
    totalMs,
    perOpMs: totalMs / iterations,
    opsPerSec: (iterations / totalMs) * 1000,
  };
}

/** Format a BenchResult as a single human-readable line. */
export function formatResult(r: BenchResult): string {
  const perOp =
    r.perOpMs >= 1
      ? `${r.perOpMs.toFixed(3)} ms`
      : `${(r.perOpMs * 1000).toFixed(2)} µs`;
  return `${r.name.padEnd(22)} ${r.iterations
    .toString()
    .padStart(7)} iters   ${perOp.padStart(14)}/op   ${Math.round(
    r.opsPerSec,
  )
    .toLocaleString()
    .padStart(12)} ops/s   ${r.totalMs.toFixed(1).padStart(8)} ms total`;
}

/** Format two BenchResults side by side with speedup ratio. */
export function formatComparison(
  webbuf: BenchResult,
  webCrypto: BenchResult,
): string {
  const ratio = webbuf.perOpMs / webCrypto.perOpMs;
  const faster = ratio >= 1 ? "webCrypto" : "webbuf";
  const speedup = ratio >= 1 ? ratio.toFixed(2) : (1 / ratio).toFixed(2);
  const fmt = (ms: number) =>
    ms >= 1 ? `${ms.toFixed(3)} ms` : `${(ms * 1000).toFixed(2)} µs`;
  return `${webbuf.name.padEnd(22)}   webbuf ${fmt(webbuf.perOpMs).padStart(
    12,
  )}/op   webCrypto ${fmt(webCrypto.perOpMs).padStart(
    12,
  )}/op   ${faster} ${speedup}x faster`;
}
