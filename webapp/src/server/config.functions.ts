import { createServerFn } from "@tanstack/react-start";
import { getDomain } from "~/lib/config";

export const getServerDomain = createServerFn({ method: "GET" }).handler(
  async () => {
    return getDomain();
  },
);
