import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useAdmin,
  addMechanicRecord,
  deactivateMechanicRecord,
} from '../../context/AdminContext';
import {
  useAuth,
  SEED_ACCOUNTS,
  deriveFiveDigitPin,
} from '../../lib/mockAuth';
import { getManagedAccounts } from '../../lib/mockCredentials';
import { supabase } from '../../lib/supabase';
import type { Mechanic } from '../../data/adminDummy';
import { DataCard } from '../../components/admin/DataCard';
import { DataTable, Column } from '../../components/admin/DataTable';
import { StatusChip } from '../../components/admin/StatusChip';
import {
  ActionButton,
  EyeIcon,
  EyeOffIcon,
  IconActionButton,
  XIconButton,
} from '../../components/admin/ActionButton';
import { FormField } from '../../components/admin/FormField';
import { SidePanel } from '../../components/admin/SidePanel';
import { CenterDialog } from '../../components/admin/CenterDialog';
import {
  setLastTriggerElement,
  useActionIsland,
} from '../../components/admin/island/IslandSystem';
import { todayISO, nowTime } from '../../lib/format';

const calcMinutes = (checkIn?: string, checkOut?: string): number | undefined => {
  if (!checkIn || !checkOut) return undefined;
  const [h1, m1] = checkIn.replace(':', '.').split('.').map(Number);
  const [h2, m2] = checkOut.replace(':', '.').split('.').map(Number);
  if (isNaN(h1) || isNaN(m1) || isNaN(h2) || isNaN(m2)) return undefined;
  return Math.max(0, h2 * 60 + m2 - (h1 * 60 + m1));
};

