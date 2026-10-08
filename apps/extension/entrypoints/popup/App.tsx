import type { HostRequest, HostResponse } from "@stasher/protocol";
import { Button } from "@stasher/ui/components/button";
import { useState } from "react";

export function App() {
  const [result, setResult] = useState<HostResponse | null>(null);
  const [pending, setPending] = useState(false);

  async function ping() {
    setPending(true);
    try {
      const request: HostRequest = { type: "ping", nonce: crypto.randomUUID() };
      const response = await browser.runtime.sendMessage(request);
      setResult(response);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex w-72 flex-col gap-3 p-4">
      <h1 className="text-lg font-semibold">Stasher</h1>
      <Button disabled={pending} onClick={ping}>
        {pending ? "Pinging..." : "Ping desktop app"}
      </Button>
      {result && (
        <pre className="overflow-auto rounded-md bg-muted p-2 text-xs">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </main>
  );
}
