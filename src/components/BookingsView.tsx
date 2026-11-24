import React, { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  LogIn,
  LogOut,
  X,
  AlertCircle,
  QrCode,
  Download,
  Info,
  Printer,
  Users,
  Edit2,
  Trash2,
} from 'lucide-react';
import { COMPANY_BRANDING } from '../constants/branding';
import { getT } from '../i18n/translations';
import { computeNights, findOverlappingBooking } from '../services/platformStore';
import {
  exportBookingQrPassPng,
  extractBookingCodeFromScan,
  generateBookingQrDataUrl,
} from '../utils/bookingQr';
import { addEgyptDays, getEgyptTodayIsoDate } from '../utils/egyptTime';
import {
  Booking,
  BookingSource,
  BookingStatus,
  Chalet,
  Guest,
  Language,
  MutationResult,
  PaymentStatus,
} from '../types/platform';
import { CompanyLogo } from './CompanyLogo';

interface BookingsViewProps {
  bookings: Booking[];
  chalets: Chalet[];
  guests?: Guest[];
  lang: Language;
  canManage: boolean;
  onCreateBooking: (
    booking: Booking
  ) => Promise<MutationResult | void> | MutationResult | void;
  onCheckIn: (
    bookingId: string,
    payload: { idPassport: string; depositAmount: number; numGuests: number; notes: string }
  ) => Promise<MutationResult | void> | MutationResult | void;
  onCheckOut: (
    bookingId: string,
    payload: { inspectionNotes: string; damageReport: string; outstandingAmount: number; notes: string }
  ) => Promise<MutationResult | void> | MutationResult | void;
  onCancelBooking: (
    bookingId: string
  ) => Promise<MutationResult | void> | MutationResult | void;
  onSaveGuest?: (
    guest: Guest,
    isNew: boolean
  ) => Promise<MutationResult<Guest> | void> | MutationResult<Guest> | void;
  onDeleteGuest?: (
    guestId: string
  ) => Promise<MutationResult | void> | MutationResult | void;
}

const BOOKING_STATUS_COLOR: Record<BookingStatus, string> = {
  upcoming: 'text-cyan-800',
  checked_in: 'text-emerald-700',
  checked_out: 'text-slate-600',
  cancelled: 'text-red-700',
};

