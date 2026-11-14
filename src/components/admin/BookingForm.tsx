import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { siteContent } from '../../content/site';
import { useAuth } from '../../lib/mockAuth';
import { useAdmin, createBookingRecord } from '../../context/AdminContext';
import type { Booking } from '../../data/adminDummy';
import { ActionButton } from './ActionButton';
import { todayISO } from '../../lib/format';

export const CAPACITY_PER_HOUR = 2;
const PUBLIC_DRAFT_KEY = 'booking-form-draft-sv1';

export type BookingFormField =
  | 'customerName'
  | 'plate'
  | 'engineNo'
  | 'frameNo'
  | 'service'
  | 'date'
  | 'hour';

export interface BookingFormProps {
  mode: 'public' | 'admin';
  onCreated?: (booking: Booking) => void;
  onCancel?: () => void;
}

export const BookingForm: React.FC<BookingFormProps> = ({
  mode,
  onCreated,
  onCancel,
}) => {
  const navigate = useNavigate();
  const { isLoggedIn, role, user } = useAuth();
  const { bookings, customers, vehicles } = useAdmin();

  const today = todayISO();

  const isCustomerLoggedIn = mode === 'public' && isLoggedIn && role === 'customer';
  const accountName = isCustomerLoggedIn && user?.name ? user.name : '';
  const accountPlate = isCustomerLoggedIn && user?.plate ? user.plate : '';
  const accountEngine = isCustomerLoggedIn && user?.engineNo ? user.engineNo : '';
  const accountFrame = isCustomerLoggedIn && user?.frameNo ? user.frameNo : '';

  const [customerName, setCustomerName] = useState<string>(accountName);
  const [plate, setPlate] = useState<string>(accountPlate);
  const [engineNo, setEngineNo] = useState<string>(accountEngine);
  const [frameNo, setFrameNo] = useState<string>(accountFrame);
  const [service, setService] = useState<string>('');
  const [date, setDate] = useState<string>(mode === 'admin' ? today : '');
  const [hour, setHour] = useState<string>('');
  const [complaint, setComplaint] = useState<string>('');

  const [errors, setErrors] = useState<Partial<Record<BookingFormField, string>>>({});
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Restore saved public draft after redirect to /login?next=/#booking
  useEffect(() => {
    if (mode !== 'public' || typeof sessionStorage === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(PUBLIC_DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<{
          customerName: string;
          plate: string;
          engineNo: string;
          frameNo: string;
          service: string;
          date: string;
          hour: string;
          complaint: string;
        }>;
        if (!accountName && parsed.customerName) setCustomerName(parsed.customerName);
        if (!accountPlate && parsed.plate) setPlate(parsed.plate);
        if (!accountEngine && parsed.engineNo) setEngineNo(parsed.engineNo);
        if (!accountFrame && parsed.frameNo) setFrameNo(parsed.frameNo);
        if (parsed.service) setService(parsed.service);
        if (parsed.date) setDate(parsed.date);
        if (parsed.hour) setHour(parsed.hour);
        if (parsed.complaint !== undefined) setComplaint(parsed.complaint);
      }
    } catch {
      // Ignore parse errors
    }
  }, [mode, accountName, accountPlate, accountEngine, accountFrame]);

  // Keep read-only fields synced if customer logs in
  useEffect(() => {
    if (mode !== 'public') return;
    if (accountName) setCustomerName(accountName);
    if (accountPlate) setPlate(accountPlate);
    if (accountEngine) setEngineNo(accountEngine);
    if (accountFrame) setFrameNo(accountFrame);
  }, [mode, accountName, accountPlate, accountEngine, accountFrame]);

  const countBookingsAt = (d: string, h: string) =>
    bookings.filter((b) => b.date === d && b.hour === h && b.status !== 'batal').length;

  const validateField = (
    field: BookingFormField,
    val: string,
    ctxDate: string = date
  ): string => {
    const trimmed = val.trim();
    switch (field) {
      case 'customerName':
        return trimmed ? '' : 'Nama konsumen wajib diisi.';
      case 'plate': {
        if (!trimmed) return 'Plat nomor wajib diisi.';
        const plateRegex = /^[A-Z]{1,2}\s?[0-9]{1,4}\s?[A-Z]{1,3}$/i;
        if (!plateRegex.test(trimmed)) {
          return 'Format plat nomor belum sesuai. Contoh: XX 0001 XX.';
        }
        return '';
      }
      case 'engineNo': {
        if (!trimmed) return 'Nomor mesin wajib diisi.';
        if (!/^[A-Za-z0-9-]+$/.test(trimmed)) {
          return 'Nomor mesin hanya boleh berisi huruf, angka, dan tanda hubung (-).';
        }
        return '';
      }
      case 'frameNo': {
        if (!trimmed) return 'Nomor rangka wajib diisi.';
        if (!/^[A-Za-z0-9-]+$/.test(trimmed)) {
          return 'Nomor rangka hanya boleh berisi huruf, angka, dan tanda hubung (-).';
        }
        return '';
      }
      case 'service':
        return trimmed ? '' : 'Pilih layanan dulu.';
      case 'date':
        if (!trimmed) return 'Pilih tanggal dulu.';
        if (trimmed < today) return 'Pilih tanggal hari ini atau setelahnya.';
        return '';
      case 'hour':
        if (!trimmed) return 'Pilih jam dulu.';
        if (ctxDate && countBookingsAt(ctxDate, trimmed) >= CAPACITY_PER_HOUR) {
          return `Jam ${trimmed} sudah penuh. Pilih jam lain.`;
        }
        return '';
    }
  };

  const handleAdminCustomerPick = (typedName: string) => {
    setCustomerName(typedName);
    if (errors.customerName) {
      setErrors((prev) => ({ ...prev, customerName: undefined }));
    }
    if (mode !== 'admin') return;

    const matchedCustomer = customers.find(
      (c) => c.name.trim().toLowerCase() === typedName.trim().toLowerCase()
    );
    if (matchedCustomer) {
      const matchedVehicle = vehicles.find((v) => v.customerId === matchedCustomer.id);
      const nextPlate = matchedCustomer.plate || matchedVehicle?.plate || '';
      const nextEngine = matchedCustomer.engineNo || matchedVehicle?.engineNo || '';
      const nextFrame = matchedCustomer.frameNo || matchedVehicle?.frameNo || '';

      if (nextPlate) setPlate(nextPlate);
      if (nextEngine) setEngineNo(nextEngine);
      if (nextFrame) setFrameNo(nextFrame);

      setErrors((prev) => ({
        ...prev,
        plate: nextPlate ? undefined : prev.plate,
        engineNo: nextEngine ? undefined : prev.engineNo,
        frameNo: nextFrame ? undefined : prev.frameNo,
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatusNotice(null);

    // If visitor on public page is logged out, save what they typed and redirect to /login?next=/#booking
    if (mode === 'public' && (!isLoggedIn || role !== 'customer')) {
      if (typeof sessionStorage !== 'undefined') {
        try {
          sessionStorage.setItem(
            PUBLIC_DRAFT_KEY,
            JSON.stringify({
              customerName,
              plate,
              engineNo,
              frameNo,
              service,
              date,
              hour,
              complaint,
            })
          );
        } catch {
          // Ignore storage errors
        }
      }
      navigate('/login?next=/#booking');
      return;
    }

    const nextErrors: Partial<Record<BookingFormField, string>> = {
      customerName: validateField('customerName', customerName),
      plate: validateField('plate', plate),
      engineNo: validateField('engineNo', engineNo),
      frameNo: validateField('frameNo', frameNo),
      service: validateField('service', service),
      date: validateField('date', date),
      hour: validateField('hour', hour, date),
    };

    const hasError = Object.values(nextErrors).some(Boolean);
    if (hasError) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});

    const resolvedVehicleModel = isCustomerLoggedIn
      ? user?.motorType || user?.vehicleModel
      : undefined;

    const created = createBookingRecord({
      customerName: customerName.trim(),
      plate: plate.trim().toUpperCase().replace(/\s+/g, ' '),
      engineNo: engineNo.trim().toUpperCase(),
      frameNo: frameNo.trim().toUpperCase(),
      service,
      date,
      hour,
      complaint: complaint.trim(),
      source: mode === 'public' ? 'online' : 'langsung',
      customerEmail: isCustomerLoggedIn && user?.email ? user.email.toLowerCase().trim() : undefined,
      vehicleModel: resolvedVehicleModel,
    });

    if (mode === 'public') {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(PUBLIC_DRAFT_KEY);
      }
      setStatusNotice(`Booking tercatat untuk ${date} jam ${hour}.`);
      setService('');
      setDate('');
      setHour('');
      setComplaint('');
      if (!accountName) setCustomerName('');
      if (!accountPlate) setPlate('');
      if (!accountEngine) setEngineNo('');
      if (!accountFrame) setFrameNo('');
    }

    onCreated?.(created);
  };

  const isPublic = mode === 'public';
  const labelClass = isPublic
    ? 'font-sans font-medium text-[15px] text-paper mb-2 block'
    : 'block text-[13px] font-medium text-[#646B7C] mb-1.5';
  const inputBaseClass = isPublic
    ? 'w-full bg-paper/[0.06] border border-steel rounded-[4px] min-h-[44px] px-3 py-2 text-paper placeholder-paper/40 focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2 read-only:opacity-75'
    : 'admin-input';
  const errorClass = isPublic
    ? 'text-alert font-sans text-sm mt-1.5'
    : 'text-[#D62E5A] text-[13px] mt-1.5';

  const idPrefix = isPublic ? 'pub-bk' : 'adm-bk';

  return (
    <form
      id={isPublic ? 'public-booking-form' : 'admin-booking-form'}
      onSubmit={handleSubmit}
      noValidate
      className={isPublic ? 'space-y-6' : 'space-y-4'}
    >
      {/* 1. Nama konsumen */}
      <div>
        <label htmlFor={`${idPrefix}-name`} className={labelClass}>
          Nama konsumen
        </label>
        <input
          id={`${idPrefix}-name`}
          type="text"
          list={mode === 'admin' ? 'booking-customer-datalist' : undefined}
          readOnly={Boolean(accountName)}
          value={customerName}
          onChange={(e) => handleAdminCustomerPick(e.target.value)}
          onBlur={() =>
            setErrors((prev) => ({
              ...prev,
              customerName: validateField('customerName', customerName),
            }))
          }
          placeholder="Contoh: Pelanggan Dummy 01"
          className={inputBaseClass}
          aria-invalid={Boolean(errors.customerName)}
        />
        {mode === 'admin' && (
          <datalist id="booking-customer-datalist">
            {customers.map((c) => (
              <option key={c.id} value={c.name}>
                {c.plate ? `${c.plate}` : ''}
              </option>
            ))}
          </datalist>
        )}
        {errors.customerName && <p className={errorClass}>{errors.customerName}</p>}
      </div>

      {/* 2. Plat nomor */}
      <div>
        <label htmlFor={`${idPrefix}-plate`} className={labelClass}>
          Plat nomor
        </label>
        <input
          id={`${idPrefix}-plate`}
          type="text"
          readOnly={Boolean(accountPlate)}
          value={plate}
          onChange={(e) => {
            setPlate(e.target.value.toUpperCase());
            if (errors.plate) setErrors((prev) => ({ ...prev, plate: undefined }));
          }}
          onBlur={() =>
            setErrors((prev) => ({
              ...prev,
              plate: validateField('plate', plate),
            }))
          }
          placeholder="Contoh: XX 0001 XX"
          className={`${inputBaseClass} font-mono`}
          aria-invalid={Boolean(errors.plate)}
        />
        {errors.plate && <p className={errorClass}>{errors.plate}</p>}
      </div>

      {/* 3. Nomor mesin */}
      <div>
        <label htmlFor={`${idPrefix}-engine`} className={labelClass}>
          Nomor mesin
        </label>
        <input
          id={`${idPrefix}-engine`}
          type="text"
          readOnly={Boolean(accountEngine)}
          value={engineNo}
          onChange={(e) => {
            setEngineNo(e.target.value.toUpperCase());
            if (errors.engineNo) setErrors((prev) => ({ ...prev, engineNo: undefined }));
          }}
          onBlur={() =>
            setErrors((prev) => ({
              ...prev,
              engineNo: validateField('engineNo', engineNo),
            }))
          }
          placeholder="Contoh: JM51E-0001"
          className={`${inputBaseClass} font-mono`}
          aria-invalid={Boolean(errors.engineNo)}
        />
        {errors.engineNo && <p className={errorClass}>{errors.engineNo}</p>}
      </div>

      {/* 4. Nomor rangka */}
      <div>
        <label htmlFor={`${idPrefix}-frame`} className={labelClass}>
          Nomor rangka
        </label>
        <input
          id={`${idPrefix}-frame`}
          type="text"
          readOnly={Boolean(accountFrame)}
          value={frameNo}
          onChange={(e) => {
            setFrameNo(e.target.value.toUpperCase());
            if (errors.frameNo) setErrors((prev) => ({ ...prev, frameNo: undefined }));
          }}
          onBlur={() =>
            setErrors((prev) => ({
              ...prev,
              frameNo: validateField('frameNo', frameNo),
            }))
          }
          placeholder="Contoh: MH1JM5110PK-0001"
          className={`${inputBaseClass} font-mono`}
          aria-invalid={Boolean(errors.frameNo)}
        />
        {errors.frameNo && <p className={errorClass}>{errors.frameNo}</p>}
      </div>

      {/* 5. Layanan */}
      <div>
        <label htmlFor={`${idPrefix}-service`} className={labelClass}>
          Layanan
        </label>
        <select
          id={`${idPrefix}-service`}
          value={service}
          onChange={(e) => {
            setService(e.target.value);
            if (errors.service) setErrors((prev) => ({ ...prev, service: undefined }));
          }}
          onBlur={() =>
            setErrors((prev) => ({
              ...prev,
              service: validateField('service', service),
            }))
          }
          className={inputBaseClass}
          aria-invalid={Boolean(errors.service)}
        >
          <option
            value=""
            className={isPublic ? 'bg-carbon text-paper/50' : undefined}
          >
            Pilih layanan
          </option>
          {siteContent.bookingServices.map((srv) => (
            <option
              key={srv}
              value={srv}
              className={isPublic ? 'bg-carbon text-paper' : undefined}
            >
              {srv}
            </option>
          ))}
        </select>
        {errors.service && <p className={errorClass}>{errors.service}</p>}
      </div>

      {/* 6. Tanggal */}
      <div>
        <label htmlFor={`${idPrefix}-date`} className={labelClass}>
          Tanggal
        </label>
        <input
          id={`${idPrefix}-date`}
          type="date"
          min={today}
          value={date}
          onChange={(e) => {
            const nextDate = e.target.value;
            setDate(nextDate);
            setErrors((prev) => ({
              ...prev,
              date: undefined,
              hour: hour ? validateField('hour', hour, nextDate) : prev.hour,
            }));
          }}
          onBlur={() =>
            setErrors((prev) => ({
              ...prev,
              date: validateField('date', date),
            }))
          }
          className={inputBaseClass}
          aria-invalid={Boolean(errors.date)}
        />
        {errors.date && <p className={errorClass}>{errors.date}</p>}
      </div>

      {/* 7. Jam */}
      <div>
        <label htmlFor={`${idPrefix}-hour`} className={labelClass}>
          Jam
        </label>
        <select
          id={`${idPrefix}-hour`}
          value={hour}
          onChange={(e) => {
            const nextHour = e.target.value;
            setHour(nextHour);
            setErrors((prev) => ({
              ...prev,
              hour: validateField('hour', nextHour, date),
            }));
          }}
          onBlur={() =>
            setErrors((prev) => ({
              ...prev,
              hour: validateField('hour', hour, date),
            }))
          }
          className={inputBaseClass}
          aria-invalid={Boolean(errors.hour)}
        >
          <option
            value=""
            className={isPublic ? 'bg-carbon text-paper/50' : undefined}
          >
            Pilih jam
          </option>
          {siteContent.bookingHours.map((h) => {
            const isFull = Boolean(date) && countBookingsAt(date, h) >= CAPACITY_PER_HOUR;
            return (
              <option
                key={h}
                value={h}
                className={isPublic ? 'bg-carbon text-paper' : undefined}
              >
                {isFull ? `${h} (penuh)` : h}
              </option>
            );
          })}
        </select>
        {errors.hour && <p className={errorClass}>{errors.hour}</p>}
      </div>

      {/* 8. Keluhan (opsional) */}
      <div>
        <label htmlFor={`${idPrefix}-complaint`} className={labelClass}>
          Keluhan (opsional)
        </label>
        <textarea
          id={`${idPrefix}-complaint`}
          rows={3}
          value={complaint}
          onChange={(e) => setComplaint(e.target.value)}
          placeholder="Ceritakan keluhan kendaraan"
          className={
            isPublic
              ? 'w-full bg-paper/[0.06] border border-steel rounded-[4px] px-3 py-2 text-paper placeholder-paper/40 focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2 resize-y'
              : 'admin-input'
          }
        />
      </div>

      {statusNotice && (
        <div
          role="status"
          className="p-4 border border-steel/40 bg-paper/[0.04] text-paper font-sans text-sm rounded-[4px]"
        >
          {statusNotice}
        </div>
      )}

      {isPublic ? (
        <div>
          <button
            type="submit"
            className="w-full md:w-auto inline-flex items-center justify-center bg-signal text-carbon font-sans font-medium text-[16px] px-8 py-3 rounded-[4px] min-h-[44px] transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
          >
            Lanjut booking
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#EEF0F4]">
          {onCancel && (
            <ActionButton type="button" intent="cancel" onClick={onCancel}>
              Batal
            </ActionButton>
          )}
          <ActionButton type="submit" intent="start">
            Simpan booking
          </ActionButton>
        </div>
      )}
    </form>
  );
};

export default BookingForm;

