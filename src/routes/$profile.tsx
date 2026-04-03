import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { getMyKeypear, getProfile } from "~/server/keypears.functions";
import { Navbar } from "~/components/Navbar";
import { CircleUser } from "lucide-react";

export const Route = createFileRoute("/$profile")({
  loader: async ({ params }) => {
    if (!params.profile.startsWith("@")) {
      throw notFound();
    }
    const profileId = Number(params.profile.slice(1));
    if (Number.isNaN(profileId)) {
      throw notFound();
    }
    const [me, profileData] = await Promise.all([
      getMyKeypear(),
      getProfile({ data: profileId }),
    ]);
    if (!me) {
      throw notFound();
    }
    return { myId: me.id, profileId, publicKey: profileData?.publicKey ?? null };
  },
  component: ProfilePage,
});

function ProfilePage() {
  const { myId, profileId, publicKey } = Route.useLoaderData();
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
    <div className="font-sans">
      <Navbar keypearId={myId} />
      <div className="flex flex-col items-center pt-32">
        <CircleUser className="text-muted-foreground h-24 w-24" />
        <h1 className="text-foreground mt-6 text-2xl font-bold">
          {profileId}@keypears.com
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
      </div>
    </div>
  );
}
