import type { StashConfig } from "@stasher/protocol";
import { Button } from "@stasher/ui/components/button";
import { GlobeIcon, KeyIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { SettingsSection } from "@/features/settings/settings-section";
import { getStashConfig, setStashConfig, testStashConnection } from "@/features/settings/stash/api";
import { IconInput } from "@/shared/components/icon-input";
import { Row } from "@/shared/components/row";

type TestState = "idle" | "testing" | "ok" | "error";

export function StashSettings() {
  const [stashUrl, setStashUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [testState, setTestState] = useState<TestState>("idle");
  const [testMessage, setTestMessage] = useState<string | null>(null);

  useEffect(() => {
    getStashConfig().then((config) => {
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
    await setStashConfig(currentConfig());
    setSaved(true);
  }

  async function testConnection() {
    setTestState("testing");
    setTestMessage(null);
    try {
      await testStashConnection(currentConfig());
      setTestState("ok");
    } catch (error) {
      setTestState("error");
      setTestMessage(String(error));
    }
  }

  return (
    <SettingsSection title="Stash connection" description="The Stash instance media is catalogued in">
      <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 afterhours-glass rounded-lg p-3.5">
        <Row label="Stash URL" htmlFor="stash-url">
          <IconInput
            id="stash-url"
            icon={<GlobeIcon />}
            placeholder="http://localhost:9999"
            value={stashUrl}
            onChange={(event) => {
              setStashUrl(event.target.value);
              edited();
            }}
          />
        </Row>
        <Row label="API key" htmlFor="api-key">
          <IconInput
            id="api-key"
            icon={<KeyIcon />}
            type="password"
            value={apiKey}
            onChange={(event) => {
              setApiKey(event.target.value);
              edited();
            }}
          />
        </Row>
      </div>

      <div className="flex items-center justify-end gap-2">
        {testState === "ok" && <p className="mr-auto text-xs text-success">Connected to Stash.</p>}
        {testState === "error" && (
          <p className="mr-auto min-w-0 truncate text-xs text-destructive">{testMessage}</p>
        )}
        {saved && <p className="mr-auto text-xs text-muted-foreground">Saved.</p>}
        <Button
          variant="secondary"
          disabled={testState === "testing" || !stashUrl}
          onClick={testConnection}
        >
          {testState === "testing" ? "Testing…" : "Test"}
        </Button>
        <Button disabled={!stashUrl} onClick={save}>
          Save
        </Button>
      </div>
    </SettingsSection>
  );
}
