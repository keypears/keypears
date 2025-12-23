import { DEV_PORT_MAP } from "@keypears/lib";
import type { Route } from "./+types/[.]well-known.keypears[.]json.js";

/**
 * Resource route that serves the .well-known/keypears.json file
 *
 * This file identifies the server as a KeyPears-compatible server and provides
 * the API URL for clients to use. The apiUrl is dynamic based on
 * the environment (production vs development).
 */
export const loader = async ({ request, params }: Route.LoaderArgs) => {
  const isDev = process.env.NODE_ENV !== "production";

  let apiUrl: string;
  if (isDev) {
    const port = DEV_PORT_MAP["passapples.localhost"];
    apiUrl = `http://passapples.localhost:${port}/api`;
  } else {
    apiUrl = "https://passapples.com/api";
  }

  const keypearsJson = {
    version: 1,
    apiUrl,
  };

  return new Response(JSON.stringify(keypearsJson), {
    headers: {
      "Content-Type": "application/json",
    },
  });
};
