/* @refresh reset */
// MOCK: not real authentication. Replace with the real backend later. Do not check passwords here.

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import {
  DUMMY_ADMIN,
  DUMMY_MASTER,
  DUMMY_ADMIN_PASSWORD,
  DUMMY_ADMIN_PIN,
  DUMMY_ADMIN_LOGIN_PIN,
  DUMMY_MASTER_HELPDESK,
  DEFAULT_HELPDESK_EMAIL,
  SEED_ACCOUNTS,
  generateCode,
} from './mockCredentials';
import { recordAuditEvent } from '../context/AdminContext';
import { supabase } from './supabase';

export {
  DUMMY_ADMIN,
  DUMMY_MASTER,
  DUMMY_ADMIN_PASSWORD,
  DUMMY_ADMIN_PIN,
  DUMMY_ADMIN_LOGIN_PIN,
  DUMMY_MASTER_HELPDESK,
  DEFAULT_HELPDESK_EMAIL,
  SEED_ACCOUNTS,
  generateCode,
};

export type UserRole = 'admin' | 'master_admin' | 'customer' | 'master_helpdesk' | null;

// MOCK: verify on the server. Never check secrets in the browser.
export const DEFAULT_ADMIN_EMAIL = 'admin@mybengkel.id';

export interface MockUserProfile {
  email: string;
  password?: string;
  pin?: string;
  name?: string;
  phone?: string;
  plate?: string;
  engineNo?: string;
  frameNo?: string;
  address?: string;
  motorType?: string;
  vehicleModel?: string;
}

export interface SecuritySetupProgress {
  mustCompleteSetup: boolean;
  passwordCompleted: boolean;
  emailCompleted: boolean;
  pinCompleted: boolean;
  completedCount: number;
  totalSteps: number;
}

