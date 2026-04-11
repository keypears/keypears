import { createFileRoute } from "@tanstack/react-router";
import { DocsContent } from "~/components/DocsContent";
import content from "~/docs/welcome.md?raw";

export const Route = createFileRoute("/_docs/docs/")({
  head: () => ({ meta: [{ title: "Docs — KeyPears" }] }),
  component: () => (
    <DocsContent title="Welcome to KeyPears" content={content} path="/docs" />
  ),
});
