import { afterEach, describe, expect, test } from 'vitest';
import { getSafeAreaInsets, resetSafeAreaCache } from '../src/getSafeAreaInsets';

describe('getSafeAreaInsets', () => {
  afterEach(() => {
    resetSafeAreaCache();
  });

  test('returns zero insets in non-DOM (node-only) environment', () => {
    const originalDocument = globalThis.document;
    // @ts-expect-error — temporarily strip document to simulate SSR/node
    globalThis.document = undefined;
    try {
      const insets = getSafeAreaInsets();
      expect(insets).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    } finally {
      globalThis.document = originalDocument;
      resetSafeAreaCache();
    }
  });

  test('cache returns same object on second call', () => {
    // In node test env document is undefined, so the read path returns
    // ZERO and caches it. Confirm the cache hit returns identity.
    const originalDocument = globalThis.document;
    // @ts-expect-error — temporarily strip document to simulate SSR/node
    globalThis.document = undefined;
    try {
      const a = getSafeAreaInsets();
      const b = getSafeAreaInsets();
      expect(a).toBe(b);
    } finally {
      globalThis.document = originalDocument;
    }
  });
});
