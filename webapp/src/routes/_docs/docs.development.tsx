import { createFileRoute } from "@tanstack/react-router";
import { DocsContent } from "~/components/DocsContent";
import content from "~/docs/development.md?raw";

export const Route = createFileRoute("/_docs/docs/development")({
  head: () => ({ meta: [{ title: "Development — KeyPears Docs" }] }),
  component: () => (
    <DocsContent title="Development" content={content} path="/docs/development" />
  ),
});
