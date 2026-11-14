import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth, DEFAULT_BOOTSTRAP_EMAILS } from '../../lib/mockAuth';
import { ActionButton, EyeIcon, EyeOffIcon } from './ActionButton';

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
    logout,
  } = useAuth();

  // Active step in modal: 'password' | 'email' | 'pin'
  const [activeTab, setActiveTab] = useState<'password' | 'email' | 'pin'>(() => {
    const stepParam = searchParams.get('step');
    if (stepParam === 'pin' && securitySetup.emailCompleted) return 'pin';
    if (!securitySetup.passwordCompleted) return 'password';
    if (!securitySetup.emailCompleted) return 'email';
    return 'pin';
  });

  // Keep active tab synced if email gets confirmed
  useEffect(() => {
    const stepParam = searchParams.get('step');
    if (stepParam === 'pin' && securitySetup.emailCompleted) {
      setActiveTab('pin');
    } else if (securitySetup.emailCompleted && !securitySetup.pinCompleted && activeTab === 'email') {
      setActiveTab('pin');
    }
  }, [searchParams, securitySetup.emailCompleted, securitySetup.pinCompleted, activeTab]);

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
  const [emailNotice, setEmailNotice] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

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
    setEmailNotice('');

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
        setEmailError(res.error || 'Gagal mengirim permintaan verifikasi email.');
      } else {
        setEmailNotice(
          `Tautan verifikasi telah dikirim ke ${cleanNew}. Silakan periksa kotak masuk email Anda dan klik tautan untuk mengonfirmasi akun.`
        );
        setResendCooldown(60);
      }
    } finally {
      setEmailLoading(false);
    }
  };

  // Submit PIN Form
  const handleSubmitPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');
    setPinNotice('');

    const cleanPin = newPin.trim();
    if (cleanPin.length !== 12 || !/^\d{12}$/.test(cleanPin)) {
      setPinError('PIN baru wajib terdiri dari 12 angka.');
      return;
    }

    if (cleanPin !== confirmPin.trim()) {
      setPinError('Konfirmasi PIN baru tidak sesuai.');
      return;
    }

    setPinLoading(true);
    try {
      const res = await updateSecurityPin(cleanPin);
      if (!res.ok) {
        setPinError(res.error || 'Gagal menyimpan PIN baru.');
      } else {
        setPinNotice('PIN baru telah disimpan. Keamanan akun lengkap.');
        setNewPin('');
        setConfirmPin('');

        // Auto-redirect to destination dashboard
        setTimeout(() => {
          const dest = role === 'master_helpdesk' ? '/admin/helpdesk' : '/admin';
          navigate(dest, { replace: true });
        }, 900);
      }
    } finally {
      setPinLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keamanan Akun"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 overflow-y-auto"
    >
      <div className="relative w-full max-w-[620px] bg-white rounded-[16px] shadow-2xl border border-[#D9DDE6] overflow-hidden my-6">
        {/* Header */}
        <div className="p-6 md:p-8 bg-[#1E2230] text-white">
          <div className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-[#FFBD59]/20 text-[#FFBD59]">
              Wajib: Keamanan Akun
            </span>
            <span className="text-xs text-[#9DA4B4] font-medium">
              Peran: <strong className="text-white capitalize">{role?.replace('_', ' ')}</strong>
            </span>
          </div>

          {/* Progress Bar & Counter */}
          <div className="mt-5 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between text-xs font-medium mb-1.5">
              <span>Status Verifikasi</span>
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

        {/* 3 Steps Tabs */}
        <div className="flex border-b border-[#EEF0F4] bg-[#F7F8FA]">
          <button
            type="button"
            onClick={() => setActiveTab('password')}
            className={`flex-1 py-3 px-2 text-center text-xs font-medium border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'password'
                ? 'border-[#1E2230] text-[#1E2230] font-semibold bg-white'
                : 'border-transparent text-[#646B7C] hover:text-[#1E2230]'
            }`}
          >
            <span
              className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold ${
                securitySetup.passwordCompleted
                  ? 'bg-[#22C55E] text-white'
                  : 'bg-[#D9DDE6] text-[#646B7C]'
              }`}
            >
              {securitySetup.passwordCompleted ? '✓' : '1'}
            </span>
            <span>Password</span>
            <span className="hidden sm:inline text-[11px] opacity-75">
              ({securitySetup.passwordCompleted ? 'Selesai' : 'Belum'})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('email')}
            className={`flex-1 py-3 px-2 text-center text-xs font-medium border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'email'
                ? 'border-[#1E2230] text-[#1E2230] font-semibold bg-white'
                : 'border-transparent text-[#646B7C] hover:text-[#1E2230]'
            }`}
          >
            <span
              className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold ${
                securitySetup.emailCompleted
                  ? 'bg-[#22C55E] text-white'
                  : 'bg-[#D9DDE6] text-[#646B7C]'
              }`}
            >
              {securitySetup.emailCompleted ? '✓' : '2'}
            </span>
            <span>Email Akun</span>
            <span className="hidden sm:inline text-[11px] opacity-75">
              ({securitySetup.emailCompleted ? 'Selesai' : 'Menunggu'})
            </span>
          </button>

          <button
            type="button"
            disabled={!securitySetup.emailCompleted}
            onClick={() => {
              if (securitySetup.emailCompleted) {
                setActiveTab('pin');
              }
            }}
            title={
              !securitySetup.emailCompleted
                ? 'Selesaikan konfirmasi email terlebih dahulu sebelum membuat PIN baru'
                : 'Buat PIN 12 digit'
            }
            className={`flex-1 py-3 px-2 text-center text-xs font-medium border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
              !securitySetup.emailCompleted
                ? 'opacity-50 cursor-not-allowed border-transparent text-[#9DA4B4] bg-[#F7F8FA]'
                : activeTab === 'pin'
                ? 'border-[#1E2230] text-[#1E2230] font-semibold bg-white'
                : 'border-transparent text-[#646B7C] hover:text-[#1E2230]'
            }`}
          >
            <span
              className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold ${
                securitySetup.pinCompleted
                  ? 'bg-[#22C55E] text-white'
                  : 'bg-[#D9DDE6] text-[#646B7C]'
              }`}
            >
              {securitySetup.pinCompleted ? '✓' : '3'}
            </span>
            <span>PIN Baru</span>
            <span className="hidden sm:inline text-[11px] opacity-75">
              ({securitySetup.pinCompleted ? 'Selesai' : !securitySetup.emailCompleted ? 'Terkunci' : 'Belum'})
            </span>
          </button>
        </div>

        {/* Content Section */}
        <div className="p-6 md:p-8">
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
                  className="w-full px-3 py-2 text-sm border border-[#D9DDE6] rounded-[6px] focus:outline-none focus:border-[#1E2230]"
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
                    className="text-xs text-[#646B7C] hover:text-[#1E2230] inline-flex items-center gap-1"
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
                  className="w-full px-3 py-2 text-sm border border-[#D9DDE6] rounded-[6px] focus:outline-none focus:border-[#1E2230]"
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
                  className="w-full px-3 py-2 text-sm border border-[#D9DDE6] rounded-[6px] focus:outline-none focus:border-[#1E2230]"
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

              <div className="pt-2 flex items-center justify-end">
                <ActionButton type="submit" intent="start" disabled={passwordLoading}>
                  {passwordLoading ? 'Menyimpan...' : 'Simpan Kata Sandi'}
                </ActionButton>
              </div>
            </form>
          )}

          {/* TAB 2: CHANGE EMAIL */}
          {activeTab === 'email' && (
            <form onSubmit={handleSubmitEmail} className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#EEF0F4]">
                <div>
                  <h3 className="text-sm font-semibold text-[#1E2230]">Ganti Email Akun</h3>
                  <p className="text-xs text-[#646B7C]">
                    Perbarui email akun resmi Anda untuk mengaktifkan notifikasi dan pemulihan.
                  </p>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
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
                  className="w-full px-3 py-2 text-sm bg-[#F6F7FA] border border-[#D9DDE6] rounded-[6px] text-[#646B7C] cursor-not-allowed font-mono"
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
                  className="w-full px-3 py-2 text-sm border border-[#D9DDE6] rounded-[6px] focus:outline-none focus:border-[#1E2230]"
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
                  className="w-full px-3 py-2 text-sm border border-[#D9DDE6] rounded-[6px] focus:outline-none focus:border-[#1E2230]"
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
                <div className="space-y-2">
                  <div className="p-3 rounded-[6px] bg-[#FFF2F5] border border-[#FAD2DC] text-xs text-[#D62E5A] leading-relaxed">
                    {emailError}
                  </div>
                  <div className="p-3 rounded-[6px] bg-[#F7F8FA] border border-[#EEF0F4] text-[11px] text-[#646B7C] flex flex-wrap items-center justify-between gap-2">
                    <span>Sedang menguji lokal tanpa SMTP aktif?</span>
                    <Link
                      to={`/auth/verify-email?role=${role}`}
                      className="font-semibold text-[#1E2230] underline hover:text-[#2C3246]"
                    >
                      Lanjutkan dengan Simulasi Verifikasi
                    </Link>
                  </div>
                </div>
              )}

              {emailNotice && (
                <div className="p-4 rounded-[8px] bg-[#F0FDF4] border border-[#BBF7D0] text-xs text-[#16A34A] space-y-2">
                  <div className="font-medium">{emailNotice}</div>
                  <div className="pt-1 flex flex-wrap items-center justify-between gap-2 border-t border-[#BBF7D0]/50 text-[11px]">
                    <span className="text-[#646B7C]">
                      Belum menerima email? Tunggu{' '}
                      {resendCooldown > 0 ? (
                        <strong className="text-[#1E2230]">{resendCooldown} detik</strong>
                      ) : (
                        'sebentar'
                      )}
                    </span>
                    <Link
                      to={`/auth/verify-email?role=${role}`}
                      className="font-semibold text-[#1E2230] underline hover:text-[#2C3246]"
                    >
                      Buka Konfirmasi Email Langsung (Simulasi)
                    </Link>
                  </div>
                </div>
              )}

              <div className="pt-2 flex items-center justify-between gap-3">
                {resendCooldown > 0 ? (
                  <span className="text-xs text-[#646B7C]">
                    Kirim ulang dalam <strong className="tabular-nums">{resendCooldown}s</strong>
                  </span>
                ) : (
                  <span />
                )}
                <ActionButton
                  type="submit"
                  intent="start"
                  disabled={emailLoading || resendCooldown > 0}
                >
                  {emailLoading
                    ? 'Mengirim...'
                    : resendCooldown > 0
                    ? `Kirim Ulang (${resendCooldown}s)`
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
                    className="text-xs text-[#646B7C] hover:text-[#1E2230] inline-flex items-center gap-1"
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
                  placeholder="123456789012"
                  className="w-full px-3 py-2 text-sm border border-[#D9DDE6] rounded-[6px] font-mono tracking-widest focus:outline-none focus:border-[#1E2230]"
                />
                <span className="block text-[11px] text-[#646B7C] mt-1">
                  Panjang saat ini: <strong className="tabular-nums">{newPin.length}</strong> / 12 digit angka.
                </span>
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
                  className="w-full px-3 py-2 text-sm border border-[#D9DDE6] rounded-[6px] font-mono tracking-widest focus:outline-none focus:border-[#1E2230]"
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

              <div className="pt-2 flex items-center justify-end">
                <ActionButton type="submit" intent="start" disabled={pinLoading}>
                  {pinLoading ? 'Menyimpan...' : 'Simpan PIN Baru'}
                </ActionButton>
              </div>
            </form>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 px-6 md:px-8 bg-[#F6F7FA] border-t border-[#EEF0F4] flex items-center justify-between text-xs text-[#646B7C]">
          <span>Semua persyaratan di atas wajib dilengkapi.</span>
          <button
            type="button"
            onClick={logout}
            className="text-xs font-semibold text-[#D62E5A] hover:underline"
          >
            Keluar dari Sesi
          </button>
        </div>
      </div>
    </div>
  );
};

export default SecuritySetupModal;

