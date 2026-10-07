import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';

/**
 * Error boundary around the scene `<Canvas>` — shipped as a SIBLING to
 * `CabinetCanvas` rather than baked in, because GLB/wasm error semantics are
 * app-specific (bone-buster's AssetErrorBoundary, generalized: its
 * app-event-bus dispatch is dropped; the classified reason is handed up via
 * `onError` instead).
 *
 * Why it exists: drei's `useGLTF` / `useTexture` throw on a failed load; the
 * throw suspends, and when the promise REJECTS it propagates up as a render
 * error. Without a boundary React unmounts the whole subtree → a silent
 * blank canvas. This catches it, classifies the failed asset (url + type)
 * and hands the reason up so the app shell can show a DOM-level error modal.
 *
 * It renders `fallback` (default `null` — the Canvas is gone) on error; the
 * visible modal should be a DOM sibling driven by the lifted error state.
 */

export type AssetErrorClass = 'glb' | 'texture' | 'wasm' | 'font' | 'unknown';

export type AssetErrorReason = { url: string; assetType: AssetErrorClass; message: string };

/** Best-effort asset-class + URL extraction from a thrown load error. */
export function classifyAssetError(error: unknown): { url: string; assetType: AssetErrorClass } {
  const message = error instanceof Error ? error.message : String(error);
  // drei/three load errors embed the URL; grab the first http(s) or /-rooted
  // token. Keep `:` in the char class so a port (localhost:5191) survives,
  // then strip a trailing ` : 404` / `:404` status suffix that loaders
  // append — if we banned `:` wholesale the port would truncate the URL and
  // break the extension match.
  const urlMatch = message.match(/(https?:\/\/[^\s)'"]+|\/[\w\-./]+\.\w+)/);
  // Strip a trailing status annotation: ` : 404`, `:404`, or a bare trailing
  // `:` left when the status digits sat after a space (excluded from
  // capture). A real port (`:5191`) is mid-URL (followed by `/…`), so it's
  // never at the END of the token and survives.
  const url = (urlMatch?.[0] ?? 'unknown').replace(/\s*:\s*\d*$/, '');
  const lower = url.toLowerCase();
  // Match the extension allowing a trailing query/fragment (`?v=…`, `#…`).
  const extOf = (re: RegExp) => re.test(lower);
  const assetType: AssetErrorClass = extOf(/\.glb($|[?#])/)
    ? 'glb'
    : extOf(/\.wasm($|[?#])/)
      ? 'wasm'
      : extOf(/\.(png|jpg|jpeg|webp|ktx2?)($|[?#])/)
        ? 'texture'
        : extOf(/\.(woff2?|ttf|otf)($|[?#])/)
          ? 'font'
          : 'unknown';
  return { url, assetType };
}

type Props = {
  children: ReactNode;
  /** Lifted so the app shell can render the DOM-level modal. Required on
   * purpose: without it an asset failure would degrade to a silent blank —
   * exactly the failure mode this boundary exists to surface. */
  onError: (reason: AssetErrorReason) => void;
  /** Rendered in place of the (dead) Canvas subtree after an error.
   * Defaults to `null` — prefer a DOM sibling modal via `onError`. */
  fallback?: ReactNode;
};

type State = { hasError: boolean };

export class CabinetCanvasErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, _info: ErrorInfo): void {
    const { url, assetType } = classifyAssetError(error);
    // React allows throwing ANY value — derive the message safely (an Error
    // gives `.message`; a raw string/number/null is stringified) so this
    // boundary never throws while handling another throw.
    const message = error instanceof Error ? error.message : String(error);
    this.props.onError({ url, assetType, message });
  }

  render(): ReactNode {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
