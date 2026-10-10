import type { PerformerCandidate } from "@stasher/protocol";
import { Avatar, AvatarFallback, AvatarImage } from "@stasher/ui/components/avatar";
import { Button } from "@stasher/ui/components/button";
import { Card } from "@stasher/ui/components/card";
import { initials } from "@/shared/text";
import { candidateReason } from "../lib";

function CandidateRow({
  candidate,
  linking,
  onLink,
}: {
  candidate: PerformerCandidate;
  linking: boolean;
  onLink: () => void;
}) {
  return (
    <div className="flex items-center gap-3 p-4">
      <Avatar>
        <AvatarImage src={candidate.performer.imagePath ?? undefined} />
        <AvatarFallback>{initials(candidate.performer.name)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 overflow-hidden">
        <p className="truncate font-semibold">{candidate.performer.name}</p>
        <p className="truncate text-xs text-muted-foreground">{candidateReason(candidate)}</p>
      </div>
      <Button variant="outline" disabled={linking} onClick={onLink}>
        {linking ? "..." : "Link"}
      </Button>
    </div>
  );
}

export function CandidateList({
  candidates,
  linkingId,
  onLink,
}: {
  candidates: PerformerCandidate[];
  linkingId: string | null;
  onLink: (performerId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body font-semibold">Could it be one of these?</p>
      <Card variant="inset" className="gap-0 divide-y py-0">
        {candidates.map((candidate) => (
          <CandidateRow
            key={candidate.performer.id}
            candidate={candidate}
            linking={linkingId === candidate.performer.id}
            onLink={() => onLink(candidate.performer.id)}
          />
        ))}
      </Card>
    </div>
  );
}
