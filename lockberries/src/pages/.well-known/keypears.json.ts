export function GET() {
  const isProd = import.meta.env.PROD;
  const apiDomain = isProd ? "keypears.com" : "keypears.test";
  const admin = isProd
    ? "lockberries@keypears.com"
    : "lockberries@keypears.test";

  return new Response(JSON.stringify({ apiDomain, admin }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
