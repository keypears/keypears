import { createFileRoute } from "@tanstack/react-router";
import { DocsContent } from "~/components/DocsContent";
import content from "~/docs/protocol/encryption.md?raw";

export const Route = createFileRoute("/_docs/docs/protocol/encryption")({
  head: () => ({ meta: [{ title: "Encryption — KeyPears Docs" }] }),
  component: () => (
    <DocsContent title="Encryption" content={content} path="/docs/protocol/encryption" />
  ),
});
