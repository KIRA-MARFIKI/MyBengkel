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
  deriveFiveDigitPin,
  getManagedAccounts,
  getDeletedAccountEmails,
  upsertManagedAccount,
  formatRoleBadgeLabel,
  getRoleDisplayName,
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
  deriveFiveDigitPin,
  formatRoleBadgeLabel,
  getRoleDisplayName,
};

export type UserRole = 'admin' | 'master_admin' | 'customer' | 'master_helpdesk' | null;

// MOCK: verify on the server. Never check secrets in the browser.
export const DEFAULT_ADMIN_EMAIL = 'admin@mybengkel.id';

export interface MockUserProfile {
  email: string;
  password?: string;
  pin?: string;
  pin5?: string;
  roleCode?: string;
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
  registerCustomer: (profile: MockUserProfile) => Promise<{ ok: boolean; error?: string }>;
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
const LAST_ONBOARDING_PASSWORD_KEY = 'mb_last_onboarding_password';

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

  // Check if account was deleted by Master Helpdesk
  const deletedEmails = getDeletedAccountEmails();
  if (deletedEmails.includes(cleanEmail)) {
    return {
      ok: false,
      error: 'Akun ini telah dihapus oleh administrator.',
    };
  }

  // 0. Check Managed Accounts Registry (includes Supabase synced + Helpdesk CRUD edits)
  const managedAccounts = getManagedAccounts();
  const managedMatch = managedAccounts.find(
    (acc) => acc.email.trim().toLowerCase() === cleanEmail
  );
  if (managedMatch) {
    const pwOk = managedMatch.password === password;
    const expectedPin5 = managedMatch.pin12 ? deriveFiveDigitPin(managedMatch.pin12) : '';
    const pinOk =
      cleanPin === managedMatch.pin12 ||
      (managedMatch.pin5 && cleanPin === managedMatch.pin5) ||
      (expectedPin5 && cleanPin === expectedPin5) ||
      (managedMatch.role !== 'customer' && cleanPin === DUMMY_ADMIN_PIN);

    if (!pwOk || !pinOk) {
      return {
        ok: false,
        error: 'Email, kata sandi, atau PIN tidak sesuai.',
      };
    }

    const normalizedRole: 'admin' | 'master_admin' | 'customer' | 'master_helpdesk' =
      managedMatch.role === 'master_admin' || managedMatch.role === 'master_gudang'
        ? 'master_admin'
        : managedMatch.role === 'master_helpdesk'
        ? 'master_helpdesk'
        : managedMatch.role === 'admin' || managedMatch.role === 'admin_gudang'
        ? 'admin'
        : 'customer';

    const customers = getRegisteredCustomersList();
    const customerExtra =
      normalizedRole === 'customer'
        ? customers.find((c) => c.email.trim().toLowerCase() === cleanEmail)
        : undefined;

    return {
      ok: true,
      role: normalizedRole,
      profile: {
        ...(customerExtra || {}),
        email: managedMatch.email,
        name: managedMatch.nama,
        roleCode: managedMatch.roleCode,
        pin: managedMatch.pin12,
        pin5: managedMatch.pin5 || deriveFiveDigitPin(managedMatch.pin12),
        phone: managedMatch.phone || customerExtra?.phone,
      },
    };
  }

