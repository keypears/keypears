import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { getProfile } from "~/server/user.functions";
import { parseAddress } from "~/lib/config";
import { CircleUser } from "lucide-react";
import { PowBadge } from "~/components/PowBadge";

export const Route = createFileRoute("/_app/_saved/_chrome/$profile")({
  loader: async ({ params }) => {
    const parsed = parseAddress(params.profile);
    if (!parsed) throw notFound();

    const profileData = await getProfile({ data: params.profile });
    if (!profileData) throw notFound();

    return {
      address: params.profile,
      publicKey: profileData.publicKey,
      powTotal: profileData.powTotal,
    };
  },
  component: ProfilePage,
});

function ProfilePage() {
  const { address, publicKey, powTotal } = Route.useLoaderData();
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (publicKey) {
      navigator.clipboard.writeText(publicKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const truncatedKey = publicKey
    ? `${publicKey.slice(0, 8)}...${publicKey.slice(-8)}`
    : null;

  return (
    <div className="flex flex-col items-center pt-32 font-sans">
      <CircleUser className="text-muted-foreground h-24 w-24" />
      <h1 className="text-foreground mt-6 text-2xl font-bold">{address}</h1>
      {truncatedKey && (
        <button
          onClick={handleCopy}
          className="text-muted-foreground hover:text-foreground mt-4 cursor-pointer font-mono text-sm transition-colors"
          title={publicKey!}
        >
          {copied ? "Copied!" : truncatedKey}
        </button>
      )}
      {BigInt(powTotal) > 0n && (
        <div className="mt-6">
          <PowBadge difficulty={BigInt(powTotal)} label="proof-of-work" />
        </div>
      )}
    </div>
  );
}
