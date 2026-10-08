import type { StashConfig } from "@stasher/protocol";
import { Button } from "@stasher/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@stasher/ui/components/card";
import { Input } from "@stasher/ui/components/input";
import { Label } from "@stasher/ui/components/label";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

type TestState = "idle" | "testing" | "ok" | "error";

function App() {
  const [stashUrl, setStashUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [testState, setTestState] = useState<TestState>("idle");
  const [testMessage, setTestMessage] = useState<string | null>(null);

  useEffect(() => {
    invoke<StashConfig | null>("get_stash_config").then((config) => {
      if (config) {
        setStashUrl(config.stashUrl);
        setApiKey(config.apiKey);
      }
    });
  }, []);

  function currentConfig(): StashConfig {
    return { stashUrl, apiKey };
  }

  async function save() {
    await invoke("set_stash_config", { config: currentConfig() });
    setSaved(true);
  }

  async function testConnection() {
    setTestState("testing");
    setTestMessage(null);
    try {
      await invoke("test_stash_connection", { config: currentConfig() });
      setTestState("ok");
    } catch (error) {
      setTestState("error");
      setTestMessage(String(error));
    }
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Stash connection</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="stash-url">Stash URL</Label>
            <Input
              id="stash-url"
              placeholder="http://localhost:9999"
              value={stashUrl}
              onChange={(event) => {
                setStashUrl(event.target.value);
                setSaved(false);
                setTestState("idle");
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="api-key">API key</Label>
            <Input
              id="api-key"
              type="password"
              value={apiKey}
              onChange={(event) => {
                setApiKey(event.target.value);
                setSaved(false);
                setTestState("idle");
              }}
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={testState === "testing" || !stashUrl}
              onClick={testConnection}
            >
              {testState === "testing" ? "Testing..." : "Test connection"}
            </Button>
            <Button className="flex-1" disabled={!stashUrl} onClick={save}>
              Save
            </Button>
          </div>
          {testState === "ok" && (
            <p className="text-sm text-muted-foreground">Connected to Stash.</p>
          )}
          {testState === "error" && (
            <p className="text-sm text-destructive">{testMessage}</p>
          )}
          {saved && <p className="text-sm text-muted-foreground">Saved.</p>}
        </CardContent>
      </Card>
    </main>
  );
}

export default App;
