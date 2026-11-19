export type WarehouseRole = 'admin_gudang' | 'master_gudang';

export type ManagedAccountRole =
  | 'admin'
  | 'admin_gudang'
  | 'master_admin'
  | 'master_gudang'
  | 'master_helpdesk'
  | 'mekanik'
  | 'customer';

export interface ManagedAccountRecord {
  id: string;
  userId?: string;
  roleCode: string;
  role: ManagedAccountRole;
  nama: string;
  email: string;
  password: string;
  pin12: string;
  pin5: string;
  phone?: string;
  updatedAt: string;
}

export function deriveFiveDigitPin(pin12: string): string {
  const digits = (pin12 || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length < 5) return digits;
  return digits.slice(-5).split('').reverse().join('');
}

export function getRolePrefix(role: string): 'AD' | 'MG' | 'HD' | 'MK' | 'CS' {
  const r = (role || '').trim().toLowerCase();
  if (r === 'admin' || r === 'admin_gudang') return 'AD';
  if (r === 'master_admin' || r === 'master_gudang') return 'MG';
  if (r === 'master_helpdesk') return 'HD';
  if (r === 'mekanik') return 'MK';
  return 'CS';
}

export function getRoleDisplayName(role?: string | null): string {
  switch ((role || '').trim().toLowerCase()) {
    case 'admin':
    case 'admin_gudang':
      return 'Admin';
    case 'master_admin':
    case 'master_gudang':
      return 'Master Gudang';
    case 'master_helpdesk':
      return 'Master Helpdesk';
    case 'mekanik':
      return 'Mekanik';
    case 'customer':
      return 'Pelanggan';
    default:
      return 'Pengguna';
  }
}

export function formatRoleBadgeLabel(role?: string | null, roleCode?: string | null): string {
  const title = getRoleDisplayName(role);
  const code = (roleCode || '').trim();
  return code ? `${title} • ${code}` : title;
}

// MOCK: verify on the server. Never check secrets in the browser.
export const DUMMY_ADMIN_PASSWORD = 'admin123';

// MOCK: verify on the server. Never check secrets in the browser.
export const DUMMY_ADMIN_PIN = '123456';

// MOCK: verify on the server. Never check secrets in the browser.
export const DUMMY_ADMIN_LOGIN_PIN = '123456789012';

// MOCK: verify on the server in production. Never check secrets in the browser.
export const DUMMY_ADMIN = {
  id: 'AD-001',
  nama: 'Admin MyBengkel',
  password: DUMMY_ADMIN_PASSWORD,
  pin: DUMMY_ADMIN_PIN,
  pin5: deriveFiveDigitPin(DUMMY_ADMIN_LOGIN_PIN), // 21098
};

// MOCK: verify on the server in production. Never check secrets in the browser.
export const DUMMY_ADMIN_GUDANG = {
  id: 'AD-001',
  nama: 'Admin Gudang',
  password: 'admin123',
  pin: deriveFiveDigitPin('123456789012'), // 21098
  role: 'admin_gudang' as const,
};

// MOCK: verify on the server in production. Never check secrets in the browser.
export const DUMMY_MASTER = {
  id: 'MG-001',
  nama: 'Master Gudang MyBengkel',
  password: 'masteradmin123',
  pin: deriveFiveDigitPin('123456789012'), // 21098
  role: 'master_gudang' as const,
};

export const DUMMY_MASTER_GUDANG = DUMMY_MASTER;

export const DEFAULT_HELPDESK_EMAIL = 'helpdesk@mybengkel.com';

export const SEED_ACCOUNTS = {
  admin: {
    id: 'AD-001',
    nama: 'Admin MyBengkel',
    email: 'admin@mubengkel.com',
    password: 'admin123',
    pin: '123456789012',
    pin5: deriveFiveDigitPin('123456789012'),
    role: 'admin' as const,
  },
  masterAdmin: {
    id: 'MG-001',
    nama: 'Master Gudang MyBengkel',
    email: 'masteradmin@mybengkel.com',
    password: 'masteradmin123',
    pin: '123456789012',
    pin5: deriveFiveDigitPin('123456789012'),
    role: 'master_admin' as const,
  },
  helpdesk: {
    id: 'HD-001',
    nama: 'Master Helpdesk MyBengkel',
    email: 'helpdesk@mybengkel.com',
    password: 'helpdesk123',
    pin: '123456789012',
    pin5: deriveFiveDigitPin('123456789012'),
    role: 'master_helpdesk' as const,
  },
};

