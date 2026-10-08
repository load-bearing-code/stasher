import { CheckIcon } from "lucide-react";

export function Checkbox({
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
