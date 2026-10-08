import { DatabaseIcon, HardDriveIcon } from "lucide-react";
import { type ComponentType, useState } from "react";
import { StashSettings } from "./StashSettings";
import { StorageSettings } from "./StorageSettings";

const TABS: { id: string; label: string; icon: ComponentType<{ className?: string }>; panel: ComponentType }[] = [
  { id: "stash", label: "Stash", icon: DatabaseIcon, panel: StashSettings },
  { id: "storage", label: "Storage", icon: HardDriveIcon, panel: StorageSettings },
];

function App() {
  const [active, setActive] = useState("storage");
  const Panel = TABS.find((tab) => tab.id === active)?.panel ?? StorageSettings;

  return (
    <main className="glass-thick flex h-svh flex-col overflow-hidden text-sm">
      <nav
        data-tauri-drag-region
        className="relative flex justify-center gap-1 border-b px-4 pt-10 pb-4"
      >
        <h1
          data-tauri-drag-region
          className="absolute inset-x-0 top-0 flex h-8 items-center justify-center text-sm font-medium"
        >
          Settings
        </h1>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActive(id)}
            className={`flex w-16 cursor-pointer flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-xs transition-colors ${
              active === id
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-y-auto overscroll-none">
        <div className="mx-auto w-full max-w-xl p-6">
          <Panel />
        </div>
      </div>
    </main>
  );
}

export default App;
