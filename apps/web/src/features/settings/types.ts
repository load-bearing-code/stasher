import type { LucideIcon } from "lucide-react";

export type SettingsSectionId = "library" | "tags" | "maintenance";

export interface SettingsNavItem {
  id: SettingsSectionId;
  label: string;
  icon: LucideIcon;
}
