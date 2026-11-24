import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMO_DATASET_STORAGE_KEY,
  DEMO_TOUR_PROGRESS_KEY,
  StorageLike,
  loadCompletedDemoSteps,
  loadPersistedDemoDataset,
  resetPersistedDemoDataset,
  saveCompletedDemoSteps,
  savePersistedDemoDataset,
} from '../src/utils/demoStorage.ts';

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

test('loads initial 22-chalet dataset when storage is empty or corrupted', () => {
  const storage = createMemoryStorage();
  const initial = loadPersistedDemoDataset(storage);
  assert.equal(initial.chalets.length, 22);

  storage.setItem(DEMO_DATASET_STORAGE_KEY, '{invalid-json');
  const fallback = loadPersistedDemoDataset(storage);
  assert.equal(fallback.chalets.length, 22);
});

test('persists demo modifications and resets back to clean initial state', () => {
  const storage = createMemoryStorage();
  const modified = loadPersistedDemoDataset(storage);
  modified.chalets[0] = {
    ...modified.chalets[0],
    nightlyPrice: 9999,
  };

  assert.equal(savePersistedDemoDataset(modified, storage), true);
  const reloaded = loadPersistedDemoDataset(storage);
  assert.equal(reloaded.chalets[0].nightlyPrice, 9999);

  saveCompletedDemoSteps(['step-roles', 'step-bookings'], storage);
  assert.deepEqual(loadCompletedDemoSteps(storage), ['step-roles', 'step-bookings']);

  const reset = resetPersistedDemoDataset(storage);
  assert.notEqual(reset.chalets[0].nightlyPrice, 9999);
  assert.equal(storage.getItem(DEMO_DATASET_STORAGE_KEY), null);
  assert.equal(storage.getItem(DEMO_TOUR_PROGRESS_KEY), null);
  assert.deepEqual(loadCompletedDemoSteps(storage), []);
});
