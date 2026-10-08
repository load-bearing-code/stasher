import type { Stage } from "../types";

export function StageMessage({ stage }: { stage: Stage }) {
  switch (stage.kind) {
    case "loading":
      return <p className="text-muted-foreground">Checking this page...</p>;
    case "unsupported":
      return <p className="text-muted-foreground">No supported profile detected on this page.</p>;
    case "needsConfig":
      return (
        <p className="text-muted-foreground">
          Connect to Stash in the desktop app's settings to use this.
        </p>
      );
    case "error":
      return <p className="text-destructive">{stage.message}</p>;
    default:
      return null;
  }
}
