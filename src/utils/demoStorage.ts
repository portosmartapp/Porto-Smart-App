import { INITIAL_DEMO_DATASET } from '../data/demoData';
import { PlatformDataset } from '../types/platform';

export const DEMO_DATASET_STORAGE_KEY = 'freerenttours_porto_demo_dataset_v1';
export const DEMO_TOUR_PROGRESS_KEY = 'freerenttours_porto_demo_steps_v1';

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

function getBrowserStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Storage access may be restricted in private iframes
  }
  return null;
}

function isValidPlatformDataset(candidate: unknown): candidate is PlatformDataset {
  if (!candidate || typeof candidate !== 'object') return false;
  const obj = candidate as Partial<PlatformDataset>;
  return (
    Array.isArray(obj.owners) &&
    Array.isArray(obj.chalets) &&
    obj.chalets.length > 0 &&
    Array.isArray(obj.bookings) &&
    Array.isArray(obj.payments) &&
    Array.isArray(obj.expenses) &&
    Array.isArray(obj.utilities) &&
    Array.isArray(obj.housekeeping) &&
    Array.isArray(obj.maintenance) &&
    Array.isArray(obj.offers) &&
    Array.isArray(obj.notifications)
  );
}

export function loadPersistedDemoDataset(storage: StorageLike | null = getBrowserStorage()): PlatformDataset {
  if (!storage) {
    return structuredClone(INITIAL_DEMO_DATASET);
  }
  try {
    const raw = storage.getItem(DEMO_DATASET_STORAGE_KEY);
    if (!raw) {
      return structuredClone(INITIAL_DEMO_DATASET);
    }
    const parsed: unknown = JSON.parse(raw);
    if (isValidPlatformDataset(parsed)) {
      return {
        ...parsed,
        guests: Array.isArray(parsed.guests)
          ? parsed.guests
          : structuredClone(INITIAL_DEMO_DATASET.guests),
      };
    }
  } catch {
    // Corrupted JSON or restricted storage falls back cleanly
  }
  return structuredClone(INITIAL_DEMO_DATASET);
}

export function savePersistedDemoDataset(
  dataset: PlatformDataset,
  storage: StorageLike | null = getBrowserStorage()
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(DEMO_DATASET_STORAGE_KEY, JSON.stringify(dataset));
    return true;
  } catch {
    return false;
  }
}

export function resetPersistedDemoDataset(
  storage: StorageLike | null = getBrowserStorage()
): PlatformDataset {
  try {
    storage?.removeItem(DEMO_DATASET_STORAGE_KEY);
    storage?.removeItem(DEMO_TOUR_PROGRESS_KEY);
  } catch {
    // Ignore storage removal errors
  }
  return structuredClone(INITIAL_DEMO_DATASET);
}

export function loadCompletedDemoSteps(storage: StorageLike | null = getBrowserStorage()): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(DEMO_TOUR_PROGRESS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function saveCompletedDemoSteps(
  stepIds: string[],
  storage: StorageLike | null = getBrowserStorage()
): void {
  if (!storage) return;
  try {
    storage.setItem(DEMO_TOUR_PROGRESS_KEY, JSON.stringify(stepIds));
  } catch {
    // Ignore storage write errors
  }
}
