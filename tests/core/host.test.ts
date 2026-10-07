/**
 * The CSS contract, pinned in BOTH shapes it ships in (inline JS object +
 * stylesheet), so neither can drift from the other or lose the load-bearing
 * `min-height: 0` line — the #1 real-world footgun the fleet audit surfaced
 * (a flex item's implicit `min-height: auto` lets a `height: 100%` child
 * refuse to shrink, silently breaking HUD-docked layouts).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CABINET_CANVAS_HOST_CLASS, cabinetCanvasHostStyle } from '../src/hostStyle.js';

const cssPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/styles.css');

describe('cabinet-canvas-host contract', () => {
  it('inline style object carries the full parent-fill contract', () => {
    expect(cabinetCanvasHostStyle).toEqual({
      position: 'relative',
      flex: 1,
      display: 'flex',
      width: '100%',
      height: '100%',
      minHeight: 0,
    });
  });

  it('stylesheet matches the inline object — min-height: 0 present on the host class', () => {
    const css = readFileSync(cssPath, 'utf8');
    const hostRule = css.match(/\.cabinet-canvas-host\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(hostRule).toContain('min-height: 0');
    expect(hostRule).toContain('flex: 1');
    expect(hostRule).toContain('width: 100%');
    expect(hostRule).toContain('height: 100%');
    expect(hostRule).toContain('display: flex');
    expect(hostRule).toContain('position: relative');
  });

  it('stylesheet styles the child canvas as a display:block full-bleed element', () => {
    const css = readFileSync(cssPath, 'utf8');
    const canvasRule = css.match(/\.cabinet-canvas-host canvas\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(canvasRule).toContain('display: block');
    expect(canvasRule).toContain('width: 100%');
    expect(canvasRule).toContain('height: 100%');
  });

  it('class-name constant matches the stylesheet selector', () => {
    expect(CABINET_CANVAS_HOST_CLASS).toBe('cabinet-canvas-host');
  });
});