export const BookingsView: React.FC<BookingsViewProps> = ({
  bookings,
  chalets,
  guests = [],
  lang,
  canManage,
  onCreateBooking,
  onCheckIn,
  onCheckOut,
  onCancelBooking,
  onSaveGuest,
  onDeleteGuest,
}) => {
  const t = getT(lang);
  const isAr = lang === 'ar';
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCreate, setShowCreate] = useState(false);

  // New booking form state (Egypt local calendar dates)
  const todayStr = getEgyptTodayIsoDate();
  const tomorrowDate = addEgyptDays(todayStr, 3);

  const [chaletId, setChaletId] = useState(chalets[0]?.id || '');
  const [selectedGuestId, setSelectedGuestId] = useState<string>('');
  const [guestName, setGuestName] = useState('');
  const [phone, setPhone] = useState('');
  const [nationality, setNationality] = useState('Egyptian');
  const [checkIn, setCheckIn] = useState(todayStr);
  const [checkOut, setCheckOut] = useState(tomorrowDate);
  const [numGuests, setNumGuests] = useState(2);
  const [nightlyPrice, setNightlyPrice] = useState(chalets[0]?.nightlyPrice || 3500);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pending');
  const [bookingSource, setBookingSource] = useState<BookingSource>('direct');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [savingBooking, setSavingBooking] = useState(false);

  // Check-in / Check-out modal states
  const [checkInModal, setCheckInModal] = useState<Booking | null>(null);
  const [idPassport, setIdPassport] = useState('');
  const [depositAmount, setDepositAmount] = useState(1500);
  const [checkInGuests, setCheckInGuests] = useState(2);
  const [checkInNotes, setCheckInNotes] = useState('');
  const [savingCheckIn, setSavingCheckIn] = useState(false);
  const [checkInError, setCheckInError] = useState('');

  const [checkOutModal, setCheckOutModal] = useState<Booking | null>(null);
  const [inspectionNotes, setInspectionNotes] = useState('All furniture, A/C, and appliances verified intact.');
  const [damageReport, setDamageReport] = useState('');
  const [outstandingAmount, setOutstandingAmount] = useState(0);
  const [checkOutNotes, setCheckOutNotes] = useState('');
  const [savingCheckOut, setSavingCheckOut] = useState(false);
  const [checkOutError, setCheckOutError] = useState('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Guests Directory Modal State
  const [showGuestsModal, setShowGuestsModal] = useState(false);
  const [guestSearch, setGuestSearch] = useState('');
  const [editingGuestId, setEditingGuestId] = useState<string | null>(null);
  const [gName, setGName] = useState('');
  const [gPhone, setGPhone] = useState('');
  const [gNationality, setGNationality] = useState('Egyptian');
  const [gIdPassport, setGIdPassport] = useState('');
  const [gEmail, setGEmail] = useState('');
  const [gNotes, setGNotes] = useState('');
  const [savingGuest, setSavingGuest] = useState(false);
  const [guestError, setGuestError] = useState('');

  // QR Code Pass Modal State
  const [qrModalBooking, setQrModalBooking] = useState<Booking | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrLoading, setQrLoading] = useState<boolean>(false);
  const [qrExporting, setQrExporting] = useState<boolean>(false);

  const chaletMap = new Map(chalets.map((c) => [c.id, c]));

  useEffect(() => {
    if (!qrModalBooking) {
      setQrDataUrl('');
      return;
    }
    let active = true;
    setQrLoading(true);
    const chNum = chaletMap.get(qrModalBooking.chaletId)?.chaletNumber || '-';
    generateBookingQrDataUrl(qrModalBooking, chNum)
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .finally(() => {
        if (active) setQrLoading(false);
      });
    return () => {
      active = false;
    };
  }, [qrModalBooking]);

  const nights = computeNights(checkIn, checkOut);
  const calculatedTotal = nights * nightlyPrice;
  const overlappingConflict = findOverlappingBooking(bookings, chaletId, checkIn, checkOut);

  const filtered = bookings.filter((b) => {
    if (statusFilter !== 'all' && b.status !== statusFilter) return false;
    if (search.trim()) {
      const scannedCode = extractBookingCodeFromScan(search);
      const q = (scannedCode || search.trim()).toLowerCase();
      const chNum = chaletMap.get(b.chaletId)?.chaletNumber.toLowerCase() || '';
      return (
        b.bookingCode.toLowerCase().includes(q) ||
        b.guestName.toLowerCase().includes(q) ||
        b.phone.toLowerCase().includes(q) ||
        chNum.includes(q)
      );
    }
    return true;
  });

  const handleOpenCreate = () => {
    const defaultChalet = chalets.find((c) => c.isActive) || chalets[0];
    setChaletId(defaultChalet?.id || '');
    setNightlyPrice(defaultChalet?.nightlyPrice || 3500);
    setSelectedGuestId('');
    setGuestName('');
    setPhone('');
    setNationality('Egyptian');
    setNotes('');
    setFormError('');
    setShowCreate(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nights <= 0) {
      setFormError(isAr ? 'تاريخ المغادرة يجب أن يكون بعد تاريخ الوصول.' : 'Check-out must be after check-in.');
      return;
    }
    if (overlappingConflict) {
      setFormError(`${t.actions.doubleBookingError} (${overlappingConflict.bookingCode})`);
      return;
    }
    const newBooking: Booking = {
      id: `bk-${Date.now()}`,
      bookingCode: `BK-${Math.floor(2620 + Math.random() * 700)}`,
      chaletId,
      guestId: selectedGuestId || null,
      guestName,
      phone,
      nationality,
      checkIn,
      checkOut,
      numGuests,
      nights,
      nightlyPrice,
      totalValue: calculatedTotal,
      paymentStatus,
      bookingSource,
      status: 'upcoming',
      notes,
      outstandingAmount: paymentStatus === 'paid' ? 0 : calculatedTotal,
      isDemo: false,
      createdAt: new Date().toISOString(),
    };
    setSavingBooking(true);
    setFormError('');
    try {
      const res = await onCreateBooking(newBooking);
      if (res && res.ok === false) {
        setFormError(res.error || t.actions.doubleBookingError);
        return;
      }
      setShowCreate(false);
    } finally {
      setSavingBooking(false);
    }
  };

  const resetGuestForm = () => {
    setEditingGuestId(null);
    setGName('');
    setGPhone('');
    setGNationality('Egyptian');
    setGIdPassport('');
    setGEmail('');
    setGNotes('');
    setGuestError('');
  };

  const handleGuestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveGuest) return;
    setSavingGuest(true);
    setGuestError('');
    try {
      const guestObj: Guest = {
        id: editingGuestId || `gst-${Date.now()}`,
        fullName: gName.trim(),
        phone: gPhone.trim(),
        nationality: gNationality.trim() || 'Egyptian',
        idPassport: gIdPassport.trim(),
        email: gEmail.trim(),
        notes: gNotes.trim(),
        isDemo: false,
        createdAt: new Date().toISOString(),
      };
      const res = await onSaveGuest(guestObj, !editingGuestId);
      if (res && res.ok === false) {
        setGuestError(
          res.error || (isAr ? 'تعذر حفظ بيانات النزيل.' : 'Failed to save guest record.')
        );
        return;
      }
      resetGuestForm();
    } finally {
      setSavingGuest(false);
    }
  };

  const filteredGuests = guests.filter((g) => {
    if (!guestSearch.trim()) return true;
    const q = guestSearch.trim().toLowerCase();
    return (
      g.fullName.toLowerCase().includes(q) ||
      g.phone.toLowerCase().includes(q) ||
      (g.idPassport || '').toLowerCase().includes(q)
    );
  });

  const activeFilteredBookings = filtered.filter((b) => b.status !== 'cancelled');
  const printTotalNights = activeFilteredBookings.reduce((s, b) => s + b.nights, 0);
  const printTotalValue = activeFilteredBookings.reduce((s, b) => s + b.totalValue, 0);
  const filterLabel =
    statusFilter === 'all'
      ? isAr
        ? 'الكل'
        : 'All'
      : t.status[statusFilter as BookingStatus] || statusFilter;

  return (
    <div className="space-y-5">
      {/* Official Branded Print / PDF Letterhead */}
      <div className="hidden print:flex items-center justify-between gap-4 pb-4 border-b border-slate-300">
        <div className="flex items-center gap-3">
          <CompanyLogo size="print" />
          <div>
            <div className="text-sm font-bold text-slate-900">
              {COMPANY_BRANDING.companyName}
            </div>
            <div className="text-base font-bold text-cyan-900">{t.brandFull}</div>
            <div className="text-xs text-slate-600">{t.brandSubtitle}</div>
          </div>
        </div>
        <div className="text-end text-xs text-slate-600">
          <div className="font-semibold text-slate-900">
            {isAr ? 'تقرير الحجوزات' : 'Bookings Report'} ({filterLabel})
          </div>
          {search.trim() && (
            <div className="text-[11px] text-slate-500">
              {isAr ? 'تصفية:' : 'Filter:'} {search.trim()}
            </div>
          )}
          <div className="font-mono-num">{todayStr}</div>
          <div>
            {t.ceoLabel}: {COMPANY_BRANDING.ceoName}
          </div>
        </div>
      </div>

      {/* Print Summary Metrics */}
      <div className="hidden print:grid grid-cols-4 gap-3 print-avoid-break">
        <div className="p-3 rounded-lg border border-slate-300 bg-slate-50">
          <div className="text-[11px] text-slate-500">
            {isAr ? 'عدد الحجوزات' : 'Filtered Bookings'}
          </div>
          <div className="mt-1 text-base font-bold font-mono-num text-slate-900">
            {filtered.length}
          </div>
        </div>
        <div className="p-3 rounded-lg border border-slate-300 bg-slate-50">
          <div className="text-[11px] text-slate-500">
            {isAr ? 'إجمالي الليالي (النشطة)' : 'Active Nights'}
          </div>
          <div className="mt-1 text-base font-bold font-mono-num text-slate-900">
            {printTotalNights}
          </div>
        </div>
        <div className="p-3 rounded-lg border border-slate-300 bg-slate-50">
          <div className="text-[11px] text-slate-500">
            {isAr ? 'إجمالي قيمة الحجوزات' : 'Total Booking Value'}
          </div>
          <div className="mt-1 text-base font-bold font-mono-num text-cyan-900">
            {printTotalValue.toLocaleString()} {t.currency}
          </div>
        </div>
        <div className="p-3 rounded-lg border border-slate-300 bg-slate-50">
          <div className="text-[11px] text-slate-500">
            {isAr ? 'مسجل دخول / قادم' : 'Checked-In / Upcoming'}
          </div>
          <div className="mt-1 text-base font-bold font-mono-num text-emerald-800">
            {filtered.filter((b) => b.status === 'checked_in').length} /{' '}
            {filtered.filter((b) => b.status === 'upcoming').length}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 no-print">
        <div className="flex flex-1 flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.actions.searchPlaceholder}
              className="w-full ps-9 pe-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-700"
            />
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
            {(['all', 'upcoming', 'checked_in', 'checked_out', 'cancelled'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st === 'all' ? (isAr ? 'الكل' : 'All') : t.status[st]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManage && onSaveGuest && (
            <button
              type="button"
              onClick={() => {
                resetGuestForm();
                setShowGuestsModal(true);
              }}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg bg-white hover:bg-slate-50 text-slate-700 whitespace-nowrap shrink-0 cursor-pointer no-print"
            >
              <Users className="w-3.5 h-3.5 text-cyan-800" />
              <span>
                {isAr ? 'سجل النزلاء' : 'Guests Directory'} ({guests.length})
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg bg-white hover:bg-slate-50 text-slate-700 whitespace-nowrap shrink-0 cursor-pointer no-print"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{t.actions.printPdf}</span>
          </button>

          {canManage && (
            <button
              type="button"
              onClick={handleOpenCreate}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-cyan-800 hover:bg-cyan-900 text-white text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{t.actions.addBooking}</span>
            </button>
          )}
        </div>
      </div>

      {/* Bookings List & Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden print:border-slate-300 print:overflow-visible">
        {/* Mobile Booking Cards */}
        <div className="md:hidden print:hidden divide-y divide-slate-100">
          {filtered.map((b) => {
            const ch = chaletMap.get(b.chaletId);
            return (
              <div key={b.id} className="p-4 space-y-2.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono-num font-bold text-slate-900">
                        {b.bookingCode}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="font-mono-num font-semibold text-cyan-800">
                        {ch?.chaletNumber || '-'}
                      </span>
                    </div>
                    <div className="font-semibold text-slate-900 mt-0.5">{b.guestName}</div>
                  </div>
                  <span className={`font-semibold whitespace-nowrap ${BOOKING_STATUS_COLOR[b.status]}`}>
                    {t.status[b.status]}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 font-mono-num">
                  <span>{b.checkIn} → {b.checkOut} ({b.nights} {t.nights})</span>
                  <span className="font-semibold text-slate-900">
                    {b.totalValue.toLocaleString()} {t.currency}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  {b.status !== 'cancelled' && (
                    <button
                      type="button"
                      onClick={() => setQrModalBooking(b)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50 text-slate-700 text-[11px] font-medium cursor-pointer"
                    >
                      <QrCode className="w-3.5 h-3.5 text-cyan-800" />
                      <span>{isAr ? 'رمز QR للدخول' : 'Check-In QR'}</span>
                    </button>
                  )}

                  {canManage && (
                    <div className="flex items-center gap-1.5">
                      {b.status === 'upcoming' && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setCheckInModal(b);
                              setIdPassport(b.idPassport || '');
                              setDepositAmount(b.depositAmount || 1500);
                              setCheckInGuests(b.numGuests);
                              setCheckInNotes(b.notes || '');
                              setCheckInError('');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-medium cursor-pointer"
                          >
                            <LogIn className="w-3 h-3" />
                            <span>{t.actions.checkIn}</span>
                          </button>
                          <button
                            type="button"
                            disabled={cancellingId === b.id}
                            onClick={async () => {
                              setCancellingId(b.id);
                              try {
                                await onCancelBooking(b.id);
                              } finally {
                                setCancellingId(null);
                              }
                            }}
                            className="px-2 py-1.5 rounded-md border border-slate-200 hover:bg-red-50 text-red-700 text-[11px] font-medium cursor-pointer disabled:opacity-50"
                          >
                            {isAr ? 'إلغاء' : 'Cancel'}
                          </button>
                        </>
                      )}
                      {b.status === 'checked_in' && (
                        <button
                          type="button"
                          onClick={() => {
                            setCheckOutModal(b);
                            setOutstandingAmount(b.outstandingAmount || 0);
                            setDamageReport('');
                            setCheckOutNotes('');
                            setCheckOutError('');
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-medium cursor-pointer"
                        >
                          <LogOut className="w-3 h-3" />
                          <span>{t.actions.checkOut}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block print:block overflow-x-auto print:overflow-visible">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-3 px-4 font-semibold text-start">{isAr ? 'الكود' : 'Code'}</th>
                <th className="py-3 px-4 font-semibold text-start">{isAr ? 'النزيل' : 'Guest'}</th>
                <th className="py-3 px-4 font-semibold text-start">{isAr ? 'الشاليه' : 'Chalet'}</th>
                <th className="py-3 px-4 font-semibold text-start">{isAr ? 'الوصول - المغادرة' : 'Dates'}</th>
                <th className="py-3 px-4 font-semibold text-start">{isAr ? 'الليالي' : 'Nights'}</th>
                <th className="py-3 px-4 font-semibold text-start">{isAr ? 'الإجمالي' : 'Total'}</th>
                <th className="py-3 px-4 font-semibold text-start">{isAr ? 'المصدر' : 'Source'}</th>
                <th className="py-3 px-4 font-semibold text-start">{isAr ? 'الدفع' : 'Payment'}</th>
                <th className="py-3 px-4 font-semibold text-start">{isAr ? 'الحالة' : 'Status'}</th>
                <th className="py-3 px-4 font-semibold text-end no-print">{isAr ? 'الاستقبال و QR' : 'Desk & QR'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((b) => {
                const ch = chaletMap.get(b.chaletId);
                return (
                  <tr key={b.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-mono-num font-semibold text-slate-900 whitespace-nowrap">
                      {b.bookingCode}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{b.guestName}</div>
                      <div className="text-slate-500 font-mono-num">{b.phone} · {b.nationality}</div>
                    </td>
                    <td className="py-3 px-4 font-mono-num font-semibold text-cyan-800 whitespace-nowrap">
                      {ch?.chaletNumber || '-'}
                    </td>
                    <td className="py-3 px-4 font-mono-num text-slate-700 whitespace-nowrap">
                      {b.checkIn} → {b.checkOut}
                    </td>
                    <td className="py-3 px-4 font-mono-num text-slate-700">{b.nights}</td>
                    <td className="py-3 px-4 font-mono-num font-semibold text-slate-900 whitespace-nowrap">
                      {b.totalValue.toLocaleString()} {t.currency}
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {t.sources[b.bookingSource]}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-slate-700">
                      {t.status[b.paymentStatus]}
                    </td>
                    <td className={`py-3 px-4 font-semibold whitespace-nowrap ${BOOKING_STATUS_COLOR[b.status]}`}>
                      {t.status[b.status]}
                    </td>
                    <td className="py-3 px-4 text-end whitespace-nowrap no-print">
                      <div className="inline-flex items-center gap-1.5">
                        {b.status !== 'cancelled' && (
                          <button
                            type="button"
                            onClick={() => setQrModalBooking(b)}
                            title={isAr ? 'إنشاء وتصدير رمز QR' : 'Generate & Export QR Code'}
                            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-700 text-[11px] font-medium cursor-pointer"
                          >
                            <QrCode className="w-3.5 h-3.5 text-cyan-800" />
                            <span>QR</span>
                          </button>
                        )}
                        {canManage && b.status === 'upcoming' && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setCheckInModal(b);
                                setIdPassport(b.idPassport || '');
                                setDepositAmount(b.depositAmount || 1500);
                                setCheckInGuests(b.numGuests);
                                setCheckInNotes(b.notes || '');
                                setCheckInError('');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-medium cursor-pointer"
                            >
                              <LogIn className="w-3 h-3" />
                              <span>{t.actions.checkIn}</span>
                            </button>
                            <button
                              type="button"
                              disabled={cancellingId === b.id}
                              onClick={async () => {
                                setCancellingId(b.id);
                                try {
                                  await onCancelBooking(b.id);
                                } finally {
                                  setCancellingId(null);
                                }
                              }}
                              className="px-2 py-1.5 rounded-md border border-slate-200 hover:bg-red-50 text-red-700 text-[11px] font-medium cursor-pointer disabled:opacity-50"
                            >
                              {isAr ? 'إلغاء' : 'Cancel'}
                            </button>
                          </>
                        )}
                        {canManage && b.status === 'checked_in' && (
                          <button
                            type="button"
                            onClick={() => {
                              setCheckOutModal(b);
                              setOutstandingAmount(b.outstandingAmount || 0);
                              setDamageReport('');
                              setCheckOutNotes('');
                              setCheckOutError('');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-medium cursor-pointer"
                          >
                            <LogOut className="w-3 h-3" />
                            <span>{t.actions.checkOut}</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Print Footer */}
      <div className="hidden print:flex items-center justify-between pt-3 border-t border-slate-300 text-[11px] text-slate-500">
        <span>
          {COMPANY_BRANDING.companyName} — {t.brandFull}
        </span>
        <span className="font-mono-num">{todayStr}</span>
      </div>

      {/* Create Booking Modal (with live Double-Booking Check) */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 no-print">
          <form
            onSubmit={handleCreateSubmit}
            className="bg-white w-full max-w-2xl rounded-xl border border-slate-200 shadow-xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
              <h3 className="text-base font-bold text-slate-900">{t.actions.addBooking}</h3>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'الشاليه' : 'Chalet'}
                </label>
                <select
                  value={chaletId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setChaletId(id);
                    const ch = chaletMap.get(id);
                    if (ch) setNightlyPrice(ch.nightlyPrice);
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {chalets
                    .filter((c) => c.isActive)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.chaletNumber} — {isAr ? c.viewTypeAr : c.viewType} ({c.nightlyPrice} {t.currency})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'مصدر الحجز' : 'Booking Source'}
                </label>
                <select
                  value={bookingSource}
                  onChange={(e) => setBookingSource(e.target.value as BookingSource)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {(Object.keys(t.sources) as BookingSource[]).map((src) => (
                    <option key={src} value={src}>
                      {t.sources[src]}
                    </option>
                  ))}
                </select>
              </div>

              {guests.length > 0 && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {isAr ? 'اختيار نزيل مسجل (اختياري)' : 'Registered Guest Profile (Optional)'}
                  </label>
                  <select
                    value={selectedGuestId}
                    onChange={(e) => {
                      const gid = e.target.value;
                      setSelectedGuestId(gid);
                      const found = guests.find((g) => g.id === gid);
                      if (found) {
                        setGuestName(found.fullName);
                        setPhone(found.phone);
                        setNationality(found.nationality || 'Egyptian');
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs"
                  >
                    <option value="">
                      {isAr ? '— إدخال بيانات نزيل جديد يدوياً —' : '— Enter new guest manually —'}
                    </option>
                    {guests.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.fullName} · {g.phone}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'اسم النزيل' : 'Guest Name'}
                </label>
                <input
                  required
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'رقم الهاتف' : 'Phone Number'}
                </label>
                <input
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+20 100 ..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'الجنسية' : 'Nationality'}
                </label>
                <input
                  required
                  value={nationality}
                  onChange={(e) => setNationality(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'عدد النزلاء' : 'Guests'}
                </label>
                <input
                  type="number"
                  min={1}
                  value={numGuests}
                  onChange={(e) => setNumGuests(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'تاريخ الوصول' : 'Check-in Date'}
                </label>
                <input
                  type="date"
                  required
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'تاريخ المغادرة' : 'Check-out Date'}
                </label>
                <input
                  type="date"
                  required
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'سعر الليلة' : 'Nightly Rate'} ({t.currency})
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={nightlyPrice}
                  onChange={(e) => setNightlyPrice(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'حالة الدفع' : 'Payment Status'}
                </label>
                <select
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {(['pending', 'partial', 'paid'] as const).map((ps) => (
                    <option key={ps} value={ps}>
                      {t.status[ps]}
                    </option>
                  ))}
                </select>
              </div>

              {/* Automatic Total Calculation */}
              <div className="sm:col-span-2 p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div className="text-xs text-slate-600">
                  {nights} {t.nights} × {nightlyPrice.toLocaleString()} {t.currency}
                </div>
                <div className="text-base font-bold font-mono-num text-cyan-900">
                  {isAr ? 'الإجمالي:' : 'Total:'} {calculatedTotal.toLocaleString()} {t.currency}
                </div>
              </div>

              {overlappingConflict && (
                <div className="sm:col-span-2 flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    {t.actions.doubleBookingError} ({overlappingConflict.bookingCode}:{' '}
                    {overlappingConflict.checkIn} → {overlappingConflict.checkOut})
                  </span>
                </div>
              )}

              {formError && !overlappingConflict && (
                <div className="sm:col-span-2 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                  {formError}
                </div>
              )}

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'ملاحظات' : 'Notes'}
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-700 cursor-pointer"
              >
                {t.actions.cancel}
              </button>
              <button
                type="submit"
                disabled={Boolean(overlappingConflict) || savingBooking}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-cyan-800 text-white hover:bg-cyan-900 disabled:opacity-50 cursor-pointer"
              >
                {savingBooking ? (isAr ? 'جاري الحفظ...' : 'Saving...') : t.actions.save}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Check-In Workflow Modal */}
      {checkInModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 no-print">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSavingCheckIn(true);
              setCheckInError('');
              try {
                const res = await onCheckIn(checkInModal.id, {
                  idPassport,
                  depositAmount,
                  numGuests: checkInGuests,
                  notes: checkInNotes,
                });
                if (res && res.ok === false) {
                  setCheckInError(
                    res.error || (isAr ? 'تعذر تأكيد تسجيل الدخول.' : 'Check-in failed.')
                  );
                  return;
                }
                setCheckInModal(null);
              } finally {
                setSavingCheckIn(false);
              }
            }}
            className="bg-white w-full max-w-md rounded-xl border border-slate-200 shadow-xl"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">
                {t.actions.checkIn} · {checkInModal.bookingCode}
              </h3>
              <button
                type="button"
                onClick={() => setCheckInModal(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
                <div className="font-semibold text-slate-900">{checkInModal.guestName}</div>
                <div className="text-slate-600">
                  {chaletMap.get(checkInModal.chaletId)?.chaletNumber} · {checkInModal.checkIn} →{' '}
                  {checkInModal.checkOut}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'رقم البطاقة / جواز السفر' : 'National ID / Passport Number'}
                </label>
                <input
                  required
                  value={idPassport}
                  onChange={(e) => setIdPassport(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {isAr ? 'عدد النزلاء الفعلي' : 'Verified Guests'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={checkInGuests}
                    onChange={(e) => setCheckInGuests(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {isAr ? 'مبلغ التأمين' : 'Security Deposit'} ({t.currency})
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'ملاحظات الوصول' : 'Check-in Notes'}
                </label>
                <textarea
                  rows={2}
                  value={checkInNotes}
                  onChange={(e) => setCheckInNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              {checkInError && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                  {checkInError}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCheckInModal(null)}
                className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-700 cursor-pointer"
              >
                {t.actions.cancel}
              </button>
              <button
                type="submit"
                disabled={savingCheckIn}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-60 cursor-pointer"
              >
                {savingCheckIn
                  ? isAr
                    ? 'جاري التأكيد...'
                    : 'Confirming...'
                  : isAr
                  ? 'تأكيد تسجيل الدخول'
                  : 'Confirm Check-In'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Check-Out Workflow Modal */}
      {checkOutModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 no-print">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSavingCheckOut(true);
              setCheckOutError('');
              try {
                const res = await onCheckOut(checkOutModal.id, {
                  inspectionNotes,
                  damageReport,
                  outstandingAmount,
                  notes: checkOutNotes,
                });
                if (res && res.ok === false) {
                  setCheckOutError(
                    res.error || (isAr ? 'تعذر إتمام تسجيل المغادرة.' : 'Check-out failed.')
                  );
                  return;
                }
                setCheckOutModal(null);
              } finally {
                setSavingCheckOut(false);
              }
            }}
            className="bg-white w-full max-w-md rounded-xl border border-slate-200 shadow-xl"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">
                {t.actions.checkOut} · {checkOutModal.bookingCode}
              </h3>
              <button
                type="button"
                onClick={() => setCheckOutModal(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'تقرير فحص الشاليه' : 'Chalet Inspection Checklist'}
                </label>
                <textarea
                  rows={2}
                  required
                  value={inspectionNotes}
                  onChange={(e) => setInspectionNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'تقرير تلفيات (إن وجد)' : 'Damage Report (if any)'}
                </label>
                <input
                  value={damageReport}
                  onChange={(e) => setDamageReport(e.target.value)}
                  placeholder={isAr ? 'لا يوجد' : 'None'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'المبلغ المتبقي عند المغادرة' : 'Outstanding Balance'} ({t.currency})
                </label>
                <input
                  type="number"
                  min={0}
                  value={outstandingAmount}
                  onChange={(e) => setOutstandingAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'ملاحظات نهائية' : 'Final Notes'}
                </label>
                <textarea
                  rows={2}
                  value={checkOutNotes}
                  onChange={(e) => setCheckOutNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              {checkOutError && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                  {checkOutError}
                </div>
              )}
              <p className="text-[11px] text-slate-500">
                {isAr
                  ? 'سيتم تغيير حالة الشاليه إلى "جاري التنظيف" وإنشاء مهمة تدبير فندقي تلقائياً.'
                  : 'Checking out automatically sets chalet status to Cleaning and dispatches a housekeeping task.'}
              </p>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCheckOutModal(null)}
                className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-700 cursor-pointer"
              >
                {t.actions.cancel}
              </button>
              <button
                type="submit"
                disabled={savingCheckOut}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60 cursor-pointer"
              >
                {savingCheckOut
                  ? isAr
                    ? 'جاري التأكيد...'
                    : 'Completing...'
                  : isAr
                  ? 'تأكيد المغادرة والتسوية'
                  : 'Complete Check-Out'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Booking Express Check-In QR Code Modal */}
      {qrModalBooking && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 no-print">
          <div className="bg-white w-full max-w-md rounded-xl border border-slate-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3 min-w-0">
                <CompanyLogo size="sm" />
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-cyan-800 truncate">
                    {COMPANY_BRANDING.companyName}
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 truncate">
                    {isAr ? 'رمز QR لتسجيل الدخول السريع' : 'Express Check-In QR Pass'}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQrModalBooking(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
                aria-label={t.actions.cancel}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {qrModalBooking.isDemo && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-950">
                  <Info className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>
                    <strong className="font-bold">DEMO DATA:</strong>{' '}
                    {isAr
                      ? 'رمز تجريبي لمعاينة آلية الوصول السريع.'
                      : 'Sample booking QR pass for preview.'}
                  </span>
                </div>
              )}

              <div className="flex flex-col items-center justify-center p-4 rounded-xl border border-slate-200 bg-slate-50">
                {qrLoading || !qrDataUrl ? (
                  <div className="w-56 h-56 flex items-center justify-center text-slate-400">
                    {isAr ? 'جاري إنشاء الرمز...' : 'Generating QR...'}
                  </div>
                ) : (
                  <img
                    src={qrDataUrl}
                    alt={`QR Pass for ${qrModalBooking.bookingCode}`}
                    className="w-56 h-56 rounded-lg bg-white p-2 border border-slate-200"
                  />
                )}
                <div className="mt-3 text-center">
                  <div className="font-mono-num text-sm font-bold text-cyan-900">
                    {qrModalBooking.bookingCode} ·{' '}
                    {chaletMap.get(qrModalBooking.chaletId)?.chaletNumber || '-'}
                  </div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">
                    {qrModalBooking.guestName}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono-num mt-0.5">
                    {qrModalBooking.checkIn} → {qrModalBooking.checkOut} · {qrModalBooking.nights}{' '}
                    {t.nights} · {qrModalBooking.numGuests} {t.guests}
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 text-center">
                {isAr
                  ? 'يمكن للنزيل إبراز رمز QR عند مكتب الاستقبال لتسريع مطابقة الحجز وتسجيل الدخول فوراً.'
                  : 'Guests can present this QR code at reception to speed up booking verification and check-in.'}
              </p>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {canManage && qrModalBooking.status === 'upcoming' && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = qrModalBooking;
                      setQrModalBooking(null);
                      setCheckInModal(target);
                      setIdPassport(target.idPassport || '');
                      setDepositAmount(target.depositAmount || 1500);
                      setCheckInGuests(target.numGuests);
                      setCheckInNotes(target.notes || '');
                      setCheckInError('');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>{t.actions.checkIn}</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQrModalBooking(null)}
                  className="px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-700 cursor-pointer"
                >
                  {t.actions.cancel}
                </button>
                <button
                  type="button"
                  disabled={qrExporting}
                  onClick={async () => {
                    setQrExporting(true);
                    try {
                      const chNum =
                        chaletMap.get(qrModalBooking.chaletId)?.chaletNumber || '-';
                      await exportBookingQrPassPng(qrModalBooking, chNum, lang);
                    } finally {
                      setQrExporting(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-cyan-800 hover:bg-cyan-900 text-white cursor-pointer disabled:opacity-60"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{isAr ? 'تصدير رمز QR' : 'Export QR Code'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Guests Directory Modal (CRUD) */}
      {showGuestsModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 no-print">
          <div className="bg-white w-full max-w-4xl rounded-xl border border-slate-200 shadow-xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan-800" />
                <h3 className="text-base font-bold text-slate-900">
                  {isAr ? 'سجل النزلاء الدائمين' : 'Guests Directory'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuestsModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              <form
                onSubmit={handleGuestSubmit}
                className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
              >
                <div className="font-bold text-slate-800">
                  {editingGuestId
                    ? isAr
                      ? 'تعديل بيانات النزيل'
                      : 'Edit Guest Profile'
                    : isAr
                    ? 'إضافة نزيل جديد'
                    : 'Add New Guest'}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      {isAr ? 'الاسم الكامل' : 'Full Name'}
                    </label>
                    <input
                      required
                      value={gName}
                      onChange={(e) => setGName(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      {isAr ? 'رقم الهاتف' : 'Phone'}
                    </label>
                    <input
                      required
                      value={gPhone}
                      onChange={(e) => setGPhone(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      {isAr ? 'الجنسية' : 'Nationality'}
                    </label>
                    <input
                      required
                      value={gNationality}
                      onChange={(e) => setGNationality(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      {isAr ? 'الرقم القومي / الجواز' : 'ID / Passport'}
                    </label>
                    <input
                      value={gIdPassport}
                      onChange={(e) => setGIdPassport(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      {isAr ? 'البريد الإلكتروني' : 'Email'}
                    </label>
                    <input
                      type="email"
                      value={gEmail}
                      onChange={(e) => setGEmail(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      {isAr ? 'ملاحظات' : 'Notes'}
                    </label>
                    <input
                      value={gNotes}
                      onChange={(e) => setGNotes(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                </div>

                {guestError && (
                  <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-800">
                    {guestError}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  {editingGuestId && (
                    <button
                      type="button"
                      onClick={resetGuestForm}
                      className="px-3 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-700 font-semibold cursor-pointer"
                    >
                      {t.actions.cancel}
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={savingGuest}
                    className="px-4 py-1.5 rounded-lg bg-cyan-800 hover:bg-cyan-900 text-white font-semibold disabled:opacity-60 cursor-pointer"
                  >
                    {savingGuest
                      ? isAr
                        ? 'جاري الحفظ...'
                        : 'Saving...'
                      : editingGuestId
                      ? isAr
                        ? 'تحديث النزيل'
                        : 'Update Guest'
                      : isAr
                      ? 'حفظ النزيل'
                      : 'Save Guest'}
                  </button>
                </div>
              </form>

              <div className="space-y-3">
                <div className="relative max-w-sm">
                  <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
                  <input
                    type="text"
                    value={guestSearch}
                    onChange={(e) => setGuestSearch(e.target.value)}
                    placeholder={isAr ? 'بحث بالاسم أو الهاتف أو الهوية...' : 'Search name, phone, ID...'}
                    className="w-full ps-9 pe-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-xs text-start">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="py-2.5 px-3 text-start">{isAr ? 'النزيل' : 'Guest'}</th>
                        <th className="py-2.5 px-3 text-start">{isAr ? 'الهاتف' : 'Phone'}</th>
                        <th className="py-2.5 px-3 text-start">{isAr ? 'الجنسية' : 'Nationality'}</th>
                        <th className="py-2.5 px-3 text-start">{isAr ? 'الهوية' : 'ID / Passport'}</th>
                        <th className="py-2.5 px-3 text-end">{isAr ? 'إجراءات' : 'Actions'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredGuests.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-slate-500">
                            {isAr ? 'لا توجد سجلات نزلاء مطابقة.' : 'No matching guest records.'}
                          </td>
                        </tr>
                      ) : (
                        filteredGuests.map((g) => (
                          <tr key={g.id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-semibold text-slate-900">
                              {g.fullName}
                              {g.email && (
                                <div className="text-[11px] font-normal text-slate-500">
                                  {g.email}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-mono-num text-slate-700">{g.phone}</td>
                            <td className="py-2.5 px-3 text-slate-600">{g.nationality}</td>
                            <td className="py-2.5 px-3 font-mono-num text-slate-600">
                              {g.idPassport || '—'}
                            </td>
                            <td className="py-2.5 px-3 text-end whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingGuestId(g.id);
                                    setGName(g.fullName);
                                    setGPhone(g.phone);
                                    setGNationality(g.nationality);
                                    setGIdPassport(g.idPassport || '');
                                    setGEmail(g.email || '');
                                    setGNotes(g.notes || '');
                                    setGuestError('');
                                  }}
                                  className="p-1.5 rounded border border-slate-200 hover:bg-slate-100 text-slate-700 cursor-pointer"
                                  title={isAr ? 'تعديل' : 'Edit'}
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                {onDeleteGuest && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      setGuestError('');
                                      const res = await onDeleteGuest(g.id);
                                      if (res && res.ok === false) {
                                        setGuestError(
                                          res.error ||
                                            (isAr ? 'تعذر حذف النزيل.' : 'Failed to delete guest.')
                                        );
                                      }
                                    }}
                                    className="p-1.5 rounded border border-red-200 hover:bg-red-50 text-red-700 cursor-pointer"
                                    title={isAr ? 'حذف' : 'Delete'}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
