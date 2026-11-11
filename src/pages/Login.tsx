import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuth, authenticateCredentials } from '../lib/mockAuth';
import { resetBodyScrollIfIdle } from '../components/admin/island/IslandSystem';
import { EyeIcon, EyeOffIcon, RefreshIcon } from '../components/admin/ActionButton';
import { siteContent } from '../content/site';

const CAPTCHA_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function generateCaptchaCode(length = 6): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    const idx = Math.floor(Math.random() * CAPTCHA_CHARS.length);
    result += CAPTCHA_CHARS[idx];
  }
  return result;
}

export const Login: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const next = searchParams.get('next') || '/';

  useEffect(() => {
    resetBodyScrollIfIdle();
  }, []);

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showPin, setShowPin] = useState<boolean>(false);

  const [captchaCode, setCaptchaCode] = useState<string>(() => generateCaptchaCode());
  const [captchaInput, setCaptchaInput] = useState<string>('');

  const [emailError, setEmailError] = useState<string>('');
  const [passwordError, setPasswordError] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');
  const [captchaError, setCaptchaError] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');

  const refreshCaptcha = useCallback(() => {
    setCaptchaCode(generateCaptchaCode());
    setCaptchaInput('');
    setCaptchaError('');
  }, []);

  const validateEmail = (value: string): boolean => {
    const trimmed = value.trim();
    if (!trimmed) {
      setEmailError('Email harus diisi.');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      setEmailError('Format email belum valid. Gunakan format email@contoh.com.');
      return false;
    }
    setEmailError('');
    return true;
  };

  const validatePassword = (value: string): boolean => {
    if (!value) {
      setPasswordError('Kata sandi harus diisi.');
      return false;
    }
    setPasswordError('');
    return true;
  };

  const validatePin = (value: string): boolean => {
    const trimmed = value.trim();
    if (!trimmed) {
      setPinError('PIN harus diisi.');
      return false;
    }
    if (!/^\d+$/.test(trimmed)) {
      setPinError('PIN hanya boleh berisi angka.');
      return false;
    }
    setPinError('');
    return true;
  };

  const validateCaptcha = (value: string): boolean => {
    const trimmed = value.trim().toUpperCase();
    if (!trimmed) {
      setCaptchaError('Kode captcha harus diisi.');
      return false;
    }
    if (trimmed !== captchaCode.toUpperCase()) {
      setCaptchaError('Kode captcha belum sesuai. Silakan coba lagi.');
      setCaptchaCode(generateCaptchaCode());
      setCaptchaInput('');
      return false;
    }
    setCaptchaError('');
    return true;
  };

  const handleBlurEmail = () => {
    validateEmail(email);
  };

  const handleBlurPassword = () => {
    validatePassword(password);
  };

  const handleBlurPin = () => {
    validatePin(pin);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password);
    const isPinValid = validatePin(pin);
    const isCaptchaValid = validateCaptcha(captchaInput);

    if (!isEmailValid || !isPasswordValid || !isPinValid || !isCaptchaValid) {
      return;
    }

    const result = authenticateCredentials(email, password, pin);
    if (!result.ok) {
      setAuthError(result.error || 'Email, kata sandi, atau PIN tidak sesuai.');
      setCaptchaCode(generateCaptchaCode());
      setCaptchaInput('');
      return;
    }

    if (result.role === 'admin') {
      login('admin', { email: email.trim() });
      const destination = next && next.startsWith('/admin') ? next : '/admin';
      navigate(destination);
    } else {
      login('customer', result.profile);
      const destination =
        next && !next.startsWith('/admin') && next !== '/' ? next : '/#booking';
      navigate(destination);
    }
  };

  return (
    <div className="min-h-screen w-full bg-paper flex flex-col md:flex-row">
      {/* Left Column (Desktop only): Carbon 50% with aesthetic background image & gradient */}
      <div className="hidden md:flex md:w-1/2 bg-carbon text-paper p-12 lg:p-16 flex-col justify-between relative overflow-hidden">
        {/* Background photo with aesthetic dark gradient overlay */}
        <div className="absolute inset-0 z-0 select-none pointer-events-none">
          <img
            src="/assets/untuk_login1.webp"
            alt=""
            width={432}
            height={768}
            className="w-full h-full object-cover object-center opacity-55"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-carbon via-carbon/60 to-carbon/85" />
          <div className="absolute inset-0 bg-gradient-to-r from-carbon/40 via-transparent to-carbon/60" />
        </div>

        {/* Wordmark top left */}
        <div className="relative z-10">
          <span className="font-condensed font-bold text-[20px] text-paper select-none">
            {siteContent.brand}
          </span>
        </div>

        {/* Hero subtitle at bottom */}
        <div className="relative z-10 max-w-[36ch]">
          <p className="font-sans font-normal text-[20px] text-paper/90 leading-relaxed">
            {siteContent.heroSubtitle}
          </p>
        </div>
      </div>

      {/* Right Column: Paper 50% (Full width on mobile) */}
      <div className="w-full md:w-1/2 bg-paper text-carbon flex flex-col justify-center items-center px-6 py-12 md:p-12 lg:p-16 pb-28">
        <div className="w-full max-w-[400px]">
          {/* Mobile wordmark above form */}
          <div className="md:hidden mb-8">
            <span className="font-condensed font-bold text-[20px] text-carbon select-none">
              {siteContent.brand}
            </span>
          </div>

          {/* Top text link: Kembali ke beranda (No arrow) */}
          <div className="mb-8">
            <Link
              to="/"
              className="font-sans text-sm text-muted hover:text-carbon underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
            >
              Kembali ke beranda
            </Link>
          </div>

          {/* Heading */}
          <h1
            data-aos="fade-up"
            className="font-condensed font-semibold text-[40px] text-carbon leading-tight mb-8"
          >
            Masuk
          </h1>

          {authError && (
            <div
              role="alert"
              className="border border-alert bg-alert/[0.06] p-4 rounded-[4px] mb-6 text-sm font-sans text-alert"
            >
              {authError}
            </div>
          )}

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            data-aos="fade-up"
            data-aos-delay="80"
            noValidate
            className="space-y-6"
          >
            {/* Email Field */}
            <div>
              <label
                htmlFor="login-email"
                className="font-sans font-medium text-[15px] text-carbon mb-2 block"
              >
                Email
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="email@contoh.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError('');
                  if (authError) setAuthError('');
                }}
                onBlur={handleBlurEmail}
                className="w-full bg-transparent border border-steel rounded-[4px] min-h-[44px] px-3 py-2 text-carbon placeholder-muted/60 focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
              />
              {emailError && (
                <p className="text-alert font-sans text-sm mt-1.5">{emailError}</p>
              )}
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label
                  htmlFor="login-password"
                  className="font-sans font-medium text-[15px] text-carbon block"
                >
                  Kata sandi
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 font-sans text-xs text-muted hover:text-carbon underline underline-offset-2 transition-colors focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
                  aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                >
                  {showPassword ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
                  <span>{showPassword ? 'Sembunyikan' : 'Tampilkan'}</span>
                </button>
              </div>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (passwordError) setPasswordError('');
                  if (authError) setAuthError('');
                }}
                onBlur={handleBlurPassword}
                className="w-full bg-transparent border border-steel rounded-[4px] min-h-[44px] px-3 py-2 text-carbon focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
              />
              {passwordError && (
                <p className="text-alert font-sans text-sm mt-1.5">{passwordError}</p>
              )}
            </div>

            {/* PIN Field (no max length restriction or max-length notice on login) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label
                  htmlFor="login-pin"
                  className="font-sans font-medium text-[15px] text-carbon block"
                >
                  PIN
                </label>
                <button
                  type="button"
                  onClick={() => setShowPin((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 font-sans text-xs text-muted hover:text-carbon underline underline-offset-2 transition-colors focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
                  aria-label={showPin ? 'Sembunyikan PIN' : 'Tampilkan PIN'}
                >
                  {showPin ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
                  <span>{showPin ? 'Sembunyikan' : 'Tampilkan'}</span>
                </button>
              </div>
              <input
                id="login-pin"
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                placeholder="Masukkan PIN"
                value={pin}
                onChange={(e) => {
                  const digitsOnly = e.target.value.replace(/\D/g, '');
                  setPin(digitsOnly);
                  if (pinError) setPinError('');
                  if (authError) setAuthError('');
                }}
                onBlur={handleBlurPin}
                className="w-full font-mono tracking-widest bg-transparent border border-steel rounded-[4px] min-h-[44px] px-3 py-2 text-carbon placeholder:tracking-normal placeholder:font-sans placeholder-muted/60 focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
              />
              {pinError && (
                <p className="text-alert font-sans text-sm mt-1.5">{pinError}</p>
              )}
            </div>

            {/* Captcha Field */}
            <div>
              <label
                htmlFor="login-captcha"
                className="font-sans font-medium text-[15px] text-carbon mb-2 block"
              >
                Captcha
              </label>
              <div className="flex items-center gap-2 mb-2.5">
                <div
                  aria-label="Kode captcha"
                  className="flex-1 min-h-[44px] px-4 py-2 rounded-[4px] border border-steel bg-carbon/[0.04] flex items-center justify-center select-none relative overflow-hidden"
                >
                  <span
                    aria-hidden="true"
                    className="font-mono font-bold text-[20px] tracking-[0.3em] text-carbon italic"
                  >
                    {captchaCode}
                  </span>
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-3 top-1/2 h-[1px] bg-carbon/25 -rotate-3"
                  />
                </div>
                <button
                  type="button"
                  onClick={refreshCaptcha}
                  className="min-h-[44px] px-3.5 py-2 rounded-[4px] border border-steel text-xs font-sans font-medium text-carbon hover:border-carbon transition-colors inline-flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2 active:scale-95"
                  title="Ganti kode captcha"
                  aria-label="Ganti kode captcha"
                >
                  <RefreshIcon size={14} />
                  <span>Ganti kode</span>
                </button>
              </div>
              <input
                id="login-captcha"
                type="text"
                autoComplete="off"
                placeholder="Ketik kode di atas"
                value={captchaInput}
                onChange={(e) => {
                  setCaptchaInput(e.target.value.toUpperCase());
                  if (captchaError) setCaptchaError('');
                }}
                className="w-full font-mono uppercase bg-transparent border border-steel rounded-[4px] min-h-[44px] px-3 py-2 text-carbon placeholder:normal-case placeholder:font-sans placeholder-muted/60 focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
              />
              {captchaError && (
                <p className="text-alert font-sans text-sm mt-1.5">{captchaError}</p>
              )}
            </div>

            {/* Lupa kata sandi: plain text, not clickable */}
            <div>
              <span className="text-sm font-sans text-muted cursor-not-allowed select-none">
                Lupa kata sandi (Segera hadir)
              </span>
            </div>

            {/* Submit button: carbon background, paper text, full width */}
            <div>
              <button
                type="submit"
                className="w-full bg-carbon text-paper font-sans font-medium text-[16px] py-3 rounded-[4px] min-h-[44px] transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
              >
                Masuk
              </button>
            </div>

            {/* Link to Register */}
            <div className="pt-2 text-center">
              <Link
                to="/register"
                className="text-sm font-sans text-muted hover:text-carbon focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
              >
                Belum punya akun?{' '}
                <span className="underline underline-offset-4 text-carbon font-medium">
                  Daftar
                </span>
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
