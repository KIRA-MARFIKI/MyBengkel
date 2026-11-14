// MOCK: verify on the server. Never check secrets in the browser.
export const DUMMY_ADMIN_PASSWORD = 'admin123';

// MOCK: verify on the server. Never check secrets in the browser.
export const DUMMY_ADMIN_PIN = '123456';

// MOCK: verify on the server. Never check secrets in the browser.
export const DUMMY_ADMIN_LOGIN_PIN = '123456789012';

// MOCK: verify on the server in production. Never check secrets in the browser.
export const DUMMY_ADMIN = {
  id: 'ADM-001',
  nama: 'Admin Dummy',
  password: DUMMY_ADMIN_PASSWORD,
  pin: DUMMY_ADMIN_PIN,
};

// MOCK: verify on the server in production. Never check secrets in the browser.
export const DUMMY_ADMIN_GUDANG = {
  id: 'ADMG-001',
  nama: 'Admin Gudang',
  password: 'admin123',
  pin: '12345',
  role: 'admin_gudang' as const,
};

// MOCK: verify on the server in production. Never check secrets in the browser.
export const DUMMY_MASTER = {
  id: 'MG-001',
  nama: 'Master Gudang Dummy',
  password: 'master123',
  pin: '12345',
  role: 'master_gudang' as const,
};

export const DUMMY_MASTER_GUDANG = DUMMY_MASTER;

export const DEFAULT_HELPDESK_EMAIL = 'helpdesk@gmail.com';

export const SEED_ACCOUNTS = {
  admin: {
    id: 'ADM-001',
    nama: 'Admin MyBengkel',
    email: 'admin@mybengkel.com',
    password: 'admin123',
    pin: '123456789012',
    role: 'admin' as const,
  },
  masterAdmin: {
    id: 'MA-001',
    nama: 'Master Admin MyBengkel',
    email: 'masteradmin@mybengkel.com',
    password: 'masteradmin123',
    pin: '123456789012',
    role: 'master_admin' as const,
  },
  helpdesk: {
    id: 'HD-001',
    nama: 'Master Helpdesk MyBengkel',
    email: 'helpdesk@gmail.com',
    password: 'helpdesk123',
    pin: '123456789012',
    role: 'master_helpdesk' as const,
  },
};

export const DUMMY_MASTER_HELPDESK = {
  id: 'HD-001',
  nama: 'Master Helpdesk',
  email: DEFAULT_HELPDESK_EMAIL,
  password: 'helpdesk123',
  pin: '123456789012',
  role: 'master_helpdesk' as const,
};

export type WarehouseRole = 'admin_gudang' | 'master_gudang';

export interface VerifiedWarehouseUser {
  id: string;
  nama: string;
  role: WarehouseRole;
}

// MOCK: verify on the server in production. Never check secrets in the browser.
export function verifyWarehouseCredential(
  values: Record<string, string>
): VerifiedWarehouseUser | null {
  const id = (values.idGudang || values.idMaster || '').trim();
  const nama = (values.nama || '').trim();
  const password = values.password || '';
  const pin = (values.pin || '').trim();

  // Admin Gudang check: all 4 must match DUMMY_ADMIN_GUDANG
  if (
    id === DUMMY_ADMIN_GUDANG.id &&
    nama === DUMMY_ADMIN_GUDANG.nama &&
    password === DUMMY_ADMIN_GUDANG.password &&
    pin === DUMMY_ADMIN_GUDANG.pin
  ) {
    return {
      id: DUMMY_ADMIN_GUDANG.id,
      nama: DUMMY_ADMIN_GUDANG.nama,
      role: 'admin_gudang',
    };
  }

  // Master Gudang check: all 4 must match DUMMY_MASTER
  if (
    id === DUMMY_MASTER.id &&
    nama === DUMMY_MASTER.nama &&
    password === DUMMY_MASTER.password &&
    pin === DUMMY_MASTER.pin
  ) {
    return {
      id: DUMMY_MASTER.id,
      nama: DUMMY_MASTER.nama,
      role: 'master_gudang',
    };
  }

  return null;
}

// MOCK: verify on the server in production. Never check secrets in the browser.
// ONLY Master Gudang (MG-001) can authorize official Stock Opname printing.
export function verifyMasterGudangPrintCredential(
  values: Record<string, string>
): VerifiedWarehouseUser | null {
  const id = (values.idMaster || values.idGudang || '').trim();
  const nama = (values.nama || '').trim();
  const password = values.password || '';
  const pin = (values.pin || '').trim();

  // Explicitly reject Admin Gudang
  if (id === DUMMY_ADMIN_GUDANG.id) {
    return null;
  }

  if (
    id === DUMMY_MASTER.id &&
    nama === DUMMY_MASTER.nama &&
    password === DUMMY_MASTER.password &&
    pin === DUMMY_MASTER.pin
  ) {
    return {
      id: DUMMY_MASTER.id,
      nama: DUMMY_MASTER.nama,
      role: 'master_gudang',
    };
  }

  return null;
}

export const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const CODE_RESEND_WAIT_MS = 60 * 1000; // 60 seconds

const codeExpiryStore = new Map<string, number>();

// MOCK: verify on the server. Never check secrets in the browser.
export function generateCode(nowMs: number = Date.now()): string {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  codeExpiryStore.set(code, nowMs + CODE_TTL_MS);
  return code;
}

export function isGeneratedCodeValid(
  expectedCode: string,
  enteredCode: string,
  nowMs: number = Date.now()
): boolean {
  if (!expectedCode || !enteredCode) return false;
  if (expectedCode.trim() !== enteredCode.trim()) return false;
  const expiresAt = codeExpiryStore.get(expectedCode);
  if (expiresAt !== undefined && nowMs > expiresAt) {
    return false;
  }
  return true;
}

export function maskPhone(hp: string): string {
  const clean = hp.trim();
  if (clean.length <= 6) return clean;
  return `${clean.slice(0, 4)}••••${clean.slice(-3)}`;
}

export function maskEmail(email: string): string {
  const clean = email.trim();
  const atIdx = clean.indexOf('@');
  if (atIdx <= 1) return clean;
  const local = clean.slice(0, atIdx);
  const domain = clean.slice(atIdx);
  return `${local.slice(0, 2)}••••${domain}`;
}

