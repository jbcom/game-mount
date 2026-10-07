# game-mount

Mount Pixi, React Three Fiber and Babylon renderers into a parent-sized host with one quality and pixel-ratio policy.

The core has no dependencies. Renderer adapters live at separate entry points; install only the peers your adapter uses. The package ships ESM, CommonJS and TypeScript declarations.

## Install

```sh
npm install game-mount pixi.js
```

Install the published package from npm. Release notes are available in the [changelog](./CHANGELOG.md).

## Quick start

Give the parent a real height. The mount creates a fresh canvas and owns its teardown; your application owns scene content.

```ts
import { QUALITY_TIERS } from "game-mount";
import { mountPixi } from "game-mount/pixi";
import "game-mount/styles.css";

const host = document.createElement("div");
host.className = "game-canvas-host";
const parent = document.createElement("main");
parent.style.height = "480px";
parent.style.display = "flex";
parent.append(host);
document.body.append(parent);

const mount = await mountPixi({
  container: host,
  quality: QUALITY_TIERS.medium,
  onResize: (width, height) => {
    // Reflow your scene after the renderer has resized.
    host.setAttribute("aria-label", `GameCanvas ${width} by ${height}`);
  },
});

// When leaving the game view:
mount.destroy();
```

## Entry points and compatibility

All peers are optional at the package level. Each selected adapter still requires its listed peers.

| Import | Exports | Required peers |
| --- | --- | --- |
| `game-mount` | DPR, quality, device, motion, host, phase, resolution ladder and error classification | None |
| `game-mount/react` | `GameCanvasErrorBoundary` | React 18 or 19 |
| `game-mount/pixi` | `mountPixi`, `applyFilterResolutionFix` | PixiJS 8 |
| `game-mount/pixi/react` | `usePixiMount` | PixiJS 8, React 18 or 19 |
| `game-mount/pixi/pixi-react` | `PixiReactMount` | PixiJS 8, React 18 or 19, @pixi/react 8.0.5+ within 8.x |
| `game-mount/r3f` | `GameCanvas`, `AdaptiveResolution` | React 18 or 19, Three >=0.160, @react-three/fiber 9 |
| `game-mount/babylon` | `babylonEngineOptions`, `SceneRoot`, `useBeforeRender` | React 18 or 19, Babylon core 7–9, Reactylon 3 |
| `game-mount/babylon/havok` | `useHavokPhysics` | React 18 or 19, Babylon core 7–9, Havok 1 |
| `game-mount/styles.css` | `.game-canvas-host` stylesheet | None |

Use mutually compatible renderer and React versions: the peer ranges above describe this package, and upstream peers can impose narrower requirements. Mounting requires a browser; importing modules and using the pure core works in Node. Node.js 22, 24 and 26 are supported (`engines.node: >=22`). Development defaults to Node 26 and pnpm 12; CI verifies every supported line.

The default quality is `high` (DPR cap 2, antialiasing enabled). `medium` caps at 1.5; `low` caps at 1 and disables antialiasing. Babylon detects mobile devices and defaults to `low` there. Reduced-motion detection supplies a preference; your scene decides how to apply it.

The @pixi/react 8.0.5 ESM dependency graph has an upstream extensionless import that plain Node ESM cannot load. Use a browser bundler for that adapter. Three's CommonJS build emits its own deprecation warning; prefer ESM for r3f.

## Documentation

- [Getting started](docs/getting-started.md)
- [API reference](docs/API.md)
- [Architecture](docs/ARCHITECTURE.md) and [decisions](docs/decisions.md)
- [Contributing](CONTRIBUTING.md), [security](SECURITY.md), [changelog](CHANGELOG.md)
- [Documentation site](https://jonbogaty.com/game-mount/)

## License

[MIT](LICENSE), Copyright (c) 2026 Jon Bogaty.
