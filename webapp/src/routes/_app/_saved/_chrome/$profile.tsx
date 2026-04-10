import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { getProfile } from "~/server/user.functions";
import { parseAddress } from "~/lib/config";
import { CircleUser, Copy, Check } from "lucide-react";
import { PowBadge } from "~/components/PowBadge";

export const Route = createFileRoute("/_app/_saved/_chrome/$profile")({
  loader: async ({ params }) => {
    const parsed = parseAddress(params.profile);
    if (!parsed) throw notFound();

    const profileData = await getProfile({ data: params.profile });
    if (!profileData) throw notFound();

    return {
      address: params.profile,
      powTotal: profileData.powTotal,
    };
  },
  component: ProfilePage,
});

function ProfilePage() {
  const { address, powTotal } = Route.useLoaderData();
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col items-center pt-32 font-sans">
      <CircleUser className="text-muted-foreground h-24 w-24" />
      <button
        onClick={handleCopy}
        className="text-foreground hover:text-accent mt-6 inline-flex cursor-pointer items-center gap-2 text-2xl font-bold transition-colors"
        title="Copy address"
      >
        {address}
        {copied ? (
          <Check className="h-5 w-5 text-green-500" />
        ) : (
          <Copy className="text-muted-foreground h-5 w-5" />
        )}
      </button>
      {BigInt(powTotal) > 0n && (
        <div className="mt-6">
          <PowBadge difficulty={BigInt(powTotal)} label="proof-of-work" />
        </div>
      )}
    </div>
  );
}
