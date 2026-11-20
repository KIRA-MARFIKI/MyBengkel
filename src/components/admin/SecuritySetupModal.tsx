import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  useAuth,
  DEFAULT_BOOTSTRAP_EMAILS,
  LAST_VERIFIED_ONBOARDING_KEY,
} from '../../lib/mockAuth';
import { supabase } from '../../lib/supabase';
import { ActionButton, EyeIcon, EyeOffIcon } from './ActionButton';

function stripAuthErrorParamsFromUrl(keepStepPin: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    const search = new URLSearchParams(window.location.search);
    const hashRaw = window.location.hash.replace(/^#/, '');
    const hash = new URLSearchParams(hashRaw);

    const errorKeys = ['error', 'error_code', 'error_description', 'sb'];
    const hashAuthKeys = [
      'error',
      'error_code',
      'error_description',
      'access_token',
      'refresh_token',
      'expires_at',
      'expires_in',
      'token_type',
      'type',
      'message',
    ];

    let changed = false;
    for (const k of errorKeys) {
      if (search.has(k)) {
        search.delete(k);
        changed = true;
      }
    }
    for (const k of ['code', 'token_hash', 'access_token']) {
      if (search.has(k)) {
        search.delete(k);
        changed = true;
      }
    }

    for (const k of hashAuthKeys) {
      if (hash.has(k)) {
        hash.delete(k);
        changed = true;
      }
    }

    if (keepStepPin) {
      if (search.get('step') !== 'pin') {
        search.set('step', 'pin');
        changed = true;
      }
    } else if (search.has('step')) {
      search.delete('step');
      changed = true;
    }

    if (changed) {
      const nextSearch = search.toString();
      const nextHash = hash.toString();
      const nextUrl =
        window.location.pathname +
        (nextSearch ? `?${nextSearch}` : '') +
        (nextHash ? `#${nextHash}` : '');
      window.history.replaceState(null, '', nextUrl);
    }
  } catch {
    // ignore history replaceState errors
  }
}

interface SecuritySetupModalProps {
  isOpen: boolean;
}