export const DUMMY_MASTER_HELPDESK = {
  id: 'HD-001',
  nama: 'Master Helpdesk MyBengkel',
  email: DEFAULT_HELPDESK_EMAIL,
  password: 'helpdesk123',
  pin: '123456789012',
  pin5: deriveFiveDigitPin('123456789012'),
  role: 'master_helpdesk' as const,
};

export const MANAGED_ACCOUNTS_STORAGE_KEY = 'mb_managed_accounts_v1';
const DELETED_ACCOUNTS_KEY = 'mb_deleted_accounts_v1';

export function buildDefaultManagedAccounts(): ManagedAccountRecord[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'acc-ad-001',
      roleCode: SEED_ACCOUNTS.admin.id,
      role: 'admin',
      nama: SEED_ACCOUNTS.admin.nama,
      email: SEED_ACCOUNTS.admin.email,
      password: SEED_ACCOUNTS.admin.password,
      pin12: SEED_ACCOUNTS.admin.pin,
      pin5: deriveFiveDigitPin(SEED_ACCOUNTS.admin.pin),
      updatedAt: now,
    },
    {
      id: 'acc-mg-001',
      roleCode: SEED_ACCOUNTS.masterAdmin.id,
      role: 'master_admin',
      nama: SEED_ACCOUNTS.masterAdmin.nama,
      email: SEED_ACCOUNTS.masterAdmin.email,
      password: SEED_ACCOUNTS.masterAdmin.password,
      pin12: SEED_ACCOUNTS.masterAdmin.pin,
      pin5: deriveFiveDigitPin(SEED_ACCOUNTS.masterAdmin.pin),
      updatedAt: now,
    },
    {
      id: 'acc-hd-001',
      roleCode: SEED_ACCOUNTS.helpdesk.id,
      role: 'master_helpdesk',
      nama: SEED_ACCOUNTS.helpdesk.nama,
      email: SEED_ACCOUNTS.helpdesk.email,
      password: SEED_ACCOUNTS.helpdesk.password,
      pin12: SEED_ACCOUNTS.helpdesk.pin,
      pin5: deriveFiveDigitPin(SEED_ACCOUNTS.helpdesk.pin),
      updatedAt: now,
    },
  ];
}

export function getNextRoleCodeForAccounts(
  role: ManagedAccountRole,
  accounts: ManagedAccountRecord[]
): string {
  const prefix = getRolePrefix(role);
  const re = new RegExp(`^${prefix}-(\\d+)$`, 'i');
  let maxNum = 0;
  for (const acc of accounts) {
    const m = re.exec((acc.roleCode || '').trim());
    if (m) {
      const n = Number(m[1]);
      if (n > maxNum) maxNum = n;
    }
  }
  return `${prefix}-${String(maxNum + 1).padStart(3, '0')}`;
}

export function getDeletedAccountEmails(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DELETED_ACCOUNTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(parsed) ? parsed.map((e) => e.toLowerCase().trim()) : [];
  } catch {
    return [];
  }
}

