---
title: Introduction
description: One rendering policy with isolated adapters for your chosen renderer.
---

game-mount mounts a renderer into a parent-sized host and applies a shared quality and pixel-ratio policy. It keeps lifecycle ownership explicit: imperative Pixi owns its Application, @pixi/react owns its Application, and r3f and Reactylon own their React scene trees.

The core has no dependencies. Choose an adapter entry point and install only its peers. Quality tiers share the same `maxDpr` and `antialias` vocabulary across renderers. The package also supplies reduced-motion detection, phase matching, an adaptive-resolution ladder and asset-error classification.

Your application owns gameplay, assets, audio, safe-area layout and persistence. A host must have a resolved height; the mount does not size a game from the window.

Start with [Getting started](./getting-started/) and the [API reference](./API/). Read [Architecture](./ARCHITECTURE/) and [Decisions](./decisions/) before changing lifecycle behavior.