  // 1. Check Master Helpdesk (Official requested account + legacy fallback)
  if (
    cleanEmail === SEED_ACCOUNTS.helpdesk.email.toLowerCase() &&
    password === SEED_ACCOUNTS.helpdesk.password &&
    (cleanPin === SEED_ACCOUNTS.helpdesk.pin || cleanPin === SEED_ACCOUNTS.helpdesk.pin5)
  ) {
    return {
      ok: true,
      role: 'master_helpdesk',
      profile: {
        email: SEED_ACCOUNTS.helpdesk.email,
        name: SEED_ACCOUNTS.helpdesk.nama,
        roleCode: SEED_ACCOUNTS.helpdesk.id,
        pin5: SEED_ACCOUNTS.helpdesk.pin5,
      },
    };
  }
  if (cleanEmail === DEFAULT_HELPDESK_EMAIL.toLowerCase()) {
    if (
      password === DUMMY_MASTER_HELPDESK.password &&
      (cleanPin === DUMMY_MASTER_HELPDESK.pin || cleanPin === DUMMY_MASTER_HELPDESK.pin5)
    ) {
      return {
        ok: true,
        role: 'master_helpdesk',
        profile: {
          email: DEFAULT_HELPDESK_EMAIL,
          name: DUMMY_MASTER_HELPDESK.nama,
          roleCode: DUMMY_MASTER_HELPDESK.id,
          pin5: DUMMY_MASTER_HELPDESK.pin5,
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
    (cleanPin === SEED_ACCOUNTS.masterAdmin.pin || cleanPin === SEED_ACCOUNTS.masterAdmin.pin5)
  ) {
    return {
      ok: true,
      role: 'master_admin',
      profile: {
        email: SEED_ACCOUNTS.masterAdmin.email,
        name: SEED_ACCOUNTS.masterAdmin.nama,
        roleCode: SEED_ACCOUNTS.masterAdmin.id,
        pin5: SEED_ACCOUNTS.masterAdmin.pin5,
      },
    };
  }

  // 3. Check Admin (Official requested account)
  if (
    cleanEmail === SEED_ACCOUNTS.admin.email.toLowerCase() &&
    password === SEED_ACCOUNTS.admin.password &&
    (cleanPin === SEED_ACCOUNTS.admin.pin || cleanPin === SEED_ACCOUNTS.admin.pin5)
  ) {
    return {
      ok: true,
      role: 'admin',
      profile: {
        email: SEED_ACCOUNTS.admin.email,
        name: SEED_ACCOUNTS.admin.nama,
        roleCode: SEED_ACCOUNTS.admin.id,
        pin5: SEED_ACCOUNTS.admin.pin5,
      },
    };
  }

  // Legacy Admin check (admin@mybengkel.id)
  const isTryingAdmin = cleanEmail === DEFAULT_ADMIN_EMAIL.toLowerCase();

  if (isTryingAdmin) {
    if (
      cleanEmail === DEFAULT_ADMIN_EMAIL.toLowerCase() &&
      password === DUMMY_ADMIN_PASSWORD &&
      (cleanPin === DUMMY_ADMIN_LOGIN_PIN || cleanPin === DUMMY_ADMIN_PIN || cleanPin === DUMMY_ADMIN.pin5)
    ) {
      return {
        ok: true,
        role: 'admin',
        profile: {
          email: DEFAULT_ADMIN_EMAIL,
          name: 'Admin MyBengkel',
          roleCode: SEED_ACCOUNTS.admin.id,
          pin5: SEED_ACCOUNTS.admin.pin5,
        },
      };
    }
    return {
      ok: false,
      error: 'Email, kata sandi, atau PIN tidak sesuai.',
    };
  }

  // 4. Check Registered Customer (accepts full PIN or derived 5-digit reversed PIN)
  const customers = getRegisteredCustomersList();
  const matchedCustomer = customers.find(
    (c) => c.email.trim().toLowerCase() === cleanEmail
  );

  if (matchedCustomer) {
    const passwordMatches = !matchedCustomer.password || matchedCustomer.password === password;
    const expectedCustPin5 = matchedCustomer.pin
      ? deriveFiveDigitPin(matchedCustomer.pin)
      : '';
    const pinMatches =
      !matchedCustomer.pin ||
      matchedCustomer.pin === cleanPin ||
      matchedCustomer.pin5 === cleanPin ||
      (expectedCustPin5 !== '' && expectedCustPin5 === cleanPin);
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

  return {
    ok: false,
    error: 'Email, kata sandi, atau PIN tidak sesuai.',
  };
};

export const authenticateCredentialsAsync = async (
  email: string,
  password: string,
  pin: string
): Promise<{
  ok: boolean;
  role?: 'admin' | 'master_admin' | 'customer' | 'master_helpdesk';
  profile?: MockUserProfile;
  error?: string;
}> => {
  const cleanEmail = email.trim().toLowerCase();
  const cleanPin = pin.trim();

  if (getDeletedAccountEmails().includes(cleanEmail)) {
    return {
      ok: false,
      error: 'Akun ini telah dihapus oleh administrator.',
    };
  }

  // 1. Check authoritative Supabase DB RPC first for synced cross-device login
  try {
    const { data, error } = await supabase.rpc('authenticate_account_login', {
      p_email: cleanEmail,
      p_password: password,
      p_pin: cleanPin,
    });

    if (!error && data) {
      const res = data as any;
      if (res.ok) {
        const rawRole = String(res.role || 'customer').trim().toLowerCase();
        const normalizedRole: 'admin' | 'master_admin' | 'customer' | 'master_helpdesk' =
          rawRole === 'master_admin' || rawRole === 'master_gudang'
            ? 'master_admin'
            : rawRole === 'master_helpdesk'
            ? 'master_helpdesk'
            : rawRole === 'admin' || rawRole === 'admin_gudang'
            ? 'admin'
            : 'customer';

        const managed = upsertManagedAccount({
          userId: res.user_id ? String(res.user_id) : undefined,
          roleCode: res.role_code ? String(res.role_code) : undefined,
          role: normalizedRole,
          nama: res.full_name ? String(res.full_name) : cleanEmail.split('@')[0],
          email: cleanEmail,
          password: res.raw_password ? String(res.raw_password) : password,
          pin12: res.pin_12 ? String(res.pin_12) : cleanPin,
          pin5: res.pin_5 ? String(res.pin_5) : deriveFiveDigitPin(String(res.pin_12 || cleanPin)),
        });

        if (!DEFAULT_BOOTSTRAP_EMAILS.includes(cleanEmail) && normalizedRole !== 'customer') {
          const isSetupDone = !Boolean(res.must_complete_security_setup);
          saveStoredSecuritySetup(cleanEmail, {
            mustCompleteSetup: !isSetupDone,
            passwordCompleted: true,
            emailCompleted: true,
            pinCompleted: isSetupDone,
            completedCount: isSetupDone ? 3 : 2,
            totalSteps: 3,
          });
        }

        // Best-effort Supabase Auth JWT hydration
        try {
          await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password,
          });
        } catch {
          // Ignore if email/password differs from supabase session token
        }

        return {
          ok: true,
          role: normalizedRole,
          profile: {
            email: managed.email,
            name: managed.nama,
            roleCode: managed.roleCode,
            pin: managed.pin12,
            pin5: managed.pin5,
            phone: managed.phone,
          },
        };
      }

      // Check explicit credential mismatch from DB when not a seed account
      const msg = String(res.error || '');
      if (msg && !msg.includes('tidak ditemukan')) {
        // Still allow local seed/fallback if matching seeded/local customer
        const localSeedCheck = authenticateCredentials(email, password, pin);
        if (localSeedCheck.ok) {
          try {
            await supabase.auth.signInWithPassword({ email: cleanEmail, password });
          } catch {
            // Best-effort session hydration
          }
          return localSeedCheck;
        }
        return { ok: false, error: msg };
      }
    } else if (error) {
      // Fallback: sync helpdesk_list_accounts into local registry if authenticate_account_login is unavailable
      try {
        const { data: listData } = await supabase.rpc('helpdesk_list_accounts');
        const rows = Array.isArray((listData as any)?.accounts)
          ? ((listData as any).accounts as any[])
          : [];
        for (const remote of rows) {
          const remEmail = String(remote?.email || '').trim().toLowerCase();
          if (remEmail === cleanEmail) {
            const remRoleRaw = String(remote?.role || 'customer').trim().toLowerCase();
            const remRole =
              remRoleRaw === 'master_admin' || remRoleRaw === 'master_gudang'
                ? 'master_admin'
                : remRoleRaw === 'master_helpdesk'
                ? 'master_helpdesk'
                : remRoleRaw === 'admin' || remRoleRaw === 'admin_gudang'
                ? 'admin'
                : 'customer';
            upsertManagedAccount({
              userId: remote?.user_id ? String(remote.user_id) : undefined,
              roleCode: remote?.role_code ? String(remote.role_code) : undefined,
              role: remRole,
              nama: String(remote?.full_name || remEmail.split('@')[0]),
              email: remEmail,
              password: String(remote?.raw_password || remote?.plaintext_password || ''),
              pin12: String(remote?.raw_pin || remote?.pin_12 || ''),
              pin5: String(remote?.raw_pin_5 || remote?.pin_5 || ''),
            });
          }
        }
      } catch {
        // Continue to local verification below
      }
    }
  } catch {
    // Fall back cleanly to local managed/seed verification
  }

  const localRes = authenticateCredentials(email, password, pin);
  if (localRes.ok) {
    try {
      await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    } catch {
      // Best-effort session hydration
    }
  }
  if (localRes.ok && !DEFAULT_BOOTSTRAP_EMAILS.includes(cleanEmail) && localRes.role && localRes.role !== 'customer') {
    saveStoredSecuritySetup(cleanEmail, {
      mustCompleteSetup: false,
      passwordCompleted: true,
      emailCompleted: true,
      pinCompleted: true,
      completedCount: 3,
      totalSteps: 3,
    });
  }
  return localRes;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Session flag only so a page refresh does not drop the mock session.
  const storedRole = (
    typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(ROLE_KEY) : null
  ) as UserRole;
  let initialRole: UserRole =
    storedRole === 'admin' ||
      storedRole === 'master_admin' ||
      storedRole === 'customer' ||
      storedRole === 'master_helpdesk'
      ? storedRole
      : null;

  let initialUser: MockUserProfile | null = loadStoredUser();

  // If returning from email confirmation redirect (/admin?step=pin) in a new tab,
  // hydrate session from pending onboarding state in localStorage so route guards don't drop the user.
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('step') === 'pin') {
      try {
        const pendingRaw = localStorage.getItem('mb_pending_onboarding');
        const pending = pendingRaw ? JSON.parse(pendingRaw) : null;
        if (pending && (pending.newEmail || initialUser?.email)) {
          const targetRole: 'admin' | 'master_admin' | 'master_helpdesk' =
            pending.role === 'master_admin' ||
            pending.role === 'master_helpdesk' ||
            pending.role === 'admin'
              ? pending.role
              : initialRole === 'master_admin' ||
                initialRole === 'master_helpdesk' ||
                initialRole === 'admin'
              ? initialRole
              : 'admin';
          const targetEmail = String(pending.newEmail || initialUser?.email || '').trim().toLowerCase();
          if (targetEmail) {
            initialRole = targetRole;
            initialUser = {
              ...(initialUser || {}),
              email: targetEmail,
              name: initialUser?.name || getRoleDisplayName(targetRole),
            };
            if (typeof sessionStorage !== 'undefined') {
              sessionStorage.setItem(ROLE_KEY, targetRole);
              sessionStorage.setItem(USER_KEY, JSON.stringify(initialUser));
            }
            const existingSetup = loadStoredSecuritySetup(targetEmail, targetRole);
            saveStoredSecuritySetup(targetEmail, {
              ...existingSetup,
              mustCompleteSetup: !existingSetup.pinCompleted,
              passwordCompleted: true,
              emailCompleted: true,
              pinCompleted: existingSetup.pinCompleted,
              completedCount: existingSetup.pinCompleted ? 3 : 2,
              totalSteps: 3,
            });
          }
        }
      } catch {
        // ignore storage errors
      }
    }
  }

  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(initialRole !== null);
  const [role, setRole] = useState<UserRole>(initialRole);
  const [user, setUser] = useState<MockUserProfile | null>(initialUser);
  const [securitySetup, setSecuritySetup] = useState<SecuritySetupProgress>(() =>
    loadStoredSecuritySetup(initialUser?.email, initialRole)
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
    let pendingEmail = '';
    try {
      const prevPendingRaw = localStorage.getItem('mb_pending_onboarding');
      const prevPending = prevPendingRaw ? JSON.parse(prevPendingRaw) : {};
      pendingEmail = String(prevPending.newEmail || '').trim().toLowerCase();
      localStorage.setItem(
        'mb_pending_onboarding',
        JSON.stringify({
          ...prevPending,
          role: role || 'admin',
          newPassword,
          passwordCompleted: true,
        })
      );
      localStorage.setItem(LAST_ONBOARDING_PASSWORD_KEY, newPassword);
    } catch {
      // ignore storage errors
    }

    const activeCustomEmail =
      pendingEmail ||
      (user?.email && !DEFAULT_BOOTSTRAP_EMAILS.includes(user.email.trim().toLowerCase())
        ? user.email.trim().toLowerCase()
        : '');

    try {
      const { data: sess } = await supabase.auth.getSession();
      if (sess?.session) {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) {
          return { ok: false, error: error.message };
        }
        const { error: recErr } = await supabase.rpc('record_security_password_changed');
        if (recErr && !recErr.message.includes('session')) {
          console.warn('record_security_password_changed:', recErr.message);
        }
      }
    } catch (err: any) {
      return { ok: false, error: String(err?.message || err || 'Gagal menyimpan kata sandi ke auth.') };
    }

