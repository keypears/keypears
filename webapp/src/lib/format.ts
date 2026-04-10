export function formatNumber(value: bigint | number): string {
  const n = typeof value === "number" ? BigInt(value) : value;
  if (n >= 1_000_000_000n) return `${n / 1_000_000_000n}B`;
  if (n >= 1_000_000n) return `${n / 1_000_000n}M`;
  if (n >= 1_000n) return `${n / 1_000n}k`;
  return n.toString();
}
