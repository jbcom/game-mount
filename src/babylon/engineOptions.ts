import type { EngineOptions } from '@babylonjs/core/Engines/thinEngine';

/**
 * Detects a mobile UA. Kept as a small standalone export so callers can
 * branch their own logic on it without re-implementing the sniff.
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

/**
 * Mobile-aware Babylon `EngineOptions`, folding in the tuning duplicated
 * across the fleet: disable stencil/AA and prefer low-power on mobile
 * (stellar-descent), and cap the hardware scaling level on high-DPI
 * mobile screens so the GPU isn't asked to render more pixels than the
 * panel needs (also stellar-descent, applied by the caller via
 * `hardwareScalingLevel` since Babylon only exposes that as a post-init
 * `engine.setHardwareScalingLevel()` call, not a constructor option).
 *
 * `overrides` is spread last, so any field can still be escape-hatched
 * per-game (e.g. martian-trail's `preserveDrawingBuffer: true`, needed
 * for screenshot capture, which the mobile-perf default disables).
 */
export function mobileEngineOptions(overrides?: Partial<EngineOptions>): EngineOptions {
  const mobile = isMobileDevice();
  const pixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  const base: EngineOptions = {
    preserveDrawingBuffer: false,
    stencil: !mobile,
    antialias: !mobile || pixelRatio < 2,
    powerPreference: mobile ? 'low-power' : 'high-performance',
    adaptToDeviceRatio: !mobile,
  };

  return { ...base, ...overrides };
}

/**
 * The hardware-scaling-level companion to `mobileEngineOptions` — call
 * once after `new Engine(...)` on mobile+high-DPI to cap GPU resolution.
 * Returns the scaling level applied (1 = no scaling / not applied).
 */
export function mobileHardwareScalingLevel(): number {
  if (typeof window === 'undefined') return 1;
  const mobile = isMobileDevice();
  const pixelRatio = window.devicePixelRatio || 1;
  if (mobile && pixelRatio > 2) {
    return pixelRatio / 2;
  }
  return 1;
}
