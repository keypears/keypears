import { createServerFn } from "@tanstack/react-start";
import { getDomain } from "~/lib/config";

export const getKeypearsJson = createServerFn({ method: "GET" }).handler(
  async () => {
    return {
      apiDomain: getDomain(),
    };
  },
);
