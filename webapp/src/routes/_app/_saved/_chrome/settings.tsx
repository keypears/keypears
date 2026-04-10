import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  getMyPowSettings,
  updateMyPowSettings,
} from "~/server/user.functions";

const PRESETS = [
  { label: "Low", value: 7_000_000n, time: "~1 second" },
  { label: "Medium", value: 70_000_000n, time: "~15 seconds" },
  { label: "High", value: 700_000_000n, time: "~2 minutes" },
];

const CHANNEL_DEFAULT = 70_000_000n;
const MESSAGE_DEFAULT = 7_000_000n;

function presetIndex(value: bigint): number {
  for (let i = PRESETS.length - 1; i >= 0; i--) {
    if (value >= PRESETS[i].value) return i;
  }
  return 0;
}

export const Route = createFileRoute("/_app/_saved/_chrome/settings")({
  loader: () => getMyPowSettings(),
  component: SettingsPage,
});

function SettingsPage() {
  const data = Route.useLoaderData();
  const channelVal = data.channelDifficulty
    ? BigInt(data.channelDifficulty)
    : CHANNEL_DEFAULT;
  const messageVal = data.messageDifficulty
    ? BigInt(data.messageDifficulty)
    : MESSAGE_DEFAULT;

  const [channelIdx, setChannelIdx] = useState(presetIndex(channelVal));
  const [messageIdx, setMessageIdx] = useState(presetIndex(messageVal));
  const [status, setStatus] = useState("");

  async function save(channel: number, message: number) {
    setStatus("Saving...");
    try {
      await updateMyPowSettings({
        data: {
          channelDifficulty: PRESETS[channel].value.toString(),
          messageDifficulty: PRESETS[message].value.toString(),
        },
      });
      setStatus("Saved");
      setTimeout(() => setStatus(""), 1500);
    } catch {
      setStatus("Failed to save");
    }
  }

  function handleChannelChange(idx: number) {
    setChannelIdx(idx);
    save(idx, messageIdx);
  }

  function handleMessageChange(idx: number) {
    setMessageIdx(idx);
    save(channelIdx, idx);
  }

  return (
    <div className="mx-auto max-w-md p-8 font-sans">
      <h1 className="text-foreground text-2xl font-bold">Settings</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Control how much proof of work senders must compute to reach you.
        Higher difficulty means more spam protection but slower delivery.
      </p>

      <section className="mt-8">
        <h2 className="text-foreground text-sm font-semibold">
          New Conversations
        </h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Difficulty for the first message from a new sender.
        </p>
        <div className="mt-3">
          <input
            type="range"
            min={0}
            max={PRESETS.length - 1}
            step={1}
            value={channelIdx}
            onChange={(e) => handleChannelChange(Number(e.target.value))}
            className="accent-accent w-full"
          />
          <div className="text-muted-foreground mt-1 flex justify-between text-xs">
            {PRESETS.map((p) => (
              <span key={p.label}>{p.label}</span>
            ))}
          </div>
          <p className="text-foreground mt-2 text-sm">
            {PRESETS[channelIdx].label} — {PRESETS[channelIdx].time}
          </p>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-foreground text-sm font-semibold">Messages</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Difficulty for each message in an existing conversation.
        </p>
        <div className="mt-3">
          <input
            type="range"
            min={0}
            max={PRESETS.length - 1}
            step={1}
            value={messageIdx}
            onChange={(e) => handleMessageChange(Number(e.target.value))}
            className="accent-accent w-full"
          />
          <div className="text-muted-foreground mt-1 flex justify-between text-xs">
            {PRESETS.map((p) => (
              <span key={p.label}>{p.label}</span>
            ))}
          </div>
          <p className="text-foreground mt-2 text-sm">
            {PRESETS[messageIdx].label} — {PRESETS[messageIdx].time}
          </p>
        </div>
      </section>

      {status && (
        <p className="text-muted-foreground mt-6 text-sm">{status}</p>
      )}
    </div>
  );
}
