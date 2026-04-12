import { createFileRoute } from "@tanstack/react-router";
import { DocsContent } from "~/components/DocsContent";
import content from "~/docs/protocol/addressing.md?raw";

export const Route = createFileRoute("/_docs/docs/protocol/addressing")({
  head: () => ({ meta: [{ title: "Addressing — KeyPears Docs" }] }),
  component: () => (
    <DocsContent
      title="Addressing"
      content={content}
      path="/docs/protocol/addressing"
    />
  ),
});
