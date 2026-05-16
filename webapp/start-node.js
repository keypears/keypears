import { createServer } from "node:http";
import { Readable } from "node:stream";
import server from "./dist/server/server.js";

const port = Number(process.env.PORT ?? 3500);
const host = process.env.HOST ?? "0.0.0.0";

function buildRequest(req) {
  const protocol = req.headers["x-forwarded-proto"] ?? "http";
  const hostHeader = req.headers.host ?? `${host}:${port}`;
  const url = new URL(req.url ?? "/", `${protocol}://${hostHeader}`);
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }

  const init = { headers, method: req.method };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = Readable.toWeb(req);
    init.duplex = "half";
  }

  return new Request(url, init);
}

async function sendResponse(res, response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (!response.body) {
    res.end();
    return;
  }

  Readable.fromWeb(response.body).pipe(res);
}

createServer(async (req, res) => {
  try {
    const request = buildRequest(req);
    const response = await server.fetch(request);
    await sendResponse(res, response);
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
}).listen(port, host, () => {
  console.log(`KeyPears server listening on ${host}:${port}`);
});
