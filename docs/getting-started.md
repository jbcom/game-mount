---
title: Getting started
description: Install one adapter and give its host a resolved height.
---

Install the published package from npm with the peers needed by your adapter.

## Pick an adapter

```sh
# Imperative Pixi
npm install game-mount pixi.js
# React hook over imperative Pixi
npm install game-mount pixi.js react react-dom
# @pixi/react
npm install game-mount pixi.js @pixi/react react react-dom
# React Three Fiber
npm install game-mount three @react-three/fiber react react-dom
# Babylon with Reactylon
npm install game-mount @babylonjs/core reactylon react react-dom
# Add physics when needed
npm install @babylonjs/havok
```

Choose compatible upstream peer versions; see the [API](./API/) and package manifest. React 19 is appropriate for the r3f 9 examples.

## Imperative Pixi

```ts
import { mountPixi } from "game-mount/pixi";
import "game-mount/styles.css";

const parent = document.createElement("main");
parent.style.cssText = "display:flex;height:480px";
const host = document.createElement("div");
host.className = "game-canvas-host";
parent.append(host);
document.body.append(parent);

const handle = await mountPixi({ container: host });
// Add your stage content to handle.app.stage.
// Call handle.destroy() when the view is removed.
```

Prefer a container to a supplied canvas: every mount then creates a fresh canvas, including React StrictMode remounts. A destroyed canvas must never be reused for another Application.

## React Three Fiber

```tsx
import { QUALITY_TIERS } from "game-mount";
import { AdaptiveResolution, GameCanvas } from "game-mount/r3f";

export function GameView() {
  const quality = QUALITY_TIERS.medium;
  return (
    <main style={{ height: 480, display: "flex" }}>
      <GameCanvas active quality={quality}>
        <AdaptiveResolution maxDpr={quality.maxDpr} />
        <mesh>
          <boxGeometry />
          <meshBasicMaterial color="#64748b" />
        </mesh>
      </GameCanvas>
    </main>
  );
}
```

`active={false}` tears down the canvas. Keep persistent game state outside its subtree. Context restoration remounts scene children, so recreate GPU resources from that state.

## @pixi/react

```tsx
import { gameCanvasHostStyle } from "game-mount";
import { PixiReactMount } from "game-mount/pixi/pixi-react";

export function GameView() {
  return (
    <main style={{ height: 480, display: "flex" }}>
      <div style={gameCanvasHostStyle}>
        <PixiReactMount onReady={(handle) => {
          handle.canvas.setAttribute("aria-label", "GameCanvas");
        }} />
      </div>
    </main>
  );
}
```

Use a browser bundler for this adapter. Change the component's `key` to apply new mount options. `onReady` and `onResize` use the latest callbacks.

## Babylon policy and physics

```ts
import { QUALITY_TIERS } from "game-mount";
import { babylonEngineOptions } from "game-mount/babylon";

const engineOptions = babylonEngineOptions({ quality: QUALITY_TIERS.medium });
// Pass engineOptions to Reactylon's Engine component.
```

Inside a Reactylon scene, `SceneRoot` gates a subtree by phase and `useBeforeRender` supplies a clamped frame delta. `useHavokPhysics` is a separate import from `game-mount/babylon/havok`. Serve `HavokPhysics.wasm` at `/havok/` or provide a trailing-slash base URL. Enable physics on the scene yourself once the returned plugin is ready.

## Errors and motion

Wrap a React canvas subtree in `GameCanvasErrorBoundary` from `game-mount/react`. Supply `onError` and preferably a DOM fallback. Remount the boundary with a new key to retry. Asset classification is best-effort; render messages as text.

Pixi handles expose `reduceMotion`; use it to reduce scene animation. The preference does not automatically stop animations or mute sound.
