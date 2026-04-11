import { createFileRoute } from "@tanstack/react-router";
import { DocsContent } from "~/components/DocsContent";
import content from "~/docs/protocol/key-derivation.md?raw";

export const Route = createFileRoute("/_docs/docs/protocol/key-derivation")({
  head: () => ({ meta: [{ title: "Key Derivation — KeyPears Docs" }] }),
  component: () => (
    <DocsContent title="Key Derivation" content={content} path="/docs/protocol/key-derivation" />
  ),
});
