import { useEffect, useRef, useState } from "react";
import { SettingsSection } from "@/features/settings/settings-section";
import { getFileLayout, setFileLayout } from "@/features/settings/storage/file-layout/api";
import { TemplateBuilder } from "@/features/settings/storage/file-layout/components/template-builder";
import { renderTemplate } from "@/features/settings/storage/file-layout/tokens";

const DEFAULT_TEMPLATE = "{performer}/{date} – {title}.{extension}";

export function FileLayout() {
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  // Don't persist until the saved template has loaded, so hydration doesn't
  // write the default back over a stored value.
  const hydrated = useRef(false);

  useEffect(() => {
    getFileLayout()
      .then((config) => {
        if (config) setTemplate(config.template);
      })
      .finally(() => {
        hydrated.current = true;
      });
  }, []);

  // Debounce so editing the template a character at a time doesn't write to
  // disk on every keystroke.
  useEffect(() => {
    if (!hydrated.current) return;
    const timer = setTimeout(() => {
      setFileLayout({ template });
    }, 400);
    return () => clearTimeout(timer);
  }, [template]);

  return (
    <SettingsSection title="File layout" description="How downloaded files are named and foldered">
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