export const SecuritySetupModal: React.FC<SecuritySetupModalProps> = ({ isOpen }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    user,
    role,
    securitySetup,
    updateSecurityPassword,
    updateSecurityEmail,
    updateSecurityPin,
    markEmailVerified,
    logout,
  } = useAuth();

  // Active step in modal: 'password' | 'email' | 'pin' (strictly sequential)
  const [activeTab, setActiveTab] = useState<'password' | 'email' | 'pin'>(() => {
    if (!securitySetup.passwordCompleted) return 'password';
    if (!securitySetup.emailCompleted) return 'email';
    return 'pin';
  });

  // Password Step State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordNotice, setPasswordNotice] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Email Step State
  const [newEmail, setNewEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailTechnicalDetail, setEmailTechnicalDetail] = useState('');
  const [emailNotice, setEmailNotice] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailChecking, setEmailChecking] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Keep active tab synced strictly in sequence (Step 1 -> Step 2 -> Step 3)
  useEffect(() => {
    let cancelled = false;
    const stepParam = searchParams.get('step');

    const verifyStepAndSyncTab = async () => {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const urlError =
        searchParams.get('error') ||
        searchParams.get('error_code') ||
        hashParams.get('error') ||
        hashParams.get('error_code');

      // If Step 1 & Step 2 are already completed, keep user on Step 3 and scrub any leftover URL error params
      if (securitySetup.passwordCompleted && securitySetup.emailCompleted) {
        if (urlError || window.location.hash.includes('error')) {
          stripAuthErrorParamsFromUrl(true);
        }
        if (!cancelled) {
          setEmailError('');
          if (!securitySetup.pinCompleted && activeTab !== 'pin') {
            setActiveTab('pin');
          }
        }
        return;
      }

      if (stepParam === 'pin') {
        let pendingEmail = '';
        let pendingPwDone = securitySetup.passwordCompleted;
        let pendingEmailSent = false;
        let pendingAlreadyVerified = securitySetup.emailCompleted;
        let lastVerifiedEmail = '';
        try {
          const pendingRaw = localStorage.getItem('mb_pending_onboarding');
          if (pendingRaw) {
            const parsed = JSON.parse(pendingRaw);
            if (parsed?.newEmail) {
              pendingEmail = String(parsed.newEmail).trim().toLowerCase();
            }
            if (parsed?.passwordCompleted) {
              pendingPwDone = true;
            }
            if (parsed?.emailSentAt) {
              pendingEmailSent = true;
            }
            if (parsed?.emailCompleted) {
              pendingAlreadyVerified = true;
            }
          }
          const verifiedRaw = localStorage.getItem(LAST_VERIFIED_ONBOARDING_KEY);
          if (verifiedRaw) {
            const parsedVerified = JSON.parse(verifiedRaw);
            if (parsedVerified?.email) {
              lastVerifiedEmail = String(parsedVerified.email).trim().toLowerCase();
            }
          }
        } catch {
          // ignore storage read error
        }

        if (!pendingPwDone && !lastVerifiedEmail) {
          if (urlError) stripAuthErrorParamsFromUrl(false);
          if (!cancelled) setActiveTab('password');
          return;
        }

        const verifiedTarget =
          pendingEmail ||
          lastVerifiedEmail ||
          (user?.email && !DEFAULT_BOOTSTRAP_EMAILS.includes(user.email.trim().toLowerCase())
            ? user.email.trim().toLowerCase()
            : '');
        const isValidVerifiedTarget =
          Boolean(verifiedTarget) && !DEFAULT_BOOTSTRAP_EMAILS.includes(verifiedTarget);

        if (
          !isValidVerifiedTarget ||
          (!pendingEmailSent && !pendingAlreadyVerified && lastVerifiedEmail !== verifiedTarget)
        ) {
          if (urlError) stripAuthErrorParamsFromUrl(false);
          if (!cancelled) {
            setActiveTab('email');
            setEmailError(
              'Wajib memasukkan email baru dan menyelesaikan verifikasi email terlebih dahulu sebelum membuka Langkah 3 (PIN Baru).'
            );
          }
          return;
        }

        const codeParam = searchParams.get('code');
        const hashMessage = (hashParams.get('message') || '').toLowerCase();
        const hasAuthCallbackToken =
          !urlError &&
          Boolean(
            codeParam ||
              searchParams.get('token_hash') ||
              searchParams.get('access_token') ||
              hashParams.get('access_token') ||
              hashParams.get('token_hash') ||
              hashParams.get('type') === 'email_change' ||
              hashParams.get('type') === 'signup' ||
              hashMessage.includes('confirmation link accepted')
          );

        if (codeParam) {
          try {
            await supabase.auth.exchangeCodeForSession(codeParam);
          } catch {
            // ignore if already exchanged
          }
        }

        let confirmedBySupabase =
          hasAuthCallbackToken ||
          pendingAlreadyVerified ||
          (Boolean(lastVerifiedEmail) && lastVerifiedEmail === verifiedTarget);

        if (!confirmedBySupabase) {
          try {
            await supabase.auth.refreshSession();
          } catch {
            // ignore refresh failure
          }
          try {
            const { data: userData } = await supabase.auth.getUser();
            const authUser = userData?.user;
            const authEmail = (authUser?.email || '').trim().toLowerCase();
            const newPendingAuthEmail = String((authUser as any)?.new_email || '')
              .trim()
              .toLowerCase();
            if (
              (authUser?.email_confirmed_at &&
                authEmail === verifiedTarget &&
                !DEFAULT_BOOTSTRAP_EMAILS.includes(authEmail)) ||
              (newPendingAuthEmail === verifiedTarget && Boolean(authUser?.email_confirmed_at))
            ) {
              confirmedBySupabase = true;
            }
          } catch {
            // ignore
          }
        }

        if (!confirmedBySupabase) {
          try {
            const { data: statusData } = await supabase.rpc('get_account_security_status', {
              p_email: verifiedTarget,
            });
            if (statusData?.ok && statusData?.email_completed) {
              confirmedBySupabase = true;
            }
          } catch {
            // ignore
          }
        }

        if (cancelled) return;

        if (confirmedBySupabase) {
          stripAuthErrorParamsFromUrl(true);
          if (!securitySetup.emailCompleted) {
            await markEmailVerified(verifiedTarget, role || 'admin', securitySetup.pinCompleted);
          }
          setEmailError('');
          setActiveTab('pin');
          return;
        } else {
          if (urlError) {
            stripAuthErrorParamsFromUrl(false);
          }
          setActiveTab('email');
          setEmailError(
            urlError
              ? `Tautan verifikasi untuk ${verifiedTarget} sudah kedaluwarsa atau telah digunakan sebelumnya. Jika Anda sudah mengklik tautan tersebut, klik "Saya Sudah Klik Tautan di Email (Cek Status)" atau kirim ulang tautan.`
              : `Verifikasi email untuk ${verifiedTarget} belum dikonfirmasi. Silakan klik tautan verifikasi resmi di kotak masuk email Anda terlebih dahulu.`
          );
          return;
        }
      }

      if (!securitySetup.passwordCompleted) {
        if (activeTab !== 'password') setActiveTab('password');
      } else if (!securitySetup.emailCompleted) {
        if (activeTab === 'pin') setActiveTab('email');
      } else if (!securitySetup.pinCompleted && activeTab === 'email') {
        setActiveTab('pin');
      }
    };

    void verifyStepAndSyncTab();
    return () => {
      cancelled = true;
    };
  }, [
    searchParams,
    securitySetup.passwordCompleted,
    securitySetup.emailCompleted,
    securitySetup.pinCompleted,
    activeTab,
    user?.email,
    role,
    markEmailVerified,
  ]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // PIN Step State
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [pinError, setPinError] = useState('');
  const [pinNotice, setPinNotice] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  if (!isOpen) return null;

  // Password Complexity Calculation
  const hasMinLength = newPassword.length >= 8;
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasLower = /[a-z]/.test(newPassword);
  const hasDigit = /\d/.test(newPassword);
  const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);
  const passwordStrengthScore =
    (hasMinLength ? 1 : 0) +
    (hasUpper ? 1 : 0) +
    (hasLower ? 1 : 0) +
    (hasDigit ? 1 : 0) +
    (hasSpecial ? 1 : 0);

  const getStrengthLabel = () => {
    if (newPassword.length === 0) return 'Belum diisi';
    if (passwordStrengthScore <= 2) return 'Lemah';
    if (passwordStrengthScore <= 4) return 'Sedang';
    return 'Kuat';
  };

  const getStrengthColor = () => {
    if (newPassword.length === 0) return 'bg-[#D9DDE6]';
    if (passwordStrengthScore <= 2) return 'bg-[#F2466F]';
    if (passwordStrengthScore <= 4) return 'bg-[#FFBD59]';
    return 'bg-[#22C55E]';
  };

  // Submit Password Form
  const handleSubmitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordNotice('');

    if (passwordStrengthScore < 3 || !hasMinLength) {
      setPasswordError(
        'Kata sandi baru minimal 8 karakter dan mengandung kombinasi huruf besar, huruf kecil, angka, serta simbol.'
      );
      return;
    }

    if (['admin123', 'masteradmin123', 'helpdesk123'].includes(newPassword.trim())) {
      setPasswordError('Kata sandi baru tidak boleh sama dengan kata sandi bawaan.');
      return;
    }

    if (currentPassword && newPassword.trim() === currentPassword.trim()) {
      setPasswordError('Kata sandi baru tidak boleh sama dengan kata sandi saat ini.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Konfirmasi kata sandi baru tidak sesuai.');
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await updateSecurityPassword(newPassword);
      if (!res.ok) {
        setPasswordError(res.error || 'Gagal memperbarui kata sandi.');
      } else {
        setPasswordNotice('Kata sandi telah diperbarui.');
        setNewPassword('');
        setConfirmPassword('');
        setCurrentPassword('');
        // Auto-switch to next incomplete step (Email)
        if (!securitySetup.emailCompleted) {
          setActiveTab('email');
        } else if (!securitySetup.pinCompleted) {
          setActiveTab('pin');
        }
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  // Submit Email Form
  const handleSubmitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError('');
    setEmailTechnicalDetail('');
    setEmailNotice('');

    if (!securitySetup.passwordCompleted) {
      setEmailError('Wajib menyelesaikan Langkah 1 (Ganti Kata Sandi) terlebih dahulu.');
      setActiveTab('password');
      return;
    }

    const cleanNew = newEmail.trim().toLowerCase();
    const cleanConfirm = confirmEmail.trim().toLowerCase();
    const current = (user?.email || '').trim().toLowerCase();

    if (!cleanNew) {
      setEmailError('Email baru wajib diisi.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanNew)) {
      setEmailError('Format email baru belum valid.');
      return;
    }

    if (cleanNew === current) {
      setEmailError('Email baru harus berbeda dengan email saat ini.');
      return;
    }

    if (DEFAULT_BOOTSTRAP_EMAILS.includes(cleanNew)) {
      setEmailError('Email baru tidak boleh menggunakan alamat email bawaan sistem.');
      return;
    }

    if (cleanNew !== cleanConfirm) {
      setEmailError('Konfirmasi email baru tidak sesuai.');
      return;
    }

    setEmailLoading(true);
    try {
      const res = await updateSecurityEmail(cleanNew);
      if (!res.ok) {
        setEmailNotice('');
        setEmailError(res.error || 'Gagal mengirim permintaan verifikasi email.');
        setEmailTechnicalDetail(res.technicalDetail || '');
      } else {
        setEmailError('');
        setEmailTechnicalDetail('');
        setEmailNotice(
          `Tautan verifikasi telah dikirim ke ${cleanNew}. Silakan buka kotak masuk email Anda dan klik tautan verifikasi untuk membuka Langkah 3 (PIN Baru).`
        );
        setResendCooldown(60);
      }
    } finally {
      setEmailLoading(false);
    }
  };

  // Check if user already clicked the email confirmation link in their inbox
  const handleCheckEmailVerification = async () => {
    setEmailError('');
    if (!securitySetup.passwordCompleted) {
      setEmailError('Wajib menyelesaikan Langkah 1 (Ganti Kata Sandi) terlebih dahulu.');
      return;
    }

    let pendingEmail = newEmail.trim().toLowerCase();
    try {
      const pendingRaw = localStorage.getItem('mb_pending_onboarding');
      if (pendingRaw) {
        const parsed = JSON.parse(pendingRaw);
        if (parsed?.newEmail) {
          pendingEmail = String(parsed.newEmail).trim().toLowerCase();
        }
      }
    } catch {
      // ignore
    }

    if (!pendingEmail || DEFAULT_BOOTSTRAP_EMAILS.includes(pendingEmail)) {
      setEmailError('Kirim tautan verifikasi ke email baru Anda terlebih dahulu.');
      return;
    }

    setEmailChecking(true);
    try {
      try {
        await supabase.auth.refreshSession();
      } catch {
        // ignore refresh error
      }
      const { data: userData } = await supabase.auth.getUser();
      const authUser = userData?.user;
      const authEmail = (authUser?.email || '').trim().toLowerCase();
      const isConfirmedInAuth =
        Boolean(authUser?.email_confirmed_at) &&
        authEmail === pendingEmail &&
        !DEFAULT_BOOTSTRAP_EMAILS.includes(authEmail);

      if (isConfirmedInAuth) {
        stripAuthErrorParamsFromUrl(true);
        await markEmailVerified(pendingEmail, role || 'admin', securitySetup.pinCompleted);
        setActiveTab('pin');
        return;
      }

      const { data: statusData } = await supabase.rpc('get_account_security_status', {
        p_email: pendingEmail,
      });
      if (statusData?.ok && statusData?.email_completed) {
        stripAuthErrorParamsFromUrl(true);
        await markEmailVerified(pendingEmail, role || 'admin', securitySetup.pinCompleted);
        setActiveTab('pin');
        return;
      }

      setEmailError(
        `Email ${pendingEmail} belum terkonfirmasi di Supabase Auth. Silakan klik tautan verifikasi di kotak masuk email Anda terlebih dahulu.`
      );
    } finally {
      setEmailChecking(false);
    }
  };

  // Submit PIN Form
  const handleSubmitPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');
    setPinNotice('');

    let pendingEmail = '';
    let pendingPwDone = false;
    let pendingEmailDone = false;
    let lastVerifiedEmail = '';
    try {
      const pendingRaw = localStorage.getItem('mb_pending_onboarding');
      if (pendingRaw) {
        const parsed = JSON.parse(pendingRaw);
        pendingEmail = String(parsed?.newEmail || '').trim().toLowerCase();
        pendingPwDone = Boolean(parsed?.passwordCompleted);
        pendingEmailDone = Boolean(parsed?.emailCompleted);
      }
      const verifiedRaw = localStorage.getItem(LAST_VERIFIED_ONBOARDING_KEY);
      if (verifiedRaw) {
        const parsedVerified = JSON.parse(verifiedRaw);
        lastVerifiedEmail = String(parsedVerified?.email || '').trim().toLowerCase();
      }
    } catch {
      // ignore storage read error
    }

    const userEmailClean = (user?.email || '').trim().toLowerCase();
    const verifiedEmailTarget =
      [pendingEmail, lastVerifiedEmail, userEmailClean].find(
        (em) => Boolean(em) && !DEFAULT_BOOTSTRAP_EMAILS.includes(em)
      ) || '';

    const isPasswordStepDone = securitySetup.passwordCompleted || pendingPwDone;
    if (!isPasswordStepDone) {
      setPinError('Wajib menyelesaikan Langkah 1 (Ganti Kata Sandi) terlebih dahulu.');
      setActiveTab('password');
      return;
    }

    const isEmailStepVerified =
      securitySetup.emailCompleted ||
      (pendingEmailDone && Boolean(verifiedEmailTarget)) ||
      (Boolean(lastVerifiedEmail) && !DEFAULT_BOOTSTRAP_EMAILS.includes(lastVerifiedEmail)) ||
      (activeTab === 'pin' && Boolean(verifiedEmailTarget));

    if (!isEmailStepVerified) {
      setPinError('Wajib menyelesaikan Langkah 2 (Verifikasi Email Akun) terlebih dahulu.');
      setActiveTab('email');
      return;
    }

    const clean12 = newPin.replace(/\D/g, '');
    const cleanConfirm12 = confirmPin.replace(/\D/g, '');
    if (clean12.length !== 12 || !/^\d{12}$/.test(clean12)) {
      setPinError('PIN baru wajib terdiri dari tepat 12 digit angka.');
      return;
    }

    if (clean12 === '123456789012') {
      setPinError('PIN baru tidak boleh sama dengan PIN bawaan sistem (123456789012).');
      return;
    }

    if (clean12 !== cleanConfirm12) {
      setPinError('Konfirmasi PIN baru tidak sesuai.');
      return;
    }

    const pin5 = clean12.slice(-5).split('').reverse().join('');

    setPinLoading(true);
    try {
      stripAuthErrorParamsFromUrl(true);

      if (!securitySetup.emailCompleted && verifiedEmailTarget) {
        await markEmailVerified(verifiedEmailTarget, role || 'admin', false);
      }

      const res = await updateSecurityPin(clean12, {
        allowVerifiedOnPinStep: isEmailStepVerified,
        verifiedEmailOverride: verifiedEmailTarget || undefined,
      });
      if (!res.ok) {
        setPinError(res.error || 'Gagal menyimpan PIN baru.');
      } else {
        setPinNotice(
          `PIN 12 digit & PIN operasional 5 digit (${pin5}) telah disimpan. Keamanan akun lengkap.`
        );
        setNewPin('');
        setConfirmPin('');

        // Auto-redirect immediately to clean destination dashboard without query/hash leftovers
        const dest = role === 'master_helpdesk' ? '/admin/helpdesk' : '/admin';
        navigate(dest, { replace: true });
      }
    } finally {
      setPinLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keamanan Akun Wajib"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4 overflow-y-auto select-none"
    >
      <div className="relative w-full max-w-[95vw] sm:max-w-[620px] max-h-[90dvh] overflow-y-auto bg-white rounded-[16px] shadow-2xl border border-[#D9DDE6] my-3 sm:my-6 select-text">
        {/* Header (Strictly non-dismissible: no X close icon) */}
        <div className="p-4 sm:p-6 md:p-8 bg-[#1E2230] text-white">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-semibold uppercase tracking-wider bg-[#FFBD59]/20 text-[#FFBD59] whitespace-nowrap">
                Wajib: Keamanan Akun (Tidak Dapat Dilewati)
              </span>
              <span className="text-[11px] sm:text-xs text-[#9DA4B4] font-medium whitespace-nowrap">
                Peran:{' '}
                <strong className="text-white">
                  {role === 'admin'
                    ? `Admin • ${user?.roleCode || 'AD-001'}`
                    : role === 'master_admin'
                    ? `Master Gudang • ${user?.roleCode || 'MG-001'}`
                    : role === 'master_helpdesk'
                    ? `Master Helpdesk • ${user?.roleCode || 'HD-001'}`
                    : role?.replace('_', ' ')}
                </strong>
              </span>
            </div>
          </div>

          {/* Progress Bar & Counter */}
          <div className="mt-4 sm:mt-5 pt-3 sm:pt-4 border-t border-white/10">
            <div className="flex items-center justify-between text-xs font-medium mb-1.5">
              <span>Status Verifikasi Berurutan (Langkah 1 → 2 → 3)</span>
              <span className="tabular-nums font-semibold text-[#FFBD59]">
                {securitySetup.completedCount} dari {securitySetup.totalSteps} Selesai
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-[#FFBD59] transition-all duration-300"
                style={{
                  width: `${(securitySetup.completedCount / securitySetup.totalSteps) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* 3 Steps Tabs (Strictly Sequential: Step 2 locked until Step 1 done; Step 3 locked until Step 1 & Step 2 done) */}
        <div className="flex border-b border-[#EEF0F4] bg-[#F7F8FA]">
          <button
            type="button"
            onClick={() => setActiveTab('password')}
            className={`flex-1 min-h-[44px] py-2.5 sm:py-3 px-1.5 sm:px-2 text-center text-[11px] sm:text-xs font-medium border-b-2 transition-colors flex items-center justify-center gap-1 sm:gap-1.5 ${
              activeTab === 'password'
                ? 'border-[#1E2230] text-[#1E2230] font-semibold bg-white'
                : 'border-transparent text-[#646B7C] hover:text-[#1E2230]'
            }`}
          >
            <span
              className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold shrink-0 ${
                securitySetup.passwordCompleted
                  ? 'bg-[#22C55E] text-white'
                  : 'bg-[#D9DDE6] text-[#646B7C]'
              }`}
            >
              {securitySetup.passwordCompleted ? '✓' : '1'}
            </span>
            <span className="whitespace-nowrap font-medium">Password</span>
            <span className="hidden sm:inline text-[11px] opacity-75">
              ({securitySetup.passwordCompleted ? 'Selesai' : 'Wajib'})
            </span>
          </button>

          <button
            type="button"
            disabled={!securitySetup.passwordCompleted}
            onClick={() => {
              if (securitySetup.passwordCompleted) {
                setActiveTab('email');
              }
            }}
            title={
              !securitySetup.passwordCompleted
                ? 'Selesaikan Langkah 1 (Ganti Kata Sandi) terlebih dahulu'
                : 'Verifikasi email akun aktif'
            }
            className={`flex-1 min-h-[44px] py-2.5 sm:py-3 px-1.5 sm:px-2 text-center text-[11px] sm:text-xs font-medium border-b-2 transition-colors flex items-center justify-center gap-1 sm:gap-1.5 ${
              !securitySetup.passwordCompleted
                ? 'opacity-50 cursor-not-allowed border-transparent text-[#9DA4B4] bg-[#F7F8FA]'
                : activeTab === 'email'
                ? 'border-[#1E2230] text-[#1E2230] font-semibold bg-white'
                : 'border-transparent text-[#646B7C] hover:text-[#1E2230]'
            }`}
          >
            <span
              className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold shrink-0 ${
                securitySetup.emailCompleted
                  ? 'bg-[#22C55E] text-white'
                  : 'bg-[#D9DDE6] text-[#646B7C]'
              }`}
            >
              {securitySetup.emailCompleted ? '✓' : '2'}
            </span>
            <span className="whitespace-nowrap font-medium">Email Akun</span>
            <span className="hidden sm:inline text-[11px] opacity-75">
              ({securitySetup.emailCompleted ? 'Selesai' : !securitySetup.passwordCompleted ? 'Terkunci' : 'Menunggu'})
            </span>
          </button>

          <button
            type="button"
            disabled={!securitySetup.passwordCompleted || !securitySetup.emailCompleted}
            onClick={() => {
              if (securitySetup.passwordCompleted && securitySetup.emailCompleted) {
                setActiveTab('pin');
              }
            }}
            title={
              !securitySetup.passwordCompleted || !securitySetup.emailCompleted
                ? 'Selesaikan Langkah 1 dan konfirmasi email di Langkah 2 terlebih dahulu sebelum membuat PIN baru'
                : 'Buat PIN 12 digit'
            }
            className={`flex-1 min-h-[44px] py-2.5 sm:py-3 px-1.5 sm:px-2 text-center text-[11px] sm:text-xs font-medium border-b-2 transition-colors flex items-center justify-center gap-1 sm:gap-1.5 ${
              !securitySetup.passwordCompleted || !securitySetup.emailCompleted
                ? 'opacity-50 cursor-not-allowed border-transparent text-[#9DA4B4] bg-[#F7F8FA]'
                : activeTab === 'pin'
                ? 'border-[#1E2230] text-[#1E2230] font-semibold bg-white'
                : 'border-transparent text-[#646B7C] hover:text-[#1E2230]'
            }`}
          >
            <span
              className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold shrink-0 ${
                securitySetup.pinCompleted
                  ? 'bg-[#22C55E] text-white'
                  : 'bg-[#D9DDE6] text-[#646B7C]'
              }`}
            >
              {securitySetup.pinCompleted ? '✓' : '3'}
            </span>
            <span className="whitespace-nowrap font-medium">PIN Baru</span>
            <span className="hidden sm:inline text-[11px] opacity-75">
              ({securitySetup.pinCompleted ? 'Selesai' : !securitySetup.emailCompleted ? 'Terkunci' : 'Belum'})
            </span>
          </button>
        </div>

        {/* Content Section */}
        <div className="p-4 sm:p-6 md:p-8">
          {/* TAB 1: CHANGE PASSWORD */}
          {activeTab === 'password' && (
            <form onSubmit={handleSubmitPassword} className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#EEF0F4]">
                <div>
                  <h3 className="text-sm font-semibold text-[#1E2230]">Ganti Kata Sandi</h3>
                  <p className="text-xs text-[#646B7C]">
                    Buat kata sandi baru yang kuat untuk menggantikan kata sandi bawaan.
                  </p>
                </div>
                {securitySetup.passwordCompleted && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#22C55E]/10 text-[#16A34A]">
                    Selesai
                  </span>
                )}
              </div>

              {/* Current Password Field */}
              <div>
                <label
                  htmlFor="setup-current-password"
                  className="block text-xs font-semibold text-[#1E2230] mb-1"
                >
                  Kata Sandi Saat Ini (Opsional untuk verifikasi)
                </label>
                <input
                  id="setup-current-password"
                  type={showPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Masukkan kata sandi saat ini"
                  className="w-full min-h-[44px] px-3 py-2 text-sm border border-[#D9DDE6] rounded-[6px] focus:outline-none focus:border-[#1E2230]"
                />
              </div>

              {/* New Password Field */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="setup-new-password"
                    className="block text-xs font-semibold text-[#1E2230]"
                  >
                    Kata Sandi Baru
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="min-h-[44px] md:min-h-0 px-1 text-xs text-[#646B7C] hover:text-[#1E2230] inline-flex items-center gap-1"
                  >
                    {showPassword ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
                    <span>{showPassword ? 'Sembunyikan' : 'Tampilkan'}</span>
                  </button>
                </div>
                <input
                  id="setup-new-password"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimal 8 karakter campuran"
                  className="w-full min-h-[44px] px-3 py-2 text-sm border border-[#D9DDE6] rounded-[6px] focus:outline-none focus:border-[#1E2230]"
                />

                {/* Password Strength Meter */}
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#646B7C]">Kekuatan kata sandi:</span>
                    <span className="font-semibold text-[#1E2230]">{getStrengthLabel()}</span>
                  </div>
                  <div className="w-full h-1.5 bg-[#EEF0F4] rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getStrengthColor()} transition-all`}
                      style={{ width: `${(passwordStrengthScore / 5) * 100}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[11px] text-[#646B7C] pt-1">
                    <span className={hasMinLength ? 'text-[#16A34A] font-medium' : ''}>
                      {hasMinLength ? '✓' : '•'} Min. 8 karakter
                    </span>
                    <span className={hasUpper ? 'text-[#16A34A] font-medium' : ''}>
                      {hasUpper ? '✓' : '•'} Huruf besar
                    </span>
                    <span className={hasLower ? 'text-[#16A34A] font-medium' : ''}>
                      {hasLower ? '✓' : '•'} Huruf kecil
                    </span>
                    <span className={hasDigit && hasSpecial ? 'text-[#16A34A] font-medium' : ''}>
                      {hasDigit && hasSpecial ? '✓' : '•'} Angka & simbol
                    </span>
                  </div>
                </div>
              </div>

              {/* Confirm New Password */}
              <div>
                <label
                  htmlFor="setup-confirm-password"
                  className="block text-xs font-semibold text-[#1E2230] mb-1"
                >
                  Konfirmasi Kata Sandi Baru
                </label>
                <input
                  id="setup-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ketik ulang kata sandi baru"
                  className="w-full min-h-[44px] px-3 py-2 text-sm border border-[#D9DDE6] rounded-[6px] focus:outline-none focus:border-[#1E2230]"
                />
              </div>

              {passwordError && (
                <div className="p-3 rounded-[6px] bg-[#FFF2F5] border border-[#FAD2DC] text-xs text-[#D62E5A]">
                  {passwordError}
                </div>
              )}

              {passwordNotice && (
                <div className="p-3 rounded-[6px] bg-[#F0FDF4] border border-[#BBF7D0] text-xs text-[#16A34A]">
                  {passwordNotice}
                </div>
              )}

              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-end">
                <ActionButton
                  type="submit"
                  intent="start"
                  disabled={passwordLoading}
                  className="w-full sm:w-auto justify-center min-h-[44px]"
                >
                  {passwordLoading ? 'Menyimpan...' : 'Simpan Kata Sandi'}
                </ActionButton>
              </div>
            </form>
          )}

          {/* TAB 2: CHANGE EMAIL */}
          {activeTab === 'email' && (
            <form onSubmit={handleSubmitEmail} className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2 pb-2 border-b border-[#EEF0F4]">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-[#1E2230]">Ganti Email Akun</h3>
                  <p className="text-xs text-[#646B7C]">
                    Perbarui email akun resmi Anda untuk mengaktifkan notifikasi dan pemulihan.
                  </p>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap shrink-0 ${
                    securitySetup.emailCompleted
                      ? 'bg-[#22C55E]/10 text-[#16A34A]'
                      : 'bg-[#FFBD59]/20 text-[#B45309]'
                  }`}
                >
                  {securitySetup.emailCompleted ? 'Selesai' : 'Menunggu Konfirmasi'}
                </span>
              </div>

              {/* Current Email (Read-only) */}
              <div>
                <label className="block text-xs font-semibold text-[#646B7C] mb-1">
                  Email Akun Saat Ini (Terdaftar)
                </label>
                <input
                  type="text"
                  readOnly
                  disabled
                  value={user?.email || ''}
                  className="w-full min-h-[44px] px-3 py-2 text-sm bg-[#F6F7FA] border border-[#D9DDE6] rounded-[6px] text-[#646B7C] cursor-not-allowed font-mono"
                />
              </div>

              {/* New Email */}
              <div>
                <label
                  htmlFor="setup-new-email"
                  className="block text-xs font-semibold text-[#1E2230] mb-1"
                >
                  Email Baru
                </label>
                <input
                  id="setup-new-email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="nama@domain-anda.com"
                  className="w-full min-h-[44px] px-3 py-2 text-sm border border-[#D9DDE6] rounded-[6px] focus:outline-none focus:border-[#1E2230]"
                />
              </div>

              {/* Confirm New Email */}
              <div>
                <label
                  htmlFor="setup-confirm-email"
                  className="block text-xs font-semibold text-[#1E2230] mb-1"
                >
                  Konfirmasi Email Baru
                </label>
                <input
                  id="setup-confirm-email"
                  type="email"
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                  placeholder="Ketik ulang email baru"
                  className="w-full min-h-[44px] px-3 py-2 text-sm border border-[#D9DDE6] rounded-[6px] focus:outline-none focus:border-[#1E2230]"
                />
              </div>

              <div className="p-3 rounded-[6px] bg-[#F7F8FA] border border-[#EEF0F4] text-xs text-[#646B7C] space-y-1">
                <p className="font-semibold text-[#1E2230]">Catatan Konfirmasi Email:</p>
                <p>
                  Sesuai standar keamanan Supabase Auth, tautan verifikasi akan dikirimkan. Langkah 3
                  (Pembuatan PIN Baru) akan terbuka secara otomatis setelah Anda mengonfirmasi email
                  melalui tautan yang dikirim.
                </p>
              </div>

              {emailError && (
                <div
                  role="alert"
                  className="p-3.5 rounded-[8px] bg-[#FFF2F5] border border-[#FAD2DC] text-xs text-[#D62E5A] leading-relaxed space-y-1.5"
                >
                  <div className="font-bold uppercase tracking-wide text-[11px] text-[#B4234A]">
                    Email verifikasi GAGAL dikirim
                  </div>
                  <p className="font-medium">{emailError}</p>
                  {emailTechnicalDetail && (
                    <p className="font-mono text-[11px] text-[#9F1239] bg-white/70 px-2 py-1 rounded border border-[#FAD2DC] break-words">
                      {emailTechnicalDetail}
                    </p>
                  )}
                </div>
              )}

              {emailNotice && (
                <div className="p-4 rounded-[8px] bg-[#F0FDF4] border border-[#BBF7D0] text-xs text-[#16A34A] space-y-2.5">
                  <div className="font-medium">{emailNotice}</div>
                  <p className="text-[11px] text-[#4B5563] leading-relaxed">
                    Jika email belum masuk ke Inbox atau Spam dalam 1 menit, pastikan opsi &apos;Secure email change&apos; dimatikan dan SMTP Gmail aktif di Supabase.
                  </p>
                  <div className="pt-1 flex flex-wrap items-center justify-between gap-2 border-t border-[#BBF7D0]/50 text-[11px]">
                    <span className="text-[#646B7C]">
                      Belum menerima email? Tunggu{' '}
                      {resendCooldown > 0 ? (
                        <strong className="text-[#1E2230]">{resendCooldown} detik</strong>
                      ) : (
                        'sebentar'
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={handleCheckEmailVerification}
                      disabled={emailChecking}
                      className="font-semibold text-[#1E2230] underline hover:text-[#2C3246] disabled:opacity-50"
                    >
                      {emailChecking
                        ? 'Memeriksa Status di Supabase...'
                        : 'Saya Sudah Klik Tautan di Email (Cek Status)'}
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                {resendCooldown > 0 ? (
                  <span className="text-xs text-[#646B7C] text-center sm:text-left">
                    Tunggu <strong className="tabular-nums">{resendCooldown} dtk</strong> untuk mengirim ulang
                  </span>
                ) : (
                  <span className="hidden sm:inline" />
                )}
                <ActionButton
                  type="submit"
                  intent="start"
                  disabled={emailLoading || resendCooldown > 0}
                  className="w-full sm:w-auto justify-center min-h-[44px]"
                >
                  {emailLoading
                    ? 'Mengirim...'
                    : resendCooldown > 0
                    ? `Kirim ulang dalam ${resendCooldown} dtk`
                    : 'Kirim Tautan Verifikasi Email'}
                </ActionButton>
              </div>
            </form>
          )}

          {/* TAB 3: CREATE NEW PIN */}
          {activeTab === 'pin' && (
            <form onSubmit={handleSubmitPin} className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#EEF0F4]">
                <div>
                  <h3 className="text-sm font-semibold text-[#1E2230]">Buat PIN Baru</h3>
                  <p className="text-xs text-[#646B7C]">
                    Tetapkan PIN rahasia 12 angka untuk otorisasi tindakan sensitif.
                  </p>
                </div>
                {securitySetup.pinCompleted && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#22C55E]/10 text-[#16A34A]">
                    Selesai
                  </span>
                )}
              </div>

              {/* New PIN */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="setup-new-pin"
                    className="block text-xs font-semibold text-[#1E2230]"
                  >
                    PIN Baru (12 Digit Angka)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPin((s) => !s)}
                    className="min-h-[44px] md:min-h-0 px-1 text-xs text-[#646B7C] hover:text-[#1E2230] inline-flex items-center gap-1"
                  >
                    {showPin ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
                    <span>{showPin ? 'Sembunyikan' : 'Tampilkan'}</span>
                  </button>
                </div>
                <input
                  id="setup-new-pin"
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={12}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="098765432112"
                  className="w-full min-h-[44px] px-3 py-2 text-sm border border-[#D9DDE6] rounded-[6px] font-mono tracking-widest focus:outline-none focus:border-[#1E2230]"
                />
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#646B7C]">
                  <span>
                    Panjang saat ini: <strong className="tabular-nums">{newPin.length}</strong> / 12 digit angka.
                  </span>
                  <span>
                    PIN Operasional / Gudang 5 Digit (Otomatis):{' '}
                    <strong className="font-mono text-[#1E2230] bg-[#EEF0F4] px-1.5 py-0.5 rounded">
                      {newPin.length >= 5
                        ? newPin.replace(/\D/g, '').slice(-5).split('').reverse().join('')
                        : '-----'}
                    </strong>
                  </span>
                </div>
              </div>

              {/* Confirm New PIN */}
              <div>
                <label
                  htmlFor="setup-confirm-pin"
                  className="block text-xs font-semibold text-[#1E2230] mb-1"
                >
                  Konfirmasi PIN Baru
                </label>
                <input
                  id="setup-confirm-pin"
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={12}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="Ketik ulang 12 digit PIN baru"
                  className="w-full min-h-[44px] px-3 py-2 text-sm border border-[#D9DDE6] rounded-[6px] font-mono tracking-widest focus:outline-none focus:border-[#1E2230]"
                />
              </div>

              {pinError && (
                <div className="p-3 rounded-[6px] bg-[#FFF2F5] border border-[#FAD2DC] text-xs text-[#D62E5A]">
                  {pinError}
                </div>
              )}

              {pinNotice && (
                <div className="p-3 rounded-[6px] bg-[#F0FDF4] border border-[#BBF7D0] text-xs text-[#16A34A]">
                  {pinNotice}
                </div>
              )}

              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-end">
                <ActionButton
                  type="submit"
                  intent="start"
                  disabled={pinLoading}
                  className="w-full sm:w-auto justify-center min-h-[44px]"
                >
                  {pinLoading ? 'Menyimpan...' : 'Simpan PIN Baru'}
                </ActionButton>
              </div>
            </form>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 px-4 sm:px-6 md:px-8 bg-[#F6F7FA] border-t border-[#EEF0F4] flex flex-col md:flex-row items-center justify-center md:justify-between gap-2 text-xs text-[#646B7C]">
          <span className="text-center md:text-left">
            Seluruh 3 langkah keamanan wajib diselesaikan secara berurutan untuk membuka akses dashboard.
          </span>
          <button
            type="button"
            onClick={logout}
            className="text-xs font-semibold text-[#D62E5A] hover:underline shrink-0"
          >
            Keluar dari Sesi
          </button>
        </div>
      </div>
    </div>
  );
};

export default SecuritySetupModal;

