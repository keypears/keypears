import { createContext, useContext, useState, useEffect, useMemo } from "react";
import { getMyChannels } from "~/server/message.functions";

interface Channel {
  id: string;
  counterpartyAddress: string;
  updatedAt: Date;
  unreadCount: number;
}

interface ChannelContextValue {
  channels: Channel[];
  unreadCount: number;
}

const ChannelContext = createContext<ChannelContextValue>({
  channels: [],
  unreadCount: 0,
});

export function useChannels() {
  return useContext(ChannelContext);
}

export function ChannelProvider({ children }: { children: React.ReactNode }) {
  const [channels, setChannels] = useState<Channel[]>([]);

  useEffect(() => {
    let active = true;
    async function poll() {
      while (active) {
        if (!document.hidden) {
          try {
            const list = await getMyChannels();
            if (!active) break;
            setChannels(list);
          } catch {
            // ignore
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    // Resume polling immediately when tab becomes visible
    function handleVisibility() {
      if (!document.hidden && active) {
        getMyChannels()
          .then((list) => {
            if (active) setChannels(list);
            return list;
          })
          .catch(() => {});
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);
    poll();
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const unreadCount = channels.reduce((sum, ch) => sum + ch.unreadCount, 0);

  const value = useMemo(
    () => ({ channels, unreadCount }),
    [channels, unreadCount],
  );

  return <ChannelContext value={value}>{children}</ChannelContext>;
}
