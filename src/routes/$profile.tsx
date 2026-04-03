import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { getMyKeypear, getProfile } from "~/server/keypears.functions";
import { Navbar } from "~/components/Navbar";
import { CircleUser } from "lucide-react";

export const Route = createFileRoute("/$profile")({
  ssr: false,
  component: ProfilePage,
});

function ProfilePage() {
  const { profile } = Route.useParams();

  if (!profile.startsWith("@")) {
    throw notFound();
  }

  const profileId = Number(profile.slice(1));
  if (Number.isNaN(profileId)) {
    throw notFound();
  }

  const [myId, setMyId] = useState<number | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    Promise.all([getMyKeypear(), getProfile({ data: profileId })]).then(
      ([me, profileData]) => {
        if (!me) {
          window.location.href = "/";
          return;
        }
        setMyId(me.id);
        if (profileData?.publicKey) {
          setPublicKey(profileData.publicKey);
        }
        setChecking(false);
      },
    );
  }, [profileId]);

  if (checking || myId == null) {
    return <div className="bg-background min-h-screen" />;
  }

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
    <div className="bg-background min-h-screen font-sans">
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
