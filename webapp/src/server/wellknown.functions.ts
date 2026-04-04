import { createServerFn } from "@tanstack/react-start";
import { getApiUrl } from "~/lib/config";

export const getKeypearsJson = createServerFn({ method: "GET" }).handler(
  async () => {
    return {
      version: 1,
      apiUrl: getApiUrl(),
    };
  },
);
