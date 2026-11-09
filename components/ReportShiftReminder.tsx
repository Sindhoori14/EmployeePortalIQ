'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../lib/auth-context';
import { useMyAttendance, useTick } from './AttendanceProvider';

function playReminderChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') { ctx.resume().catch(() => {}); }
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now); // A4
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.2); // A5
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.45);
  } catch {
    // Audio context may require user interaction
  }
}

export function ReportShiftReminder() {
  const { user } = useAuth();
  const { today, nowMs } = useMyAttendance();
  const [dismissed, setDismissed] = useState(false);
  const alertedRef = useRef(false);

  // Tick every 15 seconds to update countdown
  useTick(15_000);

  if (!user || dismissed) return null;

  // Must have today's attendance record, be currently working, and not have submitted report
  if (!today || !today.config?.shiftEnd) return null;
  if (!today.record?.checkInAt || today.record?.checkOutAt) return null;
  if (today.reportGate?.submitted) return null;

  const now = new Date(nowMs());
  const currentMinOfDay = now.getHours() * 60 + now.getMinutes();
  const shiftEnd = today.config.shiftEnd;
  const minutesUntilEnd = shiftEnd - currentMinOfDay;

  // Alert when within 5 minutes before shift ends (and up to 120 minutes after if still working)
  const isTimeForAlert = minutesUntilEnd <= 5 && minutesUntilEnd >= -120;

  if (!isTimeForAlert) return null;

  // Sound chime once when alert triggers within 5 minutes before shift ends
  if (!alertedRef.current && minutesUntilEnd <= 5) {
    alertedRef.current = true;
    playReminderChime();
  }

  const shiftEndLabel = `${String(Math.floor(shiftEnd / 60)).padStart(2, '0')}:${String(shiftEnd % 60).padStart(2, '0')}`;

  return (
    <aside aria-label="Daily report reminder" className="mx-auto mb-4 w-full max-w-7xl px-4 lg:px-8">
      <div className="relative flex flex-col items-center justify-between gap-3 overflow-hidden rounded-2xl border-2 border-amber-300 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 p-4 text-white shadow-lg sm:flex-row">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 text-xl font-bold">
            ⏰
          </span>
          <div>
            <p className="text-sm font-extrabold text-white sm:text-base">
              {minutesUntilEnd > 0
                ? `Shift ends in ${minutesUntilEnd} minute${minutesUntilEnd === 1 ? '' : 's'} (${shiftEndLabel})!`
                : `Shift ended at ${shiftEndLabel}!`}
            </p>
            <p className="text-xs text-white/95">
              Please submit your daily work report before ending your shift or checking out.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/reports"
            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-bold text-amber-900 shadow hover:bg-amber-50 active:scale-95 transition"
          >
            <span>📝 Submit Report Now</span>
          </Link>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded-xl px-2.5 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white transition"
            title="Dismiss for this session"
          >
            Dismiss
          </button>
        </div>
      </div>
    </aside>
  );
}
