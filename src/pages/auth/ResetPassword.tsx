import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../lib/mockAuth';
import { supabase } from '../../lib/supabase';
import { EyeIcon, EyeOffIcon } from '../../components/admin/ActionButton';

export const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const { resetPasswordWithToken, logout } = useAuth();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sessionChecked, setSessionChecked] = useState(false);
  const [isSessionValid, setIsSessionValid] = useState(true);

  // Validate recovery session on mount
  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      try {
        const { data } = await supabase.auth.getSession();
        if (mounted) {
          // If session exists or hash contains access_token / type=recovery
          const hash = window.location.hash || '';
          const isRecovery =
            Boolean(data.session) ||
            hash.includes('type=recovery') ||
            hash.includes('access_token') ||
            typeof sessionStorage !== 'undefined' &&
              Boolean(sessionStorage.getItem('mb_mock_pw_reset_token'));

          setIsSessionValid(isRecovery);
          setSessionChecked(true);
        }
      } catch {
        if (mounted) {
          setIsSessionValid(true);
          setSessionChecked(true);
        }
      }
    }

    checkSession();
    return () => {
      mounted = false;
    };
  }, []);

  // Password Complexity
  const hasMinLength = newPassword.length >= 8;
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasLower = /[a-z]/.test(newPassword);
  const hasDigit = /\d/.test(newPassword);
  const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);
  const score =
    (hasMinLength ? 1 : 0) +
    (hasUpper ? 1 : 0) +
    (hasLower ? 1 : 0) +
    (hasDigit ? 1 : 0) +
    (hasSpecial ? 1 : 0);

  const getStrengthLabel = () => {
    if (newPassword.length === 0) return 'Belum diisi';
    if (score <= 2) return 'Lemah';
    if (score <= 4) return 'Sedang';
    return 'Kuat';
  };

  const getStrengthColor = () => {
    if (newPassword.length === 0) return 'bg-[#D9DDE6]';
    if (score <= 2) return 'bg-[#F2466F]';
    if (score <= 4) return 'bg-[#FFBD59]';
    return 'bg-[#22C55E]';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');

    if (score < 3 || !hasMinLength) {
      setError(
        'Kata sandi baru minimal 8 karakter dan mengandung kombinasi huruf besar, huruf kecil, angka, serta simbol.'
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Konfirmasi kata sandi baru tidak sesuai.');
      return;
    }

    setLoading(true);
    try {
      const res = await resetPasswordWithToken(newPassword);
      if (!res.ok) {
        setError(res.error || 'Gagal mengatur ulang kata sandi.');
      } else {
        setNotice('Kata sandi telah diperbarui. Mengalihkan ke halaman masuk...');
        // Invalidate current session for security
        logout();
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#1E2230] text-[#EEF0F4] flex items-center justify-center p-4">
      <div className="w-full max-w-[460px] bg-white rounded-[16px] shadow-2xl border border-[#EEF0F4] text-[#1E2230] p-8 md:p-10">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#FFBD59]/20 text-[#B45309] font-bold text-xl mb-3">
            🔑
          </div>
          <h1 className="text-2xl font-condensed font-bold text-[#1E2230]">
            Atur Ulang Kata Sandi
          </h1>
          <p className="text-xs text-[#646B7C] mt-1">
            Masukkan kata sandi baru Anda untuk akun MyBengkel.
          </p>
        </div>

        {sessionChecked && !isSessionValid ? (
          <div className="space-y-4">
            <div className="p-4 rounded-[8px] bg-[#FFF2F5] border border-[#FAD2DC] text-xs text-[#D62E5A] leading-relaxed">
              Tautan pemulihan kata sandi tidak valid atau telah kedaluwarsa. Silakan lakukan
              permintaan tautan baru.
            </div>
            <Link
              to="/login"
              className="block w-full py-2.5 text-center text-xs font-semibold bg-[#1E2230] text-white rounded-[6px] hover:bg-[#2C3246] transition-colors"
            >
              Kembali ke Halaman Masuk
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* New Password */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="reset-new-password"
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
                id="reset-new-password"
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimal 8 karakter campuran"
                className="w-full px-3 py-2 text-sm border border-[#D9DDE6] rounded-[6px] focus:outline-none focus:border-[#1E2230]"
              />

              {/* Password Strength Meter */}
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#646B7C]">Kekuatan kata sandi:</span>
                  <span className="font-semibold text-[#1E2230]">{getStrengthLabel()}</span>
                </div>
                <div className="w-full h-1.5 bg-[#EEF0F4] rounded-full overflow-hidden">
                  <div
                    className={`h-full ${getStrengthColor()} transition-all`}
                    style={{ width: `${(score / 5) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Confirm New Password */}
            <div>
              <label
                htmlFor="reset-confirm-password"
                className="block text-xs font-semibold text-[#1E2230] mb-1"
              >
                Konfirmasi Kata Sandi Baru
              </label>
              <input
                id="reset-confirm-password"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ketik ulang kata sandi baru"
                className="w-full px-3 py-2 text-sm border border-[#D9DDE6] rounded-[6px] focus:outline-none focus:border-[#1E2230]"
              />
            </div>

            {error && (
              <div className="p-3 rounded-[6px] bg-[#FFF2F5] border border-[#FAD2DC] text-xs text-[#D62E5A]">
                {error}
              </div>
            )}

            {notice && (
              <div className="p-3 rounded-[6px] bg-[#F0FDF4] border border-[#BBF7D0] text-xs text-[#16A34A]">
                {notice}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#1E2230] text-white font-medium text-sm rounded-[6px] hover:bg-[#2C3246] transition-colors disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Memproses...' : 'Simpan Kata Sandi Baru'}
            </button>

            <div className="text-center pt-2">
              <Link to="/login" className="text-xs text-[#646B7C] hover:text-[#1E2230]">
                Batalkan dan kembali ke Halaman Masuk
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;

