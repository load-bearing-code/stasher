import type { StashConfig } from "@stasher/protocol";
import { Button } from "@stasher/ui/components/button";
import { Input } from "@stasher/ui/components/input";
import { Label } from "@stasher/ui/components/label";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

type TestState = "idle" | "testing" | "ok" | "error";

export function StashSettings() {
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

  function edited() {
    setSaved(false);
    setTestState("idle");
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
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base font-medium">Stash connection</h2>
        <p className="text-sm text-muted-foreground">The Stash instance media is catalogued in</p>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="grid grid-cols-[7rem_1fr] items-center gap-3">
          <Label htmlFor="stash-url" className="text-sm text-muted-foreground">
            Stash URL
          </Label>
          <Input
            id="stash-url"
            className="h-10 px-3 bg-black/30! font-mono text-xs md:text-xs"
            placeholder="http://localhost:9999"
            value={stashUrl}
            onChange={(event) => {
              setStashUrl(event.target.value);
              edited();
            }}
          />
        </div>
        <div className="grid grid-cols-[7rem_1fr] items-center gap-3">
          <Label htmlFor="api-key" className="text-sm text-muted-foreground">
            API key
          </Label>
          <Input
            id="api-key"
            type="password"
            className="h-10 px-3 bg-black/30! font-mono text-xs md:text-xs"
            value={apiKey}
            onChange={(event) => {
              setApiKey(event.target.value);
              edited();
            }}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {testState === "ok" && <p className="text-sm text-success">Connected to Stash.</p>}
        {testState === "error" && <p className="text-sm text-destructive">{testMessage}</p>}
        {saved && <p className="text-sm text-muted-foreground">Saved.</p>}
        <Button
          variant="outline"
          className="h-10 px-5"
          disabled={testState === "testing" || !stashUrl}
          onClick={testConnection}
        >
          {testState === "testing" ? "Testing..." : "Test"}
        </Button>
        <Button className="h-10 px-5" disabled={!stashUrl} onClick={save}>
          Save
        </Button>
      </div>
    </div>
  );
}
