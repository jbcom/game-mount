# Changelog

## [0.3.0](https://github.com/jbcom/game-mount/compare/v0.2.0...v0.3.0) (2026-11-24)


### Features

* bounded ground camera (game-mount/camera) and r3f GroundCameraRig ([d23ff2f](https://github.com/jbcom/game-mount/commit/d23ff2fb2365322e866b90434cf625f6fcede74c))
* **camera:** add the bounded ground camera as a pure game-mount/camera entry ([0b89518](https://github.com/jbcom/game-mount/commit/0b89518ba429d39a5b1a2b5bad7f0976af7ca8c4))
* **r3f:** add GroundCameraRig to drive the r3f camera from the ground camera ([0cbc324](https://github.com/jbcom/game-mount/commit/0cbc3242f4a92e76f8ef15252017ab7aa929dea5))

## [0.2.0](https://github.com/jbcom/game-mount/compare/v0.1.1...v0.2.0) (2026-11-15)


### Features

* **r3f:** await owned root retirement before scene disposal ([592a322](https://github.com/jbcom/game-mount/commit/592a322e87f13346ce5cc702cfdd7bf15c5a4438))
* **r3f:** await owned root retirement before scene disposal ([fac332b](https://github.com/jbcom/game-mount/commit/fac332bfaeb392e4bccb563e03557807997ef251))


### Bug Fixes

* **r3f:** retire roots when owner initialization throws ([d8be8e3](https://github.com/jbcom/game-mount/commit/d8be8e3eec6234f1b867d49cc90afb49e5aa8d1d))
* **r3f:** start retirement before detaching the canvas ([f83a92d](https://github.com/jbcom/game-mount/commit/f83a92d5675dd28a01bd617caa4ab0f8ad912ac2))

## [0.1.1](https://github.com/jbcom/game-mount/compare/v0.1.0...v0.1.1) (2026-10-07)


### Bug Fixes

* support every maintained Node line (22, 24 and 26) ([71c5e15](https://github.com/jbcom/game-mount/commit/71c5e15c1e4c232e8be9cab748a2d64ca2b0a6a8))
* support maintained Node lines and conform repository gates ([931940b](https://github.com/jbcom/game-mount/commit/931940b216702d369068767b3a9a59ce9be9486e))

## 0.1.0 (unreleased)

Initial unified release candidate:

- Renderer-neutral DPR, quality, motion, host, phase and error policy.
- Isolated Pixi, React, @pixi/react, r3f, Babylon and Havok entry points with optional peers.
- Fresh Pixi canvas ownership, renderer-first resize callbacks and r3f context-restoration remounts.
- Shared adaptive-resolution ladder and retryable Havok loading.
- ESM and CommonJS builds with corresponding TypeScript declarations.
- Unit coverage, real-WebGL Chromium testing and packed-consumer validation.

Release Please will maintain subsequent entries. See the [commit history](https://github.com/jbcom/game-mount/commits/main/) for development history.
