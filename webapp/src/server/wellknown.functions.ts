import { createServerFn } from "@tanstack/react-start";
import { getApiUrl } from "~/lib/config";

export const getKeypearsJson = createServerFn({ method: "GET" }).handler(
  async () => {
    return {
      apiUrl: getApiUrl(),
    };
  },
);
