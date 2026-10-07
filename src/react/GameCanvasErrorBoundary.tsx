import { Component, type ErrorInfo, type ReactNode } from "react";
import { type AssetErrorReason, classifyAssetError, errorMessage } from "../core/assetError.js";

export interface GameCanvasErrorBoundaryProps {
  children?: ReactNode;
  /**
   * Receives the classified failure so the app shell can show a DOM-level message. Required: a
   * boundary that swallowed the error silently would recreate the blank canvas it exists to
   * prevent.
   */
  onError: (reason: AssetErrorReason) => void;
  /** Rendered in place of the failed subtree. Defaults to nothing; prefer a DOM sibling. */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * An error boundary for a canvas subtree, for any React renderer.
 *
 * Suspense-based loaders (drei's `useGLTF` and `useTexture`, `@pixi/react` asset hooks) throw a
 * promise while loading; when it rejects, the rejection surfaces as a render error and React
 * unmounts the whole tree above it, leaving a blank canvas with nothing on screen to say why. Wrap
 * the canvas in this boundary: it renders `fallback`, classifies the failure with
 * `classifyAssetError` and hands it to `onError`.
 *
 * It is a sibling of the canvas components rather than built into them because what to show on a
 * failed load is the game's decision.
 */
export class GameCanvasErrorBoundary extends Component<GameCanvasErrorBoundaryProps, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown, _info: ErrorInfo): void {
    // React allows throwing any value, so the message is derived defensively: this boundary must
    // never throw while handling another throw.
    this.props.onError({ ...classifyAssetError(error), message: errorMessage(error) });
  }

  override render(): ReactNode {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
