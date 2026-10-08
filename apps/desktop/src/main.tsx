import { DatabaseIcon, GlobeIcon, HardDriveIcon } from "lucide-react";
import { type ComponentType, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { SourcesSettings } from "@/features/settings/sources/sources-settings";
import { StashSettings } from "@/features/settings/stash/stash-settings";
import { StorageSettings } from "@/features/settings/storage/storage-settings";
import "./index.css";

const TABS: {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  panel: ComponentType;
}[] = [
  { id: "stash", label: "Stash", icon: DatabaseIcon, panel: StashSettings },
  { id: "sources", label: "Sources", icon: GlobeIcon, panel: SourcesSettings },
  { id: "storage", label: "Storage", icon: HardDriveIcon, panel: StorageSettings },
];

function App() {
  const [active, setActive] = useState("storage");

  return (
    <main className="glass-thick flex h-svh flex-col overflow-hidden text-sm">
      <nav
        data-tauri-drag-region
        className="relative flex justify-center gap-0.5 border-b px-3 pt-10 pb-2.5"
      >
        <h1
          data-tauri-drag-region
          className="absolute inset-x-0 top-0 flex h-9 items-center justify-center text-[13px] font-semibold text-secondary-foreground/80"
        >
          {TABS.find((tab) => tab.id === active)?.label}
        </h1>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActive(id)}
            className={`flex w-17 cursor-pointer flex-col items-center gap-1 rounded-lg py-1.5 text-[11px] transition-colors ${
              active === id
                ? "bg-accent text-foreground"
                : "text-secondary-foreground/80 hover:text-foreground"
            }`}
          >
            <Icon className={`size-[18px] ${active === id ? "text-tint-text" : ""}`} />
            {label}
          </button>
        ))}
      </nav>
      {TABS.map(({ id, panel: Panel }) => (
        <div key={id} hidden={active !== id} className="flex-1 overflow-y-auto overscroll-none">
          <div className="mx-auto w-full max-w-xl px-5 py-[18px]">
            <Panel />
          </div>
        </div>
      ))}
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
