import { createFileRoute } from "@tanstack/react-router";
import { DocsContent } from "~/components/DocsContent";
import content from "~/docs/protocol/proof-of-work.md?raw";

export const Route = createFileRoute("/_docs/docs/protocol/proof-of-work")({
  head: () => ({ meta: [{ title: "Proof of Work — KeyPears Docs" }] }),
  component: () => (
    <DocsContent title="Proof of Work" content={content} path="/docs/protocol/proof-of-work" />
  ),
});
