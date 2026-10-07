import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isMobileDevice,
  mobileEngineOptions,
  mobileHardwareScalingLevel,
} from '../src/mobileEngineOptions';

function mockUserAgent(ua: string) {
  vi.stubGlobal('navigator', { userAgent: ua });
}

function mockDevicePixelRatio(ratio: number) {
  vi.stubGlobal('window', { ...globalThis.window, devicePixelRatio: ratio });
}

describe('isMobileDevice', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('detects iPhone UA as mobile', () => {
    mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    expect(isMobileDevice()).toBe(true);
  });

  it('detects Android UA as mobile', () => {
    mockUserAgent('Mozilla/5.0 (Linux; Android 14)');
    expect(isMobileDevice()).toBe(true);
  });

  it('does not flag desktop Chrome UA as mobile', () => {
    mockUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120');
    expect(isMobileDevice()).toBe(false);
  });
});

describe('mobileEngineOptions', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('prefers high-performance + stencil/AA on desktop', () => {
    mockUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120');
    mockDevicePixelRatio(1);
    const opts = mobileEngineOptions();
    expect(opts.powerPreference).toBe('high-performance');
    expect(opts.stencil).toBe(true);
    expect(opts.antialias).toBe(true);
    expect(opts.adaptToDeviceRatio).toBe(true);
  });

  it('prefers low-power + disables stencil on mobile', () => {
    mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    mockDevicePixelRatio(1);
    const opts = mobileEngineOptions();
    expect(opts.powerPreference).toBe('low-power');
    expect(opts.stencil).toBe(false);
    expect(opts.adaptToDeviceRatio).toBe(false);
  });

  it('disables antialias on high-DPI mobile', () => {
    mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    mockDevicePixelRatio(3);
    const opts = mobileEngineOptions();
    expect(opts.antialias).toBe(false);
  });

  it('lets overrides win over the mobile-aware defaults', () => {
    mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    mockDevicePixelRatio(1);
    const opts = mobileEngineOptions({ preserveDrawingBuffer: true, stencil: true });
    expect(opts.preserveDrawingBuffer).toBe(true);
    expect(opts.stencil).toBe(true);
  });
});

describe('mobileHardwareScalingLevel', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns 1 (no scaling) on desktop', () => {
    mockUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120');
    mockDevicePixelRatio(3);
    expect(mobileHardwareScalingLevel()).toBe(1);
  });

  it('returns 1 on mobile with low DPR', () => {
    mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    mockDevicePixelRatio(2);
    expect(mobileHardwareScalingLevel()).toBe(1);
  });

  it('scales down on mobile with high DPR', () => {
    mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    mockDevicePixelRatio(3);
    expect(mobileHardwareScalingLevel()).toBe(1.5);
  });
});
