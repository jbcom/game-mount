import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import { dprRange } from "../core/dpr.js";
import type { RenderQuality } from "../core/quality.js";

/** Rendering defaults shared by the declarative and explicitly owned canvas roots. */
export function renderPolicy(
  quality: RenderQuality,
  preserveDrawingBuffer: boolean,
  toneMappingExposure: number
) {
  return {
    dpr: [...dprRange(quality.maxDpr)] as [number, number],
    gl: {
      antialias: quality.antialias,
      powerPreference: "high-performance" as const,
      toneMapping: ACESFilmicToneMapping,
      toneMappingExposure,
      outputColorSpace: SRGBColorSpace,
      preserveDrawingBuffer,
    },
  };
}
