import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_DEMO_DATASET } from '../src/data/demoData.ts';
import {
  buildOwnerWeeklySummary,
  generateOwnerWeeklySummaryPdf,
  getWeeklySummaryPeriod,
  scheduleWeeklyOwnerReportsBatch,
  scheduleWeeklyOwnerSummaryEmail,
  startWeeklyReportScheduler,
} from '../src/services/reportEngine.ts';
import { PlatformDataset } from '../src/types/platform.ts';

function buildFixtureDataset(): PlatformDataset {
  const base = structuredClone(INITIAL_DEMO_DATASET);
  const ownerA = base.owners[0];
  const ownerB = base.owners[1];
  const chaletA = { ...base.chalets[0], id: 'ch-test-a', ownerId: ownerA.id, chaletNumber: 'PS-901', ownerPct: 75, managementPct: 25 };
  const chaletB = { ...base.chalets[1], id: 'ch-test-b', ownerId: ownerB.id, chaletNumber: 'PS-902', ownerPct: 80, managementPct: 20 };

  return {
    ...base,
    owners: [ownerA, ownerB],
    chalets: [chaletA, chaletB],
    bookings: [
      {
        ...base.bookings[0],
        id: 'bk-a-1',
        bookingCode: 'BK-901',
        chaletId: chaletA.id,
        checkIn: '2026-11-18',
        checkOut: '2026-11-22',
        nights: 4,
        nightlyPrice: 4000,
        totalValue: 16000,
        status: 'checked_in',
        isDemo: true,
      },
      {
        ...base.bookings[0],
        id: 'bk-a-cancelled',
        bookingCode: 'BK-902',
        chaletId: chaletA.id,
        checkIn: '2026-11-19',
        checkOut: '2026-11-21',
        nights: 2,
        nightlyPrice: 4000,
        totalValue: 8000,
        status: 'cancelled',
        isDemo: true,
      },
      {
        ...base.bookings[0],
        id: 'bk-b-1',
        bookingCode: 'BK-903',
        chaletId: chaletB.id,
        checkIn: '2026-11-18',
        checkOut: '2026-11-20',
        nights: 2,
        nightlyPrice: 5000,
        totalValue: 10000,
        status: 'upcoming',
        isDemo: true,
      },
    ],
    expenses: [
      {
        id: 'exp-a-1',
        chaletId: chaletA.id,
        category: 'housekeeping',
        description: 'Weekly linen wash',
        descriptionAr: 'غسيل مفروشات أسبوعي',
        amount: 600,
        expenseDate: '2026-11-20',
        isDemo: true,
      },
      {
        id: 'exp-b-1',
        chaletId: chaletB.id,
        category: 'electricity',
        description: 'Other owner expense',
        descriptionAr: 'مصروف مالك آخر',
        amount: 900,
        expenseDate: '2026-11-20',
        isDemo: true,
      },
    ],
    payments: [],
    maintenance: [],
    notificationDeliveries: [],
  };
}

test('computes rolling 7-day Cairo weekly period and isolated owner financials', () => {
  const period = getWeeklySummaryPeriod('2026-11-23');
  assert.equal(period.startDate, '2026-11-17');
  assert.equal(period.endDate, '2026-11-23');

  const dataset = buildFixtureDataset();
  const ownerA = dataset.owners[0];
  const summary = buildOwnerWeeklySummary(dataset, ownerA.id, {
    referenceDate: '2026-11-23',
  });

  assert.ok(summary);
  assert.equal(summary.chalets.length, 1);
  assert.equal(summary.totals.bookingsCount, 1); // cancelled excluded, other owner excluded
  assert.equal(summary.totals.totalBookedNights, 4);
  assert.equal(summary.totals.grossRevenue, 16000);
  assert.equal(summary.totals.ownerGrossShare, 12000); // 75%
  assert.equal(summary.totals.managementFees, 4000); // 25%
  assert.equal(summary.totals.expensesTotal, 600);
  assert.equal(summary.totals.netOwnerBalance, 11400);
});

test('generates valid PDF Blob and dataUri for an owner weekly summary', async () => {
  const dataset = buildFixtureDataset();
  const summary = buildOwnerWeeklySummary(dataset, dataset.owners[0].id, {
    referenceDate: '2026-11-23',
  });
  assert.ok(summary);

  const pdfResult = await generateOwnerWeeklySummaryPdf(summary, 'en', {
    download: false,
  });
  assert.ok(pdfResult.fileName.endsWith('.pdf'));
  assert.ok(pdfResult.blob.size > 500);
  assert.ok(pdfResult.dataUri.startsWith('data:application/pdf'));
});

test('skips email scheduling when notifications are disabled and schedules safely when configured', () => {
  const dataset = buildFixtureDataset();
  const ownerId = dataset.owners[0].id;

  // Case 1: emailEnabled = false (default)
  const skipped = scheduleWeeklyOwnerSummaryEmail({
    dataset,
    ownerId,
    lang: 'en',
    referenceDate: '2026-11-23',
  });
  assert.equal(skipped.status, 'skipped_not_configured');
  assert.equal(skipped.delivery, undefined);

  // Case 2: emailEnabled = true (safe simulation mode)
  const configuredDataset: PlatformDataset = {
    ...dataset,
    notificationSettings: {
      ...dataset.notificationSettings,
      emailEnabled: true,
      simulationMode: true,
    },
  };

  const scheduled = scheduleWeeklyOwnerSummaryEmail({
    dataset: configuredDataset,
    ownerId,
    lang: 'en',
    referenceDate: '2026-11-23',
  });
  assert.equal(scheduled.status, 'simulated');
  assert.ok(scheduled.delivery);
  assert.equal(scheduled.delivery.channel, 'email');
  assert.ok(scheduled.delivery.body.includes(scheduled.pdfFileName));

  // Case 3: duplicate guard blocks rescheduling for the same owner & period
  const dupBlocked = scheduleWeeklyOwnerSummaryEmail({
    dataset: {
      ...configuredDataset,
      notificationDeliveries: [scheduled.delivery],
    },
    ownerId,
    lang: 'en',
    referenceDate: '2026-11-23',
  });
  assert.equal(dupBlocked.status, 'blocked_duplicate');
});

test('batch scheduler processes all owners and startWeeklyReportScheduler fires & stops cleanly', () => {
  const dataset = buildFixtureDataset();
  const configuredDataset: PlatformDataset = {
    ...dataset,
    notificationSettings: {
      ...dataset.notificationSettings,
      emailEnabled: true,
      simulationMode: true,
    },
  };

  const batch = scheduleWeeklyOwnerReportsBatch({
    dataset: configuredDataset,
    lang: 'ar',
    referenceDate: '2026-11-23',
  });
  assert.equal(batch.summaries.length, 2);
  assert.equal(batch.tasks.length, 2);
  assert.equal(batch.deliveries.length, 2);

  let callbackCount = 0;
  const stop = startWeeklyReportScheduler({
    getDataset: () => configuredDataset,
    getLang: () => 'en',
    runImmediately: true,
    intervalMs: 60_000,
    onTasksScheduled: (res) => {
      callbackCount += res.tasks.length;
    },
  });
  stop();
  assert.equal(callbackCount, 2);
});
