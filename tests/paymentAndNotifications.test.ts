import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_DEMO_DATASET, DEMO_USERS } from '../src/data/demoData';
import {
  computeBookingPaymentSummary,
  issuePaymentRefundOrCorrection,
  reconcileLedgerTotals,
  recordManualPayment,
  SUPPORTED_PAYMENT_METHODS,
} from '../src/utils/paymentLedger';
import {
  dispatchNotification,
  INITIAL_NOTIFICATION_TEMPLATES,
  retryNotificationDelivery,
} from '../src/utils/notificationEngine';
import { Booking, Payment } from '../src/types/platform';

const staffActor = DEMO_USERS[0];

const sampleBooking: Booking = {
  id: 'bk-test-1',
  bookingCode: 'BK-TEST-901',
  chaletId: 'ch-01',
  guestName: 'Karim Test',
  phone: '+201001112233',
  nationality: 'Egyptian',
  checkIn: '2026-07-10',
  checkOut: '2026-07-14',
  numGuests: 4,
  nights: 4,
  nightlyPrice: 3000,
  totalValue: 12000,
  paymentStatus: 'pending',
  bookingSource: 'direct',
  status: 'upcoming',
  notes: '',
  paymentDueDate: '2026-07-10',
  isDemo: false,
  createdAt: '2026-07-01T10:00:00Z',
};

test('supports all 6 manual payment methods', () => {
  const ids = SUPPORTED_PAYMENT_METHODS.map((m) => m.id);
  assert.deepEqual(ids, [
    'cash',
    'bank_transfer',
    'instapay',
    'mobile_wallet',
    'card_manual',
    'other',
  ]);
});

test('tracks multiple payments, deposit, remaining balance, and blocks duplicates', () => {
  const existing: Payment[] = [];

  // 1. Deposit 3,000 via InstaPay
  const depRes = recordManualPayment({
    booking: sampleBooking,
    paymentType: 'deposit',
    amount: 3000,
    paymentMethod: 'instapay',
    referenceNo: 'IP-1001',
    notes: 'Booking deposit',
    paidAt: '2026-07-01T12:00:00Z',
    actor: staffActor,
    existingPayments: existing,
  });
  assert.equal(depRes.ok, true);
  assert.ok(depRes.payment && depRes.auditLog && depRes.updatedBooking);
  assert.equal(depRes.updatedBooking.paymentStatus, 'partial');
  assert.equal(depRes.updatedBooking.depositAmount, 3000);
  assert.equal(depRes.updatedBooking.outstandingAmount, 9000);
  existing.push(depRes.payment);

  // Duplicate attempt with same reference & amount must be blocked
  const dupRes = recordManualPayment({
    booking: sampleBooking,
    paymentType: 'deposit',
    amount: 3000,
    paymentMethod: 'instapay',
    referenceNo: 'IP-1001',
    notes: 'Duplicate click',
    paidAt: '2026-07-01T12:00:00Z',
    actor: staffActor,
    existingPayments: existing,
  });
  assert.equal(dupRes.ok, false);
  assert.equal(dupRes.isDuplicate, true);

  // 2. Final 9,000 via Cash
  const finalRes = recordManualPayment({
    booking: depRes.updatedBooking,
    paymentType: 'guest_payment',
    amount: 9000,
    paymentMethod: 'cash',
    referenceNo: 'CSH-1002',
    notes: 'Balance settled at desk',
    paidAt: '2026-07-10T14:00:00Z',
    actor: staffActor,
    existingPayments: existing,
  });
  assert.equal(finalRes.ok, true);
  assert.equal(finalRes.updatedBooking?.paymentStatus, 'paid');
  assert.equal(finalRes.updatedBooking?.outstandingAmount, 0);
});

