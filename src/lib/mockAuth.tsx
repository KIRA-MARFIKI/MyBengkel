// MOCK: not real authentication. Replace with the real backend later. Do not check passwords here.

import React, { createContext, useContext, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import {
  DUMMY_ADMIN,
  DUMMY_MASTER,
  DUMMY_ADMIN_PASSWORD,
  DUMMY_ADMIN_PIN,
  DUMMY_ADMIN_LOGIN_PIN,
  generateCode,
} from './mockCredentials';
import { recordAuditEvent } from '../context/AdminContext';

export {
  DUMMY_ADMIN,
  DUMMY_MASTER,
  DUMMY_ADMIN_PASSWORD,
  DUMMY_ADMIN_PIN,
  DUMMY_ADMIN_LOGIN_PIN,
  generateCode,
};

export type UserRole = 'admin' | 'customer' | null;

// MOCK: verify on the server. Never check secrets in the browser.
export const DEFAULT_ADMIN_EMAIL = 'admin@mybengkel.id';

export interface MockUserProfile {
  email: string;
  password?: string;
  pin?: string;
  name?: string;
  plate?: string;
  engineNo?: string;
  frameNo?: string;
  address?: string;
}

interface AuthContextType {
  isLoggedIn: boolean;
  role: UserRole;
  user: MockUserProfile | null;
  adminEmail: string;
  login: (asRole?: UserRole, profile?: Partial<MockUserProfile>) => void;
  registerCustomer: (profile: MockUserProfile) => void;
  logout: () => void;
}

const ROLE_KEY = 'mock-auth-role';
const USER_KEY = 'mock-auth-user';
const REGISTERED_CUSTOMER_KEY = 'mock-registered-customer';
const REGISTERED_CUSTOMERS_LIST_KEY = 'mock-registered-customers-list';

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
  role?: 'admin' | 'customer';
  profile?: MockUserProfile;
  error?: string;
} => {
  const cleanEmail = email.trim().toLowerCase();
  const cleanPin = pin.trim();

  // 1. Check Admin (Email + Password + 12-digit Admin PIN from programmer)
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

  // 2. Check Registered Customer (PIN max 6 digits)
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

  // 3. Fallback for customer login if PIN is 1..6 digits
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
    storedRole === 'admin' || storedRole === 'customer' ? storedRole : null;

  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(validRole !== null);
  const [role, setRole] = useState<UserRole>(validRole);
  const [user, setUser] = useState<MockUserProfile | null>(loadStoredUser);

  const login = (asRole: UserRole = 'admin', profile?: Partial<MockUserProfile>) => {
    const registered = getRegisteredCustomer();
    const nextUser: MockUserProfile =
      asRole === 'customer'
        ? {
            email: profile?.email || registered?.email || 'pelanggan@contoh.com',
            name: profile?.name ?? registered?.name ?? '',
            plate: profile?.plate ?? registered?.plate ?? '',
            engineNo: profile?.engineNo ?? registered?.engineNo ?? '',
            frameNo: profile?.frameNo ?? registered?.frameNo ?? '',
            address: profile?.address ?? registered?.address ?? '',
          }
        : {
            email: profile?.email || DEFAULT_ADMIN_EMAIL,
            name: profile?.name || 'Admin Bengkel',
          };

    setIsLoggedIn(Boolean(asRole));
    setRole(asRole);
    setUser(asRole ? nextUser : null);

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
          actorName: nextUser.name || 'Admin Dummy',
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
      value={{ isLoggedIn, role, user, adminEmail, login, registerCustomer, logout }}
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

// Route guard: requireRole("admin") for every /admin route
export const RequireAdmin: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoggedIn, role } = useAuth();
  const location = useLocation();

  if (!isLoggedIn || role !== 'admin') {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }

  return <>{children}</>;
};
