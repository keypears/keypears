import { createServerFn } from "@tanstack/react-start";
import { getDomain, getApiUrl, getServerPublicKey } from "~/lib/config";

export const getKeypearsJson = createServerFn({ method: "GET" }).handler(
  async () => {
    return {
      version: 1,
      domain: getDomain(),
      apiUrl: getApiUrl(),
      serverPublicKey: getServerPublicKey().buf.toHex(),
    };
  },
);