    if (activeCustomEmail) {
      const { data: stepData, error: stepErr } = await supabase.rpc(
        'save_onboarding_step_credentials',
        {
          p_email: activeCustomEmail,
          p_password: newPassword,
          p_role: role || 'admin',
          p_full_name: user?.name || null,
        }
      );
      if (stepErr) {
        const isMissingRpc =
          stepErr.code === 'PGRST202' ||
          stepErr.message.includes('Could not find the function');
        if (!isMissingRpc) {
          return { ok: false, error: `Gagal menyimpan kata sandi ke database: ${stepErr.message}` };
        }
      } else if (stepData && !(stepData as any).ok && (stepData as any).error) {
        return { ok: false, error: String((stepData as any).error) };
      }

      const roleForAcc =
        role === 'master_admin' || role === 'master_helpdesk' || role === 'admin'
          ? role
          : 'admin';
      upsertManagedAccount({
        email: activeCustomEmail,
        role: roleForAcc,
        roleCode: (stepData as any)?.role_code || user?.roleCode,
        nama: user?.name || getRoleDisplayName(roleForAcc),
        password: newPassword,
      });
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
    rawNewEmail: string
  ): Promise<{ ok: boolean; error?: string }> => {
    const newEmail = rawNewEmail.trim().toLowerCase();

    let pendingPassword = '';
    try {
      const pendingRaw = localStorage.getItem('mb_pending_onboarding');
      if (pendingRaw) {
        const parsed = JSON.parse(pendingRaw);
        pendingPassword = parsed.newPassword || '';
      }
      if (!pendingPassword) {
        pendingPassword = localStorage.getItem(LAST_ONBOARDING_PASSWORD_KEY) || '';
      }
    } catch {
      // ignore
    }

    // Persist target email + password in pending storage before email verification call
    try {
      const prevPendingRaw = localStorage.getItem('mb_pending_onboarding');
      const prevPending = prevPendingRaw ? JSON.parse(prevPendingRaw) : {};
      localStorage.setItem(
        'mb_pending_onboarding',
        JSON.stringify({
          ...prevPending,
          role: role || 'admin',
          newEmail,
          newPassword: pendingPassword || prevPending.newPassword || '',
          emailSentAt: new Date().toISOString(),
        })
      );
    } catch {
      // ignore
    }

    const roleForAcc =
      role === 'master_admin' || role === 'master_helpdesk' || role === 'admin'
        ? role
        : 'admin';
    upsertManagedAccount({
      email: newEmail,
      role: roleForAcc,
      roleCode: user?.roleCode || undefined,
      nama: user?.name || getRoleDisplayName(roleForAcc),
      password: pendingPassword || undefined,
    });

    let requestError: string | null = null;

    try {
      // Ensure an active Supabase Auth session exists for the current user before calling updateUser
      const { data: sessData } = await supabase.auth.getSession();
      if (!sessData?.session) {
        const currentAuthEmail = (
          user?.email ||
          (role === 'master_helpdesk'
            ? SEED_ACCOUNTS.helpdesk.email
            : role === 'master_admin'
            ? SEED_ACCOUNTS.masterAdmin.email
            : SEED_ACCOUNTS.admin.email)
        )
          .trim()
          .toLowerCase();
        const defaultBootstrapPw =
          role === 'master_helpdesk'
            ? SEED_ACCOUNTS.helpdesk.password
            : role === 'master_admin'
            ? SEED_ACCOUNTS.masterAdmin.password
            : SEED_ACCOUNTS.admin.password;
        const candidatePasswords = Array.from(
          new Set([pendingPassword, defaultBootstrapPw].filter(Boolean))
        );
        for (const candidatePw of candidatePasswords) {
          const { data: signInData } = await supabase.auth.signInWithPassword({
            email: currentAuthEmail,
            password: candidatePw,
          });
          if (signInData?.session) break;
        }
      }

      const { data, error } = await supabase.auth.updateUser({
        email: newEmail,
      }, {
        emailRedirectTo: `${window.location.origin}/admin?step=pin`
      });
      void data;

      if (error && !error.message.includes('session')) {
        requestError = error.message;
      }
    } catch (err: any) {
      console.warn('Supabase updateUser network exception:', err);
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
    } else if (cleanPin.length < 4 || cleanPin.length > 12 || !/^\d+$/.test(cleanPin)) {
      return { ok: false, error: 'PIN harus berupa angka antara 4 hingga 12 digit.' };
    }

    let pendingEmail = '';
    let pendingPassword = '';
    let pendingRole: UserRole = null;
    try {
      const pendingRaw = localStorage.getItem('mb_pending_onboarding');
      if (pendingRaw) {
        const parsed = JSON.parse(pendingRaw);
        pendingEmail = String(parsed.newEmail || '').trim().toLowerCase();
        pendingPassword = String(parsed.newPassword || '');
        if (parsed.role) pendingRole = parsed.role as UserRole;
      }
      if (!pendingPassword) {
        pendingPassword = localStorage.getItem(LAST_ONBOARDING_PASSWORD_KEY) || '';
      }
      if (!pendingEmail) {
        const verifiedRaw = localStorage.getItem(LAST_VERIFIED_ONBOARDING_KEY);
        if (verifiedRaw) {
          const parsedVerified = JSON.parse(verifiedRaw);
          pendingEmail = String(parsedVerified.email || '').trim().toLowerCase();
          if (!pendingRole && parsedVerified.role) {
            pendingRole = parsedVerified.role as UserRole;
          }
        }
      }
    } catch {
      // ignore storage read errors
    }

    const currentRole = role || pendingRole || 'admin';
    let resolvedEmail: string | null =
      pendingEmail || (user?.email ? user.email.trim().toLowerCase() : '') || null;

    if (!pendingPassword && resolvedEmail) {
      const existingManaged = getManagedAccounts().find(
        (acc) => acc.email.trim().toLowerCase() === resolvedEmail
      );
      if (existingManaged?.password && existingManaged.password !== '-') {
        pendingPassword = existingManaged.password;
      }
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session && pendingEmail && pendingPassword) {
        const { data: signInData } = await supabase.auth.signInWithPassword({
          email: pendingEmail,
          password: pendingPassword,
        });
        if (signInData?.user?.email) {
          resolvedEmail = signInData.user.email.trim().toLowerCase();
        }
      } else if (session?.user?.email) {
        resolvedEmail = session.user.email.trim().toLowerCase();
      }
    } catch {
      // Continue cleanly; SECURITY DEFINER RPC accepts p_email directly
    }

