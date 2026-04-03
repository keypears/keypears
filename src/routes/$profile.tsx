import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { getMyRickroll, getProfile } from "~/server/rickroll.functions";
import { Navbar } from "~/components/Navbar";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";

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
    Promise.all([getMyRickroll(), getProfile({ data: profileId })]).then(
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
      <Navbar rickrollId={myId} />
      <div className="flex flex-col items-center pt-32">
        <Avatar className="h-24 w-24">
          <AvatarFallback className="bg-accent/20 text-accent text-3xl">
            {profileId}
          </AvatarFallback>
        </Avatar>
        <h1 className="text-foreground mt-6 text-2xl font-bold">
          Rick Roll #{new Intl.NumberFormat().format(profileId)}
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
