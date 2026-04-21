import { z } from "zod";

const keypearsJsonSchema = z.object({
  apiDomain: z.string().optional(),
  admin: z.string().optional(),
});

export type KeypearsJson = z.infer<typeof keypearsJsonSchema>;

export async function fetchKeypearsJson(domain: string): Promise<KeypearsJson> {
  const url = `https://${domain}/.well-known/keypears.json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch keypears.json from ${domain}`);
  }
  return keypearsJsonSchema.parse(await response.json());
}

export async function discoverApiDomain(domain: string): Promise<string> {
  const json = await fetchKeypearsJson(domain);
  if (!json.apiDomain) {
    throw new Error(
      `Invalid keypears.json from ${domain}: missing apiDomain`,
    );
  }
  return json.apiDomain;
}