    const targetEmailKey = (resolvedEmail || pendingEmail || user?.email || '')
      .trim()
      .toLowerCase();
    if (!targetEmailKey) {
      return { ok: false, error: 'Email akun tidak ditemukan untuk menyimpan PIN.' };
    }

    const roleForAcc =
      currentRole === 'master_admin' ||
      currentRole === 'master_helpdesk' ||
      currentRole === 'admin'
        ? currentRole
        : 'admin';

    let rpcData: any = null;
    let rpcError: any = null;

    const firstAttempt = await supabase.rpc('set_account_security_pin', {
      p_new_pin: cleanPin,
      p_role: roleForAcc,
      p_email: targetEmailKey,
      p_password: pendingPassword || null,
    });
    rpcData = firstAttempt.data;
    rpcError = firstAttempt.error;

    if (
      rpcError &&
      (rpcError.code === 'PGRST202' ||
        String(rpcError.message || '').includes('Could not find the function'))
    ) {
      const fallbackAttempt = await supabase.rpc('set_account_security_pin', {
        p_new_pin: cleanPin,
        p_role: roleForAcc,
        p_email: targetEmailKey,
      });
      rpcData = fallbackAttempt.data;
      rpcError = fallbackAttempt.error;
    }

    if (rpcError) {
      return { ok: false, error: `Gagal menyimpan PIN ke database: ${rpcError.message}` };
    }
    if (rpcData && rpcData.ok === false && rpcData.error) {
      return { ok: false, error: String(rpcData.error) };
    }

