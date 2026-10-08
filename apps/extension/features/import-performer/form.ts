import type { PerformerDraft, SiteProfile } from "@stasher/protocol";

export type ImportKey = "profile" | "avatar" | "tags";
export type Selection = Record<ImportKey, boolean>;

export type FormState = {
  name: string;
  disambiguation: string;
  aliases: string;
  birthdate: string;
  country: string;
  details: string;
  urls: string;
  tags: string;
};

function splitList(value: string, separator: RegExp): string[] {
  return value
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function seedForm(profile: SiteProfile, selection: Selection): FormState {
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

export function toDraft(
  form: FormState,
  profile: SiteProfile,
  includeAvatar: boolean,
): PerformerDraft {
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
