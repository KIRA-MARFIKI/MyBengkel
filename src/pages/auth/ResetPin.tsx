import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../lib/mockAuth';
import { EyeIcon, EyeOffIcon } from '../../components/admin/ActionButton';

export const ResetPin: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { resetPinWithToken } = useAuth();

  const tokenFromUrl = searchParams.get('token') || '';
  const [token, setToken] = useState(tokenFromUrl);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (tokenFromUrl) {
      setToken(tokenFromUrl);
    }
  }, [tokenFromUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');

    const cleanToken = token.trim();
    if (!cleanToken) {
      setError('Token pemulihan PIN tidak ditemukan.');
      return;
    }

    const cleanPin = newPin.trim();
    if (cleanPin.length !== 12 || !/^\d{12}$/.test(cleanPin)) {
      setError('PIN baru wajib berupa 12 angka.');
      return;
    }

    if (cleanPin !== confirmPin.trim()) {
      setError('Konfirmasi PIN baru tidak sesuai.');
      return;
    }

    setLoading(true);
    try {
      const res = await resetPinWithToken(cleanToken, cleanPin);
      if (!res.ok) {
        setError(res.error || 'Gagal mengatur ulang PIN.');
      } else {
        setNotice('PIN telah diperbarui. Mengalihkan ke halaman masuk...');
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
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#3DA5F5]/10 text-[#1D6FC4] font-bold text-xl mb-3">
            <svg
              className="w-6 h-6 text-[#1D6FC4]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" strokeWidth="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-2xl font-condensed font-bold text-[#1E2230]">Atur Ulang PIN</h1>
          <p className="text-xs text-[#646B7C] mt-1">
            Buat PIN otorisasi baru (12 angka) untuk akun MyBengkel Anda.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Recovery Token Display / Manual Input */}
          <div>
            <label htmlFor="reset-pin-token" className="block text-xs font-semibold text-[#1E2230] mb-1">
              Token Pemulihan PIN
            </label>
            <input
              id="reset-pin-token"
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Masukkan token dari tautan email"
              className="w-full px-3 py-2 text-xs border border-[#D9DDE6] rounded-[6px] font-mono focus:outline-none focus:border-[#1E2230]"
            />
          </div>

          {/* New PIN */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="reset-new-pin" className="block text-xs font-semibold text-[#1E2230]">
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
              id="reset-new-pin"
              type={showPin ? 'text' : 'password'}
              inputMode="numeric"
              maxLength={12}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
              placeholder="123456789012"
              className="w-full px-3 py-2 text-sm border border-[#D9DDE6] rounded-[6px] font-mono tracking-widest focus:outline-none focus:border-[#1E2230]"
            />
            <span className="block text-[11px] text-[#646B7C] mt-1">
              Panjang: <strong className="tabular-nums">{newPin.length}</strong> / 12 digit angka.
            </span>
          </div>

          {/* Confirm New PIN */}
          <div>
            <label
              htmlFor="reset-confirm-pin"
              className="block text-xs font-semibold text-[#1E2230] mb-1"
            >
              Konfirmasi PIN Baru
            </label>
            <input
              id="reset-confirm-pin"
              type={showPin ? 'text' : 'password'}
              inputMode="numeric"
              maxLength={12}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Ketik ulang 12 digit PIN baru"
              className="w-full px-3 py-2 text-sm border border-[#D9DDE6] rounded-[6px] font-mono tracking-widest focus:outline-none focus:border-[#1E2230]"
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
            {loading ? 'Memproses...' : 'Simpan PIN Baru'}
          </button>

          <div className="text-center pt-2">
            <Link to="/login" className="text-xs text-[#646B7C] hover:text-[#1E2230]">
              Batalkan dan kembali ke Halaman Masuk
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ResetPin;

