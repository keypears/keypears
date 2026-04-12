import { createServerFn } from "@tanstack/react-start";
import { getDomain, getApiDomain } from "~/lib/config";

export const getServerDomain = createServerFn({ method: "GET" }).handler(
  async () => {
    return getDomain();
  },
);

export const getServerApiDomain = createServerFn({ method: "GET" }).handler(
  async () => {
    return getApiDomain();
  },
);
