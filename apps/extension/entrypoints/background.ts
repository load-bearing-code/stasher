import type { HostRequest, HostResponse } from "@stasher/protocol";

/**
 * Bridges extension pages to the desktop app. Native messaging can't be used
 * from extension pages directly, so everything routes through here via
 * `browser.runtime.sendMessage`.
 *
 * The native port is a single ordered byte stream with no request/response
 * correlation: a response frame is just "the next frame", not "the reply to
 * request X". So concurrent requests must be serialized — one in flight at a
 * time — or their replies get delivered to the wrong caller. Requests are
 * queued and sent only once the previous one has been answered.
 */
export default defineBackground(() => {
  let port: Browser.runtime.Port | undefined;
  const queue: Array<{
    message: HostRequest;
    resolve: (response: HostResponse) => void;
  }> = [];
  let inFlight = false;

  function getPort(): Browser.runtime.Port {
    if (port) return port;
    const opened = browser.runtime.connectNative("ar.schw.stasher");
    opened.onDisconnect.addListener(() => {
      port = undefined;
    });
    port = opened;
    return opened;
  }

  function pump() {
    if (inFlight) return;
    const next = queue.shift();
    if (!next) return;

    inFlight = true;
    const nativePort = getPort();

    const settle = (response: HostResponse) => {
      nativePort.onMessage.removeListener(onResponse);
      nativePort.onDisconnect.removeListener(onDisconnect);
      inFlight = false;
      next.resolve(response);
      pump();
    };
    const onResponse = (response: HostResponse) => settle(response);
    const onDisconnect = () =>
      settle({ type: "error", message: "Stasher desktop app isn't running." });

    nativePort.onMessage.addListener(onResponse);
    nativePort.onDisconnect.addListener(onDisconnect);
    nativePort.postMessage(next.message);
  }

  browser.runtime.onMessage.addListener((message: HostRequest, _sender, sendResponse) => {
    queue.push({ message, resolve: sendResponse });
    pump();
    return true; // keep the message channel open for the async response
  });
});
