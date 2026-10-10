import {
  ACCENT_PRESETS,
  type AccentKey,
  getAccent,
  setAccent,
} from "@stasher/ui/lib/afterhours-accent";
import { useEffect, useState } from "react";

const GROUP_LABELS = {
  original: "Originals",
  harmony: "Harmonies of Amber",
} as const;

/** Swatches for Afterhours' accent presets. Picking one sets data-accent on <html>. */
export function AccentPicker() {
  // The saved accent only exists on the client, so start from the default and
  // correct it once mounted. The boot in main.tsx has already applied it to <html>.
  const [current, setCurrent] = useState<AccentKey>("amber");

  useEffect(() => setCurrent(getAccent()), []);

  return (
    <div className="flex flex-col gap-3.5">
      {(["original", "harmony"] as const).map((group) => (
        <div key={group} className="flex flex-col gap-2">
          <span className="section-label">{GROUP_LABELS[group]}</span>
          <div className="flex flex-wrap items-center gap-2">
            {ACCENT_PRESETS.filter((preset) => preset.group === group).map((preset) => (
              <button
                key={preset.key}
                type="button"
                aria-label={preset.name}
                aria-pressed={current === preset.key}
                title={preset.harmony ? `${preset.name} (${preset.harmony})` : preset.name}
                onClick={() => {
                  setAccent(preset.key);
                  setCurrent(preset.key);
                }}
                className="grid size-7 cursor-pointer place-items-center rounded-full"
                style={{
                  boxShadow: current === preset.key ? `0 0 0 1.5px ${preset.accent}` : undefined,
                }}
              >
                <span
                  className="size-5 rounded-full shadow-swatch"
                  style={{
                    background: `linear-gradient(-135deg, ${preset.hi} 0%, ${preset.lo} 100%)`,
                  }}
                />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
