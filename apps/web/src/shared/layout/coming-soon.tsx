interface ComingSoonProps {
  title: string;
  description?: string;
}

export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-5 py-20 text-center text-muted-foreground">
      <div className="text-[15px] font-medium text-foreground">{title}</div>
      <div className="text-[13px]">{description ?? "Coming soon"}</div>
    </div>
  );
}
