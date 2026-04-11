import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useState } from "react";
import { getProfile } from "~/server/user.functions";
import { parseAddress } from "~/lib/config";
import { CircleUser, Copy, Check, MessageSquare } from "lucide-react";
import { PowBadge } from "~/components/PowBadge";

import { profileParam } from "~/lib/route-params";

export const Route = createFileRoute("/_app/_saved/_chrome/$profile")({
  params: profileParam,
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.address} — KeyPears` : "KeyPears" }],
  }),
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
    <div className="mx-auto max-w-2xl font-sans">
      <div className="flex flex-col items-center pt-16 pb-6">
        <CircleUser className="text-muted-foreground h-20 w-20" />
        <button
          onClick={handleCopy}
          className="text-foreground hover:text-accent mt-4 inline-flex cursor-pointer items-center gap-2 text-xl font-bold transition-colors"
          title="Copy address"
        >
          {address}
          {copied ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <Copy className="text-muted-foreground h-4 w-4" />
          )}
        </button>
        <Link
          to="/send"
          search={{ to: address }}
          className="bg-accent text-accent-foreground hover:bg-accent/90 mt-4 inline-flex items-center gap-2 rounded px-4 py-1.5 text-sm no-underline transition-all"
        >
          <MessageSquare className="h-4 w-4" />
          Message
        </Link>
        {BigInt(powTotal) > 0n && (
          <div className="mt-3">
            <PowBadge
              difficulty={BigInt(powTotal)}
              label="total proof-of-work"
            />
          </div>
        )}
      </div>
    </div>
  );
}