test('validates refunds against net collected and creates immutable audit logs', () => {
  const pay: Payment = {
    id: 'pay-ref-1',
    bookingId: sampleBooking.id,
    ownerId: 'own-01',
    paymentType: 'guest_payment',
    entryDirection: 'inflow',
    amount: 5000,
    paymentMethod: 'card_manual',
    status: 'confirmed',
    referenceNo: 'POS-555',
    paidAt: '2026-07-02T10:00:00Z',
    notes: 'Partial card payment',
    isDemo: false,
  };

  // Excess refund must fail
  const overRefund = issuePaymentRefundOrCorrection({
    booking: sampleBooking,
    targetPayment: pay,
    mode: 'refund',
    amount: 6000,
    paymentMethod: 'cash',
    reason: 'Over-refund test',
    actor: staffActor,
    existingPayments: [pay],
  });
  assert.equal(overRefund.ok, false);

  // Valid refund of 2000 updates net paid to 3000 & balance to 9000
  const okRefund = issuePaymentRefundOrCorrection({
    booking: sampleBooking,
    targetPayment: pay,
    mode: 'refund',
    amount: 2000,
    paymentMethod: 'cash',
    reason: 'Guest shortened stay by 1 night',
    actor: staffActor,
    existingPayments: [pay],
  });
  assert.equal(okRefund.ok, true);
  assert.equal(okRefund.auditLog?.action, 'refund_issued');
  assert.equal(okRefund.auditLog?.previousAmount, 5000);
  assert.equal(okRefund.auditLog?.newAmount, 2000);

  const summary = computeBookingPaymentSummary(sampleBooking, [pay, okRefund.payment!], '2026-07-03');
  assert.equal(summary.netPaid, 3000);
  assert.equal(summary.refundsTotal, 2000);
  assert.equal(summary.remainingBalance, 9000);
  assert.equal(summary.derivedStatus, 'partial');
});

test('reconciles financial ledger without double counting booking revenue + payments', () => {
  const ch = INITIAL_DEMO_DATASET.chalets[0];
  const p1: Payment = {
    id: 'p-rec-1',
    bookingId: sampleBooking.id,
    ownerId: ch.ownerId,
    paymentType: 'guest_payment',
    entryDirection: 'inflow',
    amount: 12000,
    paymentMethod: 'bank_transfer',
    status: 'confirmed',
    referenceNo: 'WIRE-1',
    paidAt: '2026-07-02T10:00:00Z',
    notes: '',
    isDemo: false,
  };
  const totals = reconcileLedgerTotals([sampleBooking], [p1], [ch], '2026-07-03');
  assert.equal(totals.contractedBookingRevenue, 12000);
  assert.equal(totals.netBookingCashCollected, 12000);
  assert.equal(totals.totalOutstandingReceivables, 0);
});

test('provides all 12 bilingual templates and enforces provider-disabled + dedup guards', () => {
  assert.equal(INITIAL_NOTIFICATION_TEMPLATES.length, 12);
  const template = INITIAL_NOTIFICATION_TEMPLATES[0];
  const recipient = INITIAL_DEMO_DATASET.notificationRecipients[2];
  const settings = {
    ...INITIAL_DEMO_DATASET.notificationSettings,
    providersActivated: false,
    simulationMode: false,
  };

  // First SMS dispatch while providers disabled -> queued_disabled (never externally sent)
  const first = dispatchNotification({
    template,
    channel: 'sms',
    recipient,
    variables: {
      guestName: 'Ahmed',
      chaletNumber: 'PS-101',
      bookingCode: 'BK-999',
      checkIn: '2026-08-01',
      checkOut: '2026-08-04',
      amount: '10000',
    },
    relatedEntityId: 'bk-999',
    settings,
    existingDeliveries: [],
  });

  assert.equal(first.ok, true);
  assert.equal(first.delivery?.status, 'queued_disabled');
  assert.equal(first.delivery?.attemptCount, 1);

  // Duplicate notification on same day/event/entity/channel/recipient must be blocked
  const duplicate = dispatchNotification({
    template,
    channel: 'sms',
    recipient,
    variables: {
      guestName: 'Ahmed',
      chaletNumber: 'PS-101',
      bookingCode: 'BK-999',
      checkIn: '2026-08-01',
      checkOut: '2026-08-04',
      amount: '10000',
    },
    relatedEntityId: 'bk-999',
    settings,
    existingDeliveries: [first.delivery!],
  });

  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.blockedByDuplicate, true);

  // Retry increments attemptCount safely while keeping external sending disabled
  const retried = retryNotificationDelivery(first.delivery!, settings);
  assert.equal(retried.attemptCount, 2);
  assert.equal(retried.status, 'queued_disabled');
});
