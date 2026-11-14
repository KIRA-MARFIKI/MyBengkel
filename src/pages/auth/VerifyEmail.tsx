import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import {
  useAuth,
  UserRole,
  LAST_VERIFIED_ONBOARDING_KEY,
  readStoredSecuritySetup,
} from '../../lib/mockAuth';

type VerifyStatus = 'verifying' | 'confirmed' | 'already' | 'error';

const PRIVILEGED_ROLES: UserRole[] = ['admin', 'master_admin', 'master_helpdesk'];
const REDIRECT_DELAY_MS = 1800;

// Supabase PKCE codes are single use. Guard against React StrictMode double effects.
const attemptedCodes = new Set<string>();

const normalizeRole = (value: string | null | undefined): UserRole => {
  if (value && (PRIVILEGED_ROLES as string[]).includes(value)) return value as UserRole;
  return null;
};

const readJson = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

/** Reads error params that Supabase appends to the redirect URL (query or hash). */
const readAuthUrlError = (): { code: string; description: string } | null => {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const code = query.get('error_code') || hash.get('error_code') || query.get('error') || hash.get('error');
  if (!code) return null;
  const description =
    query.get('error_description') || hash.get('error_description') || '';
  return { code, description: description.replace(/\+/g, ' ') };
};

const dashboardFor = (role: UserRole) => (role === 'master_helpdesk' ? '/admin/helpdesk' : '/admin');
const pinStepFor = (role: UserRole) => `${dashboardFor(role)}?step=pin`;

