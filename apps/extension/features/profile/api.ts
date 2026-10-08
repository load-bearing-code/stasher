import type { HostResponse, SiteProfile } from "@stasher/protocol";
import { sendHostRequest } from "@/shared/host";

export function linkPerformer(performerId: string, profile: SiteProfile): Promise<HostResponse> {
  return sendHostRequest({ type: "linkPerformer", performerId, profile });
}
