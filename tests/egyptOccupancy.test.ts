import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addEgyptDays,
  computeEgyptNights,
  getEgyptDateTimeParts,
  getEgyptTodayIsoDate,
  normalizeToEgyptDateString,
} from '../src/utils/egyptTime.ts';
import { computeChaletOccupancy } from '../src/utils/chaletOccupancy.ts';
import { computeNights, findOverlappingBooking } from '../src/services/platformStore.ts';
import { Booking, Chalet, Owner } from '../src/types/platform.ts';

const SAMPLE_OWNER: Owner = {
  id: 'own-test',
  fullName: 'Tarek El-Masry',
  fullNameAr: 'طارق المصري',
  phone: '+201005550101',
  email: 'tarek@example.com',
  nationalId: '28405120102391',
  bankAccount: 'CIB',
  notes: '',
  isDemo: false,
  createdAt: '2026-01-01T00:00:00Z',
};

const SAMPLE_CHALET: Chalet = {
  id: 'ch-test',
  chaletNumber: 'PS-101',
  ownerId: SAMPLE_OWNER.id,
  bedrooms: 2,
  bathrooms: 2,
  maxGuests: 5,
  floor: '1',
  viewType: 'Sea View',
  viewTypeAr: 'إطلالة بحرية',
  status: 'available',
  photos: [],
  description: '',
  descriptionAr: '',
  amenities: [],
  nightlyPrice: 4000,
  ownerPct: 75,
  managementPct: 25,
  isActive: true,
  isDemo: false,
};

const ownerMap = new Map<string, Owner>([[SAMPLE_OWNER.id, SAMPLE_OWNER]]);

function makeBooking(overrides: Partial<Booking>): Booking {
  return {
    id: 'bk-test',
    bookingCode: 'BK-9001',
    chaletId: SAMPLE_CHALET.id,
    guestName: 'Test Guest',
    phone: '+201001112222',
    nationality: 'Egyptian',
    checkIn: '2026-11-23',
    checkOut: '2026-11-26',
    numGuests: 3,
    nights: 3,
    nightlyPrice: 4000,
    totalValue: 12000,
    paymentStatus: 'paid',
    bookingSource: 'direct',
    status: 'upcoming',
    notes: '',
    isDemo: false,
    createdAt: '2026-11-01T10:00:00Z',
    ...overrides,
  };
}

test('Egypt standard time (UTC+2) midnight boundary rolls over at 22:00 UTC', () => {
  // 2026-11-22 23:59:59 in Cairo = 2026-11-22T21:59:59Z
  const beforeCairoMidnight = new Date('2026-11-22T21:59:59Z');
  assert.equal(getEgyptTodayIsoDate(beforeCairoMidnight), '2026-11-22');

  // 2026-11-23 00:00:00 in Cairo = 2026-11-22T22:00:00Z (still Nov 22 in UTC!)
  const atCairoMidnight = new Date('2026-11-22T22:00:00Z');
  assert.equal(getEgyptTodayIsoDate(atCairoMidnight), '2026-11-23');

  // 2026-11-23 01:45:00 in Cairo = 2026-11-22T23:45:00Z
  const afterCairoMidnight = new Date('2026-11-22T23:45:00Z');
  assert.equal(getEgyptTodayIsoDate(afterCairoMidnight), '2026-11-23');
});

test('Egypt summer DST (UTC+3) midnight boundary rolls over at 21:00 UTC', () => {
  // July 2026 in Africa/Cairo is EEST (UTC+3)
  const beforeSummerMidnight = new Date('2026-07-15T20:59:59Z');
  assert.equal(getEgyptTodayIsoDate(beforeSummerMidnight), '2026-07-15');

  const atSummerMidnight = new Date('2026-07-15T21:00:00Z');
  assert.equal(getEgyptTodayIsoDate(atSummerMidnight), '2026-07-16');
});

test('Month-end Cairo midnight advances month/year accurately for trends', () => {
  // 2026-03-31 22:05:00Z is 2026-04-01 00:05:00 in Cairo
  const parts = getEgyptDateTimeParts(new Date('2026-03-31T22:05:00Z'));
  assert.equal(parts.year, 2026);
  assert.equal(parts.month, 4);
  assert.equal(parts.day, 1);
  assert.equal(parts.isoDate, '2026-04-01');
});

