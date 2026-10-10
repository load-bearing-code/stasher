import { Button } from "@stasher/ui/components/button";
import { Card } from "@stasher/ui/components/card";
import { AccentPicker } from "@/features/settings/appearance/components/accent-picker";
import { useServerMetadata } from "@/features/settings/library/library-api";
import { apiEndpoint } from "@/shared/api/graphql";

const numberFormat = new Intl.NumberFormat();

function formatCount(value: number | undefined): string {
  return value === undefined ? "—" : numberFormat.format(value);
}

export function LibrarySection() {
  const { data, isPending, isError, isFetching, refetch } = useServerMetadata();

  const status = isError
    ? { dot: "bg-destructive", label: "Disconnected" }
    : isPending
      ? { dot: "bg-warning", label: "Connecting…" }
      : { dot: "bg-success", label: `Connected · v${data.version}` };

  const stats = [
    { label: "Performers", value: formatCount(data?.itemCounts.performers) },
    { label: "Tags", value: formatCount(data?.itemCounts.tags) },
    { label: "Platforms", value: formatCount(data?.itemCounts.platforms) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="section-label px-1">Connection</h2>
        <Card variant="inset" className="gap-0 py-0">
          <div className="flex items-center gap-3 border-b border-divider px-3.5 py-3">
            <span className={`size-2 flex-none rounded-full ${status.dot}`} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-mono-field">
                {data?.endpoint || apiEndpoint}
              </div>
              <div className="mt-0.5 text-meta text-muted-foreground">{status.label}</div>
            </div>
            <Button variant="secondary" size="sm" disabled={isFetching} onClick={() => refetch()}>
              Test
            </Button>
          </div>
          <div className="grid grid-cols-3 px-3.5 py-3">
            {stats.map((stat) => (
              <div key={stat.label}>
                <div className="text-dialog-title">{stat.value}</div>
                <div className="text-meta text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="section-label px-1">Appearance</h2>
        <Card variant="inset">
          <div className="flex flex-col gap-1.5 px-3.5">
            <span className="text-card-title">Accent</span>
            <p className="text-meta text-muted-foreground">
              Tints buttons, links and selected rows across the app.
            </p>
          </div>
          <div className="px-3.5">
            <AccentPicker />
          </div>
        </Card>
      </section>
    </div>
  );
}
