import type { ConnectionStatus } from "../api";

export function ConnectionIndicator({
  connection,
  stashUrl,
}: {
  connection: ConnectionStatus;
  stashUrl: string | null;
}) {
  const dotColor =
    connection === "connected"
      ? "bg-success"
      : connection === "checking"
        ? "bg-muted-foreground"
        : "bg-destructive";
  const statusLabel =
    connection === "checking"
      ? "Checking..."
      : connection === "offline"
        ? "Desktop app offline"
        : connection === "disconnected"
          ? "Stash not connected"
          : "Connected";

  return (
    <div
      className="flex items-center gap-2 text-xs text-muted-foreground"
      title={stashUrl ? new URL(stashUrl).host : undefined}
    >
      <span className={`size-2 rounded-full ${dotColor}`} />
      {statusLabel}
    </div>
  );
}
