import type { HostRequest, HostResponse } from "@stasher/protocol";

export async function sendHostRequest(request: HostRequest): Promise<HostResponse> {
  return browser.runtime.sendMessage(request);
}
