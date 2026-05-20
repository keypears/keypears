import { createServerFn } from "@tanstack/react-start";
import { getApiDomain } from "~/lib/config";
import { validateFederationAuthority } from "~/lib/federation-authority";

export const getKeypearsJson = createServerFn({ method: "GET" }).handler(
  async () => {
    return {
      apiDomain: validateFederationAuthority(getApiDomain()),
    };
  },
);
