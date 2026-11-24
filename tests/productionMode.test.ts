import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyDataset, INITIAL_DEMO_DATASET } from '../src/data/demoData.ts';
import { classifySupabaseError, normalizeSupabaseUrl } from '../src/lib/supabase.ts';
import { loadProductionDataset, scopeDatasetForUser } from '../src/services/platformStore.ts';
import { PlatformUser } from '../src/types/platform.ts';

test('classifySupabaseError identifies missing tables, concurrent booking conflicts, and RLS violations', () => {
  const missingPostgres = classifySupabaseError(
    { code: '42P01', message: 'relation "public.owners" does not exist' },
    'en'
  );
  assert.equal(missingPostgres.kind, 'missing_tables');
  assert.match(missingPostgres.message, /No tables/i);

  const missingPostgrest = classifySupabaseError(
    { code: 'PGRST205', message: "Could not find the table 'public.chalets' in the schema cache" },
    'ar'
  );
  assert.equal(missingPostgrest.kind, 'missing_tables');

  const exclusionConflict = classifySupabaseError(
    {
      code: '23P01',
      message: 'conflicting key value violates exclusion constraint "bookings_no_overlap"',
    },
    'en'
  );
  assert.equal(exclusionConflict.kind, 'conflict');

  const triggerConflict = classifySupabaseError(
    { code: 'P0001', message: 'Double booking not allowed for overlapping dates' },
    'ar'
  );
  assert.equal(triggerConflict.kind, 'conflict');

  const rlsDenied = classifySupabaseError(
    { code: '42501', message: 'new row violates row-level security policy for table "bookings"' },
    'en'
  );
  assert.equal(rlsDenied.kind, 'permission');
});

test('createEmptyDataset returns zero demo/placeholder records for Production initialization', () => {
  const empty = createEmptyDataset();
  assert.equal(empty.owners.length, 0);
  assert.equal(empty.chalets.length, 0);
  assert.equal(empty.guests.length, 0);
  assert.equal(empty.bookings.length, 0);
  assert.equal(empty.payments.length, 0);
  assert.equal(empty.paymentAuditLogs.length, 0);
  assert.equal(empty.expenses.length, 0);
  assert.equal(empty.utilities.length, 0);
  assert.equal(empty.utilityTransactions.length, 0);
  assert.equal(empty.housekeeping.length, 0);
  assert.equal(empty.maintenance.length, 0);
  assert.equal(empty.offers.length, 0);
  assert.equal(empty.notifications.length, 0);
  assert.equal(empty.notificationRecipients.length, 0);
  assert.equal(empty.notificationDeliveries.length, 0);
});

test('scopeDatasetForUser isolates owner records and hides staff-only guests directory from owners', () => {
  const targetOwnerId = INITIAL_DEMO_DATASET.owners[0].id;
  const ownerUser: PlatformUser = {
    id: 'usr-owner-test',
    fullName: 'Test Owner',
    fullNameAr: 'مالك تجريبي',
    email: 'owner@test.local',
    phone: '+201000000001',
    role: 'owner',
    ownerId: targetOwnerId,
    isActive: true,
    isDemo: false,
  };

  const ownerScoped = scopeDatasetForUser(INITIAL_DEMO_DATASET, ownerUser);
  assert.equal(ownerScoped.guests.length, 0);
  assert.ok(ownerScoped.chalets.length > 0);
  assert.ok(ownerScoped.chalets.every((c) => c.ownerId === targetOwnerId));
  const ownChaletIds = new Set(ownerScoped.chalets.map((c) => c.id));
  assert.ok(ownerScoped.bookings.every((b) => ownChaletIds.has(b.chaletId)));
  assert.ok(ownerScoped.expenses.every((e) => ownChaletIds.has(e.chaletId)));
  assert.ok(ownerScoped.utilities.every((u) => ownChaletIds.has(u.chaletId)));

  const unlinkedOwnerUser: PlatformUser = {
    ...ownerUser,
    ownerId: null,
  };
  const unlinkedScoped = scopeDatasetForUser(INITIAL_DEMO_DATASET, unlinkedOwnerUser);
  assert.equal(unlinkedScoped.chalets.length, 0);
  assert.equal(unlinkedScoped.bookings.length, 0);
  assert.equal(unlinkedScoped.guests.length, 0);

  const receptionUser: PlatformUser = {
    ...ownerUser,
    role: 'reception',
    ownerId: null,
  };
  const receptionScoped = scopeDatasetForUser(INITIAL_DEMO_DATASET, receptionUser);
  assert.equal(receptionScoped.guests.length, INITIAL_DEMO_DATASET.guests.length);
  assert.equal(receptionScoped.chalets.length, INITIAL_DEMO_DATASET.chalets.length);
});

test('loadProductionDataset returns explicit error and empty dataset without falling back to Demo Mode', async () => {
  const result = await loadProductionDataset('en');
  assert.equal(result.source, 'production');
  assert.ok(result.error && result.error.length > 0);
  assert.equal(result.dataset.chalets.length, 0);
  assert.equal(result.dataset.owners.length, 0);
  assert.equal(result.dataset.bookings.length, 0);
});

test('normalizeSupabaseUrl strips /rest/v1/ suffix and trailing slashes safely', () => {
  assert.equal(
    normalizeSupabaseUrl('https://mabpvpymlsipdowfhiqs.supabase.co/rest/v1/'),
    'https://mabpvpymlsipdowfhiqs.supabase.co'
  );
  assert.equal(
    normalizeSupabaseUrl('  https://mabpvpymlsipdowfhiqs.supabase.co/  '),
    'https://mabpvpymlsipdowfhiqs.supabase.co'
  );
  assert.equal(normalizeSupabaseUrl(undefined), '');
});

