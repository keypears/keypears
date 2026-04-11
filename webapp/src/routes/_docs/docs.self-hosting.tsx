import { createFileRoute } from "@tanstack/react-router";
import { DocsContent } from "~/components/DocsContent";
import content from "~/docs/self-hosting.md?raw";

export const Route = createFileRoute("/_docs/docs/self-hosting")({
  head: () => ({ meta: [{ title: "Self-Hosting — KeyPears Docs" }] }),
  component: () => (
    <DocsContent title="Self-Hosting" content={content} path="/docs/self-hosting" />
  ),
});