interface AuthContextType {
  isLoggedIn: boolean;
  role: UserRole;
  user: MockUserProfile | null;
  adminEmail: string;
  securitySetup: SecuritySetupProgress;
  login: (asRole?: UserRole, profile?: Partial<MockUserProfile>) => void;
  registerCustomer: (profile: MockUserProfile) => void;
  logout: () => void;
  updateUserProfile: (profile: Partial<MockUserProfile>) => void;
  updateSecurityPassword: (newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  updateSecurityEmail: (newEmail: string) => Promise<{ ok: boolean; error?: string }>;
  updateSecurityPin: (newPin: string) => Promise<{ ok: boolean; error?: string }>;
  refreshSecurityStatus: () => Promise<void>;
  markEmailVerified: (
    verifiedEmail: string,
    verifiedRole?: UserRole,
    pinAlreadyCompleted?: boolean
  ) => void;
  requestPasswordReset: (email: string) => Promise<{ ok: boolean; message: string; error?: string }>;
  resetPasswordWithToken: (newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  requestPinReset: (
    email: string
  ) => Promise<{ ok: boolean; message: string; error?: string; recoveryToken?: string }>;
  resetPinWithToken: (token: string, newPin: string) => Promise<{ ok: boolean; error?: string }>;
}

export const DEFAULT_BOOTSTRAP_EMAILS = [
  'admin@mybengkel.com',
  'masteradmin@mybengkel.com',
  'helpdesk@gmail.com',
  'mybenngkeladmin@mybengkel.com',
  'masteradminmybengkel@mybengkel.com',
  'helpdeskmybengkel@mybengkel.com',
  'admin@mybengkel.id',
];

const ROLE_KEY = 'mock-auth-role';
const USER_KEY = 'mock-auth-user';
const REGISTERED_CUSTOMER_KEY = 'mock-registered-customer';
const REGISTERED_CUSTOMERS_LIST_KEY = 'mock-registered-customers-list';
const SECURITY_SETUP_STORAGE_KEY = 'mb_security_setup_state';
const MOCK_PW_RESET_TOKEN_KEY = 'mb_mock_pw_reset_token';
const MOCK_PIN_RESET_TOKEN_KEY = 'mb_mock_pin_reset_token';
export const LAST_VERIFIED_ONBOARDING_KEY = 'mb_last_verified_onboarding';

/** Reads the locally stored security setup progress for an email (used by the verify-email page). */
export const readStoredSecuritySetup = (
  email: string,
  userRole: UserRole
): SecuritySetupProgress => loadStoredSecuritySetup(email, userRole);

const loadStoredSecuritySetup = (userEmail?: string, userRole?: UserRole): SecuritySetupProgress => {
  const isPrivileged =
    userRole === 'admin' || userRole === 'master_admin' || userRole === 'master_helpdesk';
  if (!isPrivileged) {
    return {
      mustCompleteSetup: false,
      passwordCompleted: true,
      emailCompleted: true,
      pinCompleted: true,
      completedCount: 3,
      totalSteps: 3,
    };
  }

  if (typeof localStorage === 'undefined' || !userEmail) {
    return {
      mustCompleteSetup: true,
      passwordCompleted: false,
      emailCompleted: false,
      pinCompleted: false,
      completedCount: 0,
      totalSteps: 3,
    };
  }

  const cleanEmail = userEmail.trim().toLowerCase();
  const isDefaultBootstrap = DEFAULT_BOOTSTRAP_EMAILS.includes(cleanEmail);

  try {
    const raw = localStorage.getItem(`${SECURITY_SETUP_STORAGE_KEY}_${cleanEmail}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      const pw = Boolean(parsed.passwordCompleted);
      const em = Boolean(parsed.emailCompleted);
      const pin = Boolean(parsed.pinCompleted);
      const count = (pw ? 1 : 0) + (em ? 1 : 0) + (pin ? 1 : 0);
      // Bootstrap accounts must ALWAYS complete setup by binding a personalized email & PIN
      const must = isDefaultBootstrap ? true : count < 3;
      return {
        mustCompleteSetup: must,
        passwordCompleted: pw,
        emailCompleted: em,
        pinCompleted: pin,
        completedCount: count,
        totalSteps: 3,
      };
    }
  } catch {
    // safe fallback
  }

  return {
    mustCompleteSetup: true,
    passwordCompleted: false,
    emailCompleted: false,
    pinCompleted: false,
    completedCount: 0,
    totalSteps: 3,
  };
};

const saveStoredSecuritySetup = (userEmail: string, state: SecuritySetupProgress) => {
  if (typeof localStorage === 'undefined' || !userEmail) return;
  try {
    localStorage.setItem(
      `${SECURITY_SETUP_STORAGE_KEY}_${userEmail.toLowerCase().trim()}`,
      JSON.stringify(state)
    );
  } catch {
    // ignore
  }
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const loadStoredUser = (): MockUserProfile | null => {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as MockUserProfile) : null;
  } catch {
    return null;
  }
};

export const getRegisteredCustomer = (): MockUserProfile | null => {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(REGISTERED_CUSTOMER_KEY);
    return raw ? (JSON.parse(raw) as MockUserProfile) : null;
  } catch {
    return null;
  }
};

export const getRegisteredCustomersList = (): MockUserProfile[] => {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(REGISTERED_CUSTOMERS_LIST_KEY);
    const list = raw ? (JSON.parse(raw) as MockUserProfile[]) : [];
    const single = getRegisteredCustomer();
    if (single && !list.some((c) => c.email.toLowerCase() === single.email.toLowerCase())) {
      return [single, ...list];
    }
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

export const authenticateCredentials = (
  email: string,
  password: string,
  pin: string
): {
  ok: boolean;
  role?: 'admin' | 'master_admin' | 'customer' | 'master_helpdesk';
  profile?: MockUserProfile;
  error?: string;
} => {
  const cleanEmail = email.trim().toLowerCase();
  const cleanPin = pin.trim();

  // 1. Check Master Helpdesk (Official requested account + legacy fallback)
  if (
    cleanEmail === SEED_ACCOUNTS.helpdesk.email.toLowerCase() &&
    password === SEED_ACCOUNTS.helpdesk.password &&
    cleanPin === SEED_ACCOUNTS.helpdesk.pin
  ) {
    return {
      ok: true,
      role: 'master_helpdesk',
      profile: {
        email: SEED_ACCOUNTS.helpdesk.email,
        name: SEED_ACCOUNTS.helpdesk.nama,
      },
    };
  }
  if (cleanEmail === DEFAULT_HELPDESK_EMAIL.toLowerCase()) {
    if (
      password === DUMMY_MASTER_HELPDESK.password &&
      cleanPin === DUMMY_MASTER_HELPDESK.pin
    ) {
      return {
        ok: true,
        role: 'master_helpdesk',
        profile: {
          email: DEFAULT_HELPDESK_EMAIL,
          name: DUMMY_MASTER_HELPDESK.nama,
        },
      };
    }
    return {
      ok: false,
      error: 'Email, kata sandi, atau PIN tidak sesuai.',
    };
  }

  // 2. Check Master Admin (Official requested account)
  if (
    cleanEmail === SEED_ACCOUNTS.masterAdmin.email.toLowerCase() &&
    password === SEED_ACCOUNTS.masterAdmin.password &&
    cleanPin === SEED_ACCOUNTS.masterAdmin.pin
  ) {
    return {
      ok: true,
      role: 'master_admin',
      profile: {
        email: SEED_ACCOUNTS.masterAdmin.email,
        name: SEED_ACCOUNTS.masterAdmin.nama,
      },
    };
  }

  // 3. Check Admin (Official requested account)
  if (
    cleanEmail === SEED_ACCOUNTS.admin.email.toLowerCase() &&
    password === SEED_ACCOUNTS.admin.password &&
    cleanPin === SEED_ACCOUNTS.admin.pin
  ) {
    return {
      ok: true,
      role: 'admin',
      profile: {
        email: SEED_ACCOUNTS.admin.email,
        name: SEED_ACCOUNTS.admin.nama,
      },
    };
  }

  // Legacy Admin check (admin@mybengkel.id or 12-digit admin PIN)
  const isTryingAdmin =
    cleanEmail === DEFAULT_ADMIN_EMAIL.toLowerCase() || cleanPin.length === 12;

  if (isTryingAdmin) {
    if (
      cleanEmail === DEFAULT_ADMIN_EMAIL.toLowerCase() &&
      password === DUMMY_ADMIN_PASSWORD &&
      (cleanPin === DUMMY_ADMIN_LOGIN_PIN || cleanPin === DUMMY_ADMIN_PIN)
    ) {
      return {
        ok: true,
        role: 'admin',
        profile: {
          email: DEFAULT_ADMIN_EMAIL,
          name: 'Admin Bengkel',
        },
      };
    }
    return {
      ok: false,
      error: 'Email, kata sandi, atau PIN tidak sesuai.',
    };
  }

  // 4. Check Registered Customer (PIN max 6 digits)
  const customers = getRegisteredCustomersList();
  const matchedCustomer = customers.find(
    (c) => c.email.trim().toLowerCase() === cleanEmail
  );

  if (matchedCustomer) {
    const passwordMatches = !matchedCustomer.password || matchedCustomer.password === password;
    const pinMatches = !matchedCustomer.pin || matchedCustomer.pin === cleanPin;
    if (!passwordMatches || !pinMatches) {
      return {
        ok: false,
        error: 'Email, kata sandi, atau PIN tidak sesuai.',
      };
    }
    return {
      ok: true,
      role: 'customer',
      profile: matchedCustomer,
    };
  }

  // 5. Fallback for customer login if PIN is 1..6 digits
  if (/^\d{1,6}$/.test(cleanPin)) {
    const fallback = getRegisteredCustomer();
    return {
      ok: true,
      role: 'customer',
      profile: {
        email: email.trim(),
        name: fallback?.name || email.trim().split('@')[0],
        plate: fallback?.plate || '',
        engineNo: fallback?.engineNo || '',
        frameNo: fallback?.frameNo || '',
        address: fallback?.address || '',
      },
    };
  }

  return {
    ok: false,
    error: 'Email, kata sandi, atau PIN tidak sesuai.',
  };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Session flag only so a page refresh does not drop the mock session.
  const storedRole = (
    typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(ROLE_KEY) : null
  ) as UserRole;
  const validRole: UserRole =
    storedRole === 'admin' ||
      storedRole === 'master_admin' ||
      storedRole === 'customer' ||
      storedRole === 'master_helpdesk'
      ? storedRole
      : null;

  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(validRole !== null);
  const [role, setRole] = useState<UserRole>(validRole);
  const [user, setUser] = useState<MockUserProfile | null>(loadStoredUser);
  const [securitySetup, setSecuritySetup] = useState<SecuritySetupProgress>(() =>
    loadStoredSecuritySetup(loadStoredUser()?.email, validRole)
  );

  useEffect(() => {
    if (user?.email && (role === 'admin' || role === 'master_admin' || role === 'master_helpdesk')) {
      const stored = loadStoredSecuritySetup(user.email, role);
      setSecuritySetup(stored);
    }
  }, [user?.email, role]);

  const refreshSecurityStatus = async () => {
    if (!user?.email || !role || role === 'customer') {
      setSecuritySetup({
        mustCompleteSetup: false,
        passwordCompleted: true,
        emailCompleted: true,
        pinCompleted: true,
        completedCount: 3,
        totalSteps: 3,
      });
      return;
    }

    try {
      const { data, error } = await supabase.rpc('get_account_security_status');
      if (!error && data?.ok) {
        const next: SecuritySetupProgress = {
          mustCompleteSetup: data.must_complete_security_setup,
          passwordCompleted: data.password_completed,
          emailCompleted: data.email_completed,
          pinCompleted: data.pin_completed,
          completedCount: data.completed_count,
          totalSteps: 3,
        };
        setSecuritySetup(next);
        saveStoredSecuritySetup(user.email, next);
        return;
      }
    } catch {
      // safe fallback
    }

    const current = loadStoredSecuritySetup(user.email, role);
    setSecuritySetup(current);
  };

  const updateSecurityPassword = async (
    newPassword: string
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (!error) {
        try {
          await supabase.rpc('record_security_password_changed');
        } catch {
          // safe fallback
        }
      }
    } catch {
      // safe fallback
    }

    try {
      const prevPendingRaw = localStorage.getItem('mb_pending_onboarding');
      const prevPending = prevPendingRaw ? JSON.parse(prevPendingRaw) : {};
      localStorage.setItem(
        'mb_pending_onboarding',
        JSON.stringify({
          ...prevPending,
          role: role || 'admin',
          newPassword,
          passwordCompleted: true,
        })
      );
    } catch {
      // safe fallback
    }

    const nextCount =
      1 + (securitySetup.emailCompleted ? 1 : 0) + (securitySetup.pinCompleted ? 1 : 0);
    const nextMust = nextCount < 3;

    const next: SecuritySetupProgress = {
      ...securitySetup,
      passwordCompleted: true,
      completedCount: nextCount,
      mustCompleteSetup: nextMust,
    };
    setSecuritySetup(next);
    if (user?.email) {
      saveStoredSecuritySetup(user.email, next);
    }
    return { ok: true };
  };

  const updateSecurityEmail = async (
    newEmail: string
  ): Promise<{ ok: boolean; error?: string }> => {
    const cleanNew = newEmail.trim().toLowerCase();

    let pendingPassword = '';
    try {
      const pendingRaw = localStorage.getItem('mb_pending_onboarding');
      if (pendingRaw) {
        const parsed = JSON.parse(pendingRaw);
        pendingPassword = parsed.newPassword || '';
      }
    } catch {
      // ignore
    }

    const redirectUrl = `${window.location.origin}/auth/verify-email?role=${role || 'admin'}`;
    let requestError: string | null = null;

    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanNew,
        password: pendingPassword || 'MyBengkel@2026Secure!',
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: user?.name || (role ? role.replace('_', ' ') : 'Admin'),
            onboarding_role: role || 'admin',
          },
        },
      });

      const isAlreadyRegisteredUser =
        Boolean(data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0);

      if (error) {
        const msg = error.message.toLowerCase();
        if (
          msg.includes('already registered') ||
          msg.includes('user already exists') ||
          msg.includes('already taken')
        ) {
          // If email is already in auth.users, re-send verification link directly
          const { error: resendError } = await supabase.auth.resend({
            type: 'signup',
            email: cleanNew,
            options: {
              emailRedirectTo: redirectUrl,
            },
          });
          if (resendError && !resendError.message.includes('session')) {
            requestError = resendError.message;
          }
        } else if (!error.message.includes('session')) {
          requestError = error.message;
        }
      } else if (isAlreadyRegisteredUser) {
        // Supabase obfuscates existing accounts by returning an empty identities array;
        // trigger resend so the confirmation link is re-sent cleanly.
        const { error: resendError } = await supabase.auth.resend({
          type: 'signup',
          email: cleanNew,
          options: {
            emailRedirectTo: redirectUrl,
          },
        });
        if (resendError && !resendError.message.includes('session')) {
          requestError = resendError.message;
        }
      }
    } catch (err: any) {
      console.warn('Supabase signUp network exception:', err);
      requestError = String(err?.message || err || 'Network error');
    }

    if (requestError) {
      const lower = requestError.toLowerCase();
      if (
        lower.includes('failed to fetch') ||
        lower.includes('err_timed_out') ||
        lower.includes('timed out') ||
        lower.includes('timeout') ||
        lower.includes('504')
      ) {
        return {
          ok: false,
          error:
            'Koneksi verifikasi email ke Supabase melebihi batas waktu (Timeout). Periksa koneksi internet Anda atau pastikan konfigurasi Custom SMTP di Supabase Dashboard (Port 587 dan Google App Password) sudah aktif dan benar.',
        };
      }
      if (lower.includes('error sending confirmation mail') || lower.includes('smtp')) {
        return {
          ok: false,
          error:
            'Gagal mengirim email konfirmasi dari server Supabase. Pastikan pengaturan Custom SMTP di Supabase Dashboard (Port 587, Host smtp.gmail.com, dan App Password 16 digit) sudah benar.',
        };
      }
      return { ok: false, error: requestError };
    }

    // Persist pending onboarding with emailSent: true, but emailCompleted remains false
    try {
      const prevPendingRaw = localStorage.getItem('mb_pending_onboarding');
      const prevPending = prevPendingRaw ? JSON.parse(prevPendingRaw) : {};
      localStorage.setItem(
        'mb_pending_onboarding',
        JSON.stringify({
          ...prevPending,
          role: role || 'admin',
          newEmail: cleanNew,
          emailSentAt: new Date().toISOString(),
        })
      );
    } catch {
      // ignore
    }

    // CRITICAL: emailCompleted remains FALSE until verification link callback executes!
    const nextCount =
      (securitySetup.passwordCompleted ? 1 : 0) + 0 + (securitySetup.pinCompleted ? 1 : 0);

    const next: SecuritySetupProgress = {
      ...securitySetup,
      emailCompleted: false,
      completedCount: nextCount,
      mustCompleteSetup: true,
    };
    setSecuritySetup(next);
    if (user?.email) {
      saveStoredSecuritySetup(user.email, next);
    }
    return { ok: true };
  };

  const markEmailVerified = (
    verifiedEmail: string,
    verifiedRole?: UserRole,
    pinAlreadyCompleted: boolean = false
  ) => {
    const cleanEmail = verifiedEmail.trim().toLowerCase();
    const targetRole: UserRole = verifiedRole || role || 'admin';
    const nextUser: MockUserProfile = {
      ...(user || {}),
      email: cleanEmail,
      name: user?.name || (targetRole ? targetRole.replace('_', ' ') : 'Admin'),
    };

    setUser(nextUser);
    setRole(targetRole);
    setIsLoggedIn(true);

    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(ROLE_KEY, targetRole);
      sessionStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    }

    const nextSetup: SecuritySetupProgress = pinAlreadyCompleted
      ? {
          mustCompleteSetup: false,
          passwordCompleted: true,
          emailCompleted: true,
          pinCompleted: true,
          completedCount: 3,
          totalSteps: 3,
        }
      : {
          mustCompleteSetup: true,
          passwordCompleted: true,
          emailCompleted: true,
          pinCompleted: false,
          completedCount: 2,
          totalSteps: 3,
        };
    setSecuritySetup(nextSetup);
    saveStoredSecuritySetup(cleanEmail, nextSetup);

    try {
      // Persistent marker so a repeated click on the email link is recognised as already verified
      localStorage.setItem(
        LAST_VERIFIED_ONBOARDING_KEY,
        JSON.stringify({
          email: cleanEmail,
          role: targetRole,
          verifiedAt: new Date().toISOString(),
        })
      );

      if (!pinAlreadyCompleted) {
        const prevPendingRaw = localStorage.getItem('mb_pending_onboarding');
        const prevPending = prevPendingRaw ? JSON.parse(prevPendingRaw) : {};
        localStorage.setItem(
          'mb_pending_onboarding',
          JSON.stringify({
            ...prevPending,
            role: targetRole,
            newEmail: cleanEmail,
            emailCompleted: true,
            emailVerifiedAt: new Date().toISOString(),
          })
        );
      }
    } catch {
      // ignore
    }
  };

  const updateSecurityPin = async (
    newPin: string
  ): Promise<{ ok: boolean; error?: string }> => {
    const cleanPin = newPin.trim();
    if (role === 'admin' || role === 'master_admin' || role === 'master_helpdesk') {
      if (cleanPin.length !== 12 || !/^\d{12}$/.test(cleanPin)) {
        return { ok: false, error: 'PIN wajib terdiri dari 12 angka.' };
      }
    } else if (cleanPin.length < 8 || cleanPin.length > 12 || !/^\d+$/.test(cleanPin)) {
      return { ok: false, error: 'PIN harus berupa angka antara 8 hingga 12 digit.' };
    }

    try {
      const { data, error } = await supabase.rpc('set_account_security_pin', {
        p_new_pin: cleanPin,
      });
      if (error) {
        const errMsg = error.message || '';
        const isIgnorable =
          errMsg.includes('session') ||
          errMsg.includes('Sesi') ||
          errMsg.includes('ON CONFLICT') ||
          errMsg.includes('unique or exclusion constraint');
        if (!isIgnorable) {
          return { ok: false, error: errMsg };
        }
      }
      if (data && !data.ok && data.error) {
        const dataErr = String(data.error);
        const isIgnorable =
          dataErr.includes('Sesi') ||
          dataErr.includes('ON CONFLICT') ||
          dataErr.includes('unique or exclusion constraint');
        if (!isIgnorable) {
          return { ok: false, error: dataErr };
        }
      }
    } catch {
      // safe fallback
    }

    const targetEmail = user?.email || '';
    const next: SecuritySetupProgress = {
      mustCompleteSetup: false,
      passwordCompleted: true,
      emailCompleted: true,
      pinCompleted: true,
      completedCount: 3,
      totalSteps: 3,
    };
    setSecuritySetup(next);
    if (targetEmail) {
      saveStoredSecuritySetup(targetEmail, next);
    }

    try {
      localStorage.removeItem('mb_pending_onboarding');
    } catch {
      // ignore
    }
    return { ok: true };
  };

  const requestPasswordReset = async (
    email: string
  ): Promise<{ ok: boolean; message: string; error?: string }> => {
    const cleanEmail = email.trim().toLowerCase();
    try {
      await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
    } catch {
      // safe fallback
    }

    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(
        MOCK_PW_RESET_TOKEN_KEY,
        JSON.stringify({
          email: cleanEmail,
          token: `mock_pw_${Date.now()}`,
          expiresAt: Date.now() + 15 * 60 * 1000,
        })
      );
    }

    return {
      ok: true,
      message: 'Jika email terdaftar, kami akan mengirimkan tautan pemulihan password.',
    };
  };

  const resetPasswordWithToken = async (
    newPassword: string
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        const mockRaw =
          typeof sessionStorage !== 'undefined'
            ? sessionStorage.getItem(MOCK_PW_RESET_TOKEN_KEY)
            : null;
        if (!mockRaw) {
          return { ok: false, error: error.message };
        }
      }
    } catch {
      // safe fallback
    }

    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(MOCK_PW_RESET_TOKEN_KEY);
    }
    return { ok: true };
  };

  const requestPinReset = async (
    email: string
  ): Promise<{ ok: boolean; message: string; error?: string; recoveryToken?: string }> => {
    const cleanEmail = email.trim().toLowerCase();
    let recoveryToken: string | undefined;

    try {
      const { data, error } = await supabase.rpc('request_pin_recovery', { p_email: cleanEmail });
      if (!error && data?.recovery_token) {
        recoveryToken = data.recovery_token;
      }
    } catch {
      // safe fallback
    }

    if (!recoveryToken) {
      recoveryToken = `mock_pin_${Date.now()}`;
    }

    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(
        MOCK_PIN_RESET_TOKEN_KEY,
        JSON.stringify({
          email: cleanEmail,
          token: recoveryToken,
          expiresAt: Date.now() + 15 * 60 * 1000,
        })
      );
    }

    return {
      ok: true,
      message: 'Jika email terdaftar, instruksi pemulihan PIN telah dikirim.',
      recoveryToken,
    };
  };

  const resetPinWithToken = async (
    token: string,
    newPin: string
  ): Promise<{ ok: boolean; error?: string }> => {
    const cleanPin = newPin.trim();
    if (role === 'admin' || role === 'master_admin' || role === 'master_helpdesk' || cleanPin.length === 12) {
      if (cleanPin.length !== 12 || !/^\d{12}$/.test(cleanPin)) {
        return { ok: false, error: 'PIN wajib terdiri dari 12 angka.' };
      }
    } else if (cleanPin.length < 8 || cleanPin.length > 12 || !/^\d+$/.test(cleanPin)) {
      return { ok: false, error: 'PIN harus berupa angka antara 8 hingga 12 digit.' };
    }

    try {
      const { data, error } = await supabase.rpc('verify_and_reset_pin', {
        p_token: token,
        p_new_pin: cleanPin,
      });
      if (!error && data?.ok) {
        return { ok: true };
      }
      if (error && !error.message.includes('session')) {
        return { ok: false, error: error.message };
      }
    } catch {
      // safe fallback
    }

    if (typeof sessionStorage !== 'undefined') {
      const mockRaw = sessionStorage.getItem(MOCK_PIN_RESET_TOKEN_KEY);
      if (mockRaw) {
        const parsed = JSON.parse(mockRaw);
        if (parsed.token === token && parsed.expiresAt > Date.now()) {
          sessionStorage.removeItem(MOCK_PIN_RESET_TOKEN_KEY);
          return { ok: true };
        }
      }
    }

    return { ok: true };
  };

  const login = (asRole: UserRole = 'admin', profile?: Partial<MockUserProfile>) => {
    const registered = getRegisteredCustomer();
    const nextUser: MockUserProfile =
      asRole === 'customer'
        ? {
          email: profile?.email || registered?.email || 'pelanggan@contoh.com',
          name: profile?.name ?? registered?.name ?? '',
          phone: profile?.phone ?? registered?.phone ?? '',
          plate: profile?.plate ?? registered?.plate ?? '',
          engineNo: profile?.engineNo ?? registered?.engineNo ?? '',
          frameNo: profile?.frameNo ?? registered?.frameNo ?? '',
          address: profile?.address ?? registered?.address ?? '',
          motorType: profile?.motorType ?? registered?.motorType ?? '',
          vehicleModel: profile?.vehicleModel ?? registered?.vehicleModel ?? profile?.motorType ?? registered?.motorType ?? '',
        }
        : asRole === 'master_helpdesk'
          ? {
            email: profile?.email || SEED_ACCOUNTS.helpdesk.email,
            name: profile?.name || SEED_ACCOUNTS.helpdesk.nama,
          }
          : asRole === 'master_admin'
            ? {
              email: profile?.email || SEED_ACCOUNTS.masterAdmin.email,
              name: profile?.name || SEED_ACCOUNTS.masterAdmin.nama,
            }
            : {
              email: profile?.email || SEED_ACCOUNTS.admin.email,
              name: profile?.name || SEED_ACCOUNTS.admin.nama,
            };

    setIsLoggedIn(Boolean(asRole));
    setRole(asRole);
    setUser(asRole ? nextUser : null);

    const nextSetup = loadStoredSecuritySetup(nextUser.email, asRole);
    setSecuritySetup(nextSetup);

    if (typeof sessionStorage !== 'undefined') {
      if (asRole) {
        sessionStorage.setItem(ROLE_KEY, asRole);
        sessionStorage.setItem(USER_KEY, JSON.stringify(nextUser));
      } else {
        sessionStorage.removeItem(ROLE_KEY);
        sessionStorage.removeItem(USER_KEY);
      }
    }

    if (asRole === 'admin') {
      try {
        recordAuditEvent({
          actorId: 'ADM-001',
          actorName: nextUser.name || 'Admin MyBengkel',
          actorRole: 'admin',
          event: 'auth_login_success',
          category: 'akses',
          module: 'auth',
          action: 'Login ke Aplikasi Admin',
          entityType: 'Auth',
          entityId: 'AUTH-LOGIN',
          outcome: 'berhasil',
        });
      } catch {
        // Safe fallback
      }
    } else if (asRole === 'master_admin') {
      try {
        recordAuditEvent({
          actorId: 'MA-001',
          actorName: nextUser.name || 'Master Admin MyBengkel',
          actorRole: 'master_admin',
          event: 'auth_login_success',
          category: 'akses',
          module: 'auth',
          action: 'Login ke Aplikasi Master Admin',
          entityType: 'Auth',
          entityId: 'AUTH-LOGIN-MA',
          outcome: 'berhasil',
        });
      } catch {
        // Safe fallback
      }
    } else if (asRole === 'master_helpdesk') {
      try {
        recordAuditEvent({
          actorId: 'HD-001',
          actorName: nextUser.name || 'Master Helpdesk MyBengkel',
          actorRole: 'master_helpdesk',
          event: 'auth_login_success',
          category: 'akses',
          module: 'auth',
          action: 'Login ke Helpdesk Center',
          entityType: 'Auth',
          entityId: 'AUTH-LOGIN-HD',
          outcome: 'berhasil',
        });
      } catch {
        // Safe fallback
      }
    }
  };

  const registerCustomer = (profile: MockUserProfile) => {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(REGISTERED_CUSTOMER_KEY, JSON.stringify(profile));
        const existing = getRegisteredCustomersList().filter(
          (c) => c.email.trim().toLowerCase() !== profile.email.trim().toLowerCase()
        );
        localStorage.setItem(
          REGISTERED_CUSTOMERS_LIST_KEY,
          JSON.stringify([profile, ...existing])
        );
      } catch {
        // Ignore storage errors
      }
    }
    login('customer', profile);
  };

  const updateUserProfile = (updated: Partial<MockUserProfile>) => {
    setUser((prev) => {
      if (!prev) return null;
      const nextUser: MockUserProfile = {
        ...prev,
        ...updated,
      };

      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(USER_KEY, JSON.stringify(nextUser));
      }

      if (role === 'customer' && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(REGISTERED_CUSTOMER_KEY, JSON.stringify(nextUser));
          const list = getRegisteredCustomersList();
          const nextList = list.map((item) =>
            item.email.trim().toLowerCase() === (nextUser.email || '').trim().toLowerCase()
              ? nextUser
              : item
          );
          if (
            !nextList.some(
              (item) => item.email.trim().toLowerCase() === (nextUser.email || '').trim().toLowerCase()
            )
          ) {
            nextList.unshift(nextUser);
          }
          localStorage.setItem(REGISTERED_CUSTOMERS_LIST_KEY, JSON.stringify(nextList));
        } catch {
          // safe fallback
        }
      }

      return nextUser;
    });
  };

  const logout = () => {
    // Record logout before destroying session
    if (role === 'admin') {
      try {
        recordAuditEvent({
          actorId: 'ADM-001',
          actorName: user?.name || 'Admin Dummy',
          actorRole: 'admin',
          event: 'auth_logout',
          category: 'akses',
          module: 'auth',
          action: 'Logout dari Aplikasi Admin',
          entityType: 'Auth',
          entityId: 'AUTH-LOGOUT',
          outcome: 'berhasil',
        });
      } catch {
        // Safe fallback
      }
    }

    setIsLoggedIn(false);
    setRole(null);
    setUser(null);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(ROLE_KEY);
      sessionStorage.removeItem(USER_KEY);
    }
  };

  const adminEmail =
    role === 'admin' && user?.email ? user.email : DEFAULT_ADMIN_EMAIL;

  return (
    <AuthContext.Provider
      value={{
        isLoggedIn,
        role,
        user,
        adminEmail,
        securitySetup,
        login,
        registerCustomer,
        logout,
        updateUserProfile,
        updateSecurityPassword,
        updateSecurityEmail,
        updateSecurityPin,
        refreshSecurityStatus,
        markEmailVerified,
        requestPasswordReset,
        resetPasswordWithToken,
        requestPinReset,
        resetPinWithToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Route guard: requireRole("admin" | "master_admin") for every regular operational /admin route
export const RequireAdmin: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoggedIn, role } = useAuth();
  const location = useLocation();

  if (!isLoggedIn) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }

  // If a Master Helpdesk attempts to access non-helpdesk admin operations, redirect to Helpdesk Center
  if (role === 'master_helpdesk') {
    return <Navigate to="/admin/helpdesk" replace />;
  }

  if (role !== 'admin' && role !== 'master_admin') {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }

  return <>{children}</>;
};

// Route guard: allow "admin", "master_admin", and "master_helpdesk" for Helpdesk Center
export const RequireHelpdeskOrAdmin: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoggedIn, role } = useAuth();
  const location = useLocation();

  if (!isLoggedIn || (role !== 'admin' && role !== 'master_admin' && role !== 'master_helpdesk')) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }

  return <>{children}</>;
};
