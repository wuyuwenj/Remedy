interface BeforeAfterProps {
  beforeScreenshot?: string;
  afterScreenshot?: string;
}

function toSrc(data?: string): string | undefined {
  if (!data) return undefined;
  if (data.startsWith('data:')) return data;
  if (data.startsWith('http')) return data;
  return `data:image/png;base64,${data}`;
}

export default function BeforeAfter({ beforeScreenshot, afterScreenshot }: BeforeAfterProps) {
  if (!beforeScreenshot && !afterScreenshot) return null;

  return (
    <div className="mt-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Screenshots
      </div>
      <div className="flex gap-4 flex-wrap">
        {/* Before */}
        <div className="flex-1 min-w-[240px]">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--color-bad)] mb-1.5">
            Before
          </div>
          {beforeScreenshot ? (
            <img
              src={toSrc(beforeScreenshot)}
              alt="Before optimization"
              className="w-full rounded-lg border border-white/10"
            />
          ) : (
            <div className="panel flex items-center justify-center text-muted-foreground text-[13px] min-h-[180px]">
              No screenshot
            </div>
          )}
        </div>

        {/* After */}
        <div className="flex-1 min-w-[240px]">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--color-improve)] mb-1.5">
            After
          </div>
          {afterScreenshot ? (
            <img
              src={toSrc(afterScreenshot)}
              alt="After optimization"
              className="w-full rounded-lg border border-white/10"
            />
          ) : (
            <div className="panel flex items-center justify-center text-muted-foreground text-[13px] min-h-[180px]">
              No screenshot
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
