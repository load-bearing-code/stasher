import { Button } from "@stasher/ui/components/button";
import { ExternalLinkIcon } from "lucide-react";

export function OpenInStashButton({
  stashUrl,
  performerId,
}: {
  stashUrl: string | null;
  performerId: string | undefined;
}) {
  if (!stashUrl || !performerId) return null;

  return (
    <Button
      onClick={() => {
        const base = stashUrl.replace(/\/+$/, "");
        void browser.tabs.create({ url: `${base}/performers/${performerId}` });
      }}
    >
      Open in Stash
      <ExternalLinkIcon />
    </Button>
  );
}
