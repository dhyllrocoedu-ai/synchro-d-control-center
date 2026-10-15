import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { customRange, presetRange, type DateRange, type RangePreset } from '@/lib/analytics';

const PRESETS: { key: Exclude<RangePreset, 'custom'>; label: string }[] = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
];

const toInput = (ms: number) => {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center rounded-lg border bg-card/60 p-0.5">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => onChange(presetRange(p.key))}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              value.preset === p.key
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-lg border bg-card/60 px-2 py-1">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <input
          type="date"
          value={toInput(value.from)}
          max={toInput(value.to)}
          onChange={(e) => onChange(customRange(new Date(`${e.target.value}T00:00:00`).getTime(), value.to))}
          className="bg-transparent text-xs text-foreground outline-none [color-scheme:dark]"
        />
        <span className="text-muted-foreground">–</span>
        <input
          type="date"
          value={toInput(value.to)}
          min={toInput(value.from)}
          onChange={(e) => onChange(customRange(value.from, new Date(`${e.target.value}T23:59:59`).getTime()))}
          className="bg-transparent text-xs text-foreground outline-none [color-scheme:dark]"
        />
      </div>
    </div>
  );
}
