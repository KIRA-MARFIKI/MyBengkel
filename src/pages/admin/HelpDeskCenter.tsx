import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { recordAuditEvent } from '../../context/AdminContext';
import { useAuth } from '../../lib/mockAuth';
import { supabase } from '../../lib/supabase';
import { deriveFiveDigitPin } from '../../lib/mockCredentials';
import { ActionButton, EyeIcon, EyeOffIcon, PencilIcon, PlusIcon, TrashIcon } from '../../components/admin/ActionButton';
import { CenterDialog } from '../../components/admin/CenterDialog';
import { FormField } from '../../components/admin/FormField';
import { useActionIsland } from '../../components/admin/island/IslandSystem';

type HelpdeskRoleType =
  | 'admin'
  | 'admin_gudang'
  | 'master_admin'
  | 'master_gudang'
  | 'master_helpdesk'
  | 'mekanik'
  | 'customer';

interface HelpdeskDbAccount {
  userId: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: HelpdeskRoleType;
  roleCode: string;
  rawPassword: string | null;
  rawPin: string | null;
  rawPin5: string | null;
}

type RoleFilterValue = 'semua' | 'admin' | 'master_admin' | 'master_helpdesk' | 'customer';

function getCompactRoleName(role: string): string {
  const r = role.trim().toLowerCase();
  if (r === 'admin' || r === 'admin_gudang') return 'Admin';
  if (r === 'master_admin' || r === 'master_gudang') return 'Master Admin';
  if (r === 'master_helpdesk') return 'Helpdesk';
  if (r === 'mekanik') return 'Mekanik';
  return 'Customer';
}

function getRoleBadgeColor(role: string): string {
  const r = role.trim().toLowerCase();
  if (r === 'master_helpdesk') return 'bg-[#E4F2FE] text-[#1A64B0]';
  if (r === 'master_admin' || r === 'master_gudang') return 'bg-[#F3E8FF] text-[#6B21A8]';
  if (r === 'admin' || r === 'admin_gudang') return 'bg-[#FFF1DA] text-[#8A5A00]';
  if (r === 'mekanik') return 'bg-[#E6F6EC] text-[#166534]';
  return 'bg-[#EEF0F4] text-[#454D5F]';
}

const CopyIcon: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <rect x="6" y="6" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M4.5 12H4C3.17157 12 2.5 11.3284 2.5 10.5V4C2.5 3.17157 3.17157 2.5 4 2.5H10.5C11.3284 2.5 12 3.17157 12 4V4.5"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

