import { MarkdownRenderer } from "~/components/MarkdownRenderer";

export function MarkdownPage({ content }: { content: string }) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 font-sans">
      <div className="prose prose-sm text-foreground prose-headings:text-foreground prose-a:text-accent prose-strong:text-foreground prose-code:text-foreground max-w-none">
        <MarkdownRenderer content={content} />
      </div>
    </div>
  );
}
