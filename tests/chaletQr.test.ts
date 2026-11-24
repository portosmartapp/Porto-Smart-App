import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChaletGuestPortalUrl,
  findChaletByPortalRef,
  generateChaletPortalQrDataUrl,
  parseChaletGuestPortalUrl,
} from '../src/utils/chaletQr.ts';
import { Chalet } from '../src/types/platform.ts';

const SAMPLE_CHALETS: Chalet[] = [
  {
    id: 'ch-101',
    chaletNumber: 'PS-101',
    ownerId: 'own-01',
    bedrooms: 2,
    bathrooms: 2,
    maxGuests: 5,
    floor: '1',
    viewType: 'Marina & Sea View',
    viewTypeAr: 'إطلالة المارينا والبحر',
    status: 'available',
    photos: [],
    description: 'Sample chalet',
    descriptionAr: 'شاليه تجريبي',
    amenities: [],
    nightlyPrice: 3800,
    ownerPct: 75,
    managementPct: 25,
    isActive: true,
    isDemo: true,
  },
  {
    id: 'ch-205',
    chaletNumber: 'PS-205',
    ownerId: 'own-02',
    bedrooms: 3,
    bathrooms: 2,
    maxGuests: 6,
    floor: '2',
    viewType: 'Lagoon View',
    viewTypeAr: 'إطلالة اللاجون',
    status: 'occupied',
    photos: [],
    description: 'Lagoon chalet',
    descriptionAr: 'شاليه على اللاجون',
    amenities: [],
    nightlyPrice: 4200,
    ownerPct: 75,
    managementPct: 25,
    isActive: true,
    isDemo: true,
  },
];

test('builds unique chalet guest portal URLs with optional action focus', () => {
  const stayUrl = buildChaletGuestPortalUrl(SAMPLE_CHALETS[0], {
    origin: 'https://porto.example.com/',
  });
  assert.equal(stayUrl, 'https://porto.example.com/?portal=guest&chalet=PS-101');

  const mntUrl = buildChaletGuestPortalUrl(SAMPLE_CHALETS[1], {
    origin: 'https://porto.example.com',
    action: 'maintenance',
  });
  assert.equal(
    mntUrl,
    'https://porto.example.com/?portal=guest&chalet=PS-205&action=maintenance'
  );

  const hkUrl = buildChaletGuestPortalUrl(SAMPLE_CHALETS[0], {
    origin: 'https://porto.example.com',
    action: 'housekeeping',
  });
  assert.equal(
    hkUrl,
    'https://porto.example.com/?portal=guest&chalet=PS-101&action=housekeeping'
  );

  const offersUrl = buildChaletGuestPortalUrl(SAMPLE_CHALETS[0], {
    origin: 'https://porto.example.com',
    action: 'offers',
  });
  assert.equal(
    offersUrl,
    'https://porto.example.com/?portal=guest&chalet=PS-101&action=offers'
  );

  assert.notEqual(stayUrl, mntUrl);
  assert.notEqual(hkUrl, offersUrl);
});

test('parses guest portal URLs and query strings safely', () => {
  const parsedFull = parseChaletGuestPortalUrl(
    'https://porto.example.com/?portal=guest&chalet=PS-101&action=checkin'
  );
  assert.deepEqual(parsedFull, {
    isGuestPortal: true,
    chaletRef: 'PS-101',
    action: 'checkin',
  });

  const parsedSearch = parseChaletGuestPortalUrl('?portal=guest&chalet=PS-205&action=maintenance');
  assert.deepEqual(parsedSearch, {
    isGuestPortal: true,
    chaletRef: 'PS-205',
    action: 'maintenance',
  });

  const parsedHousekeeping = parseChaletGuestPortalUrl('?portal=guest&chalet=PS-101&action=housekeeping');
  assert.deepEqual(parsedHousekeeping, {
    isGuestPortal: true,
    chaletRef: 'PS-101',
    action: 'housekeeping',
  });

  const parsedOffers = parseChaletGuestPortalUrl('?portal=guest&chalet=PS-101&action=offers');
  assert.deepEqual(parsedOffers, {
    isGuestPortal: true,
    chaletRef: 'PS-101',
    action: 'offers',
  });

  const parsedActionOnly = parseChaletGuestPortalUrl('?portal=guest&action=maintenance');
  assert.deepEqual(parsedActionOnly, {
    isGuestPortal: true,
    chaletRef: null,
    action: 'maintenance',
  });

  const parsedStandaloneAction = parseChaletGuestPortalUrl('?action=check-in');
  assert.deepEqual(parsedStandaloneAction, {
    isGuestPortal: false,
    chaletRef: null,
    action: 'checkin',
  });

  const parsedInvalid = parseChaletGuestPortalUrl('?tab=dashboard');
  assert.deepEqual(parsedInvalid, {
    isGuestPortal: false,
    chaletRef: null,
    action: 'stay',
  });
});

test('resolves chalets by chaletNumber (case-insensitive) or id', () => {
  assert.equal(findChaletByPortalRef(SAMPLE_CHALETS, 'ps-101')?.id, 'ch-101');
  assert.equal(findChaletByPortalRef(SAMPLE_CHALETS, 'ch-205')?.chaletNumber, 'PS-205');
  assert.equal(findChaletByPortalRef(SAMPLE_CHALETS, 'unknown'), undefined);
});

test('generates valid QR PNG data URL for a chalet guest portal URL', async () => {
  const url = buildChaletGuestPortalUrl(SAMPLE_CHALETS[0], {
    origin: 'https://porto.example.com',
  });
  const dataUrl = await generateChaletPortalQrDataUrl(url);
  assert.ok(dataUrl.startsWith('data:image/png;base64,'));
  assert.ok(dataUrl.length > 200);
});
