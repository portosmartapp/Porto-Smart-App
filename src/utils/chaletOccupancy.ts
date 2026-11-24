import {
  Booking,
  Chalet,
  MaintenanceTicket,
  Owner,
} from '../types/platform';
import {
  getEgyptTodayIsoDate,
  normalizeToEgyptDateString,
} from './egyptTime';

export type DynamicOccupancyStatus =
  | 'available'
  | 'occupied'
  | 'upcoming'
  | 'checkin_today'
  | 'checkout_today'
  | 'maintenance'
  | 'inactive';

export type OccupancyFilterKey =
  | 'all'
  | 'available'
  | 'occupied'
  | 'upcoming'
  | 'maintenance'
  | 'inactive';

export interface ChaletOccupancySnapshot {
  chalet: Chalet;
  owner: Owner | undefined;
  dynamicStatus: DynamicOccupancyStatus;
  filterBucket: Exclude<OccupancyFilterKey, 'all'>;
  currentBooking: Booking | null;
  nextBooking: Booking | null;
  displayBooking: Booking | null;
  activeMaintenanceTickets: MaintenanceTicket[];
  latestMaintenanceTicket: MaintenanceTicket | null;
  isDemoData: boolean;
}

export function getTodayIsoDate(now?: Date): string {
  return getEgyptTodayIsoDate(now);
}

/**
 * Dynamically computes current occupancy status for a chalet from live/demo
 * chalet state, active booking date ranges, and maintenance tickets using
 * Egypt local dates (Africa/Cairo).
 *
 * Rules enforced:
 * 1. Cancelled bookings (`status === 'cancelled'`) and invalid ranges are ignored.
 * 2. Any non-checked-out booking whose date range overlaps today (`checkIn < today && checkOut > today`
 *    or `checkIn <= today && checkOut > today` when checked in) guarantees the chalet is NOT Available.
 * 3. Same-day departures (`checkOut === today`) and arrivals (`checkIn === today`) are surfaced cleanly,
 *    preserving both `currentBooking` and `nextBooking` for turnover visibility.
 */
export function computeChaletOccupancy(
  chalet: Chalet,
  bookings: Booking[],
  maintenanceTickets: MaintenanceTicket[],
  ownerMap: Map<string, Owner>,
  todayOrNow: string | Date = getEgyptTodayIsoDate()
): ChaletOccupancySnapshot {
  const today =
    todayOrNow instanceof Date
      ? getEgyptTodayIsoDate(todayOrNow)
      : normalizeToEgyptDateString(todayOrNow) || getEgyptTodayIsoDate();

  const owner = ownerMap.get(chalet.ownerId);

  // Exclude cancelled bookings and normalize dates in Africa/Cairo so midnight boundaries align
  const normalizedBookings = bookings
    .filter((b) => b.chaletId === chalet.id && b.status !== 'cancelled')
    .map((b) => ({
      booking: b,
      checkIn: normalizeToEgyptDateString(b.checkIn),
      checkOut: normalizeToEgyptDateString(b.checkOut),
    }))
    .filter(
      ({ checkIn, checkOut }) =>
        Boolean(checkIn) && Boolean(checkOut) && checkOut > checkIn
    )
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));

  // Departing today: still checked in (or multi-night stay ending today before checkout completes)
  const checkoutTodayBooking =
    normalizedBookings.find(
      ({ booking, checkIn, checkOut }) =>
        booking.status !== 'checked_out' &&
        checkOut === today &&
        checkIn < today
    )?.booking ?? null;

  // Currently occupied across today (either checked in on/before today and leaving after today,
  // or an active reservation whose stay window already started before today and extends past today)
  const activeStayBooking =
    normalizedBookings.find(
      ({ booking, checkIn, checkOut }) =>
        booking.status === 'checked_in' &&
        checkIn <= today &&
        checkOut > today
    )?.booking ??
    normalizedBookings.find(
      ({ booking, checkIn, checkOut }) =>
        booking.status === 'upcoming' &&
        checkIn < today &&
        checkOut > today
    )?.booking ??
    null;

  // Scheduled arrival today (upcoming reservation whose check-in is today)
  const checkinTodayBooking =
    normalizedBookings.find(
      ({ booking, checkIn, checkOut }) =>
        booking.status === 'upcoming' &&
        checkIn === today &&
        checkOut > today
    )?.booking ?? null;

  // Next confirmed future reservation starting after today
  const futureUpcomingBooking =
    normalizedBookings.find(
      ({ booking, checkIn }) =>
        booking.status === 'upcoming' &&
        checkIn > today
    )?.booking ?? null;

  const chaletMaintenance = maintenanceTickets
    .filter((m) => m.chaletId === chalet.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const activeMaintenanceTickets = chaletMaintenance.filter(
    (m) => m.status !== 'completed' && m.status !== 'closed'
  );
  const latestMaintenanceTicket = chaletMaintenance[0] ?? null;

  let dynamicStatus: DynamicOccupancyStatus;

  if (!chalet.isActive || chalet.status === 'inactive') {
    dynamicStatus = 'inactive';
  } else if (chalet.status === 'maintenance') {
    dynamicStatus = 'maintenance';
  } else if (checkoutTodayBooking) {
    dynamicStatus = 'checkout_today';
  } else if (activeStayBooking) {
    dynamicStatus = 'occupied';
  } else if (checkinTodayBooking) {
    dynamicStatus = 'checkin_today';
  } else if (futureUpcomingBooking) {
    dynamicStatus = 'upcoming';
  } else {
    dynamicStatus = 'available';
  }

  let filterBucket: Exclude<OccupancyFilterKey, 'all'>;
  switch (dynamicStatus) {
    case 'occupied':
    case 'checkout_today':
      filterBucket = 'occupied';
      break;
    case 'upcoming':
    case 'checkin_today':
      filterBucket = 'upcoming';
      break;
    case 'maintenance':
      filterBucket = 'maintenance';
      break;
    case 'inactive':
      filterBucket = 'inactive';
      break;
    default:
      filterBucket = 'available';
      break;
  }

  const currentBooking =
    checkoutTodayBooking ??
    activeStayBooking ??
    checkinTodayBooking ??
    null;

  // If a guest is checking out today and another reservation arrives today, expose that as nextBooking
  const nextBooking =
    checkoutTodayBooking && checkinTodayBooking
      ? checkinTodayBooking
      : futureUpcomingBooking;

  const displayBooking = currentBooking ?? nextBooking;

  const isDemoData =
    chalet.isDemo || Boolean(displayBooking?.isDemo);

  return {
    chalet,
    owner,
    dynamicStatus,
    filterBucket,
    currentBooking,
    nextBooking,
    displayBooking,
    activeMaintenanceTickets,
    latestMaintenanceTicket,
    isDemoData,
  };
}
