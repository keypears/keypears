import { createFileRoute } from "@tanstack/react-router";
import { DocsContent } from "~/components/DocsContent";
import content from "~/docs/security.md?raw";

export const Route = createFileRoute("/_docs/docs/security")({
  head: () => ({ meta: [{ title: "Security — KeyPears Docs" }] }),
  component: () => (
    <DocsContent title="Security" content={content} path="/docs/security" />
  ),
});