const RefreshIcon: React.FC<{ spinning?: boolean }> = ({ spinning }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 20 20"
    fill="none"
    aria-hidden="true"
    className={spinning ? 'animate-spin' : ''}
  >
    <path
      d="M16.25 10A6.25 6.25 0 1 1 14.42 5.58M16.25 3.75V6.875H13.125"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const HelpDeskCenter: React.FC = () => {
  const { user } = useAuth();
  const { notify } = useActionIsland();

  const [accounts, setAccounts] = useState<HelpdeskDbAccount[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>('');

  const [roleFilter, setRoleFilter] = useState<RoleFilterValue>('semua');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
  const [revealedPins, setRevealedPins] = useState<Record<string, boolean>>({});

  // Add / Edit Account Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<HelpdeskDbAccount | null>(null);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<HelpdeskRoleType>('admin');
  const [formPassword, setFormPassword] = useState('');
  const [formShowPassword, setFormShowPassword] = useState(true);
  const [formPin, setFormPin] = useState('123456789012');
  const [formSendEmail, setFormSendEmail] = useState(true);
  const [formError, setFormError] = useState('');
  const [formSaving, setFormSaving] = useState(false);

  // Confirm Delete Modal
  const [deleteTarget, setDeleteTarget] = useState<HelpdeskDbAccount | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('mock-registered-customer');
        localStorage.removeItem('mock-registered-customers-list');
        localStorage.removeItem('mb_managed_accounts_v1');
        localStorage.removeItem('mb_deleted_accounts_v1');
      }
    } catch {
      // ignore storage cleanup error
    }
  }, []);

  const loadAccountsFromServer = useCallback(async () => {
    setLoading(true);
    setLoadError('');

    try {
      let res = await supabase.rpc('helpdesk_get_all_accounts_credentials');
      if (
        res.error &&
        (res.error.code === 'PGRST202' ||
          String(res.error.message || '').includes('Could not find the function'))
      ) {
        res = await supabase.rpc('helpdesk_list_accounts');
      }

      if (res.error) {
        setAccounts([]);
        setLoadError(`Gagal memuat akun: ${res.error.message}`);
        return;
      }

      const rawList = Array.isArray((res.data as any)?.accounts)
        ? ((res.data as any).accounts as any[])
        : [];

      const normalized: HelpdeskDbAccount[] = rawList
        .filter((item) => item && item.user_id && item.email)
        .map((item) => {
          const rawRole = String(item.role || 'customer').trim().toLowerCase();
          const roleTyped: HelpdeskRoleType =
            rawRole === 'master_admin' || rawRole === 'master_gudang'
              ? 'master_admin'
              : rawRole === 'master_helpdesk'
              ? 'master_helpdesk'
              : rawRole === 'admin' || rawRole === 'admin_gudang'
              ? 'admin'
              : rawRole === 'mekanik'
              ? 'mekanik'
              : 'customer';

          const rawPassword =
            typeof item.raw_password === 'string' && item.raw_password !== ''
              ? item.raw_password
              : typeof item.plaintext_password === 'string' && item.plaintext_password !== ''
              ? item.plaintext_password
              : null;

          const rawPin =
            typeof item.raw_pin === 'string' && item.raw_pin !== ''
              ? item.raw_pin
              : typeof item.pin_12 === 'string' && item.pin_12 !== ''
              ? item.pin_12
              : null;

          const rawPin5 =
            roleTyped === 'customer'
              ? null
              : typeof item.raw_pin_5 === 'string' && item.raw_pin_5 !== ''
              ? item.raw_pin_5
              : typeof item.pin_5 === 'string' && item.pin_5 !== ''
              ? item.pin_5
              : rawPin
              ? deriveFiveDigitPin(rawPin)
              : null;

          return {
            userId: String(item.user_id),
            email: String(item.email).trim().toLowerCase(),
            fullName: String(item.full_name || String(item.email).split('@')[0]),
            phone: item.phone ? String(item.phone) : null,
            role: roleTyped,
            roleCode: item.role_code ? String(item.role_code) : '-',
            rawPassword,
            rawPin,
            rawPin5,
          };
        });

      setAccounts(normalized);
    } catch (err: any) {
      setAccounts([]);
      setLoadError(`Koneksi database bermasalah: ${err?.message || 'Coba muat ulang'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccountsFromServer();
  }, [loadAccountsFromServer]);

  const roleCounts = useMemo(() => {
    return {
      semua: accounts.length,
      admin: accounts.filter((a) => a.role === 'admin' || a.role === 'admin_gudang').length,
      master_admin: accounts.filter((a) => a.role === 'master_admin' || a.role === 'master_gudang').length,
      master_helpdesk: accounts.filter((a) => a.role === 'master_helpdesk').length,
      customer: accounts.filter((a) => a.role === 'customer').length,
    };
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return accounts.filter((acc) => {
      if (roleFilter === 'admin' && acc.role !== 'admin' && acc.role !== 'admin_gudang') {
        return false;
      }
      if (
        roleFilter === 'master_admin' &&
        acc.role !== 'master_admin' &&
        acc.role !== 'master_gudang'
      ) {
        return false;
      }
      if (roleFilter === 'master_helpdesk' && acc.role !== 'master_helpdesk') {
        return false;
      }
      if (roleFilter === 'customer' && acc.role !== 'customer') {
        return false;
      }
      if (!q) return true;
      return (
        acc.fullName.toLowerCase().includes(q) ||
        acc.email.toLowerCase().includes(q) ||
        acc.roleCode.toLowerCase().includes(q) ||
        getCompactRoleName(acc.role).toLowerCase().includes(q)
      );
    });
  }, [accounts, roleFilter, searchQuery]);

  const handleCopy = async (value: string | null, label: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      notify(`${label} disalin.`);
    } catch {
      notify(`Gagal menyalin ${label}.`);
    }
  };

  const openCreateModal = () => {
    setEditingAccount(null);
    setFormName('');
    setFormEmail('');
    setFormRole('admin');
    setFormPassword('');
    setFormShowPassword(true);
    setFormPin('123456789012');
    setFormSendEmail(false);
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (acc: HelpdeskDbAccount) => {
    setEditingAccount(acc);
    setFormName(acc.fullName);
    setFormEmail(acc.email);
    const normalizedRole =
      acc.role === 'admin_gudang'
        ? 'admin'
        : acc.role === 'master_gudang'
        ? 'master_admin'
        : acc.role;
    setFormRole(normalizedRole);
    setFormPassword(acc.rawPassword || '');
    setFormShowPassword(true);
    setFormPin(acc.rawPin || '');
    setFormSendEmail(true);
    setFormError('');
    setModalOpen(true);
  };

  const handleSaveAccount = async () => {
    const cleanName = formName.trim();
    const cleanEmail = formEmail.trim().toLowerCase();
    const cleanPin = formPin.replace(/\D/g, '');

    if (!cleanName) {
      setFormError('Nama wajib diisi.');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setFormError('Format email tidak valid.');
      return;
    }
    if (!editingAccount && formPassword.length < 6) {
      setFormError('Password minimal 6 karakter.');
      return;
    }
    if (formPassword && formPassword.length < 6) {
      setFormError('Password minimal 6 karakter.');
      return;
    }
    if (formRole === 'customer') {
      if (cleanPin && cleanPin.length > 4) {
        setFormError('Masukkan PIN maksimal 4 angka.');
        return;
      }
    } else if (cleanPin && cleanPin.length !== 12) {
      setFormError('PIN staff harus tepat 12 digit angka.');
      return;
    }

    setFormSaving(true);
    setFormError('');

    let savedRoleCode = editingAccount?.roleCode || '-';
    let rpcErrorMsg = '';

    try {
      if (!editingAccount) {
        let createRes = await supabase.rpc('persist_account_credentials_to_db', {
          p_email: cleanEmail,
          p_password: formPassword || null,
          p_pin: cleanPin || null,
          p_role: formRole,
          p_full_name: cleanName,
          p_phone: null,
        });

        if (
          createRes.error &&
          (createRes.error.code === 'PGRST202' ||
            String(createRes.error.message || '').includes('Could not find the function'))
        ) {
          createRes = await supabase.rpc('helpdesk_upsert_account', {
            p_target_user_id: null,
            p_email: cleanEmail,
            p_full_name: cleanName,
            p_role: formRole,
            p_password: formPassword || null,
            p_pin_12: cleanPin || null,
            p_role_code: null,
          });
        }

        if (createRes.error) {
          rpcErrorMsg = createRes.error.message;
        } else if ((createRes.data as any)?.ok === false) {
          rpcErrorMsg = String((createRes.data as any).error || 'Gagal menyimpan akun.');
        } else if ((createRes.data as any)?.role_code) {
          savedRoleCode = String((createRes.data as any).role_code);
        }
      } else {
        let updateRes = await supabase.rpc('helpdesk_update_account_credentials', {
          p_target_user_id: editingAccount.userId,
          p_new_email: cleanEmail,
          p_new_password: formPassword || null,
          p_new_pin: cleanPin || null,
          p_new_role: formRole,
        });

        if (
          updateRes.error &&
          (updateRes.error.code === 'PGRST202' ||
            String(updateRes.error.message || '').includes('Could not find the function'))
        ) {
          updateRes = await supabase.rpc('helpdesk_upsert_account', {
            p_target_user_id: editingAccount.userId,
            p_email: cleanEmail,
            p_full_name: cleanName,
            p_role: formRole,
            p_password: formPassword || null,
            p_pin_12: cleanPin || null,
            p_role_code: null,
          });
        }

        if (updateRes.error) {
          rpcErrorMsg = updateRes.error.message;
        } else if ((updateRes.data as any)?.ok === false) {
          rpcErrorMsg = String((updateRes.data as any).error || 'Gagal memperbarui akun.');
        } else if ((updateRes.data as any)?.role_code) {
          savedRoleCode = String((updateRes.data as any).role_code);
        }
      }
    } catch (err: any) {
      rpcErrorMsg = String(err?.message || err || 'Gagal terhubung ke Supabase.');
    }

    if (rpcErrorMsg) {
      setFormError(`Gagal menyimpan ke database: ${rpcErrorMsg}`);
      setFormSaving(false);
      return;
    }

    const shouldSendEmail = Boolean(editingAccount) && formSendEmail;
    let emailStatusNote = '';
    if (shouldSendEmail) {
      const sendWithTimeout = async () => {
        let timerId: number | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timerId = window.setTimeout(
            () => reject(new Error('Request timeout after 15000ms')),
            15_000
          );
        });
        try {
          return await Promise.race([
            supabase.auth.resetPasswordForEmail(cleanEmail, {
              redirectTo: `${window.location.origin}/login`,
            }),
            timeoutPromise,
          ]);
        } finally {
          if (timerId !== undefined) window.clearTimeout(timerId);
        }
      };

      try {
        const { error: mailErr } = await sendWithTimeout();
        if (mailErr) {
          const msg = String(mailErr.message || '').toLowerCase();
          const st = String((mailErr as any).status ?? '');
          if (st === '429' || msg.includes('rate limit') || msg.includes('too many requests')) {
            emailStatusNote = ` (Email gagal: Rate limit [${st || '429'}] ${mailErr.message})`;
          } else if (st === '500' || msg.includes('smtp') || msg.includes('error sending')) {
            emailStatusNote = ` (Email gagal: SMTP [${st || '500'}] ${mailErr.message})`;
          } else {
            emailStatusNote = ` (Email gagal [${st || 'ERR'}]: ${mailErr.message})`;
          }
        } else {
          emailStatusNote = ' & notifikasi email dikirim.';
        }
      } catch (err: any) {
        emailStatusNote = ` (Email gagal: ${String(err?.message || err)})`;
      }
    }

    recordAuditEvent({
      actorId: user?.roleCode || 'HD-001',
      actorName: user?.name || 'Helpdesk',
      actorRole: 'master_helpdesk',
      event: editingAccount ? 'helpdesk_account_updated' : 'helpdesk_account_created',
      category: 'akses',
      module: 'auth',
      action: `${editingAccount ? 'Memperbarui' : 'Membuat'} akun ${savedRoleCode} (${cleanEmail})`,
      entityType: 'Account',
      entityId: savedRoleCode,
      outcome: 'berhasil',
    });

    await loadAccountsFromServer();
    setFormSaving(false);
    setModalOpen(false);
    notify(
      `Akun ${savedRoleCode} ${editingAccount ? 'diperbarui' : 'ditambahkan'}${emailStatusNote}`
    );
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.email.toLowerCase() === (user?.email || '').toLowerCase()) {
      setDeleteError('Tidak dapat menghapus akun yang sedang aktif.');
      return;
    }

    setDeleteSaving(true);
    setDeleteError('');

    try {
      const { data, error } = await supabase.rpc('helpdesk_delete_account', {
        p_target_user_id: deleteTarget.userId,
        p_target_email: deleteTarget.email,
      });

      if (error) {
        setDeleteError(`Gagal menghapus akun: ${error.message}`);
        setDeleteSaving(false);
        return;
      }
      if ((data as any)?.ok === false) {
        setDeleteError(String((data as any).error || 'Gagal menghapus akun.'));
        setDeleteSaving(false);
        return;
      }
    } catch (err: any) {
      setDeleteError(`Koneksi database bermasalah: ${err?.message || 'Coba lagi'}`);
      setDeleteSaving(false);
      return;
    }

    recordAuditEvent({
      actorId: user?.roleCode || 'HD-001',
      actorName: user?.name || 'Helpdesk',
      actorRole: 'master_helpdesk',
      event: 'helpdesk_account_deleted',
      category: 'akses',
      module: 'auth',
      action: `Menghapus akun ${deleteTarget.roleCode} (${deleteTarget.email})`,
      entityType: 'Account',
      entityId: deleteTarget.roleCode,
      outcome: 'berhasil',
    });

    const removedCode = deleteTarget.roleCode;
    await loadAccountsFromServer();
    setDeleteSaving(false);
    setDeleteTarget(null);
    notify(`Akun ${removedCode} dihapus.`);
  };

  const roleFilterPills: { value: RoleFilterValue; label: string; count: number }[] = [
    { value: 'semua', label: 'Semua', count: roleCounts.semua },
    { value: 'admin', label: 'Admin', count: roleCounts.admin },
    { value: 'master_admin', label: 'Master Admin', count: roleCounts.master_admin },
    { value: 'master_helpdesk', label: 'Helpdesk', count: roleCounts.master_helpdesk },
    { value: 'customer', label: 'Customer', count: roleCounts.customer },
  ];

  return (
    <div className="space-y-4 sm:space-y-5 min-w-0">
      {/* Compact Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="admin-macro-page text-[#1E2230]">Helpdesk</h1>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            aria-label="Muat ulang data"
            title="Muat ulang data"
            disabled={loading}
            onClick={() => void loadAccountsFromServer()}
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-[12px] bg-white border border-[#D9DDE6] text-[#1E2230] hover:bg-[#F6F7FA] active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
          >
            <RefreshIcon spinning={loading} />
          </button>
          <ActionButton
            type="button"
            intent="start"
            icon={<PlusIcon size={16} />}
            onClick={openCreateModal}
            className="!min-h-[44px]"
          >
            Tambah Akun
          </ActionButton>
        </div>
      </div>

      {/* Single Clean Filter Row */}
      <div className="rounded-[20px] bg-white p-3.5 sm:p-4 shadow-[0_10px_30px_rgba(0,0,0,0.04)] space-y-3 min-w-0">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama, email, atau ID..."
            aria-label="Cari akun"
            className="admin-input md:max-w-xs"
          />

          <div
            role="tablist"
            aria-label="Filter role akun"
            className="flex items-center gap-2 overflow-x-auto pb-0.5 min-w-0 flex-1 [-webkit-overflow-scrolling:touch]"
          >
            {roleFilterPills.map((pill) => {
              const active = roleFilter === pill.value;
              return (
                <button
                  key={pill.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setRoleFilter(pill.value)}
                  className={`min-h-[44px] md:min-h-[38px] px-3.5 rounded-[12px] text-[13px] whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#1E2230] text-white border border-[#1E2230] font-semibold shadow-sm'
                      : 'bg-white text-[#1E2230] border border-[#D9DDE6] hover:bg-[#F6F7FA] font-medium'
                  }`}
                >
                  {pill.label}{' '}
                  <span className="tabular-nums opacity-85">({pill.count})</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Error State */}
      {loadError && (
        <div
          role="alert"
          className="rounded-[16px] bg-[#FDE3E9] border border-[#F5B7C5] px-4 py-3 text-[13px] text-[#B4234A] flex flex-wrap items-center justify-between gap-3"
        >
          <span className="font-medium break-words min-w-0 flex-1">{loadError}</span>
          <ActionButton
            type="button"
            intent="neutral"
            onClick={() => void loadAccountsFromServer()}
            className="!min-h-[44px]"
          >
            Coba Lagi
          </ActionButton>
        </div>
      )}

      {/* Loading State */}
      {loading && accounts.length === 0 ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-24 rounded-[16px] bg-white p-4">
              <div className="admin-skeleton h-full w-full" />
            </div>
          ))}
        </div>
      ) : filteredAccounts.length === 0 ? (
        <div className="rounded-[20px] bg-white py-12 px-4 text-center shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
          <p className="text-[14px] text-[#646B7C]">Belum ada akun</p>
        </div>
      ) : (
        <>
          {/* Mobile (< 768px): Stacked Account Cards */}
          <div className="space-y-3 md:hidden">
            {filteredAccounts.map((acc) => {
              const isCustomer = acc.role === 'customer';
              const showPw = Boolean(revealedPasswords[acc.userId]);
              const showPin = Boolean(revealedPins[acc.userId]);
              return (
                <div
                  key={acc.userId}
                  className="rounded-[16px] bg-white border border-[#E6E9F0] p-4 space-y-3 shadow-[0_6px_20px_rgba(0,0,0,0.03)] min-w-0"
                >
                  {/* Card Header: Name + Compact Role • Role ID badge */}
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-[15px] text-[#1E2230] break-words">
                        {acc.fullName}
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap shrink-0 ${getRoleBadgeColor(
                        acc.role
                      )}`}
                    >
                      {getCompactRoleName(acc.role)} &bull; {acc.roleCode}
                    </span>
                  </div>

                  {/* Essential Credential Rows */}
                  <div className="space-y-2 pt-2 border-t border-[#EEF0F4] text-[13px]">
                    {/* Email Row */}
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <span className="text-[12px] text-[#646B7C] shrink-0">Email</span>
                      <div className="flex items-center gap-1 min-w-0 justify-end">
                        <span className="font-mono text-[#1E2230] truncate max-w-[180px]">
                          {acc.email}
                        </span>
                        <button
                          type="button"
                          aria-label={`Salin email ${acc.email}`}
                          onClick={() => void handleCopy(acc.email, 'Email')}
                          className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-[10px] text-[#646B7C] hover:text-[#1E2230] hover:bg-[#F6F7FA] cursor-pointer shrink-0"
                        >
                          <CopyIcon />
                        </button>
                      </div>
                    </div>

                    {/* Password Row */}
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <span className="text-[12px] text-[#646B7C] shrink-0">Password</span>
                      <div className="flex items-center gap-1 min-w-0 justify-end">
                        <span className="font-mono text-[#1E2230] truncate max-w-[150px]">
                          {acc.rawPassword
                            ? showPw
                              ? acc.rawPassword
                              : '••••••••'
                            : '-'}
                        </span>
                        {acc.rawPassword && (
                          <>
                            <button
                              type="button"
                              aria-label={showPw ? 'Sembunyikan password' : 'Tampilkan password'}
                              onClick={() =>
                                setRevealedPasswords((prev) => ({
                                  ...prev,
                                  [acc.userId]: !showPw,
                                }))
                              }
                              className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-[10px] text-[#646B7C] hover:text-[#1E2230] hover:bg-[#F6F7FA] cursor-pointer shrink-0"
                            >
                              {showPw ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                            </button>
                            <button
                              type="button"
                              aria-label="Salin password"
                              onClick={() => void handleCopy(acc.rawPassword, 'Password')}
                              className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-[10px] text-[#646B7C] hover:text-[#1E2230] hover:bg-[#F6F7FA] cursor-pointer shrink-0"
                            >
                              <CopyIcon />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* PIN Row */}
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <span className="text-[12px] text-[#646B7C] shrink-0">PIN</span>
                      <div className="flex items-center gap-1 min-w-0 justify-end">
                        <div className="text-right min-w-0">
                          <div className="font-mono text-[#1E2230]">
                            {acc.rawPin
                              ? showPin
                                ? acc.rawPin
                                : isCustomer
                                ? '••••'
                                : '••••••••••••'
                              : '-'}
                          </div>
                          {!isCustomer && acc.rawPin5 && (
                            <div className="font-mono text-[11px] text-[#646B7C]">
                              5-digit: {showPin ? acc.rawPin5 : '•••••'}
                            </div>
                          )}
                        </div>
                        {acc.rawPin && (
                          <>
                            <button
                              type="button"
                              aria-label={showPin ? 'Sembunyikan PIN' : 'Tampilkan PIN'}
                              onClick={() =>
                                setRevealedPins((prev) => ({
                                  ...prev,
                                  [acc.userId]: !showPin,
                                }))
                              }
                              className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-[10px] text-[#646B7C] hover:text-[#1E2230] hover:bg-[#F6F7FA] cursor-pointer shrink-0"
                            >
                              {showPin ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                            </button>
                            <button
                              type="button"
                              aria-label="Salin PIN"
                              onClick={() => void handleCopy(acc.rawPin, 'PIN')}
                              className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-[10px] text-[#646B7C] hover:text-[#1E2230] hover:bg-[#F6F7FA] cursor-pointer shrink-0"
                            >
                              <CopyIcon />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Footer Actions */}
                  <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-[#EEF0F4]">
                    <ActionButton
                      type="button"
                      intent="wait"
                      icon={<PencilIcon size={15} />}
                      onClick={() => openEditModal(acc)}
                      className="w-full justify-center !min-h-[44px]"
                    >
                      Edit
                    </ActionButton>
                    <ActionButton
                      type="button"
                      intent="cancel"
                      icon={<TrashIcon size={15} />}
                      onClick={() => {
                        setDeleteError('');
                        setDeleteTarget(acc);
                      }}
                      className="w-full justify-center !min-h-[44px]"
                    >
                      Hapus
                    </ActionButton>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop / Tablet (>= 768px): Uncluttered 5-column table */}
          <div className="hidden md:block rounded-[20px] bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.04)] overflow-x-auto">
            <table className="w-full text-left border-collapse text-[13px] text-[#1E2230]">
              <thead>
                <tr className="bg-[#F6F7FA] text-[#646B7C]">
                  <th className="h-10 px-3.5 font-medium text-[12px] rounded-l-[12px]">Akun &amp; ID</th>
                  <th className="h-10 px-3.5 font-medium text-[12px]">Email</th>
                  <th className="h-10 px-3.5 font-medium text-[12px]">Password</th>
                  <th className="h-10 px-3.5 font-medium text-[12px]">PIN</th>
                  <th className="h-10 px-3.5 font-medium text-[12px] text-right rounded-r-[12px]">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.map((acc) => {
                  const isCustomer = acc.role === 'customer';
                  const showPw = Boolean(revealedPasswords[acc.userId]);
                  const showPin = Boolean(revealedPins[acc.userId]);
                  return (
                    <tr
                      key={acc.userId}
                      className="border-b border-[#EEF0F4] last:border-b-0 hover:bg-[#F6F7FA]/60 transition-colors"
                    >
                      <td className="py-3 px-3.5 align-middle">
                        <div className="font-semibold text-[#1E2230]">{acc.fullName}</div>
                        <span
                          className={`mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${getRoleBadgeColor(
                            acc.role
                          )}`}
                        >
                          {getCompactRoleName(acc.role)} &bull; {acc.roleCode}
                        </span>
                      </td>

                      <td className="py-3 px-3.5 align-middle">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[#1E2230]">{acc.email}</span>
                          <button
                            type="button"
                            aria-label={`Salin email ${acc.email}`}
                            onClick={() => void handleCopy(acc.email, 'Email')}
                            className="p-1.5 rounded-[8px] text-[#646B7C] hover:text-[#1E2230] hover:bg-[#EEF0F4] cursor-pointer"
                          >
                            <CopyIcon size={14} />
                          </button>
                        </div>
                      </td>

                      <td className="py-3 px-3.5 align-middle">
                        {acc.rawPassword ? (
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-[#1E2230]">
                              {showPw ? acc.rawPassword : '••••••••'}
                            </span>
                            <button
                              type="button"
                              aria-label={showPw ? 'Sembunyikan password' : 'Tampilkan password'}
                              onClick={() =>
                                setRevealedPasswords((prev) => ({
                                  ...prev,
                                  [acc.userId]: !showPw,
                                }))
                              }
                              className="p-1.5 rounded-[8px] text-[#646B7C] hover:text-[#1E2230] hover:bg-[#EEF0F4] cursor-pointer"
                            >
                              {showPw ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
                            </button>
                            <button
                              type="button"
                              aria-label="Salin password"
                              onClick={() => void handleCopy(acc.rawPassword, 'Password')}
                              className="p-1.5 rounded-[8px] text-[#646B7C] hover:text-[#1E2230] hover:bg-[#EEF0F4] cursor-pointer"
                            >
                              <CopyIcon size={14} />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[#9CA3AF]">-</span>
                        )}
                      </td>

                      <td className="py-3 px-3.5 align-middle">
                        {acc.rawPin ? (
                          <div className="flex items-center gap-1">
                            <div>
                              <div className="font-mono text-[#1E2230]">
                                {showPin ? acc.rawPin : isCustomer ? '••••' : '••••••••••••'}
                              </div>
                              {!isCustomer && acc.rawPin5 && (
                                <div className="font-mono text-[11px] text-[#646B7C]">
                                  5-digit: {showPin ? acc.rawPin5 : '•••••'}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              aria-label={showPin ? 'Sembunyikan PIN' : 'Tampilkan PIN'}
                              onClick={() =>
                                setRevealedPins((prev) => ({
                                  ...prev,
                                  [acc.userId]: !showPin,
                                }))
                              }
                              className="p-1.5 rounded-[8px] text-[#646B7C] hover:text-[#1E2230] hover:bg-[#EEF0F4] cursor-pointer"
                            >
                              {showPin ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
                            </button>
                            <button
                              type="button"
                              aria-label="Salin PIN"
                              onClick={() => void handleCopy(acc.rawPin, 'PIN')}
                              className="p-1.5 rounded-[8px] text-[#646B7C] hover:text-[#1E2230] hover:bg-[#EEF0F4] cursor-pointer"
                            >
                              <CopyIcon size={14} />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[#9CA3AF]">-</span>
                        )}
                      </td>

                      <td className="py-3 px-3.5 align-middle text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <ActionButton
                            type="button"
                            intent="wait"
                            icon={<PencilIcon size={14} />}
                            onClick={() => openEditModal(acc)}
                          >
                            Edit
                          </ActionButton>
                          <ActionButton
                            type="button"
                            intent="cancel"
                            icon={<TrashIcon size={14} />}
                            onClick={() => {
                              setDeleteError('');
                              setDeleteTarget(acc);
                            }}
                          >
                            Hapus
                          </ActionButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal: Tambah / Edit Akun */}
      <CenterDialog
        isOpen={modalOpen}
        onClose={() => !formSaving && setModalOpen(false)}
        title={editingAccount ? `Edit Akun (${editingAccount.roleCode})` : 'Tambah Akun'}
        maxWidthClass="max-w-[480px]"
        footer={
          <>
            <ActionButton
              type="button"
              intent="neutral"
              disabled={formSaving}
              onClick={() => setModalOpen(false)}
              className="flex-1 sm:flex-none justify-center !min-h-[44px]"
            >
              Batal
            </ActionButton>
            <ActionButton
              type="button"
              intent="start"
              disabled={formSaving}
              onClick={() => void handleSaveAccount()}
              className="flex-1 sm:flex-none justify-center !min-h-[44px]"
            >
              {formSaving
                ? 'Menyimpan...'
                : editingAccount
                ? 'Simpan Perubahan'
                : 'Simpan Akun'}
            </ActionButton>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <div
              role="alert"
              className="p-3 rounded-[10px] bg-[#FDE3E9] text-[#B4234A] text-[13px] font-medium"
            >
              {formError}
            </div>
          )}

          <FormField id="hd-acc-role" label="Role">
            <select
              id="hd-acc-role"
              value={formRole}
              onChange={(e) => {
                const nextRole = e.target.value as HelpdeskRoleType;
                setFormRole(nextRole);
                if (nextRole === 'customer') {
                  setFormPin((prev) =>
                    prev === '123456789012' ? '' : prev.replace(/\D/g, '').slice(0, 4)
                  );
                }
              }}
              className="admin-input"
            >
              <option value="admin">Admin</option>
              <option value="master_admin">Master Admin</option>
              <option value="master_helpdesk">Helpdesk</option>
              <option value="mekanik">Mekanik</option>
              <option value="customer">Customer</option>
            </select>
          </FormField>

          <FormField id="hd-acc-name" label="Nama">
            <input
              id="hd-acc-name"
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Nama lengkap"
              className="admin-input"
            />
          </FormField>

          <FormField id="hd-acc-email" label="Email">
            <input
              id="hd-acc-email"
              type="email"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              placeholder="email@domain.com"
              className="admin-input font-mono"
            />
          </FormField>

          <FormField id="hd-acc-password" label="Password">
            <div className="flex items-center gap-2">
              <input
                id="hd-acc-password"
                type={formShowPassword ? 'text' : 'password'}
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                className="admin-input font-mono flex-1"
              />
              <button
                type="button"
                aria-label={formShowPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                onClick={() => setFormShowPassword((v) => !v)}
                className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-[12px] bg-white border border-[#D9DDE6] text-[#646B7C] hover:text-[#1E2230] cursor-pointer shrink-0"
              >
                {formShowPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
              </button>
            </div>
          </FormField>

          <FormField
            id="hd-acc-pin"
            label={formRole === 'customer' ? 'PIN (Maksimal 4 Angka)' : 'PIN (12 Digit Angka)'}
            helperText={
              formRole === 'customer' ? 'Masukkan PIN maksimal 4 angka.' : undefined
            }
          >
            <input
              id="hd-acc-pin"
              type="text"
              inputMode="numeric"
              maxLength={formRole === 'customer' ? 4 : 12}
              value={formPin}
              onChange={(e) =>
                setFormPin(
                  e.target.value
                    .replace(/\D/g, '')
                    .slice(0, formRole === 'customer' ? 4 : 12)
                )
              }
              placeholder={formRole === 'customer' ? '1234' : '123456789012'}
              className="admin-input font-mono tracking-wider"
            />
          </FormField>

          {formRole !== 'customer' && (
            <div className="px-3 py-2.5 rounded-[10px] bg-[#FEF3C7]/60 border border-[#FDE68A] flex items-center justify-between gap-2 text-[12px]">
              <span className="font-medium text-[#92400E]">PIN 5 Digit:</span>
              <span className="font-mono font-bold text-[#92400E] tabular-nums">
                {deriveFiveDigitPin(formPin) || '-'}
              </span>
            </div>
          )}

          {editingAccount && (
            <label className="flex items-center gap-2.5 p-3 rounded-[10px] bg-[#F6F7FA] border border-[#EEF0F4] cursor-pointer min-h-[44px]">
              <input
                type="checkbox"
                checked={formSendEmail}
                onChange={(e) => setFormSendEmail(e.target.checked)}
                className="w-4 h-4 rounded accent-[#1E2230]"
              />
              <span className="text-[13px] text-[#1E2230]">
                Kirim notifikasi ke email
              </span>
            </label>
          )}
        </div>
      </CenterDialog>

      {/* Modal: Konfirmasi Hapus */}
      <CenterDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => !deleteSaving && setDeleteTarget(null)}
        title="Hapus Akun"
        subtitle={deleteTarget ? `${deleteTarget.fullName} (${deleteTarget.roleCode})` : undefined}
        maxWidthClass="max-w-[420px]"
        footer={
          <>
            <ActionButton
              type="button"
              intent="neutral"
              disabled={deleteSaving}
              onClick={() => setDeleteTarget(null)}
              className="flex-1 sm:flex-none justify-center !min-h-[44px]"
            >
              Batal
            </ActionButton>
            <ActionButton
              type="button"
              intent="cancel"
              disabled={deleteSaving}
              onClick={() => void handleConfirmDelete()}
              className="flex-1 sm:flex-none justify-center !min-h-[44px]"
            >
              {deleteSaving ? 'Menghapus...' : 'Hapus'}
            </ActionButton>
          </>
        }
      >
        {deleteTarget && (
          <div className="space-y-3 text-[13px] text-[#1E2230]">
            {deleteError && (
              <div
                role="alert"
                className="p-3 rounded-[10px] bg-[#FDE3E9] text-[#B4234A] font-medium"
              >
                {deleteError}
              </div>
            )}
            <p className="leading-relaxed break-words">
              Hapus permanen akun <strong>{deleteTarget.email}</strong>?
            </p>
          </div>
        )}
      </CenterDialog>
    </div>
  );
};

export default HelpDeskCenter;
