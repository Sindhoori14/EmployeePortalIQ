'use client';

import { useId, useState } from 'react';
import { api, ApiError } from '../lib/api';

interface ChangePasswordCardProps {
  onSuccess?: () => void;
  title?: string;
  subtitle?: string;
  compact?: boolean;
}

export function ChangePasswordCard({
  onSuccess,
  title = 'Change Password',
  subtitle = 'Update your account password. Requires your current password and at least 8 characters with letters and numbers.',
  compact = false,
}: ChangePasswordCardProps) {
  const uid = useId();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const meetsPolicy =
    newPassword.length >= 8 && /[A-Za-z]/.test(newPassword) && /\d/.test(newPassword);
  const sameAsCurrent = Boolean(currentPassword && newPassword && newPassword === currentPassword);
  const matchesConfirm = Boolean(confirmPassword && newPassword === confirmPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setMsg('');

    if (!currentPassword) {
      setErr('Please enter your current password.');
      return;
    }
    if (!meetsPolicy) {
      setErr('New password must be at least 8 characters and contain both letters and numbers.');
      return;
    }
    if (sameAsCurrent) {
      setErr('New password must be different from your current password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErr('New password and confirmation do not match.');
      return;
    }

    setBusy(true);
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: {
          currentPassword,
          newPassword,
          confirmNewPassword: confirmPassword,
        },
      });
      setMsg('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrent(false);
      setShowNew(false);
      setShowConfirm(false);
      onSuccess?.();
    } catch (ex) {
      setErr(ex instanceof ApiError ? ex.message : 'Failed to change password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`card ${compact ? 'p-5' : 'p-6'}`}>
      <h2 className="text-base font-semibold text-slate-900 mb-1">{title}</h2>
      <p className="text-sm text-slate-500 mb-5">{subtitle}</p>

      {msg && (
        <div
          role="status"
          className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          ✓ {msg}
        </div>
      )}
      {err && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          ⚠ {err}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 max-w-md" noValidate>
        <div>
          <label
            htmlFor={`${uid}-cur`}
            className="block text-xs font-semibold text-slate-700 mb-1"
          >
            Current Password
          </label>
          <div className="relative">
            <input
              id={`${uid}-cur`}
              type={showCurrent ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              disabled={busy}
              className="input w-full pr-16"
            />
            <button
              type="button"
              onClick={() => setShowCurrent((v) => !v)}
              aria-label={showCurrent ? 'Hide current password' : 'Show current password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              {showCurrent ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <div>
          <label
            htmlFor={`${uid}-new`}
            className="block text-xs font-semibold text-slate-700 mb-1"
          >
            New Password
          </label>
          <div className="relative">
            <input
              id={`${uid}-new`}
              type={showNew ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min. 8 characters with letters & numbers"
              disabled={busy}
              className="input w-full pr-16"
            />
            <button
              type="button"
              onClick={() => setShowNew((v) => !v)}
              aria-label={showNew ? 'Hide new password' : 'Show new password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              {showNew ? 'Hide' : 'Show'}
            </button>
          </div>
          {newPassword && (
            <p
              className={`mt-1.5 text-xs font-medium ${
                sameAsCurrent
                  ? 'text-red-600'
                  : meetsPolicy
                  ? 'text-emerald-600'
                  : 'text-amber-600'
              }`}
            >
              {sameAsCurrent
                ? 'Must be different from your current password'
                : meetsPolicy
                ? '✓ Meets length and character rules (8+ chars, letter & number)'
                : 'Needs 8+ characters with at least one letter and one number'}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor={`${uid}-cfm`}
            className="block text-xs font-semibold text-slate-700 mb-1"
          >
            Confirm New Password
          </label>
          <div className="relative">
            <input
              id={`${uid}-cfm`}
              type={showConfirm ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              disabled={busy}
              className="input w-full pr-16"
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              {showConfirm ? 'Hide' : 'Show'}
            </button>
          </div>
          {confirmPassword && (
            <p
              className={`mt-1.5 text-xs font-medium ${
                matchesConfirm ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              {matchesConfirm ? '✓ Passwords match' : 'Passwords do not match'}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={busy}
          className="btn !px-5 !py-2.5 text-sm disabled:opacity-50"
        >
          {busy ? 'Updating…' : 'Update Password'}
        </button>
      </form>
    </section>
  );
}