test('Occupancy transitions from upcoming -> checkin_today -> occupied -> checkout_today -> available around Cairo midnight', () => {
  const booking = makeBooking({
    id: 'bk-stay',
    checkIn: '2026-11-23',
    checkOut: '2026-11-25',
    status: 'upcoming',
  });

  // 2026-11-22 23:59:59 Cairo -> upcoming
  const snapBeforeCheckIn = computeChaletOccupancy(
    SAMPLE_CHALET,
    [booking],
    [],
    ownerMap,
    new Date('2026-11-22T21:59:59Z')
  );
  assert.equal(snapBeforeCheckIn.dynamicStatus, 'upcoming');

  // 2026-11-23 00:00:01 Cairo (still Nov 22 UTC!) -> checkin_today
  const snapCheckInMidnight = computeChaletOccupancy(
    SAMPLE_CHALET,
    [booking],
    [],
    ownerMap,
    new Date('2026-11-22T22:00:01Z')
  );
  assert.equal(snapCheckInMidnight.dynamicStatus, 'checkin_today');

  // 2026-11-24 00:10:00 Cairo (even if front desk hasn't clicked check-in yet) -> occupied
  const snapMidStay = computeChaletOccupancy(
    SAMPLE_CHALET,
    [booking],
    [],
    ownerMap,
    new Date('2026-11-23T22:10:00Z')
  );
  assert.equal(snapMidStay.dynamicStatus, 'occupied');

  // Guest checked in; at 2026-11-25 00:00:05 Cairo -> checkout_today
  const checkedInBooking: Booking = { ...booking, status: 'checked_in' };
  const snapCheckOutMidnight = computeChaletOccupancy(
    SAMPLE_CHALET,
    [checkedInBooking],
    [],
    ownerMap,
    new Date('2026-11-24T22:00:05Z')
  );
  assert.equal(snapCheckOutMidnight.dynamicStatus, 'checkout_today');

  // Once checked out -> available
  const checkedOutBooking: Booking = { ...booking, status: 'checked_out' };
  const snapAfterCheckOut = computeChaletOccupancy(
    SAMPLE_CHALET,
    [checkedOutBooking],
    [],
    ownerMap,
    new Date('2026-11-24T22:30:00Z')
  );
  assert.equal(snapAfterCheckOut.dynamicStatus, 'available');
});

test('Same-day turnover in Egypt exposes departing guest and arriving guest around midnight', () => {
  const departing = makeBooking({
    id: 'bk-dep',
    bookingCode: 'BK-DEP',
    guestName: 'Departing Guest',
    checkIn: '2026-11-20',
    checkOut: '2026-11-23',
    status: 'checked_in',
  });
  const arriving = makeBooking({
    id: 'bk-arr',
    bookingCode: 'BK-ARR',
    guestName: 'Arriving Guest',
    checkIn: '2026-11-23',
    checkOut: '2026-11-26',
    status: 'upcoming',
  });

  // At 2026-11-22 23:55 Cairo -> still occupied by departing guest
  const beforeTurnoverDay = computeChaletOccupancy(
    SAMPLE_CHALET,
    [departing, arriving],
    [],
    ownerMap,
    new Date('2026-11-22T21:55:00Z')
  );
  assert.equal(beforeTurnoverDay.dynamicStatus, 'occupied');
  assert.equal(beforeTurnoverDay.currentBooking?.id, 'bk-dep');

  // At 2026-11-23 00:05 Cairo -> checkout_today with nextBooking = arriving guest
  const turnoverMidnight = computeChaletOccupancy(
    SAMPLE_CHALET,
    [departing, arriving],
    [],
    ownerMap,
    new Date('2026-11-22T22:05:00Z')
  );
  assert.equal(turnoverMidnight.dynamicStatus, 'checkout_today');
  assert.equal(turnoverMidnight.currentBooking?.id, 'bk-dep');
  assert.equal(turnoverMidnight.nextBooking?.id, 'bk-arr');

  // After departing guest checks out -> checkin_today for arriving guest
  const afterDepartingChecksOut = computeChaletOccupancy(
    SAMPLE_CHALET,
    [{ ...departing, status: 'checked_out' }, arriving],
    [],
    ownerMap,
    new Date('2026-11-23T10:00:00Z')
  );
  assert.equal(afterDepartingChecksOut.dynamicStatus, 'checkin_today');
  assert.equal(afterDepartingChecksOut.currentBooking?.id, 'bk-arr');
});

test('Cancelled bookings do not affect occupancy and timestamp strings normalize in Africa/Cairo', () => {
  const cancelled = makeBooking({
    id: 'bk-cancel',
    checkIn: '2026-11-22',
    checkOut: '2026-11-26',
    status: 'cancelled',
  });

  const snapCancelled = computeChaletOccupancy(
    { ...SAMPLE_CHALET, status: 'occupied' }, // even if stale chalet status flag exists
    [cancelled],
    [],
    ownerMap,
    new Date('2026-11-22T22:30:00Z')
  );
  assert.equal(snapCancelled.dynamicStatus, 'available');

  // Timestamp checkIn created at 2026-11-22T22:15:00Z equals 2026-11-23 in Cairo
  assert.equal(normalizeToEgyptDateString('2026-11-22T22:15:00Z'), '2026-11-23');
  assert.equal(addEgyptDays(new Date('2026-11-22T22:15:00Z'), 2), '2026-11-25');
  assert.equal(computeEgyptNights('2026-04-23', '2026-04-26'), 3); // crosses Egypt DST spring-forward week cleanly
  assert.equal(computeNights('2026-11-22T22:15:00Z', '2026-11-26'), 3);

  const conflict = findOverlappingBooking(
    [makeBooking({ id: 'bk-existing', checkIn: '2026-11-23', checkOut: '2026-11-26' })],
    SAMPLE_CHALET.id,
    '2026-11-22T22:15:00Z', // resolves to 2026-11-23 in Cairo
    '2026-11-24'
  );
  assert.equal(conflict?.id, 'bk-existing');
});
