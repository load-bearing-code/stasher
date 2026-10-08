import type { Performer, SiteProfile } from "@stasher/protocol";
import { useState } from "react";
import { sendHostRequest } from "@/shared/host";
import { ReviewStep } from "./components/ReviewStep";
import { SelectStep } from "./components/SelectStep";
import { type FormState, type Selection, seedForm, toDraft } from "./form";

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
  const includeAvatar = selection.avatar && hasAvatar;

  async function submit() {
    setSubmitting(true);
    try {
      const response = await sendHostRequest({
        type: "importPerformer",
        profile,
        draft: toDraft(form, profile, includeAvatar),
      });
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
      <SelectStep
        profile={profile}
        selection={selection}
        onSelectionChange={(key, checked) =>
          setSelection((current) => ({ ...current, [key]: checked }))
        }
        onCancel={onCancel}
        onContinue={goToReview}
      />
    );
  }

  return (
    <ReviewStep
      profile={profile}
      form={form}
      overrides={overrides}
      includeAvatar={includeAvatar}
      submitting={submitting}
      onFieldChange={setField}
      onBack={() => setStep(1)}
      onSubmit={() => void submit()}
    />
  );
}
