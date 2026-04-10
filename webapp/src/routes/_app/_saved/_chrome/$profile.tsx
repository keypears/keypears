import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { getMyUser, getProfile } from "~/server/user.functions";
import { getServerDomain } from "~/server/config.functions";
import { CircleUser, Cpu } from "lucide-react";
import { formatNumber } from "~/lib/format";

export const Route = createFileRoute("/_app/_saved/_chrome/$profile")({
  loader: async ({ params }) => {
    if (!params.profile.startsWith("@")) {
      throw notFound();
    }
    const profileName = params.profile.slice(1);
    if (!profileName) {
      throw notFound();
    }
    const [me, primaryDomain] = await Promise.all([
      getMyUser(),
      getServerDomain(),
    ]);
    if (!me) throw notFound();
    // Use the logged-in user's domain for profile lookup
    const domain = me.domain ?? primaryDomain;
    const profileData = await getProfile({
      data: `${profileName}@${domain}`,
    });
    return {
      profileName,
      publicKey: profileData?.publicKey ?? null,
      powTotal: profileData?.powTotal ?? "0",
      domain,
    };
  },
  component: ProfilePage,
});

function ProfilePage() {
  const { profileName, publicKey, powTotal, domain } = Route.useLoaderData();
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
      <h1 className="text-foreground mt-6 text-2xl font-bold">
        {profileName}@{domain}
      </h1>
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
        <div className="text-muted-foreground mt-6 flex items-center gap-2 text-sm">
          <Cpu className="h-4 w-4" />
          <span>
            {formatNumber(BigInt(powTotal))} proof-of-work
          </span>
        </div>
      )}
    </div>
  );
}