    if (rpcData?.email) {
      resolvedEmail = String(rpcData.email).trim().toLowerCase();
    }

    const finalEmailKey = (resolvedEmail || targetEmailKey).trim().toLowerCase();
    const computedPin5 = (rpcData?.pin_5 as string) || deriveFiveDigitPin(cleanPin);
    const returnedRoleCode = rpcData?.role_code as string | undefined;
    const resolvedPassword =
      pendingPassword ||
      (rpcData?.raw_password ? String(rpcData.raw_password) : '') ||
      getManagedAccounts().find((a) => a.email.trim().toLowerCase() === finalEmailKey)?.password ||
      '';

    // Also synchronize full credential vault record into helpdesk_upsert_account
    const { data: upsertData, error: upsertErr } = await supabase.rpc(
      'helpdesk_upsert_account',
      {
        p_target_user_id: rpcData?.user_id || null,
        p_email: finalEmailKey,
        p_full_name: user?.name || getRoleDisplayName(roleForAcc),
        p_role: roleForAcc,
        p_password: resolvedPassword || null,
        p_pin_12: cleanPin,
        p_role_code: returnedRoleCode || null,
      }
    );
    if (upsertErr && upsertErr.code !== 'PGRST202') {
      return { ok: false, error: `Gagal menyinkronkan vault akun: ${upsertErr.message}` };
    }
    if (upsertData && (upsertData as any).ok === false && (upsertData as any).error) {
      return { ok: false, error: String((upsertData as any).error) };
    }

