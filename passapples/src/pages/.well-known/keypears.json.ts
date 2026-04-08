export function GET() {
  const isProd = import.meta.env.PROD;
  const apiDomain = isProd
    ? "keypears.passapples.com"
    : "keypears.passapples.test";

  return new Response(JSON.stringify({ apiDomain }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
