import { Button } from "@stasher/ui/components/button";
import { Card } from "@stasher/ui/components/card";

const LIBRARY_STATS = [
  { label: "Posts", value: "1,404" },
  { label: "Performers", value: "8" },
  { label: "Tags", value: "412" },
];

export function LibrarySection() {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Connection
        </h2>
        <Card variant="inset" className="gap-0 py-0">
          <div className="flex items-center gap-3 border-b border-border px-3.5 py-3">
            <span className="size-2 flex-none rounded-full bg-success" />
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[13px]">
                http://localhost:8080
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Connected · v1.10.3 · API key ending 7f3a
              </div>
            </div>
            <Button variant="secondary" size="sm">
              Test
            </Button>
          </div>
          <div className="grid grid-cols-3 px-3.5 py-3">
            {LIBRARY_STATS.map((stat) => (
              <div key={stat.label}>
                <div className="text-[17px] font-semibold tracking-tight">
                  {stat.value}
                </div>
                <div className="text-xs text-muted-foreground">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}