    const acc = upsertManagedAccount({
      userId: (upsertData as any)?.user_id || rpcData?.user_id || undefined,
      email: finalEmailKey,
      role: roleForAcc,
      roleCode: (upsertData as any)?.role_code || returnedRoleCode,
      nama: user?.name || getRoleDisplayName(roleForAcc),
      password: resolvedPassword || undefined,
      pin12: cleanPin,
      pin5: computedPin5,
    });

    const nextUser: MockUserProfile = {
      ...(user || { email: finalEmailKey }),
      email: finalEmailKey,
      pin: cleanPin,
      pin5: acc.pin5,
      roleCode: acc.roleCode,
    };
    setUser(nextUser);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    }

    const next: SecuritySetupProgress = {
      mustCompleteSetup: false,
      passwordCompleted: true,
      emailCompleted: true,
      pinCompleted: true,
      completedCount: 3,
      totalSteps: 3,
    };
    setSecuritySetup(next);
    if (finalEmailKey) {
      saveStoredSecuritySetup(finalEmailKey, next);
    }
    if (user?.email && user.email.toLowerCase() !== finalEmailKey) {
      saveStoredSecuritySetup(user.email, next);
    }

    try {
      localStorage.removeItem('mb_pending_onboarding');
      localStorage.removeItem(LAST_ONBOARDING_PASSWORD_KEY);
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
    const managedList = getManagedAccounts();
    const targetEmail = (profile?.email || '').trim().toLowerCase();
    const managedMatch = targetEmail
      ? managedList.find((acc) => acc.email.trim().toLowerCase() === targetEmail)
      : undefined;

    const nextUser: MockUserProfile =
      asRole === 'customer'
        ? {
          email: profile?.email || registered?.email || 'pelanggan@contoh.com',
          name: profile?.name ?? registered?.name ?? '',
          roleCode: profile?.roleCode || managedMatch?.roleCode || registered?.roleCode || 'CS-001',
          pin5: profile?.pin5 || managedMatch?.pin5 || deriveFiveDigitPin(profile?.pin || registered?.pin || ''),
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
            roleCode: profile?.roleCode || managedMatch?.roleCode || SEED_ACCOUNTS.helpdesk.id,
            pin5: profile?.pin5 || managedMatch?.pin5 || SEED_ACCOUNTS.helpdesk.pin5,
          }
          : asRole === 'master_admin'
            ? {
              email: profile?.email || SEED_ACCOUNTS.masterAdmin.email,
              name: profile?.name || SEED_ACCOUNTS.masterAdmin.nama,
              roleCode: profile?.roleCode || managedMatch?.roleCode || SEED_ACCOUNTS.masterAdmin.id,
              pin5: profile?.pin5 || managedMatch?.pin5 || SEED_ACCOUNTS.masterAdmin.pin5,
            }
            : {
              email: profile?.email || SEED_ACCOUNTS.admin.email,
              name: profile?.name || SEED_ACCOUNTS.admin.nama,
              roleCode: profile?.roleCode || managedMatch?.roleCode || SEED_ACCOUNTS.admin.id,
              pin5: profile?.pin5 || managedMatch?.pin5 || SEED_ACCOUNTS.admin.pin5,
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
          actorId: nextUser.roleCode || SEED_ACCOUNTS.admin.id,
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
          actorId: nextUser.roleCode || SEED_ACCOUNTS.masterAdmin.id,
          actorName: nextUser.name || 'Master Gudang MyBengkel',
          actorRole: 'master_admin',
          event: 'auth_login_success',
          category: 'akses',
          module: 'auth',
          action: 'Login ke Aplikasi Master Gudang',
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
          actorId: nextUser.roleCode || SEED_ACCOUNTS.helpdesk.id,
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

  const registerCustomer = async (
    profile: MockUserProfile
  ): Promise<{ ok: boolean; error?: string }> => {
    const cleanEmail = profile.email.trim().toLowerCase();
    const cleanName = (profile.name || cleanEmail.split('@')[0]).trim();
    const cleanPin = (profile.pin || '').trim().replace(/\D/g, '');
    const computedPin5 = cleanPin ? deriveFiveDigitPin(cleanPin) : '';

    let dbUserId: string | undefined;
    let dbRoleCode: string | undefined;

    const firstAttempt = await supabase.rpc('save_onboarding_step_credentials', {
      p_email: cleanEmail,
      p_password: profile.password || null,
      p_pin: cleanPin || null,
      p_role: 'customer',
      p_full_name: cleanName,
    });

    if (!firstAttempt.error && firstAttempt.data) {
      const res = firstAttempt.data as any;
      if (res.ok === false && res.error) {
        return { ok: false, error: String(res.error) };
      }
      if (res.user_id) dbUserId = String(res.user_id);
      if (res.role_code) dbRoleCode = String(res.role_code);
    } else if (
      firstAttempt.error &&
      (firstAttempt.error.code === 'PGRST202' ||
        String(firstAttempt.error.message || '').includes('Could not find the function'))
    ) {
      const fallbackAttempt = await supabase.rpc('helpdesk_upsert_account', {
        p_email: cleanEmail,
        p_full_name: cleanName,
        p_role: 'customer',
        p_password: profile.password || null,
        p_pin_12: cleanPin || null,
      });
      if (fallbackAttempt.error) {
        return {
          ok: false,
          error: `Gagal menyimpan pendaftaran akun ke database: ${fallbackAttempt.error.message}`,
        };
      }
      const fRes = fallbackAttempt.data as any;
      if (fRes && fRes.ok === false && fRes.error) {
        return { ok: false, error: String(fRes.error) };
      }
      if (fRes?.user_id) dbUserId = String(fRes.user_id);
      if (fRes?.role_code) dbRoleCode = String(fRes.role_code);
    } else if (firstAttempt.error) {
      return {
        ok: false,
        error: `Gagal menyimpan pendaftaran akun ke database: ${firstAttempt.error.message}`,
      };
    }

    const managed = upsertManagedAccount({
      userId: dbUserId,
      roleCode: dbRoleCode,
      email: cleanEmail,
      role: 'customer',
      nama: cleanName,
      password: profile.password || '',
      pin12: cleanPin,
      pin5: computedPin5 || cleanPin,
      phone: profile.phone,
    });

    const enrichedProfile: MockUserProfile = {
      ...profile,
      email: cleanEmail,
      name: cleanName,
      roleCode: managed.roleCode,
      pin: cleanPin,
      pin5: managed.pin5,
    };

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(REGISTERED_CUSTOMER_KEY, JSON.stringify(enrichedProfile));
        const existing = getRegisteredCustomersList().filter(
          (c) => c.email.trim().toLowerCase() !== cleanEmail
        );
        localStorage.setItem(
          REGISTERED_CUSTOMERS_LIST_KEY,
          JSON.stringify([enrichedProfile, ...existing])
        );
      } catch {
        // Ignore storage errors
      }
    }
    login('customer', enrichedProfile);
    return { ok: true };
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

// Route guard: allow shared access for "admin", "master_admin", and "master_helpdesk"
export const RequireAdmin: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoggedIn, role } = useAuth();
  const location = useLocation();

  if (!isLoggedIn) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }

  if (role !== 'admin' && role !== 'master_admin' && role !== 'master_helpdesk') {
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
