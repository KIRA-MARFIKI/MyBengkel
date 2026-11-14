import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/mockAuth';
import { resetBodyScrollIfIdle } from '../components/admin/island/IslandSystem';
import { EyeIcon, EyeOffIcon } from '../components/admin/ActionButton';
import { gsap } from '../lib/gsap';

interface RegisterErrors {
  name?: string;
  address?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  pin?: string;
  plateNumber?: string;
  motorType?: string;
  customMotorType?: string;
  vehicle?: string;
  engineNumber?: string;
  frameNumber?: string;
  agreeTerms?: string;
}

export const Register: React.FC = () => {
  const navigate = useNavigate();
  const { registerCustomer } = useAuth();

  useEffect(() => {
    resetBodyScrollIfIdle();
  }, []);

  // Form states
  const [name, setName] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showPin, setShowPin] = useState<boolean>(false);

  const [plateNumber, setPlateNumber] = useState<string>('');
  const [motorType, setMotorType] = useState<string>('');
  const [customMotorType, setCustomMotorType] = useState<string>('');
  const [vehicle, setVehicle] = useState<string>('');
  const [engineNumber, setEngineNumber] = useState<string>('');
  const [frameNumber, setFrameNumber] = useState<string>('');
  const [agreeTerms, setAgreeTerms] = useState<boolean>(false);

  // Validation errors
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [submittedWithErrors, setSubmittedWithErrors] = useState<boolean>(false);

  const lainnyaWrapperRef = useRef<HTMLDivElement>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  // GSAP animation for "Lainnya" text input height reveal
  useEffect(() => {
    const el = lainnyaWrapperRef.current;
    if (!el) return;

    if (motorType === 'Lainnya') {
      gsap.to(el, {
        height: 'auto',
        opacity: 1,
        duration: 0.3,
        ease: 'power2.out',
        display: 'block',
      });
    } else {
      gsap.to(el, {
        height: 0,
        opacity: 0,
        duration: 0.3,
        ease: 'power2.in',
        onComplete: () => {
          if (el) el.style.display = 'none';
        },
      });
      setCustomMotorType('');
      setErrors((prev) => ({ ...prev, customMotorType: undefined }));
    }
  }, [motorType]);

  // Field validators
  const validateName = (val: string): string | undefined => {
    if (!val.trim()) return 'Nama lengkap harus diisi sesuai KTP atau identitas.';
    return undefined;
  };

  const validateAddress = (val: string): string | undefined => {
    if (!val.trim()) return 'Alamat harus diisi sesuai domisili atau STNK.';
    return undefined;
  };

  const validateEmail = (val: string): string | undefined => {
    const trimmed = val.trim();
    if (!trimmed) return 'Email harus diisi.';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) return 'Format email belum valid. Gunakan format email@contoh.com.';
    return undefined;
  };

  const validatePassword = (val: string): string | undefined => {
    if (!val) return 'Kata sandi harus diisi.';
    if (val.length < 8) return 'Kata sandi minimal 8 karakter.';
    return undefined;
  };

  const validateConfirmPassword = (val: string, pwdVal: string): string | undefined => {
    if (!val) return 'Konfirmasi kata sandi harus diisi.';
    if (val !== pwdVal) return 'Konfirmasi kata sandi harus sama dengan kata sandi.';
    return undefined;
  };

  const validatePin = (val: string): string | undefined => {
    const trimmed = val.trim();
    if (!trimmed) return 'PIN harus diisi.';
    if (!/^\d+$/.test(trimmed)) return 'PIN hanya boleh berisi angka.';
    if (trimmed.length > 6) return 'PIN maksimal 6 angka.';
    return undefined;
  };

  const validatePlateNumber = (val: string): string | undefined => {
    const trimmed = val.trim().toUpperCase();
    if (!trimmed) return 'Nomor plat belum sesuai format. Cek di STNK.';
    // Pattern: one or two letters, one to four digits, up to three letters, spaces allowed
    const plateRegex = /^[A-Z]{1,2}\s?[0-9]{1,4}\s?[A-Z]{1,3}$/;
    if (!plateRegex.test(trimmed)) {
      return 'Nomor plat belum sesuai format. Cek di STNK.';
    }
    return undefined;
  };

  const validateMotorType = (val: string): string | undefined => {
    if (!val) return 'Pilih jenis motor dulu.';
    return undefined;
  };

  const validateCustomMotorType = (val: string, mType: string): string | undefined => {
    if (mType === 'Lainnya' && !val.trim()) {
      return 'Tulis jenis motor yang Anda gunakan.';
    }
    return undefined;
  };

  const validateVehicle = (val: string): string | undefined => {
    if (!val.trim()) return 'Tulis nama kendaraan sesuai STNK.';
    return undefined;
  };

  const validateEngineNumber = (val: string): string | undefined => {
    const trimmed = val.trim();
    if (!trimmed) return 'Nomor mesin harus diisi sesuai STNK.';
    // Letters, digits, and hyphens allowed
    const engineRegex = /^[A-Za-z0-9-]+$/;
    if (!engineRegex.test(trimmed)) {
      return 'Nomor mesin hanya boleh berisi huruf, angka, dan tanda hubung (-).';
    }
    return undefined;
  };

  const validateFrameNumber = (val: string): string | undefined => {
    const trimmed = val.trim();
    if (!trimmed) return 'Nomor rangka harus diisi sesuai STNK.';
    // Letters, digits, and hyphens allowed. Length is not enforced.
    const frameRegex = /^[A-Za-z0-9-]+$/;
    if (!frameRegex.test(trimmed)) {
      return 'Nomor rangka hanya boleh berisi huruf, angka, dan tanda hubung (-).';
    }
    return undefined;
  };

  const validateTerms = (val: boolean): string | undefined => {
    if (!val) return 'Centang persetujuan untuk melanjutkan.';
    return undefined;
  };

  // Blur handlers
  const handleBlur = (field: keyof RegisterErrors) => {
    let err: string | undefined;
    switch (field) {
      case 'name':
        err = validateName(name);
        break;
      case 'address':
        err = validateAddress(address);
        break;
      case 'email':
        err = validateEmail(email);
        break;
      case 'password':
        err = validatePassword(password);
        break;
      case 'confirmPassword':
        err = validateConfirmPassword(confirmPassword, password);
        break;
      case 'pin':
        err = validatePin(pin);
        break;
      case 'plateNumber':
        err = validatePlateNumber(plateNumber);
        break;
      case 'motorType':
        err = validateMotorType(motorType);
        break;
      case 'customMotorType':
        err = validateCustomMotorType(customMotorType, motorType);
        break;
      case 'vehicle':
        err = validateVehicle(vehicle);
        break;
      case 'engineNumber':
        err = validateEngineNumber(engineNumber);
        break;
      case 'frameNumber':
        err = validateFrameNumber(frameNumber);
        break;
      case 'agreeTerms':
        err = validateTerms(agreeTerms);
        break;
    }
    setErrors((prev) => ({ ...prev, [field]: err }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: RegisterErrors = {
      name: validateName(name),
      address: validateAddress(address),
      email: validateEmail(email),
      password: validatePassword(password),
      confirmPassword: validateConfirmPassword(confirmPassword, password),
      pin: validatePin(pin),
      plateNumber: validatePlateNumber(plateNumber),
      motorType: validateMotorType(motorType),
      customMotorType: validateCustomMotorType(customMotorType, motorType),
      vehicle: validateVehicle(vehicle),
      engineNumber: validateEngineNumber(engineNumber),
      frameNumber: validateFrameNumber(frameNumber),
      agreeTerms: validateTerms(agreeTerms),
    };

    // Filter undefined errors
    const activeErrors: RegisterErrors = {};
    for (const [key, val] of Object.entries(newErrors)) {
      if (val) {
        activeErrors[key as keyof RegisterErrors] = val;
      }
    }

    if (Object.keys(activeErrors).length > 0) {
      setErrors(activeErrors);
      setSubmittedWithErrors(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSubmittedWithErrors(false);
    const resolvedMotorType = motorType === 'Lainnya' ? customMotorType.trim() : motorType.trim();
    registerCustomer({
      email: email.trim(),
      name: name.trim(),
      plate: plateNumber.trim().toUpperCase(),
      engineNo: engineNumber.trim().toUpperCase(),
      frameNo: frameNumber.trim().toUpperCase(),
      address: address.trim(),
      motorType: resolvedMotorType,
      vehicleModel: resolvedMotorType,
      password,
      pin: pin.trim(),
    });
    navigate('/#booking');
  };

  const errorList = Object.entries(errors).filter(([_, msg]) => !!msg);

  return (
    <div className="min-h-screen w-full bg-paper text-carbon py-12 px-6 pb-28">
      <div className="w-full max-w-[640px] mx-auto">
        {/* Top link: Kembali ke beranda (No arrow) */}
        <div className="mb-6">
          <Link
            to="/"
            className="font-sans text-sm text-muted hover:text-carbon underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
          >
            Kembali ke beranda
          </Link>
        </div>

        {/* Heading & Intro */}
        <div data-aos="fade-up" className="mb-8">
          <h1 className="font-condensed font-semibold text-[40px] text-carbon leading-tight mb-2">
            Daftar akun
          </h1>
          <p className="font-sans text-base text-muted">
            Isi sesuai STNK. Data ini dipakai untuk booking servis.
          </p>
        </div>

        {/* Error Summary at top when submitted with errors */}
        {submittedWithErrors && errorList.length > 0 && (
          <div
            ref={errorSummaryRef}
            role="alert"
            tabIndex={-1}
            className="border border-alert bg-alert/[0.06] p-5 rounded-[4px] mb-8"
          >
            <h2 className="font-sans font-semibold text-sm text-alert mb-2">
              Periksa kembali data yang belum lengkap atau belum sesuai:
            </h2>
            <ul className="list-disc list-inside space-y-1 text-sm text-alert">
              {errorList.map(([field, msg]) => (
                <li key={field}>
                  <a
                    href={`#field-${field}`}
                    className="underline hover:text-carbon focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
                  >
                    {msg}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-10">
          {/* GROUP 1: Data diri */}
          <div data-aos="fade-up" className="pt-6 border-t border-steel">
            <h2 className="font-condensed font-semibold text-[24px] text-carbon mb-6">
              Data diri
            </h2>

            <div className="space-y-5">
              {/* Nama Lengkap */}
              <div id="field-name">
                <label
                  htmlFor="reg-name"
                  className="font-sans font-medium text-[15px] text-carbon mb-2 block"
                >
                  Nama lengkap
                </label>
                <input
                  id="reg-name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => handleBlur('name')}
                  className="w-full bg-transparent border border-steel rounded-[4px] min-h-[44px] px-3 py-2 text-carbon focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
                />
                {errors.name && (
                  <p className="text-alert font-sans text-sm mt-1.5">{errors.name}</p>
                )}
              </div>

              {/* Alamat */}
              <div id="field-address">
                <label
                  htmlFor="reg-address"
                  className="font-sans font-medium text-[15px] text-carbon mb-2 block"
                >
                  Alamat
                </label>
                <textarea
                  id="reg-address"
                  rows={3}
                  autoComplete="street-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  onBlur={() => handleBlur('address')}
                  className="w-full bg-transparent border border-steel rounded-[4px] px-3 py-2 text-carbon resize-y focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
                />
                {errors.address && (
                  <p className="text-alert font-sans text-sm mt-1.5">{errors.address}</p>
                )}
              </div>

              {/* Email */}
              <div id="field-email">
                <label
                  htmlFor="reg-email"
                  className="font-sans font-medium text-[15px] text-carbon mb-2 block"
                >
                  Email
                </label>
                <input
                  id="reg-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => handleBlur('email')}
                  className="w-full bg-transparent border border-steel rounded-[4px] min-h-[44px] px-3 py-2 text-carbon focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
                />
                {errors.email && (
                  <p className="text-alert font-sans text-sm mt-1.5">{errors.email}</p>
                )}
              </div>

              {/* Kata Sandi */}
              <div id="field-password">
                <div className="flex items-center justify-between mb-2">
                  <label
                    htmlFor="reg-password"
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
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => handleBlur('password')}
                  className="w-full bg-transparent border border-steel rounded-[4px] min-h-[44px] px-3 py-2 text-carbon focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
                />
                <span className="font-sans text-xs text-muted block mt-1">
                  Minimal 8 karakter.
                </span>
                {errors.password && (
                  <p className="text-alert font-sans text-sm mt-1">{errors.password}</p>
                )}
              </div>

              {/* Konfirmasi Kata Sandi */}
              <div id="field-confirmPassword">
                <label
                  htmlFor="reg-confirm-password"
                  className="font-sans font-medium text-[15px] text-carbon mb-2 block"
                >
                  Konfirmasi kata sandi
                </label>
                <input
                  id="reg-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onBlur={() => handleBlur('confirmPassword')}
                  className="w-full bg-transparent border border-steel rounded-[4px] min-h-[44px] px-3 py-2 text-carbon focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
                />
                {errors.confirmPassword && (
                  <p className="text-alert font-sans text-sm mt-1.5">{errors.confirmPassword}</p>
                )}
              </div>

              {/* PIN Konsumen (Maksimal 6 angka) */}
              <div id="field-pin">
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="reg-pin"
                    className="font-sans font-medium text-[15px] text-carbon block"
                  >
                    PIN keamanan (maksimal 6 angka)
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
                <span className="font-sans text-xs text-muted block mb-2">
                  Maksimal 6 angka. Gunakan PIN ini saat masuk ke akun Anda.
                </span>
                <input
                  id="reg-pin"
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Contoh: 123456"
                  value={pin}
                  onChange={(e) => {
                    const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setPin(digitsOnly);
                    if (errors.pin) {
                      setErrors((prev) => ({ ...prev, pin: undefined }));
                    }
                  }}
                  onBlur={() => handleBlur('pin')}
                  className="w-full font-mono tracking-widest bg-transparent border border-steel rounded-[4px] min-h-[44px] px-3 py-2 text-carbon focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
                />
                <div className="mt-1.5 flex items-center justify-between text-xs font-sans text-muted">
                  <span>Pemberitahuan: PIN konsumen dibatasi maksimal 6 angka.</span>
                  <span className="font-mono tabular-nums">{pin.length}/6</span>
                </div>
                {errors.pin && (
                  <p className="text-alert font-sans text-sm mt-1.5">{errors.pin}</p>
                )}
              </div>
            </div>
          </div>

          {/* GROUP 2: Data kendaraan sesuai STNK */}
          <div data-aos="fade-up" className="pt-6 border-t border-steel">
            <h2 className="font-condensed font-semibold text-[24px] text-carbon mb-6">
              Data kendaraan sesuai STNK
            </h2>

            <div className="space-y-5">
              {/* Nomor Plat (IBM Plex Mono) */}
              <div id="field-plateNumber">
                <label
                  htmlFor="reg-plate"
                  className="font-sans font-medium text-[15px] text-carbon mb-2 block"
                >
                  Nomor plat
                </label>
                <input
                  id="reg-plate"
                  type="text"
                  placeholder="Sesuai STNK"
                  value={plateNumber}
                  onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
                  onBlur={() => handleBlur('plateNumber')}
                  className="w-full font-mono uppercase bg-transparent border border-steel rounded-[4px] min-h-[44px] px-3 py-2 text-carbon focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
                />
                {errors.plateNumber && (
                  <p className="text-alert font-sans text-sm mt-1.5">{errors.plateNumber}</p>
                )}
              </div>

              {/* Jenis Motor */}
              <div id="field-motorType">
                <label
                  htmlFor="reg-motor-type"
                  className="font-sans font-medium text-[15px] text-carbon mb-2 block"
                >
                  Jenis motor
                </label>
                <select
                  id="reg-motor-type"
                  value={motorType}
                  onChange={(e) => setMotorType(e.target.value)}
                  onBlur={() => handleBlur('motorType')}
                  className="w-full bg-transparent border border-steel rounded-[4px] min-h-[44px] px-3 py-2 text-carbon focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
                >
                  <option value="" disabled className="bg-paper text-carbon/60">
                    Pilih jenis motor
                  </option>
                  <option value="Honda" className="bg-paper text-carbon">
                    Honda
                  </option>
                  <option value="Yamaha" className="bg-paper text-carbon">
                    Yamaha
                  </option>
                  <option value="Suzuki" className="bg-paper text-carbon">
                    Suzuki
                  </option>
                  <option value="Lainnya" className="bg-paper text-carbon">
                    Lainnya
                  </option>
                </select>
                {errors.motorType && (
                  <p className="text-alert font-sans text-sm mt-1.5">{errors.motorType}</p>
                )}
              </div>

              {/* Height Reveal for "Lainnya" */}
              <div
                ref={lainnyaWrapperRef}
                style={{ height: 0, opacity: 0, display: 'none', overflow: 'hidden' }}
                id="field-customMotorType"
              >
                <label
                  htmlFor="reg-custom-motor-type"
                  className="font-sans font-medium text-[15px] text-carbon mb-2 block"
                >
                  Tulis jenis motor
                </label>
                <input
                  id="reg-custom-motor-type"
                  type="text"
                  placeholder="Contoh: Kawasaki, Vespa, dll."
                  value={customMotorType}
                  onChange={(e) => setCustomMotorType(e.target.value)}
                  onBlur={() => handleBlur('customMotorType')}
                  className="w-full bg-transparent border border-steel rounded-[4px] min-h-[44px] px-3 py-2 text-carbon focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
                />
                {errors.customMotorType && (
                  <p className="text-alert font-sans text-sm mt-1.5">{errors.customMotorType}</p>
                )}
              </div>

              {/* Kendaraan */}
              <div id="field-vehicle">
                <label
                  htmlFor="reg-vehicle"
                  className="font-sans font-medium text-[15px] text-carbon mb-2 block"
                >
                  Kendaraan
                </label>
                <input
                  id="reg-vehicle"
                  type="text"
                  placeholder="Contoh: Honda CBR 160cc"
                  value={vehicle}
                  onChange={(e) => setVehicle(e.target.value)}
                  onBlur={() => handleBlur('vehicle')}
                  className="w-full bg-transparent border border-steel rounded-[4px] min-h-[44px] px-3 py-2 text-carbon focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
                />
                {errors.vehicle && (
                  <p className="text-alert font-sans text-sm mt-1.5">{errors.vehicle}</p>
                )}
              </div>

              {/* Kode Mesin (IBM Plex Mono) */}
              <div id="field-engineNumber">
                <label
                  htmlFor="reg-engine-number"
                  className="font-sans font-medium text-[15px] text-carbon mb-1 block"
                >
                  Kode mesin
                </label>
                <span className="font-sans text-xs text-muted block mb-2">
                  Sesuai nomor mesin di STNK.
                </span>
                <input
                  id="reg-engine-number"
                  type="text"
                  value={engineNumber}
                  onChange={(e) => setEngineNumber(e.target.value.toUpperCase())}
                  onBlur={() => handleBlur('engineNumber')}
                  className="w-full font-mono uppercase bg-transparent border border-steel rounded-[4px] min-h-[44px] px-3 py-2 text-carbon focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
                />
                {errors.engineNumber && (
                  <p className="text-alert font-sans text-sm mt-1.5">{errors.engineNumber}</p>
                )}
              </div>

              {/* Kode Rangka (IBM Plex Mono) */}
              <div id="field-frameNumber">
                <label
                  htmlFor="reg-frame-number"
                  className="font-sans font-medium text-[15px] text-carbon mb-1 block"
                >
                  Kode rangka
                </label>
                <span className="font-sans text-xs text-muted block mb-2">
                  Sesuai nomor rangka di STNK.
                </span>
                <input
                  id="reg-frame-number"
                  type="text"
                  value={frameNumber}
                  onChange={(e) => setFrameNumber(e.target.value.toUpperCase())}
                  onBlur={() => handleBlur('frameNumber')}
                  className="w-full font-mono uppercase bg-transparent border border-steel rounded-[4px] min-h-[44px] px-3 py-2 text-carbon focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
                />
                {errors.frameNumber && (
                  <p className="text-alert font-sans text-sm mt-1.5">{errors.frameNumber}</p>
                )}
              </div>
            </div>
          </div>

          {/* Terms & Conditions */}
          <div id="field-agreeTerms" className="pt-2">
            <div className="flex items-start gap-3">
              <input
                id="reg-agree-terms"
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => {
                  setAgreeTerms(e.target.checked);
                  if (errors.agreeTerms) setErrors((prev) => ({ ...prev, agreeTerms: undefined }));
                }}
                onBlur={() => handleBlur('agreeTerms')}
                className="mt-1 w-4 h-4 rounded-[4px] border-steel text-carbon focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
              />
              <label htmlFor="reg-agree-terms" className="font-sans text-sm text-carbon leading-snug">
                Saya setuju dengan{' '}
                <span className="text-muted cursor-not-allowed select-none">
                  syarat dan ketentuan (Segera hadir)
                </span>
              </label>
            </div>
            {errors.agreeTerms && (
              <p className="text-alert font-sans text-sm mt-1.5">{errors.agreeTerms}</p>
            )}
          </div>

          {/* Submit Button: Carbon background, paper text, full width on mobile */}
          <div>
            <button
              type="submit"
              className="w-full md:w-auto inline-flex items-center justify-center bg-carbon text-paper font-sans font-medium text-[16px] px-8 py-3 rounded-[4px] min-h-[44px] transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
            >
              Daftar
            </button>
          </div>

          {/* Link to Login */}
          <div className="pt-2">
            <Link
              to="/login"
              className="text-sm font-sans text-muted hover:text-carbon focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
            >
              Sudah punya akun?{' '}
              <span className="underline underline-offset-4 text-carbon font-medium">
                Masuk
              </span>
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Register;
