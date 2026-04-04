import { createFileRoute } from "@tanstack/react-router";
import { useChannels } from "~/lib/channel-context";
import { MessageSquare } from "lucide-react";

export const Route = createFileRoute("/_app/_saved/_chrome/inbox")({
  component: InboxPage,
});

function InboxPage() {
  const { channels } = useChannels();

  return (
    <div className="mx-auto max-w-2xl p-8 font-sans">
      <h1 className="text-foreground text-2xl font-bold">Inbox</h1>

      {channels.length === 0 ? (
        <div className="mt-8 text-center">
          <MessageSquare className="text-muted-foreground mx-auto h-12 w-12" />
          <p className="text-muted-foreground mt-4">No messages yet.</p>
          <a
            href="/send"
            className="text-accent hover:text-accent/80 mt-2 inline-block text-sm no-underline"
          >
            Send your first message
          </a>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {channels.map((ch) => (
            <a
              key={ch.id}
              href={`/channel/${encodeURIComponent(ch.counterpartyAddress)}`}
              className="border-border/30 hover:bg-accent/5 flex items-center gap-3 rounded border px-4 py-3 no-underline transition-colors"
            >
              <MessageSquare className="text-muted-foreground h-5 w-5" />
              <div className="flex-1">
                <span className="text-foreground text-sm font-medium">
                  {ch.counterpartyAddress}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">
                  {new Date(ch.updatedAt).toLocaleDateString()}
                </span>
                {ch.unreadCount > 0 && (
                  <span className="bg-accent text-accent-foreground rounded-full px-1.5 py-0.5 text-xs font-medium">
                    {ch.unreadCount}
                  </span>
                )}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
