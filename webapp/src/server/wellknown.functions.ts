import { createServerFn } from "@tanstack/react-start";
import { getApiDomain } from "~/lib/config";

export const getKeypearsJson = createServerFn({ method: "GET" }).handler(
  async () => {
    return {
      apiDomain: getApiDomain(),
    };
  },
);
