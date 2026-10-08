import { sendHostRequest } from "@/shared/host";

export type ConnectionStatus = "checking" | "offline" | "disconnected" | "connected";

export async function fetchStatus(): Promise<{
  connection: ConnectionStatus;
  stashUrl: string | null;
}> {
  try {
    const response = await sendHostRequest({ type: "getStatus" });
    if (response.type === "status") {
      return {
        connection: response.stashReachable ? "connected" : "disconnected",
        stashUrl: response.stashUrl,
      };
    }
    return { connection: "disconnected", stashUrl: null };
  } catch {
    return { connection: "offline", stashUrl: null };
  }
}
