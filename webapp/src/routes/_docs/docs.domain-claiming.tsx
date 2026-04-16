import { createFileRoute } from "@tanstack/react-router";
import { DocsContent } from "~/components/DocsContent";
import content from "~/docs/domain-claiming.md?raw";

export const Route = createFileRoute("/_docs/docs/domain-claiming")({
  head: () => ({
    meta: [{ title: "Domain Claiming — KeyPears Docs" }],
  }),
  component: () => (
    <DocsContent
      title="Domain Claiming"
      content={content}
      path="/docs/domain-claiming"
    />
  ),
});
