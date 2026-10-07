/**
 * CabinetCanvasErrorBoundary contract — generalized from bone-buster's ERR1
 * browser suite (the app-event-bus assertion dropped with the dispatch):
 * when a child throws a load-style error the boundary (1) renders the
 * fallback (default null — the Canvas is gone), (2) calls `onError` with a
 * classified {url, assetType, message}. Plus direct pins on
 * `classifyAssetError`'s URL/extension edge cases.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetErrorReason } from '../src/CabinetCanvasErrorBoundary.js';
import {
  CabinetCanvasErrorBoundary,
  classifyAssetError,
} from '../src/CabinetCanvasErrorBoundary.js';

afterEach(() => cleanup());

function Boom({ message }: { message: string }): null {
  throw new Error(message);
}

describe('CabinetCanvasErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <CabinetCanvasErrorBoundary onError={() => {}}>
        <div data-testid="ok-child">ok</div>
      </CabinetCanvasErrorBoundary>,
    );
    expect(screen.getByTestId('ok-child')).toBeDefined();
  });

  it('on a child throw: renders null and calls onError with a classified GLB url', () => {
    const onError = vi.fn<(r: AssetErrorReason) => void>();
    // React logs the caught error via console.error even when a boundary
    // handles it — silence it so the suite output stays signal-only.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = render(
      <CabinetCanvasErrorBoundary onError={onError}>
        <Boom message="Could not load https://localhost/assets/models/enemies/skeleton.glb: 404" />
      </CabinetCanvasErrorBoundary>,
    );

    // (1) rendered null — no child markup survived.
    expect(container.querySelector('[data-testid]')).toBeNull();

    // (2) onError called with the classified reason.
    expect(onError).toHaveBeenCalledTimes(1);
    const reason = onError.mock.calls[0]?.[0];
    expect(reason?.assetType).toBe('glb');
    expect(reason?.url).toBe('https://localhost/assets/models/enemies/skeleton.glb');
    errSpy.mockRestore();
  });

  it('renders the provided fallback after an error', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <CabinetCanvasErrorBoundary onError={() => {}} fallback={<div data-testid="fb">retry?</div>}>
        <Boom message="fetch failed: /assets/wasm/sql-wasm.wasm" />
      </CabinetCanvasErrorBoundary>,
    );
    expect(screen.getByTestId('fb')).toBeDefined();
    errSpy.mockRestore();
  });

  it('classifies a wasm failure', () => {
    const onError = vi.fn<(r: AssetErrorReason) => void>();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <CabinetCanvasErrorBoundary onError={onError}>
        <Boom message="fetch failed: /assets/wasm/sql-wasm.wasm" />
      </CabinetCanvasErrorBoundary>,
    );
    expect(onError.mock.calls[0]?.[0]?.assetType).toBe('wasm');
    errSpy.mockRestore();
  });

  it('preserves a port in the URL (dev :5191) and still classifies + strips a trailing status', () => {
    const onError = vi.fn<(r: AssetErrorReason) => void>();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <CabinetCanvasErrorBoundary onError={onError}>
        <Boom message="Could not load https://localhost:5191/assets/models/weapons/pistol.glb: 404" />
      </CabinetCanvasErrorBoundary>,
    );
    const reason = onError.mock.calls[0]?.[0];
    expect(reason?.assetType).toBe('glb');
    expect(reason?.url).toBe('https://localhost:5191/assets/models/weapons/pistol.glb');
    errSpy.mockRestore();
  });
});

describe('classifyAssetError', () => {
  it('classifies textures with a query suffix', () => {
    const r = classifyAssetError(
      new Error('load failed https://cdn.local/textures/grass.ktx2?v=3'),
    );
    expect(r).toEqual({ url: 'https://cdn.local/textures/grass.ktx2?v=3', assetType: 'texture' });
  });

  it('classifies fonts', () => {
    const r = classifyAssetError(new Error('failed /fonts/inter.woff2'));
    expect(r.assetType).toBe('font');
  });

  it('falls back to unknown for a message without a URL, including non-Error throws', () => {
    expect(classifyAssetError(new Error('something exploded'))).toEqual({
      url: 'unknown',
      assetType: 'unknown',
    });
    expect(classifyAssetError('raw string throw').assetType).toBe('unknown');
    expect(classifyAssetError(null).assetType).toBe('unknown');
  });
});
