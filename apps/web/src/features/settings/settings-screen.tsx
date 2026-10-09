import { useLayoutEffect, useState, type ComponentType } from "react";
import { SettingsNav } from "@/features/settings/components/settings-nav";
import { LibrarySection } from "@/features/settings/library/library-section";
import { TagsSection } from "@/features/settings/tags/tags-section";
import { MaintenanceSection } from "@/features/settings/maintenance/maintenance-section";
import type { SettingsSectionId } from "@/features/settings/types";

const SECTIONS: Record<SettingsSectionId, ComponentType> = {
  library: LibrarySection,
  tags: TagsSection,
  maintenance: MaintenanceSection,
};

export function SettingsScreen() {
  const [section, setSection] = useState<SettingsSectionId>("library");
  const Section = SECTIONS[section];

  useLayoutEffect(() => {
    window.scrollTo({ top: 0 });
  }, [section]);

  return (
    <div className="mx-auto flex max-w-[1040px] flex-wrap items-start gap-x-10 gap-y-6 px-[clamp(14px,3vw,32px)] py-4.5 pb-16">
      <div className="sticky top-21 flex max-w-[220px] flex-1 basis-[180px] flex-col gap-3.5">
        <h1 className="px-2.5 text-[26px] font-semibold tracking-[-0.03em]">
          Settings
        </h1>
        <SettingsNav active={section} onSelect={setSection} />
      </div>

      <div className="min-h-[calc(100svh-146px)] min-w-0 flex-[3_1_480px] pt-1">
        <Section />
      </div>
    </div>
  );
}
