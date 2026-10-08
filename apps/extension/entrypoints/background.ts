import type { HostRequest, HostResponse } from "@stasher/protocol";

/**
 * Bridges extension pages/content-scripts to the desktop app. Native
 * messaging can't be used from content scripts directly, so everything
 * routes through here via `browser.runtime.sendMessage`.
 */
export default defineBackground(() => {
  let port: Browser.runtime.Port | undefined;

  function getPort(): Browser.runtime.Port {
    if (port) return port;
    port = browser.runtime.connectNative("ar.schw.stasher");
    port.onDisconnect.addListener(() => {
      port = undefined;
    });
    return port;
  }

  browser.runtime.onMessage.addListener((message: HostRequest, _sender, sendResponse) => {
    const nativePort = getPort();

    const onResponse = (response: HostResponse) => {
      nativePort.onMessage.removeListener(onResponse);
      sendResponse(response);
    };
    nativePort.onMessage.addListener(onResponse);
    nativePort.postMessage(message);

    return true; // keep the message channel open for the async response
  });
});
