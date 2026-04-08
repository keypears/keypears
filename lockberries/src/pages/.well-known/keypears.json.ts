export function GET() {
  const isProd = import.meta.env.PROD;
  const apiDomain = isProd ? "keypears.com" : "keypears.test";

  return new Response(JSON.stringify({ apiDomain }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
