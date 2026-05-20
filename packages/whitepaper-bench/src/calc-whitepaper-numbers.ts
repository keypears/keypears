/**
 * Calculate all quantitative claims for the whitepaper.
 *
 * Usage:
 *   bun src/calc-whitepaper-numbers.ts <gpu_hash_rate> <blake3_rounds_per_sec>
 *
 * Example:
 *   bun src/calc-whitepaper-numbers.ts 4500000 1200000
 */

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error(
    "Usage: bun src/calc-whitepaper-numbers.ts <gpu_hash_rate> <blake3_rounds_per_sec>",
  );
  console.error(
    "  gpu_hash_rate: GPU hashes per second (from bench-pow webapp)",
  );
  console.error(
    "  blake3_rounds_per_sec: BLAKE3-MAC rounds per second (from bench-blake3.ts)",
  );
  process.exit(1);
}

const GPU_HASH_RATE = parseInt(args[0]!, 10);
const BLAKE3_RATE = parseInt(args[1]!, 10);

function formatDuration(seconds: number): string {
  if (seconds < 1) return `${(seconds * 1000).toFixed(1)} ms`;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)} min`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} hours`;
  if (seconds < 86400 * 365) return `${(seconds / 86400).toFixed(1)} days`;
  return `${(seconds / (86400 * 365)).toFixed(1)} years`;
}

console.log("=== KeyPears Whitepaper Numbers ===");
console.log(`GPU hash rate: ${GPU_HASH_RATE.toLocaleString()} hashes/s`);
console.log(`BLAKE3 rate: ${BLAKE3_RATE.toLocaleString()} rounds/s`);
console.log();

// --- Section 8: PoW Mining Times ---
console.log("--- Section 8: Proof of Work ---");
const difficulties = [
  { name: "Account creation / first message", difficulty: 70_000_000 },
  { name: "Login / subsequent messages", difficulty: 7_000_000 },
];
for (const { name, difficulty } of difficulties) {
  const expectedSeconds = difficulty / GPU_HASH_RATE;
  console.log(
    `  ${name} (${difficulty.toLocaleString()}): ~${formatDuration(expectedSeconds)}`,
  );
}
console.log();

// --- Section 9.2: Password Brute-Force ---
console.log("--- Section 9.2: Password Brute-Force ---");
const ROUNDS_PER_GUESS = 300_000;
const timePerGuessSeconds = ROUNDS_PER_GUESS / BLAKE3_RATE;
console.log(`  Rounds per guess: ${ROUNDS_PER_GUESS.toLocaleString()}`);
console.log(`  Time per guess: ${formatDuration(timePerGuessSeconds)}`);
console.log();

const passwordSpaces = [
  { name: "8-char lowercase+digits (36^8)", size: 36 ** 8 },
  { name: "8-char mixed case+digits (62^8)", size: 62 ** 8 },
  { name: "10-char lowercase+digits (36^10)", size: 36 ** 10 },
  { name: "12-char lowercase+digits (36^12)", size: 36 ** 12 },
];
for (const { name, size } of passwordSpaces) {
  const totalSeconds = size * timePerGuessSeconds;
  console.log(`  ${name}:`);
  console.log(`    Candidates: ${size.toExponential(2)}`);
  console.log(`    Exhaustive search: ${formatDuration(totalSeconds)}`);
}
console.log();

// --- Section 9.3: Spam Cost ---
console.log("--- Section 9.3: Spam and Sybil Attacks ---");
const accountDifficulty = 70_000_000;
const messageDifficulty = 70_000_000;
const subsequentDifficulty = 7_000_000;

const timePerAccount = accountDifficulty / GPU_HASH_RATE;
console.log(`  Time per account: ~${formatDuration(timePerAccount)}`);

const spamScenarios = [
  { name: "Create 1,000 accounts", count: 1000, difficulty: accountDifficulty },
  {
    name: "Create 10,000 accounts",
    count: 10000,
    difficulty: accountDifficulty,
  },
  {
    name: "Send 10,000 first messages",
    count: 10000,
    difficulty: messageDifficulty,
  },
  {
    name: "Send 10,000 subsequent messages",
    count: 10000,
    difficulty: subsequentDifficulty,
  },
];
for (const { name, count, difficulty } of spamScenarios) {
  const totalSeconds = (count * difficulty) / GPU_HASH_RATE;
  const gpuHours = totalSeconds / 3600;
  console.log(
    `  ${name}: ~${formatDuration(totalSeconds)} (~${gpuHours.toFixed(1)} GPU-hours)`,
  );
}
console.log();

// --- Summary ---
console.log("=== Whitepaper-ready claims ===");
console.log();
console.log("Section 8 (Table 1):");
for (const { name, difficulty } of difficulties) {
  const t = difficulty / GPU_HASH_RATE;
  console.log(`  ${name}: ~${formatDuration(t)}`);
}
console.log();
console.log("Section 9.2 (Password brute-force):");
console.log(
  `  BLAKE3 rate: ~${(BLAKE3_RATE / 1e6).toFixed(1)}M rounds/s (single CPU core)`,
);
console.log(
  `  Time per guess (300k rounds): ~${formatDuration(timePerGuessSeconds)}`,
);
const size8_36 = 36 ** 8;
const years8_36 = (size8_36 * timePerGuessSeconds) / (86400 * 365);
console.log(
  `  8-char lowercase+digits exhaustive: ~${years8_36.toFixed(0)} CPU-core-years`,
);
console.log();
console.log("Section 9.3 (Spam cost):");
const acctGpuHours =
  (1000 * accountDifficulty) / GPU_HASH_RATE / 3600;
const spamGpuHours =
  (10000 * messageDifficulty) / GPU_HASH_RATE / 3600;
console.log(`  1,000 accounts: ~${acctGpuHours.toFixed(1)} GPU-hours`);
console.log(`  10,000 first messages: ~${spamGpuHours.toFixed(1)} GPU-hours`);