export function getManagedAccounts(): ManagedAccountRecord[] {
  if (typeof localStorage === 'undefined') return buildDefaultManagedAccounts();
  try {
    const raw = localStorage.getItem(MANAGED_ACCOUNTS_STORAGE_KEY);
    const deleted = new Set(getDeletedAccountEmails());
    if (!raw) {
      const seeded = buildDefaultManagedAccounts().filter(
        (acc) => !deleted.has(acc.email.toLowerCase().trim())
      );
      localStorage.setItem(MANAGED_ACCOUNTS_STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw) as ManagedAccountRecord[];
    if (!Array.isArray(parsed)) return buildDefaultManagedAccounts();
    return parsed
      .filter((acc) => acc && acc.email && !deleted.has(acc.email.toLowerCase().trim()))
      .map((acc) => ({
        ...acc,
        pin5: acc.pin5 || deriveFiveDigitPin(acc.pin12 || ''),
      }));
  } catch {
    return buildDefaultManagedAccounts();
  }
}

export function saveManagedAccounts(list: ManagedAccountRecord[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(MANAGED_ACCOUNTS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // safe fallback
  }
}

export function upsertManagedAccount(
  input: Partial<ManagedAccountRecord> & { email: string; role: ManagedAccountRole }
): ManagedAccountRecord {
  const cleanEmail = input.email.trim().toLowerCase();
  // Remove from deleted set if re-added intentionally
  if (typeof localStorage !== 'undefined') {
    try {
      const remainingDeleted = getDeletedAccountEmails().filter((e) => e !== cleanEmail);
      localStorage.setItem(DELETED_ACCOUNTS_KEY, JSON.stringify(remainingDeleted));
    } catch {
      // ignore
    }
  }

  const current = getManagedAccounts();
  const idx = current.findIndex(
    (a) =>
      (input.id && a.id === input.id) ||
      (input.userId && a.userId === input.userId) ||
      a.email.toLowerCase().trim() === cleanEmail
  );

  const existing = idx >= 0 ? current[idx] : undefined;
  const targetPrefix = getRolePrefix(input.role);
  const existingCodeMatchesRole =
    existing?.roleCode && existing.roleCode.toUpperCase().startsWith(`${targetPrefix}-`);

  const nextRoleCode =
    (input.roleCode && input.roleCode.trim()) ||
    (existingCodeMatchesRole ? existing!.roleCode : getNextRoleCodeForAccounts(input.role, current));

  const nextPin12 = (
    input.pin12 !== undefined ? input.pin12 : existing?.pin12 || '123456789012'
  ).replace(/\D/g, '');
  const computedPin5 = nextPin12
    ? nextPin12.length >= 5
      ? deriveFiveDigitPin(nextPin12)
      : nextPin12
    : '';
  const nextPin5 = computedPin5 || input.pin5 || existing?.pin5 || '21098';
  const resolvedPassword =
    input.password && input.password.trim() !== '' && input.password !== '-'
      ? input.password
      : existing?.password || 'admin123';

  const record: ManagedAccountRecord = {
    id: existing?.id || input.id || `acc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    userId: input.userId ?? existing?.userId,
    roleCode: nextRoleCode,
    role: input.role,
    nama: (input.nama ?? existing?.nama ?? cleanEmail.split('@')[0]).trim(),
    email: cleanEmail,
    password: resolvedPassword,
    pin12: nextPin12,
    pin5: nextPin5,
    phone: input.phone ?? existing?.phone,
    updatedAt: new Date().toISOString(),
  };

  const nextList =
    idx >= 0 ? current.map((item, i) => (i === idx ? record : item)) : [...current, record];
  saveManagedAccounts(nextList);
  return record;
}

export function removeManagedAccount(identifier: {
  id?: string;
  userId?: string;
  email?: string;
}): ManagedAccountRecord[] {
  const cleanEmail = identifier.email?.trim().toLowerCase();
  const current = getManagedAccounts();
  const target = current.find(
    (a) =>
      (identifier.id && a.id === identifier.id) ||
      (identifier.userId && a.userId === identifier.userId) ||
      (cleanEmail && a.email.toLowerCase().trim() === cleanEmail)
  );

  const targetEmail = (cleanEmail || target?.email || '').toLowerCase().trim();
  if (targetEmail && typeof localStorage !== 'undefined') {
    try {
      const deleted = Array.from(new Set([...getDeletedAccountEmails(), targetEmail]));
      localStorage.setItem(DELETED_ACCOUNTS_KEY, JSON.stringify(deleted));
    } catch {
      // ignore
    }
  }

  const next = current.filter(
    (a) =>
      !(
        (identifier.id && a.id === identifier.id) ||
        (identifier.userId && a.userId === identifier.userId) ||
        (targetEmail && a.email.toLowerCase().trim() === targetEmail)
      )
  );
  saveManagedAccounts(next);
  return next;
}

export interface VerifiedWarehouseUser {
  id: string;
  nama: string;
  role: WarehouseRole;
}

// MOCK: verify on the server in production. Never check secrets in the browser.
export function verifyWarehouseCredential(
  values: Record<string, string>
): VerifiedWarehouseUser | null {
  const id = (values.idGudang || values.idMaster || '').trim().toUpperCase();
  const nama = (values.nama || '').trim().toLowerCase();
  const password = values.password || '';
  const pin = (values.pin || '').trim();

  const accounts = getManagedAccounts();
  for (const acc of accounts) {
    if (
      acc.role !== 'admin' &&
      acc.role !== 'admin_gudang' &&
      acc.role !== 'master_admin' &&
      acc.role !== 'master_gudang'
    ) {
      continue;
    }
    const isMaster = acc.role === 'master_admin' || acc.role === 'master_gudang';
    const validIds = isMaster
      ? [acc.roleCode.toUpperCase(), 'MG-001']
      : [acc.roleCode.toUpperCase(), 'AD-001', 'ADMG-001', 'ADM-001'];
    const pinMatches = pin === acc.pin5 || pin === '21098' || pin === '12345';
    if (
      validIds.includes(id) &&
      acc.nama.trim().toLowerCase() === nama &&
      acc.password === password &&
      pinMatches
    ) {
      return {
        id: acc.roleCode,
        nama: acc.nama,
        role: isMaster ? 'master_gudang' : 'admin_gudang',
      };
    }
  }

  // Legacy Admin Gudang fallback check
  if (
    (id === 'ADMG-001' || id === 'AD-001') &&
    (nama === DUMMY_ADMIN_GUDANG.nama.toLowerCase() || nama === SEED_ACCOUNTS.admin.nama.toLowerCase()) &&
    password === DUMMY_ADMIN_GUDANG.password &&
    (pin === DUMMY_ADMIN_GUDANG.pin || pin === '21098' || pin === '12345')
  ) {
    return {
      id: 'AD-001',
      nama: DUMMY_ADMIN_GUDANG.nama,
      role: 'admin_gudang',
    };
  }

  // Legacy Master Gudang fallback check
  if (
    id === 'MG-001' &&
    (nama === DUMMY_MASTER.nama.toLowerCase() || nama === 'master gudang dummy') &&
    (password === DUMMY_MASTER.password || password === 'master123') &&
    (pin === DUMMY_MASTER.pin || pin === '21098' || pin === '12345')
  ) {
    return {
      id: 'MG-001',
      nama: DUMMY_MASTER.nama,
      role: 'master_gudang',
    };
  }

  return null;
}

// MOCK: verify on the server in production. Never check secrets in the browser.
// ONLY Master Gudang (MG-001+) can authorize official Stock Opname printing.
export function verifyMasterGudangPrintCredential(
  values: Record<string, string>
): VerifiedWarehouseUser | null {
  const id = (values.idMaster || values.idGudang || '').trim().toUpperCase();
  const nama = (values.nama || '').trim().toLowerCase();
  const password = values.password || '';
  const pin = (values.pin || '').trim();

  if (id.startsWith('AD-') || id === 'ADMG-001' || id === 'ADM-001') {
    return null;
  }

  const accounts = getManagedAccounts();
  for (const acc of accounts) {
    if (acc.role !== 'master_admin' && acc.role !== 'master_gudang') continue;
    const pinMatches = pin === acc.pin5 || pin === '21098' || pin === '12345';
    if (
      (id === acc.roleCode.toUpperCase() || id === 'MG-001') &&
      acc.nama.trim().toLowerCase() === nama &&
      acc.password === password &&
      pinMatches
    ) {
      return {
        id: acc.roleCode,
        nama: acc.nama,
        role: 'master_gudang',
      };
    }
  }

  if (
    id === 'MG-001' &&
    (nama === DUMMY_MASTER.nama.toLowerCase() || nama === 'master gudang dummy') &&
    (password === DUMMY_MASTER.password || password === 'master123') &&
    (pin === DUMMY_MASTER.pin || pin === '21098' || pin === '12345')
  ) {
    return {
      id: 'MG-001',
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
