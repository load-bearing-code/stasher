import { useState } from "react";
import { SettingsSection } from "@/features/settings/settings-section";
import { TemplateBuilder } from "@/features/settings/storage/file-layout/components/template-builder";
import { PRESETS, renderTemplate } from "@/features/settings/storage/file-layout/tokens";

const DEFAULT_TEMPLATE = PRESETS[0].template;

export function FileLayout() {
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const matchedPreset = PRESETS.find((preset) => preset.template === template);

  return (
    <SettingsSection title="File layout" description="How downloaded files are named and foldered">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => {
          const active = preset.template === template;
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => setTemplate(preset.template)}
              className={`cursor-pointer rounded-md border px-2.5 py-1 text-xs transition-colors ${
                active
                  ? "border-tint-border bg-tint-soft text-tint-text"
                  : "bg-secondary text-secondary-foreground/80 hover:text-foreground"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
        {!matchedPreset && (
          <span className="rounded-md border border-tint-border bg-tint-soft px-2.5 py-1 text-xs text-tint-text">
            Custom
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-3.5">
        <TemplateBuilder value={template} onChange={setTemplate} />
        <div className="flex flex-col gap-0.5 rounded-md bg-black/20 px-2.5 py-2">
          <span className="text-[11px] text-muted-foreground">Preview</span>
          <span className="break-all font-mono text-[11px] leading-relaxed text-foreground">
            {renderTemplate(template)}
          </span>
        </div>
      </div>
    </SettingsSection>
  );
}
