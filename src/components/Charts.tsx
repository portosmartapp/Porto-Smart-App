import React from 'react';
import { Language } from '../types/platform';

interface BarItem {
  label: string;
  value: number;
  secondaryValue?: number;
}

export const MonthlyIncomeBarChart: React.FC<{
  data: BarItem[];
  currency: string;
}> = ({ data, currency }) => {
  const maxVal = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="w-full pt-2">
      <div className="flex items-end gap-3 h-48 border-b border-slate-200 pb-2 px-1">
        {data.map((item) => {
          const pct = Math.max(8, Math.round((item.value / maxVal) * 100));
          return (
            <div key={item.label} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
              <span className="text-[11px] font-mono-num text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                {item.value.toLocaleString()} {currency}
              </span>
              <div className="w-full max-w-[34px] bg-slate-100 rounded-t-md h-36 flex items-end overflow-hidden">
                <div
                  className="w-full bg-cyan-700 group-hover:bg-cyan-600 transition-all duration-200 rounded-t-md"
                  style={{ height: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 pt-2 px-1">
        {data.map((item) => (
          <div key={item.label} className="flex-1 text-center text-xs text-slate-600 truncate">
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
};

export const OccupancyAreaChart: React.FC<{
  data: { label: string; pct: number }[];
}> = ({ data }) => {
  const width = 460;
  const height = 160;
  const padX = 16;
  const padY = 16;
  const stepX = data.length > 1 ? (width - padX * 2) / (data.length - 1) : 0;

  const points = data.map((d, idx) => {
    const x = padX + idx * stepX;
    const y = height - padY - (d.pct / 100) * (height - padY * 2);
    return { x, y, ...d };
  });

  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');
  const areaPath =
    points.length > 0
      ? `M ${points[0].x},${height - padY} L ${points.map((p) => `${p.x},${p.y}`).join(' L ')} L ${
          points[points.length - 1].x
        },${height - padY} Z`
      : '';

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-44 overflow-visible">
        <defs>
          <linearGradient id="occGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0e7490" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#0e7490" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {[25, 50, 75, 100].map((grid) => {
          const y = height - padY - (grid / 100) * (height - padY * 2);
          return (
            <line
              key={grid}
              x1={padX}
              y1={y}
              x2={width - padX}
              y2={y}
              stroke="#e2e8f0"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
          );
        })}
        {areaPath && <path d={areaPath} fill="url(#occGrad)" />}
        {polyline && (
          <polyline
            fill="none"
            stroke="#0e7490"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={polyline}
          />
        )}
        {points.map((p) => (
          <g key={p.label}>
            <circle cx={p.x} cy={p.y} r="4" fill="#ffffff" stroke="#0e7490" strokeWidth="2.5" />
          </g>
        ))}
      </svg>
      <div className="flex items-center justify-between px-2 pt-1">
        {points.map((p) => (
          <div key={p.label} className="text-center">
            <div className="text-xs font-mono-num font-semibold text-slate-800">{p.pct}%</div>
            <div className="text-[11px] text-slate-500">{p.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const HorizontalRevenueChart: React.FC<{
  items: { label: string; value: number }[];
  currency: string;
}> = ({ items, currency }) => {
  const maxVal = Math.max(...items.map((i) => i.value), 1);

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const pct = Math.max(4, Math.round((item.value / maxVal) * 100));
        return (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-800">{item.label}</span>
              <span className="font-mono-num text-slate-700 font-semibold">
                {item.value.toLocaleString()} {currency}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-cyan-700 rounded-full" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const OwnerVsMgmtChart: React.FC<{
  items: { label: string; ownerShare: number; mgmtShare: number }[];
  currency: string;
  lang: Language;
}> = ({ items, currency, lang }) => {
  const maxVal = Math.max(...items.map((i) => i.ownerShare + i.mgmtShare), 1);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-cyan-700 inline-block" />
          {lang === 'ar' ? 'حصة المالك' : 'Owner Share'}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-600 inline-block" />
          {lang === 'ar' ? 'عمولة الإدارة' : 'Management Fee'}
        </span>
      </div>
      {items.map((item) => {
        const total = item.ownerShare + item.mgmtShare;
        const ownerPct = Math.round((item.ownerShare / maxVal) * 100);
        const mgmtPct = Math.round((item.mgmtShare / maxVal) * 100);
        return (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-800 truncate max-w-[55%]">{item.label}</span>
              <span className="font-mono-num text-slate-600">
                {total.toLocaleString()} {currency}
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
              <div className="h-full bg-cyan-700" style={{ width: `${ownerPct}%` }} />
              <div className="h-full bg-amber-600" style={{ width: `${mgmtPct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const ExpensesDonutChart: React.FC<{
  items: { label: string; value: number; color: string }[];
  currency: string;
}> = ({ items, currency }) => {
  const total = items.reduce((s, i) => s + i.value, 0);
  const safeTotal = total || 1;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative w-36 h-36 shrink-0">
        <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
          <circle cx="70" cy="70" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="18" />
          {items.map((item) => {
            const dash = (item.value / safeTotal) * circumference;
            const currentOffset = offset;
            offset += dash;
            return (
              <circle
                key={item.label}
                cx="70"
                cy="70"
                r={radius}
                fill="none"
                stroke={item.color}
                strokeWidth="18"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-currentOffset}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-sm font-mono-num font-bold text-slate-900">
            {total.toLocaleString()}
          </span>
          <span className="text-[11px] text-slate-500">{currency}</span>
        </div>
      </div>

      <div className="flex-1 w-full space-y-2">
        {items.map((item) => {
          const pct = Math.round((item.value / safeTotal) * 100);
          return (
            <div key={item.label} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-slate-700">{item.label}</span>
              </div>
              <div className="font-mono-num text-slate-800 font-medium">
                {item.value.toLocaleString()} {currency} <span className="text-slate-400">({pct}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
