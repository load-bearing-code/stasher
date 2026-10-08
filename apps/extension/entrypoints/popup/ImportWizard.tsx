import type {
  HostRequest,
  HostResponse,
  Performer,
  PerformerDraft,
  SiteProfile,
} from "@stasher/protocol";
import { Button } from "@stasher/ui/components/button";
import { Card } from "@stasher/ui/components/card";
import { Input } from "@stasher/ui/components/input";
import { Label } from "@stasher/ui/components/label";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, UserPlusIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

type ImportKey = "profile" | "avatar" | "tags";
type Selection = Record<ImportKey, boolean>;

type FormState = {
  name: string;
  disambiguation: string;
  aliases: string;
  birthdate: string;
  country: string;
  details: string;
  urls: string;
  tags: string;
};

const textareaClass =
  "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function splitList(value: string, separator: RegExp): string[] {
  return value
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
}

function seedForm(profile: SiteProfile, selection: Selection): FormState {
  const name = profile.username;
  const aliases =
    selection.profile && profile.displayName && profile.displayName !== name
      ? [profile.displayName]
      : [];
  const urls = [profile.profileUrl, ...(selection.profile ? profile.links : [])];

  return {
    name,
    disambiguation: "",
    aliases: aliases.join(", "),
    birthdate: "",
    country: selection.profile ? (profile.location ?? "") : "",
    details: selection.profile ? (profile.bio ?? "") : "",
    urls: urls.join("\n"),
    tags: selection.tags ? profile.tags.join(", ") : "",
  };
}

function toDraft(form: FormState, profile: SiteProfile, includeAvatar: boolean): PerformerDraft {
  const optional = (value: string) => value.trim() || null;
  return {
    name: form.name.trim(),
    disambiguation: optional(form.disambiguation),
    aliases: splitList(form.aliases, /,/),
    birthdate: optional(form.birthdate),
    country: optional(form.country),
    details: optional(form.details),
    urls: splitList(form.urls, /\n/),
    tags: splitList(form.tags, /,/),
    imageUrl: includeAvatar ? profile.photoUrl : null,
  };
}

function Checkbox({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <span
      className={`relative flex size-6 shrink-0 items-center justify-center rounded-md border transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 ${
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background/40"
      } ${disabled ? "opacity-40" : ""}`}
    >
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="absolute inset-0 m-0 cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
      />
      {checked && <CheckIcon className="pointer-events-none size-4" />}
    </span>
  );
}

function StepDots({ step }: { step: 1 | 2 }) {
  const dot = (active: boolean) =>
    `h-1.5 rounded-full transition-all ${active ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/40"}`;
  return (
    <div className="flex items-center gap-1" aria-hidden>
      <span className={dot(step === 1)} />
      <span className={dot(step === 2)} />
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function ImportWizard({
  profile,
  onCancel,
  onCreated,
  onError,
}: {
  profile: SiteProfile;
  onCancel: () => void;
  onCreated: (performer: Performer) => void;
  onError: (message: string) => void;
}) {
  const hasAvatar = Boolean(profile.photoUrl);
  const hasTags = profile.tags.length > 0;

  const [step, setStep] = useState<1 | 2>(1);
  const [selection, setSelection] = useState<Selection>({
    profile: true,
    avatar: hasAvatar,
    tags: hasTags,
  });
  const [seed, setSeed] = useState<FormState>(() => seedForm(profile, selection));
  const [form, setForm] = useState<FormState>(seed);
  const [submitting, setSubmitting] = useState(false);

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

  function goToReview() {
    const next = seedForm(profile, selection);
    setSeed(next);
    setForm(next);
    setStep(2);
  }

  function setField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  const overrides = (Object.keys(form) as Array<keyof FormState>).filter(
    (field) => form[field] !== seed[field],
  ).length;

  async function submit() {
    setSubmitting(true);
    try {
      const request: HostRequest = {
        type: "importPerformer",
        profile,
        draft: toDraft(form, profile, selection.avatar && hasAvatar),
      };
      const response: HostResponse = await browser.runtime.sendMessage(request);
      if (response.type === "performerCreated") {
        onCreated(response.performer);
      } else if (response.type === "error") {
        onError(response.message);
      }
    } catch {
      onError("Couldn't reach the Stasher desktop app.");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 1) {
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
                onChange={(checked) =>
                  setSelection((current) => ({
                    ...current,
                    [option.key]: checked,
                  }))
                }
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
          <Button onClick={goToReview}>
            Continue
            <ArrowRightIcon />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Back"
            disabled={submitting}
            onClick={() => setStep(1)}
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
            onChange={(event) => setField("name", event.target.value)}
          />
        </Field>
        <Field id="wiz-disambiguation" label="Disambiguation">
          <Input
            id="wiz-disambiguation"
            value={form.disambiguation}
            placeholder="Not on Fansly"
            onChange={(event) => setField("disambiguation", event.target.value)}
          />
        </Field>
        <Field id="wiz-aliases" label="Aliases (comma separated)">
          <Input
            id="wiz-aliases"
            value={form.aliases}
            onChange={(event) => setField("aliases", event.target.value)}
          />
        </Field>
        <Field id="wiz-birthdate" label="Birthdate">
          <Input
            id="wiz-birthdate"
            value={form.birthdate}
            placeholder="YYYY-MM-DD"
            onChange={(event) => setField("birthdate", event.target.value)}
          />
        </Field>
        <Field id="wiz-country" label="Country">
          <Input
            id="wiz-country"
            value={form.country}
            onChange={(event) => setField("country", event.target.value)}
          />
        </Field>
        <Field id="wiz-details" label="Bio">
          <textarea
            id="wiz-details"
            rows={4}
            className={textareaClass}
            value={form.details}
            onChange={(event) => setField("details", event.target.value)}
          />
        </Field>
        <Field id="wiz-urls" label="Links (one per line)">
          <textarea
            id="wiz-urls"
            rows={3}
            className={`${textareaClass} font-mono text-xs`}
            value={form.urls}
            onChange={(event) => setField("urls", event.target.value)}
          />
        </Field>
        <Field id="wiz-tags" label="Tags (comma separated)">
          <Input
            id="wiz-tags"
            value={form.tags}
            onChange={(event) => setField("tags", event.target.value)}
          />
        </Field>
        {selection.avatar && hasAvatar && (
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
        <Button disabled={submitting || form.name.trim() === ""} onClick={() => void submit()}>
          <UserPlusIcon />
          {submitting ? "Importing..." : "Import to Stash"}
        </Button>
      </div>
    </div>
  );
}
