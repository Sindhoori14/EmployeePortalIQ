'use client';
import { useState } from 'react';
import { api, ApiError, SessionUser } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { AuthFrame } from '../../components/AuthFrame';

function homeForRole(role?: string): string {
  if (role === 'HR_MANAGER') return '/hr-manager/dashboard';
  if (role === 'HR_SUPPORT') return '/hr-support/dashboard';
  return '/dashboard';
}

export default function ChangePasswordPage() {
  const { user, reload, logout } = useAuth();
  const [currentPassword, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const [showCur, setShowCur] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const strong = next.length >= 8 && /[A-Za-z]/.test(next) && /\d/.test(next);
  const sameAsOld = Boolean(currentPassword && next && next === currentPassword);
  const matches = Boolean(confirm && next === confirm);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setOk('');

    if (!currentPassword) {
      setErr('Please enter your current or temporary password.');
      return;
    }
    if (!strong) {
      setErr('New password must be at least 8 characters and contain both letters and numbers.');
      return;
    }
    if (sameAsOld) {
      setErr('New password must be different from your current password.');
      return;
    }
    if (!matches) {
      setErr('New password and confirmation do not match.');
      return;
    }

    setBusy(true);
    try {
      const res = await api<{ ok: boolean; user?: SessionUser }>('/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword: next, confirmNewPassword: confirm },
      });
      setOk('Password changed successfully. Loading your workspace…');
      setShowCur(false);
      setShowNext(false);
      setShowConfirm(false);
      await reload();
      window.location.href = homeForRole(res.user?.role ?? user?.role);
    } catch (ex) {
      setErr(ex instanceof ApiError ? ex.message : 'Change failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame>
      <section className="a card cp-card !overflow-y-auto" aria-labelledby="cp-title">
        <div className="mb-3">
          <h2 id="cp-title" className="!text-[22px] !leading-7 !text-left font-extrabold text-[#0B2447]">
            Set a new password
          </h2>
          <p className="mt-1 text-xs text-[#4b5ca6] leading-relaxed">
            Update your password to continue. Use at least 8 characters with a letter and a number.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3" noValidate>
          <div>
            <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#0b1a50]" htmlFor="cur">
              Current / Temporary Password
            </label>
            <div className="relative h-10">
              <input
                id="cur"
                className="!h-10 !rounded-2xl !pr-14"
                type={showCur ? 'text' : 'password'}
                placeholder="Enter current password"
                autoComplete="current-password"
                required
                disabled={busy}
                value={currentPassword}
                onChange={(e) => setCurrent(e.target.value)}
              />
              <button
                type="button"
                aria-label={showCur ? 'Hide current password' : 'Show current password'}
                className="show"
                onClick={() => setShowCur(!showCur)}
              >
                {showCur ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#0b1a50]" htmlFor="nxt">
              New Password
            </label>
            <div className="relative h-10">
              <input
                id="nxt"
                className="!h-10 !rounded-2xl !pr-14"
                type={showNext ? 'text' : 'password'}
                placeholder="8+ chars with letter & number"
                autoComplete="new-password"
                required
                minLength={8}
                disabled={busy}
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
              <button
                type="button"
                aria-label={showNext ? 'Hide new password' : 'Show new password'}
                className="show"
                onClick={() => setShowNext(!showNext)}
              >
                {showNext ? 'Hide' : 'Show'}
              </button>
            </div>
            {next && (
              <p className={`mt-1 text-[11px] font-medium ${!strong ? 'text-amber-600' : sameAsOld ? 'text-red-600' : 'text-emerald-600'}`}>
                {!strong
                  ? 'Needs 8+ characters, a letter and a number'
                  : sameAsOld
                    ? 'Must differ from your current password'
                    : '✓ Password criteria met'}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#0b1a50]" htmlFor="cfm">
              Confirm New Password
            </label>
            <div className="relative h-10">
              <input
                id="cfm"
                className="!h-10 !rounded-2xl !pr-14"
                type={showConfirm ? 'text' : 'password'}
                placeholder="Re-enter new password"
                autoComplete="new-password"
                required
                minLength={8}
                disabled={busy}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              <button
                type="button"
                aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                className="show"
                onClick={() => setShowConfirm(!showConfirm)}
              >
                {showConfirm ? 'Hide' : 'Show'}
              </button>
            </div>
            {confirm && (
              <p className={`mt-1 text-[11px] font-medium ${matches ? 'text-emerald-600' : 'text-red-600'}`}>
                {matches ? '✓ Passwords match' : 'Passwords do not match'}
              </p>
            )}
          </div>

          {err && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {err}
            </div>
          )}
          {ok && (
            <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              {ok}
            </div>
          )}

          <button
            type="submit"
            style={{ position: 'static', height: '42px', width: '100%' }}
            className="btn !mt-2"
            disabled={busy || !strong || sameAsOld || !matches}
          >
            {busy ? 'Saving…' : 'Save new password'}
          </button>
          <button
            type="button"
            className="w-full rounded-full border border-slate-200 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
            onClick={logout}
          >
            Log out
          </button>
        </form>
      </section>
    </AuthFrame>
  );
}
