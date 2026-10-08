import type { SiteProfile } from "@stasher/protocol";
import { Button } from "@stasher/ui/components/button";
import { Card } from "@stasher/ui/components/card";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { plural } from "@/shared/text";
import type { ImportKey, Selection } from "../form";
import { Checkbox } from "./Checkbox";
import { StepDots } from "./StepDots";

export function SelectStep({
  profile,
  selection,
  onSelectionChange,
  onCancel,
  onContinue,
}: {
  profile: SiteProfile;
  selection: Selection;
  onSelectionChange: (key: ImportKey, checked: boolean) => void;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const hasAvatar = Boolean(profile.photoUrl);
  const hasTags = profile.tags.length > 0;

  const options: Array<{
    key: ImportKey;
    label: string;
    summary: string;
    available: boolean;
  }> = [
    {
      key: "profile",
      label: "Profile",
      summary: [
        "name",
        profile.bio ? "bio" : null,
        profile.location ? "location" : null,
        profile.links.length > 0 ? plural(profile.links.length, "link") : null,
      ]
        .filter(Boolean)
        .join(", "),
      available: true,
    },
    {
      key: "avatar",
      label: "Avatar",
      summary: hasAvatar ? "Profile photo" : "None on this profile",
      available: hasAvatar,
    },
    {
      key: "tags",
      label: "Tags",
      summary: hasTags ? plural(profile.tags.length, "bio tag") : "None on this profile",
      available: hasTags,
    },
  ];
  const selectedCount = options.filter(
    (option) => option.available && selection[option.key],
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" aria-label="Back" onClick={onCancel}>
            <ArrowLeftIcon />
          </Button>
          <h2 className="text-sm font-medium">Choose what to import</h2>
        </div>
        <StepDots step={1} />
      </div>

      <Card variant="inset" className="gap-0 divide-y py-0">
        {options.map((option) => (
          <div key={option.key} className="flex items-center gap-4 px-4 py-3.5">
            <Checkbox
              label={option.label}
              checked={option.available && selection[option.key]}
              disabled={!option.available || option.key === "profile"}
              onChange={(checked) => onSelectionChange(option.key, checked)}
            />
            <span className="flex-1 text-sm">{option.label}</span>
            <span className="truncate text-muted-foreground">{option.summary}</span>
          </div>
        ))}
      </Card>

      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">
          {selectedCount} of {options.length} selected
        </span>
        <Button onClick={onContinue}>
          Continue
          <ArrowRightIcon />
        </Button>
      </div>
    </div>
  );
}
