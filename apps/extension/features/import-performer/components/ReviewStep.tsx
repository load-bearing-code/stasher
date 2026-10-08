import type { SiteProfile } from "@stasher/protocol";
import { Button } from "@stasher/ui/components/button";
import { Input } from "@stasher/ui/components/input";
import { ArrowLeftIcon, UserPlusIcon } from "lucide-react";
import { plural } from "@/shared/text";
import type { FormState } from "../form";
import { Field } from "./Field";
import { StepDots } from "./StepDots";

const textareaClass =
  "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function ReviewStep({
  profile,
  form,
  overrides,
  includeAvatar,
  submitting,
  onFieldChange,
  onBack,
  onSubmit,
}: {
  profile: SiteProfile;
  form: FormState;
  overrides: number;
  includeAvatar: boolean;
  submitting: boolean;
  onFieldChange: (field: keyof FormState, value: string) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Back"
            disabled={submitting}
            onClick={onBack}
          >
            <ArrowLeftIcon />
          </Button>
          <h2 className="text-sm font-medium">Review values</h2>
        </div>
        <StepDots step={2} />
      </div>

      <p className="text-muted-foreground">
        Values scraped from Fansly. Change anything before it's written.
      </p>

      <div className="flex flex-col gap-3 [&_input]:text-xs">
        <Field id="wiz-name" label="Name">
          <Input
            id="wiz-name"
            value={form.name}
            onChange={(event) => onFieldChange("name", event.target.value)}
          />
        </Field>
        <Field id="wiz-disambiguation" label="Disambiguation">
          <Input
            id="wiz-disambiguation"
            value={form.disambiguation}
            placeholder="Not on Fansly"
            onChange={(event) => onFieldChange("disambiguation", event.target.value)}
          />
        </Field>
        <Field id="wiz-aliases" label="Aliases (comma separated)">
          <Input
            id="wiz-aliases"
            value={form.aliases}
            onChange={(event) => onFieldChange("aliases", event.target.value)}
          />
        </Field>
        <Field id="wiz-birthdate" label="Birthdate">
          <Input
            id="wiz-birthdate"
            value={form.birthdate}
            placeholder="YYYY-MM-DD"
            onChange={(event) => onFieldChange("birthdate", event.target.value)}
          />
        </Field>
        <Field id="wiz-country" label="Country">
          <Input
            id="wiz-country"
            value={form.country}
            onChange={(event) => onFieldChange("country", event.target.value)}
          />
        </Field>
        <Field id="wiz-details" label="Bio">
          <textarea
            id="wiz-details"
            rows={4}
            className={textareaClass}
            value={form.details}
            onChange={(event) => onFieldChange("details", event.target.value)}
          />
        </Field>
        <Field id="wiz-urls" label="Links (one per line)">
          <textarea
            id="wiz-urls"
            rows={3}
            className={`${textareaClass} font-mono text-xs`}
            value={form.urls}
            onChange={(event) => onFieldChange("urls", event.target.value)}
          />
        </Field>
        <Field id="wiz-tags" label="Tags (comma separated)">
          <Input
            id="wiz-tags"
            value={form.tags}
            onChange={(event) => onFieldChange("tags", event.target.value)}
          />
        </Field>
        {includeAvatar && (
          <div className="flex items-center gap-3">
            <img
              src={profile.photoUrl ?? undefined}
              alt=""
              className="size-12 rounded-lg object-cover"
            />
            <span className="text-muted-foreground">Profile photo will be imported.</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">{plural(overrides, "override")}</span>
        <Button disabled={submitting || form.name.trim() === ""} onClick={onSubmit}>
          <UserPlusIcon />
          {submitting ? "Importing..." : "Import to Stash"}
        </Button>
      </div>
    </div>
  );
}
