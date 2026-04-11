import { createFileRoute } from "@tanstack/react-router";
import { DocsContent } from "~/components/DocsContent";
import content from "~/docs/federation.md?raw";

export const Route = createFileRoute("/_docs/docs/federation")({
  head: () => ({ meta: [{ title: "Federation — KeyPears Docs" }] }),
  component: () => (
    <DocsContent title="Federation" content={content} path="/docs/federation" />
  ),
});
