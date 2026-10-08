import type { HostResponse } from "@stasher/protocol";
import { Button } from "@stasher/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@stasher/ui/components/card";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

function App() {
  const [result, setResult] = useState<HostResponse | null>(null);

  async function ping() {
    const nonce = crypto.randomUUID();
    const response = await invoke<HostResponse>("ping", { nonce });
    setResult(response);
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Stasher</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Listening for jobs from the Firefox extension via native messaging.
          </p>
          <Button onClick={ping}>Ping AppCore</Button>
          {result && (
            <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

export default App;
