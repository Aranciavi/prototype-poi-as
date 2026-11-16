import { CopyCheck } from 'lucide-react';
import type { BranchLocation, DayKey, WeeklyHoursSchedule } from '../types/ops';

export const DAY_META: Array<{ key: DayKey; label: string; short: string }> = [
  { key: 'mon', label: 'Senin', short: 'Sen' },
  { key: 'tue', label: 'Selasa', short: 'Sel' },
  { key: 'wed', label: 'Rabu', short: 'Rab' },
  { key: 'thu', label: 'Kamis', short: 'Kam' },
  { key: 'fri', label: 'Jumat', short: 'Jum' },
  { key: 'sat', label: 'Sabtu', short: 'Sab' },
  { key: 'sun', label: 'Minggu', short: 'Min' },
];

export function ensureWeeklyHours(branch?: Partial<BranchLocation> | null): WeeklyHoursSchedule {
  if (branch?.weeklyHours) {
    return {
      mon: { ...branch.weeklyHours.mon },
      tue: { ...branch.weeklyHours.tue },
      wed: { ...branch.weeklyHours.wed },
      thu: { ...branch.weeklyHours.thu },
      fri: { ...branch.weeklyHours.fri },
      sat: { ...branch.weeklyHours.sat },
      sun: { ...branch.weeklyHours.sun },
    };
  }

  const weekdayHours =
    branch?.operatingHours && branch.operatingHours.trim() && branch.operatingHours !== 'Tutup'
      ? branch.operatingHours
      : '08:00 - 15:00 WIB';
  const satRaw = branch?.saturdayHours?.trim() || 'Tutup';
  const satOpen = Boolean(satRaw && satRaw.toLowerCase() !== 'tutup');
  const sunRaw = branch?.sundayHours?.trim() || '';
  const sunOpen = Boolean(sunRaw && sunRaw.toLowerCase() !== 'tutup');

  return {
    mon: { open: true, hours: weekdayHours },
    tue: { open: true, hours: weekdayHours },
    wed: { open: true, hours: weekdayHours },
    thu: { open: true, hours: weekdayHours },
    fri: { open: true, hours: weekdayHours },
    sat: { open: satOpen, hours: satOpen ? satRaw : 'Tutup' },
    sun: { open: sunOpen, hours: sunOpen ? sunRaw : 'Tutup' },
  };
}

interface WeeklyHoursChecklistProps {
  value: WeeklyHoursSchedule;
  onChange: (next: WeeklyHoursSchedule) => void;
  compact?: boolean;
}

export function WeeklyHoursChecklist({
  value,
  onChange,
  compact = false,
}: WeeklyHoursChecklistProps) {
  const handleToggleDay = (day: DayKey, open: boolean) => {
    const currentHours = value[day]?.hours || '08:00 - 15:00 WIB';
    const nextHours = open
      ? currentHours === 'Tutup' || !currentHours.trim()
        ? value.mon?.open && value.mon.hours !== 'Tutup'
          ? value.mon.hours
          : '08:00 - 15:00 WIB'
        : currentHours
      : 'Tutup';
    onChange({
      ...value,
      [day]: { open, hours: nextHours },
    });
  };

  const handleHoursChange = (day: DayKey, hours: string) => {
    onChange({
      ...value,
      [day]: { ...value[day], hours },
    });
  };

  const handleCopyMondayToWeekdays = () => {
    const monEntry = value.mon;
    const baseHours =
      monEntry?.open && monEntry.hours && monEntry.hours !== 'Tutup'
        ? monEntry.hours
        : '08:00 - 15:00 WIB';
    onChange({
      ...value,
      mon: { open: monEntry?.open ?? true, hours: monEntry?.open ? baseHours : 'Tutup' },
      tue: { open: monEntry?.open ?? true, hours: monEntry?.open ? baseHours : 'Tutup' },
      wed: { open: monEntry?.open ?? true, hours: monEntry?.open ? baseHours : 'Tutup' },
      thu: { open: monEntry?.open ?? true, hours: monEntry?.open ? baseHours : 'Tutup' },
      fri: { open: monEntry?.open ?? true, hours: monEntry?.open ? baseHours : 'Tutup' },
    });
  };

  return (
    <div className="rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] p-3.5 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[#1a1b22]">
          Checklist Jam Operasional (Senin – Minggu)
        </span>
        <button
          type="button"
          onClick={handleCopyMondayToWeekdays}
          className="h-7 px-2.5 rounded-xl bg-white border border-[#cbd5e1] hover:bg-[#eff6ff] hover:border-[#00529C] text-[11px] font-semibold text-[#00529C] inline-flex items-center gap-1 smooth-transition whitespace-nowrap"
        >
          <CopyCheck className="h-3 w-3" />
          <span>Samakan Sen–Jum</span>
        </button>
      </div>

      <div className="divide-y divide-[#e2e8f0] rounded-xl bg-white border border-[#e2e8f0]">
        {DAY_META.map((day) => {
          const entry = value[day.key] ?? { open: false, hours: 'Tutup' };
          return (
            <div
              key={day.key}
              className={`flex items-center justify-between gap-2.5 ${
                compact ? 'px-2.5 py-1.5' : 'px-3 py-2'
              }`}
            >
              <label className="inline-flex items-center gap-2.5 cursor-pointer min-w-[110px] shrink-0">
                <input
                  type="checkbox"
                  checked={entry.open}
                  onChange={(e) => handleToggleDay(day.key, e.target.checked)}
                  className="h-4 w-4 rounded border-[#cbd5e1] text-[#00529C] focus:ring-[#2563eb]"
                />
                <span className="text-xs font-medium text-[#1a1b22]">{day.label}</span>
              </label>

              {entry.open ? (
                <div className="flex items-center gap-2 flex-1 justify-end">
                  <span className="text-[10px] font-semibold text-[#059669] hidden sm:inline">
                    Buka
                  </span>
                  <input
                    type="text"
                    value={entry.hours}
                    onChange={(e) => handleHoursChange(day.key, e.target.value)}
                    placeholder="08:00 - 15:00 WIB"
                    aria-label={`Jam buka hari ${day.label}`}
                    className="w-full max-w-[175px] h-8 px-2.5 rounded-xl bg-[#f8fafc] border border-[#cbd5e1] font-mono text-[11px] text-[#1a1b22] focus:outline-none focus:bg-white focus:border-[#00529C]"
                  />
                </div>
              ) : (
                <span className="text-[11px] font-mono text-[#94a3b8] px-2">Tutup</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
