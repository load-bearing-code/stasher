export function StepDots({ step }: { step: 1 | 2 }) {
  const dot = (active: boolean) =>
    `h-1.5 rounded-full transition-all ${active ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/40"}`;
  return (
    <div className="flex items-center gap-1" aria-hidden>
      <span className={dot(step === 1)} />
      <span className={dot(step === 2)} />
    </div>
  );
}