export const VerifyEmail: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { markEmailVerified } = useAuth();

  const [status, setStatus] = useState<VerifyStatus>('verifying');
  const [errorMessage, setErrorMessage] = useState('');
  const [targetEmail, setTargetEmail] = useState('');
  const [pinDone, setPinDone] = useState(false);
  const handledRef = useRef(false);
  // Keep the latest auth action in a ref so its identity change never re-runs the effect
  const markEmailVerifiedRef = useRef(markEmailVerified);
  markEmailVerifiedRef.current = markEmailVerified;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const searchKey = searchParams.toString();

  useEffect(() => {
    let active = true;
    const timers: number[] = [];
    const params = new URLSearchParams(searchKey);

    const finish = (
      nextStatus: 'confirmed' | 'already',
      email: string,
      role: UserRole,
      pinCompleted: boolean
    ) => {
      if (handledRef.current || !active) return;
      handledRef.current = true;

      const resolvedRole: UserRole = role || 'admin';
      markEmailVerifiedRef.current(email, resolvedRole, pinCompleted);
      setTargetEmail(email);
      setPinDone(pinCompleted);
      setStatus(nextStatus);

      // Not tied to effect cleanup: the redirect must survive re-renders
      window.setTimeout(() => {
        navigateRef.current(
          pinCompleted ? dashboardFor(resolvedRole) : pinStepFor(resolvedRole),
          { replace: true }
        );
      }, REDIRECT_DELAY_MS);
    };

    const fail = (message: string) => {
      if (handledRef.current || !active) return;
      handledRef.current = true;
      setErrorMessage(message);
      setStatus('error');
    };

    async function run() {
      const code = params.get('code');
      const urlError = readAuthUrlError();

      const pending = readJson<{ role?: string; newEmail?: string; emailCompleted?: boolean }>(
        'mb_pending_onboarding'
      );
      const lastVerified = readJson<{ email?: string; role?: string }>(LAST_VERIFIED_ONBOARDING_KEY);

      const role: UserRole =
        normalizeRole(params.get('role')) ||
        normalizeRole(pending?.role) ||
        normalizeRole(lastVerified?.role) ||
        'admin';

      // 1. Exchange the PKCE code once (the client may already have done it on init)
      if (code && !attemptedCodes.has(code)) {
        attemptedCodes.add(code);
        const { data: existing } = await supabase.auth.getSession();
        if (!existing.session) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.warn('exchangeCodeForSession:', error.message);
          }
        }
      }

      // 2. Read the current Supabase session
      const { data: sessData } = await supabase.auth.getSession();
      const sessionUser = sessData.session?.user ?? null;
      const sessionEmail = sessionUser?.email?.toLowerCase() || '';
      const sessionConfirmed = Boolean(sessionUser?.email_confirmed_at);

      // 3. Ask the server for the real PIN state when we have a session
      let serverPinCompleted: boolean | null = null;
      if (sessionUser) {
        if (sessionConfirmed) {
          try {
            await supabase.rpc('record_security_email_changed');
          } catch {
            // ignore
          }
        }
        try {
          const { data: statusData } = await supabase.rpc('get_account_security_status');
          if (statusData?.ok) {
            serverPinCompleted = Boolean(statusData.pin_completed);
          }
        } catch {
          // ignore, handled by fallbacks below
        }
      }

      const localEmail =
        sessionEmail || pending?.newEmail?.toLowerCase() || lastVerified?.email?.toLowerCase() || '';
      const localSetup = localEmail ? readStoredSecuritySetup(localEmail, role) : null;
      const pinCompleted = serverPinCompleted ?? Boolean(localSetup?.pinCompleted);

      // A confirmation older than 2 minutes means this click is not the first one
      const confirmedAtMs = sessionUser?.email_confirmed_at
        ? new Date(sessionUser.email_confirmed_at).getTime()
        : 0;
      const confirmedEarlier = confirmedAtMs > 0 && Date.now() - confirmedAtMs > 2 * 60 * 1000;

      // Evidence that this email was ALREADY verified before this click
      const alreadyVerified =
        confirmedEarlier ||
        Boolean(pending?.emailCompleted) ||
        Boolean(localSetup?.emailCompleted && localEmail) ||
        (Boolean(lastVerified?.email) && lastVerified?.email?.toLowerCase() === localEmail);

      // 4. Supabase redirected with an error (e.g. otp_expired after a repeated click)
      if (urlError) {
        if (alreadyVerified && localEmail) {
          finish('already', localEmail, role, pinCompleted);
          return;
        }
        if (sessionUser && sessionConfirmed) {
          finish('already', sessionEmail, role, pinCompleted);
          return;
        }
        fail(
          'Tautan verifikasi sudah tidak berlaku. Silakan masuk kembali dan kirim ulang tautan verifikasi dari langkah Email Akun.'
        );
        return;
      }

      // 5. Normal path with an active, confirmed session
      if (sessionUser && sessionConfirmed) {
        finish(alreadyVerified ? 'already' : 'confirmed', sessionEmail, role, pinCompleted);
        return;
      }

      // 6. No session (e.g. PKCE verifier missing) but local evidence of a prior verification
      if (alreadyVerified && localEmail) {
        finish('already', localEmail, role, pinCompleted);
        return;
      }

      // 7. Wait briefly for a late auth event (hash based links), then fall back
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user?.email_confirmed_at && session.user.email) {
          listener.subscription.unsubscribe();
          finish('confirmed', session.user.email.toLowerCase(), role, false);
        }
      });

      timers.push(
        window.setTimeout(() => {
          listener.subscription.unsubscribe();
          if (handledRef.current || !active) return;
          if (pending?.newEmail) {
            // Local development fallback when Supabase cannot hand over a session
            finish('confirmed', pending.newEmail.toLowerCase(), role, false);
          } else {
            fail('Tautan verifikasi tidak valid atau telah kedaluwarsa.');
          }
        }, 3500)
      );
    }

    run().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Gagal memproses verifikasi email.';
      fail(message);
    });

    return () => {
      active = false;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [searchKey]);

  const isDone = status === 'confirmed' || status === 'already';

  return (
    <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center p-4">
      <style>{`
        @keyframes mbStrokeCheck { from { stroke-dashoffset: 30; } to { stroke-dashoffset: 0; } }
        @keyframes mbPopIn { 0% { transform: scale(0.6); opacity: 0; } 70% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); } }
      `}</style>

      <div className="w-full max-w-[480px] bg-white rounded-[16px] shadow-xl border border-[#D9DDE6] p-6 md:p-8 text-center overflow-hidden relative">
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1E2230]/5 text-[#1E2230] text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-[#22C55E]" />
            Verifikasi Email Akun
          </div>
        </div>

        {status === 'verifying' && (
          <div className="py-8 space-y-4">
            <div className="w-14 h-14 mx-auto border-4 border-[#EEF0F4] border-t-[#1E2230] rounded-full animate-spin" />
            <h2 className="text-lg font-condensed font-bold text-[#1E2230]">Memverifikasi Akun Anda</h2>
            <p className="text-xs text-[#646B7C]">
              Sistem sedang memeriksa tautan konfirmasi email. Mohon tunggu sebentar.
            </p>
          </div>
        )}

        {isDone && (
          <div className="py-6 space-y-5">
            <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
              {status === 'confirmed' && (
                <div className="absolute inset-0 rounded-full bg-[#22C55E]/20 animate-ping opacity-75" />
              )}
              <div
                className={`relative w-20 h-20 rounded-full flex items-center justify-center shadow-lg ${
                  status === 'confirmed'
                    ? 'bg-[#22C55E] shadow-[#22C55E]/30'
                    : 'bg-[#2563EB] shadow-[#2563EB]/30'
                }`}
                style={{ animation: 'mbPopIn 0.45s ease-out' }}
              >
                <svg
                  className="w-10 h-10 text-white"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline
                    points="20 6 9 17 4 12"
                    style={{
                      strokeDasharray: 30,
                      strokeDashoffset: 30,
                      animation: 'mbStrokeCheck 0.45s ease-out 0.2s forwards',
                    }}
                  />
                </svg>
              </div>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-[22px] md:text-[24px] font-condensed font-bold text-[#1E2230] leading-tight">
                {status === 'confirmed' ? 'Akun berhasil dikonfirmasi' : 'Akun Sudah Terverifikasi'}
              </h2>
              <p className="text-xs text-[#646B7C] max-w-[340px] mx-auto leading-relaxed">
                {status === 'already' ? (
                  <>
                    Email{' '}
                    {targetEmail && <strong className="text-[#1E2230] font-mono">{targetEmail}</strong>}{' '}
                    sudah dikonfirmasi sebelumnya. Tautan ini tidak perlu dibuka lagi.
                  </>
                ) : (
                  <>
                    Email{' '}
                    {targetEmail && <strong className="text-[#1E2230] font-mono">{targetEmail}</strong>}{' '}
                    telah terkonfirmasi aktif.
                  </>
                )}
              </p>
            </div>

            <div
              className={`p-3.5 rounded-[8px] border text-xs flex items-center justify-center gap-2 ${
                status === 'confirmed'
                  ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#16A34A]'
                  : 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1D4ED8]'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                  status === 'confirmed' ? 'bg-[#16A34A]' : 'bg-[#1D4ED8]'
                }`}
              />
              <span>
                {pinDone
                  ? 'Mengarahkan ke dashboard Anda...'
                  : 'Mengarahkan ke pembuatan PIN 12 angka...'}
              </span>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="py-6 space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-[#FFF2F5] border border-[#FAD2DC] flex items-center justify-center text-[#D62E5A]">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h2 className="text-lg font-condensed font-bold text-[#1E2230]">Verifikasi Belum Selesai</h2>
            <p className="text-xs text-[#646B7C] leading-relaxed">
              {errorMessage || 'Tautan konfirmasi tidak ditemukan atau telah kedaluwarsa.'}
            </p>
            <div className="pt-2">
              <Link
                to="/login"
                className="block w-full py-2.5 text-center text-xs font-semibold bg-[#1E2230] text-white rounded-[6px] hover:bg-[#2C3246] transition-colors"
              >
                Kembali ke Halaman Masuk
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VerifyEmail;
