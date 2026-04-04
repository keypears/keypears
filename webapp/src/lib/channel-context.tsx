import { createContext, useContext, useState, useEffect, useMemo } from "react";
import { getMyChannels } from "~/server/message.functions";

interface Channel {
  id: number;
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
        try {
          const list = await getMyChannels();
          if (!active) break;
          setChannels(list);
        } catch {
          // ignore
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
    poll();
    return () => {
      active = false;
    };
  }, []);

  const unreadCount = channels.reduce((sum, ch) => sum + ch.unreadCount, 0);

  const value = useMemo(
    () => ({ channels, unreadCount }),
    [channels, unreadCount],
  );

  return <ChannelContext value={value}>{children}</ChannelContext>;
}
