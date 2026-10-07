/**
 * Classify an asset-load failure from whatever a loader threw: which URL failed and what kind of
 * asset it was. Loaders (three's, Babylon's, Pixi's `Assets`) embed the URL in the error message in
 * different shapes; this pulls out the first absolute or root-relative URL and names its type from
 * the extension, so a game can show "the level textures failed to load" instead of a blank canvas.
 */

export type AssetErrorClass = "model" | "texture" | "wasm" | "font" | "audio" | "unknown";

export type AssetErrorReason = Readonly<{
  url: string;
  assetType: AssetErrorClass;
  message: string;
}>;

const EXTENSION_CLASSES: ReadonlyArray<readonly [RegExp, AssetErrorClass]> = [
  [/\.(glb|gltf|obj|fbx|babylon)($|[?#])/, "model"],
  [/\.wasm($|[?#])/, "wasm"],
  [/\.(png|jpe?g|webp|avif|ktx2?|basis|hdr|exr)($|[?#])/, "texture"],
  [/\.(woff2?|ttf|otf)($|[?#])/, "font"],
  [/\.(mp3|ogg|wav|m4a|aac|flac)($|[?#])/, "audio"],
];

/** The message of anything thrown: `Error.message`, or the value as a string. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Best-effort URL and asset class of a thrown load error; `"unknown"` for either when absent. */
export function classifyAssetError(error: unknown): { url: string; assetType: AssetErrorClass } {
  const message = errorMessage(error);
  // `:` stays in the character class so a port (localhost:5173) survives; a trailing status
  // annotation (` : 404`, `:404`, or a bare `:`) is stripped afterwards. A port is mid-URL, never
  // at the end of the token, so it is never mistaken for one.
  const match = message.match(/(https?:\/\/[^\s)'"]+|\/[\w\-./]+\.\w+)/);
  const url = (match?.[0] ?? "unknown").replace(/\s*:\s*\d*$/, "");
  const lower = url.toLowerCase();
  const assetType = EXTENSION_CLASSES.find(([pattern]) => pattern.test(lower))?.[1] ?? "unknown";
  return { url, assetType };
}