const formatDuration = (mins?: number): string => {
  if (mins === undefined) return 'Belum tercatat';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}j ${m}m`;
};

const V1Attendance: React.FC = () => {
  const {
    mechanics,
    workOrders,
    attendance,
    addAttendanceCheckIn,
    updateAttendance,
  } = useAdmin();
  const { adminEmail, role, user } = useAuth();
  const { notifyAction } = useActionIsland();
  const canExecuteServis = role === 'admin';
  const activeAdminEmail = (user?.email || adminEmail || SEED_ACCOUNTS.admin.email)
    .trim()
    .toLowerCase();

  const [selectedDate, setSelectedDate] = useState<string>(todayISO());
  const [isListOpen, setIsListOpen] = useState<boolean>(false);

  // Error shown inside "Daftar mekanik" panel when trying to delete an assigned mechanic
  const [deleteBlockError, setDeleteBlockError] = useState<string>('');

  // Admin credential gate + New mechanic form dialog state
  const [addModalStep, setAddModalStep] = useState<'closed' | 'auth' | 'form'>('closed');
  const [authEmail, setAuthEmail] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authShowPassword, setAuthShowPassword] = useState<boolean>(false);
  const [authChecking, setAuthChecking] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string>('');
  const [authFailCount, setAuthFailCount] = useState<number>(0);
  const [authLockedUntil, setAuthLockedUntil] = useState<number>(0);

  // New mechanic form fields
  const [newNama, setNewNama] = useState<string>('');
  const [newHp, setNewHp] = useState<string>('');
  const [newAlamat, setNewAlamat] = useState<string>('');
  const [newErrors, setNewErrors] = useState<{
    nama?: string;
    hp?: string;
    alamat?: string;
  }>({});

  // PIN gate + reason dialog state for deleting a mechanic
  const [deleteTarget, setDeleteTarget] = useState<Mechanic | null>(null);
  const [deleteReason, setDeleteReason] = useState<string>('');
  const [deleteReasonError, setDeleteReasonError] = useState<string>('');
  const [pinValue, setPinValue] = useState<string>('');
  const [pinChecking, setPinChecking] = useState<boolean>(false);
  const [pinError, setPinError] = useState<string>('');
  const [pinFailCount, setPinFailCount] = useState<number>(0);
  const [pinLockedUntil, setPinLockedUntil] = useState<number>(0);

  const closeListPanel = useCallback(() => setIsListOpen(false), []);
  const closeAddModal = useCallback(() => setAddModalStep('closed'), []);
  const closeDeleteModal = useCallback(() => setDeleteTarget(null), []);

  // When transitioning from 'auth' to 'form', focus the first input of the new mechanic form
  useEffect(() => {
    if (addModalStep !== 'form') return;
    const t = window.setTimeout(() => {
      document.getElementById('new-mech-nama')?.focus();
    }, 40);
    return () => window.clearTimeout(t);
  }, [addModalStep]);

  // Tick every second while either lock timer is active
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    if (authLockedUntil <= Date.now() && pinLockedUntil <= Date.now()) return;
    const id = window.setInterval(() => {
      const current = Date.now();
      setNowMs(current);
      if (authLockedUntil > 0 && current >= authLockedUntil) {
        setAuthLockedUntil(0);
        setAuthFailCount(0);
        setAuthError('');
      }
      if (pinLockedUntil > 0 && current >= pinLockedUntil) {
        setPinLockedUntil(0);
        setPinFailCount(0);
        setPinError('');
      }
    }, 500);
    return () => window.clearInterval(id);
  }, [authLockedUntil, pinLockedUntil]);

  const activeMechanics = useMemo(
    () => mechanics.filter((m) => m.active),
    [mechanics]
  );

  const getRecord = (mechanicId: string) =>
    attendance.find((a) => a.mechanicId === mechanicId && a.date === selectedDate);

  const handleCheckIn = (mechanicId: string) => {
    addAttendanceCheckIn(mechanicId, selectedDate, nowTime());
  };

  const handleCheckOut = (mechanicId: string) => {
    const rec = getRecord(mechanicId);
    if (!rec) return;
    const out = nowTime();
    updateAttendance(rec.id, {
      checkOut: out,
      workHoursMinutes: calcMinutes(rec.checkIn, out),
    });
  };

  const handleOpenListPanel = (e: React.MouseEvent<HTMLElement>) => {
    setLastTriggerElement(e.currentTarget);
    setDeleteBlockError('');
    setIsListOpen(true);
  };

  const handleOpenNewMechanicGate = (e: React.MouseEvent<HTMLElement>) => {
    setLastTriggerElement(e.currentTarget);
    setDeleteBlockError('');
    setAuthEmail(activeAdminEmail);
    setAuthPassword('');
    setAuthShowPassword(false);
    setAuthChecking(false);
    setAuthError('');
    setNewNama('');
    setNewHp('');
    setNewAlamat('');
    setNewErrors({});
    setAddModalStep('auth');
  };

  const isAuthLocked = authLockedUntil > nowMs;
  const authRemainingSec = isAuthLocked
    ? Math.max(1, Math.ceil((authLockedUntil - nowMs) / 1000))
    : 0;

  const handleVerifyAdminCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAuthLocked || authChecking) return;

    const cleanInputEmail = authEmail.trim().toLowerCase();
    if (!cleanInputEmail || !authPassword) {
      setAuthError('Email dan kata sandi wajib diisi.');
      return;
    }

    if (cleanInputEmail !== activeAdminEmail) {
      const nextFails = authFailCount + 1;
      setAuthFailCount(nextFails);
      if (nextFails >= 3) {
        setAuthLockedUntil(Date.now() + 30_000);
        setNowMs(Date.now());
        setAuthError(
          `Email tidak sesuai dengan akun Admin aktif (${activeAdminEmail}). Dialog dikunci selama 30 detik.`
        );
      } else {
        setAuthError(
          `Email tidak sesuai dengan akun Admin yang sedang masuk (${activeAdminEmail}).`
        );
      }
      return;
    }

    setAuthChecking(true);
    setAuthError('');
    let verified = false;

    try {
      let { data, error } = await supabase.rpc('verify_account_login_and_pin', {
        p_email: cleanInputEmail,
        p_password: authPassword,
        p_pin: '',
      });
      if (
        error &&
        (error.code === 'PGRST202' ||
          String(error.message || '').includes('Could not find the function'))
      ) {
        const alt = await supabase.rpc('authenticate_account_login', {
          p_email: cleanInputEmail,
          p_password: authPassword,
          p_pin: '',
        });
        data = alt.data;
        error = alt.error;
      }

      if (!error && data) {
        const res = data as any;
        const dbRole = String(res.role || '').trim().toLowerCase();
        if (res.ok && (dbRole === 'admin' || dbRole === 'admin_gudang')) {
          verified = true;
        }
      } else if (error) {
        // Offline / missing-RPC fallback against active managed registry or default seed
        const managed = getManagedAccounts().find(
          (acc) => acc.email.trim().toLowerCase() === cleanInputEmail
        );
        if (
          managed &&
          (managed.role === 'admin' || managed.role === 'admin_gudang') &&
          managed.password === authPassword
        ) {
          verified = true;
        } else if (
          cleanInputEmail === SEED_ACCOUNTS.admin.email &&
          authPassword === SEED_ACCOUNTS.admin.password
        ) {
          verified = true;
        }
      }
    } catch {
      const managed = getManagedAccounts().find(
        (acc) => acc.email.trim().toLowerCase() === cleanInputEmail
      );
      if (
        managed &&
        (managed.role === 'admin' || managed.role === 'admin_gudang') &&
        managed.password === authPassword
      ) {
        verified = true;
      } else if (
        cleanInputEmail === SEED_ACCOUNTS.admin.email &&
        authPassword === SEED_ACCOUNTS.admin.password
      ) {
        verified = true;
      }
    } finally {
      setAuthChecking(false);
    }

    if (!verified) {
      const nextFails = authFailCount + 1;
      setAuthFailCount(nextFails);
      if (nextFails >= 3) {
        const until = Date.now() + 30_000;
        setAuthLockedUntil(until);
        setNowMs(Date.now());
        setAuthError(
          'Email atau kata sandi tidak cocok. Dialog dikunci selama 30 detik.'
        );
      } else {
        setAuthError('Email atau kata sandi tidak cocok.');
      }
      return;
    }

    // Passed for this one add only
    setAuthFailCount(0);
    setAuthError('');
    setAuthEmail('');
    setAuthPassword('');
    setAddModalStep('form');
  };

  const handleSaveNewMechanic = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: { nama?: string; hp?: string; alamat?: string } = {};
    if (!newNama.trim()) {
      errs.nama = 'Nama mekanik wajib diisi.';
    }
    if (!newHp.trim()) {
      errs.hp = 'Nomor HP wajib diisi.';
    } else if (!/^\d{9,13}$/.test(newHp.trim())) {
      errs.hp = 'Nomor HP harus berupa 9 sampai 13 angka.';
    }
    if (!newAlamat.trim()) {
      errs.alamat = 'Alamat wajib diisi.';
    }

    if (Object.keys(errs).length > 0) {
      setNewErrors(errs);
      return;
    }

    const created = addMechanicRecord({
      nama: newNama.trim(),
      hp: newHp.trim(),
      alamat: newAlamat.trim(),
    });

    setAddModalStep('closed');
    notifyAction({
      message: `${created.nama} ditambahkan ke daftar mekanik.`,
    });
  };

  const handleClickDeleteMechanic = (
    m: Mechanic,
    e: React.MouseEvent<HTMLElement>
  ) => {
    setDeleteBlockError('');
    const runningWOs = workOrders.filter(
      (wo) => wo.endState === null && wo.mechanicId === m.id
    );
    if (runningWOs.length > 0) {
      setDeleteBlockError(
        `Mekanik masih ditugaskan di ${runningWOs.length} work order berjalan. Pindahkan dulu.`
      );
      return;
    }

    setLastTriggerElement(e.currentTarget);
    setDeleteReason('');
    setDeleteReasonError('');
    setPinValue('');
    setPinChecking(false);
    setPinError('');
    setDeleteTarget(m);
  };

  const isPinLocked = pinLockedUntil > nowMs;
  const pinRemainingSec = isPinLocked
    ? Math.max(1, Math.ceil((pinLockedUntil - nowMs) / 1000))
    : 0;

  const handleVerifyDeletePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteTarget || isPinLocked || pinChecking) return;

    const trimmedReason = deleteReason.trim();
    if (!trimmedReason) {
      setDeleteReasonError('Alasan penghapusan wajib diisi.');
      document.getElementById('delete-mech-reason')?.focus();
      return;
    }

    const cleanPin = pinValue.replace(/\D/g, '');
    if (!cleanPin) {
      setPinError('PIN admin wajib diisi.');
      document.getElementById('delete-mech-pin')?.focus();
      return;
    }

    setPinChecking(true);
    setPinError('');
    let pinValid = false;

    const sessionCandidates = new Set<string>();
    if (user?.pin) {
      sessionCandidates.add(user.pin);
      const derived = deriveFiveDigitPin(user.pin);
      if (derived) sessionCandidates.add(derived);
    }
    if (user?.pin5) sessionCandidates.add(user.pin5);

    const managed = getManagedAccounts().find(
      (acc) => acc.email.trim().toLowerCase() === activeAdminEmail
    );
    if (managed?.pin12) {
      sessionCandidates.add(managed.pin12);
      const derived = deriveFiveDigitPin(managed.pin12);
      if (derived) sessionCandidates.add(derived);
    }
    if (managed?.pin5) sessionCandidates.add(managed.pin5);

    if (activeAdminEmail === SEED_ACCOUNTS.admin.email && sessionCandidates.size === 0) {
      sessionCandidates.add(SEED_ACCOUNTS.admin.pin);
      sessionCandidates.add(SEED_ACCOUNTS.admin.pin5);
    }

    if (sessionCandidates.has(cleanPin)) {
      pinValid = true;
    } else {
      try {
        const { data: rpcPinOk, error: rpcPinErr } = await supabase.rpc('verify_user_pin', {
          p_email: activeAdminEmail,
          p_pin: cleanPin,
        });
        if (!rpcPinErr && rpcPinOk === true) {
          pinValid = true;
        }
      } catch {
        // ignore RPC error
      }
    }
    setPinChecking(false);

    if (!pinValid) {
      const nextFails = pinFailCount + 1;
      setPinFailCount(nextFails);
      if (nextFails >= 3) {
        const until = Date.now() + 30_000;
        setPinLockedUntil(until);
        setNowMs(Date.now());
        setPinError('PIN salah. Dialog dikunci selama 30 detik.');
      } else {
        setPinError('PIN salah.');
      }
      document.getElementById('delete-mech-pin')?.focus();
      return;
    }

    const targetName = deleteTarget.nama;
    const res = deactivateMechanicRecord(deleteTarget.id, trimmedReason);
    if (!res.ok) {
      setDeleteBlockError(res.error || 'Tidak dapat menghapus mekanik.');
      setDeleteTarget(null);
      return;
    }

    setPinFailCount(0);
    setPinError('');
    setPinValue('');
    setDeleteReason('');
    setDeleteReasonError('');
    setDeleteTarget(null);
    notifyAction({
      message: `${targetName} dihapus dari daftar aktif.`,
    });
  };

  const columns: Column<Mechanic>[] = [
    {
      key: 'nama',
      header: 'Mekanik',
      render: (m) => m.nama,
    },
    {
      key: 'checkIn',
      header: 'Jam masuk',
      render: (m) => {
        const val = getRecord(m.id)?.checkIn;
        return val ? (
          <data value={val} className="tabular-nums font-mono font-medium">
            {val}
          </data>
        ) : (
          <span className="text-[#646B7C]">Belum tercatat</span>
        );
      },
    },
    {
      key: 'checkOut',
      header: 'Jam pulang',
      render: (m) => {
        const val = getRecord(m.id)?.checkOut;
        return val ? (
          <data value={val} className="tabular-nums font-mono font-medium">
            {val}
          </data>
        ) : (
          <span className="text-[#646B7C]">Belum tercatat</span>
        );
      },
    },
    {
      key: 'duration',
      header: 'Jam kerja',
      render: (m) => {
        const rec = getRecord(m.id);
        const mins = rec?.workHoursMinutes ?? calcMinutes(rec?.checkIn, rec?.checkOut);
        if (mins === undefined) {
          return <span className="text-[#646B7C]">Belum tercatat</span>;
        }
        return (
          <data value={mins} className="tabular-nums font-mono font-medium">
            {formatDuration(mins)}
          </data>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (m) => {
        const rec = getRecord(m.id);
        if (!rec?.checkIn) return <StatusChip status="Menunggu" />;
        if (!rec.checkOut) return <StatusChip status="Belum pulang" needsAction />;
        return <StatusChip status="Selesai" />;
      },
    },
    {
      key: 'actions',
      header: 'Aksi',
      render: (m) => {
        const rec = getRecord(m.id);
        if (!canExecuteServis) {
          return <span className="text-[12px] text-[#646B7C]">Mode pantau</span>;
        }
        if (!rec?.checkIn) {
          return (
            <ActionButton intent="start" onClick={() => handleCheckIn(m.id)}>
              Catat masuk
            </ActionButton>
          );
        }
        if (!rec.checkOut) {
          return (
            <ActionButton intent="cream" onClick={() => handleCheckOut(m.id)}>
              Catat pulang
            </ActionButton>
          );
        }
        // After both check-in and check-out, show the two times and no button
        return null;
      },
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <DataCard
        title="Absen Mekanik"
        actions={
          <div className="flex items-center gap-2.5">
            <label htmlFor="att-date" className="admin-micro text-[#646B7C]">
              Tanggal:
            </label>
            <input
              id="att-date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="admin-input w-auto"
            />
            <IconActionButton
              intent="start"
              ariaLabel="Daftar mekanik"
              title="Daftar mekanik"
              onClick={handleOpenListPanel}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path
                  d="M9 3.75V14.25M3.75 9H14.25"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </IconActionButton>
          </div>
        }
      >
        <DataTable
          columns={columns}
          data={activeMechanics}
          keyExtractor={(m) => m.id}
          swapKey={`${selectedDate}-${activeMechanics.length}`}
        />
      </DataCard>

      {/* SidePanel: Daftar mekanik */}
      <SidePanel
        isOpen={isListOpen}
        onClose={closeListPanel}
        title="Daftar mekanik"
        widthClass="max-w-[640px]"
      >
        <div className="space-y-4">
          {canExecuteServis ? (
            <div className="flex items-center justify-between gap-3">
              <ActionButton intent="start" onClick={handleOpenNewMechanicGate}>
                Mekanik baru
              </ActionButton>
            </div>
          ) : (
            <p className="text-[12px] font-medium text-[#646B7C]">
              Mode pantau (Read-only): Hanya Admin yang dapat menambah atau menghapus data mekanik.
            </p>
          )}

          {deleteBlockError && (
            <div
              role="alert"
              className="p-3.5 rounded-[12px] bg-[rgba(242,70,111,0.08)] border border-[rgba(242,70,111,0.3)] text-[14px] text-[#D62E5A]"
            >
              {deleteBlockError}
            </div>
          )}

          <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
            <table className="w-full text-left border-collapse text-[14px] bg-white min-w-[520px]">
              <thead>
                <tr className="bg-[#F6F7FA] text-[#646B7C]">
                  <th className="py-2.5 px-3 admin-micro whitespace-nowrap rounded-l-[12px]">ID Mekanik</th>
                  <th className="py-2.5 px-3 admin-micro whitespace-nowrap">Nama Mekanik</th>
                  <th className="py-2.5 px-3 admin-micro whitespace-nowrap">Nomor HP</th>
                  <th
                    className={`py-2.5 px-3 admin-micro whitespace-nowrap ${
                      !canExecuteServis ? 'rounded-r-[12px]' : ''
                    }`}
                  >
                    Alamat
                  </th>
                  {canExecuteServis && (
                    <th className="py-2.5 px-3 admin-micro whitespace-nowrap text-right rounded-r-[12px]">
                      Aksi
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {activeMechanics.length === 0 ? (
                  <tr className="border-b border-[#EEF0F4]">
                    <td colSpan={canExecuteServis ? 5 : 4} className="py-4 text-center text-[#646B7C]">
                      Belum ada mekanik aktif.
                    </td>
                  </tr>
                ) : (
                  activeMechanics.map((m) => (
                    <tr key={m.id} className="h-[52px] border-b border-[#EEF0F4]">
                      <td className="px-3 font-mono font-medium text-[#1E2230]">
                        <data value={m.id}>{m.id}</data>
                      </td>
                      <td className="px-3 font-medium text-[#1E2230]">{m.nama}</td>
                      <td className="px-3 font-mono text-[#1E2230] tabular-nums">{m.hp}</td>
                      <td className="px-3 text-[#646B7C]">{m.alamat}</td>
                      {canExecuteServis && (
                        <td className="px-3 text-right">
                          <XIconButton
                            ariaLabel={`Hapus mekanik ${m.nama}`}
                            title={`Hapus mekanik ${m.nama}`}
                            onClick={(e) => handleClickDeleteMechanic(m, e)}
                          />
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </SidePanel>

      {/* Centered Dialog: Admin credential gate & Mekanik baru form */}
      <CenterDialog
        isOpen={addModalStep !== 'closed'}
        onClose={closeAddModal}
        title={addModalStep === 'auth' ? 'Verifikasi admin' : 'Mekanik baru'}
        maxWidthClass="max-w-[460px]"
        footer={
          addModalStep === 'auth' ? (
            <ActionButton
              type="button"
              intent="start"
              disabled={isAuthLocked || authChecking}
              onClick={(e) =>
                void handleVerifyAdminCredentials(e as unknown as React.FormEvent)
              }
              className="!min-h-[44px]"
            >
              {authChecking ? 'Memverifikasi...' : 'Lanjutkan'}
            </ActionButton>
          ) : (
            <ActionButton
              type="button"
              intent="start"
              onClick={(e) => handleSaveNewMechanic(e as unknown as React.FormEvent)}
              className="!min-h-[44px]"
            >
              Simpan
            </ActionButton>
          )
        }
      >
        {addModalStep === 'auth' ? (
          <form
            onSubmit={(e) => void handleVerifyAdminCredentials(e)}
            noValidate
            className="space-y-4"
          >
            <p className="text-[14px] text-[#646B7C]">
              Masukkan email dan kata sandi terbaru akun Admin yang sedang masuk (
              <span className="font-mono text-[#1E2230]">{activeAdminEmail}</span>
              ) untuk menambah mekanik baru.
            </p>
            <FormField id="mech-auth-email" label="Email Admin">
              <input
                id="mech-auth-email"
                type="email"
                disabled={isAuthLocked || authChecking}
                value={authEmail}
                onChange={(e) => {
                  setAuthEmail(e.target.value);
                  if (!isAuthLocked) setAuthError('');
                }}
                placeholder={activeAdminEmail}
                className="admin-input font-mono"
              />
            </FormField>
            <FormField id="mech-auth-password" label="Kata sandi terbaru">
              <div className="flex items-center gap-2">
                <input
                  id="mech-auth-password"
                  type={authShowPassword ? 'text' : 'password'}
                  disabled={isAuthLocked || authChecking}
                  value={authPassword}
                  onChange={(e) => {
                    setAuthPassword(e.target.value);
                    if (!isAuthLocked) setAuthError('');
                  }}
                  placeholder="Masukkan kata sandi admin"
                  className="admin-input flex-1"
                />
                <button
                  type="button"
                  aria-label={authShowPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                  onClick={() => setAuthShowPassword((v) => !v)}
                  className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-[12px] bg-white border border-[#D9DDE6] text-[#646B7C] hover:text-[#1E2230] cursor-pointer shrink-0"
                >
                  {authShowPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                </button>
              </div>
            </FormField>
            {(authError || isAuthLocked) && (
              <p role="alert" className="text-[13px] text-[#D62E5A]">
                {isAuthLocked
                  ? `Dialog dikunci selama 30 detik (${authRemainingSec} detik tersisa).`
                  : authError}
              </p>
            )}
          </form>
        ) : (
          <form onSubmit={handleSaveNewMechanic} noValidate className="space-y-4">
            <FormField id="new-mech-nama" label="Nama" error={newErrors.nama}>
              <input
                id="new-mech-nama"
                type="text"
                value={newNama}
                onChange={(e) => {
                  setNewNama(e.target.value);
                  if (newErrors.nama) {
                    setNewErrors((prev) => ({ ...prev, nama: undefined }));
                  }
                }}
                placeholder="Nama lengkap mekanik"
                className="admin-input"
              />
            </FormField>
            <FormField id="new-mech-hp" label="Nomor HP" error={newErrors.hp}>
              <input
                id="new-mech-hp"
                type="text"
                inputMode="numeric"
                value={newHp}
                onChange={(e) => {
                  setNewHp(e.target.value.replace(/\D/g, ''));
                  if (newErrors.hp) {
                    setNewErrors((prev) => ({ ...prev, hp: undefined }));
                  }
                }}
                placeholder="9 sampai 13 angka"
                className="admin-input font-mono"
              />
            </FormField>
            <FormField id="new-mech-alamat" label="Alamat" error={newErrors.alamat}>
              <textarea
                id="new-mech-alamat"
                rows={3}
                value={newAlamat}
                onChange={(e) => {
                  setNewAlamat(e.target.value);
                  if (newErrors.alamat) {
                    setNewErrors((prev) => ({ ...prev, alamat: undefined }));
                  }
                }}
                placeholder="Alamat domisili mekanik"
                className="admin-input"
              />
            </FormField>
          </form>
        )}
      </CenterDialog>

      {/* Centered Dialog: PIN & Reason gate for deleting a mechanic */}
      <CenterDialog
        isOpen={deleteTarget !== null}
        onClose={closeDeleteModal}
        title={deleteTarget ? `Hapus ${deleteTarget.nama}` : 'Hapus mekanik'}
        subtitle={deleteTarget?.id}
        maxWidthClass="max-w-[440px]"
        footer={
          <ActionButton
            type="button"
            intent="start"
            disabled={isPinLocked || pinChecking}
            onClick={(e) => void handleVerifyDeletePin(e as unknown as React.FormEvent)}
            className="!min-h-[44px]"
          >
            <span className="inline-flex items-center gap-1.5">
              <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path
                  d="M3.75 9.5L7.25 13L14.25 5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>{pinChecking ? 'Memverifikasi...' : 'Approve hapus'}</span>
            </span>
          </ActionButton>
        }
      >
        <form onSubmit={(e) => void handleVerifyDeletePin(e)} noValidate className="space-y-4">
          <p className="text-[14px] text-[#646B7C]">
            Tulis alasan penghapusan dan masukkan PIN admin (12 digit atau 5 digit) untuk menonaktifkan mekanik ini dari daftar aktif.
          </p>
          <FormField
            id="delete-mech-reason"
            label="Alasan hapus"
            error={deleteReasonError || undefined}
          >
            <textarea
              id="delete-mech-reason"
              rows={3}
              disabled={isPinLocked || pinChecking}
              value={deleteReason}
              onChange={(e) => {
                setDeleteReason(e.target.value);
                if (deleteReasonError) setDeleteReasonError('');
              }}
              placeholder="Contoh: Mengundurkan diri atau pindah cabang"
              className="admin-input"
              aria-invalid={Boolean(deleteReasonError)}
            />
          </FormField>
          <FormField id="delete-mech-pin" label="PIN admin">
            <input
              id="delete-mech-pin"
              type="password"
              inputMode="numeric"
              maxLength={12}
              disabled={isPinLocked || pinChecking}
              value={pinValue}
              onChange={(e) => {
                setPinValue(e.target.value.replace(/\D/g, '').slice(0, 12));
                if (!isPinLocked) setPinError('');
              }}
              placeholder="Masukkan PIN admin"
              className="admin-input font-mono tracking-widest text-center text-[18px]"
            />
          </FormField>
          {(pinError || isPinLocked) && (
            <p role="alert" className="text-[13px] text-[#D62E5A]">
              {isPinLocked
                ? `Dialog dikunci selama 30 detik (${pinRemainingSec} detik tersisa).`
                : pinError}
            </p>
          )}
        </form>
      </CenterDialog>
    </div>
  );
};

export default V1Attendance;
