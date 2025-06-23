/**
 * Media Module - Jupyter-compatible Rich Content System
 *
 * This module provides a comprehensive system for handling rich media content
 * in Jupyter-compatible environments. It includes type definitions, utilities,
 * and validation functions for working with MIME bundles.
 *
 * @example
 * ```typescript
 * import { MediaBundle, findRichestMediaType, ensureTextPlainFallback } from "@runt/lib/media";
 *
 * const bundle: MediaBundle = {
 *   "text/plain": "Hello, world!",
 *   "text/html": "<h1>Hello, world!</h1>",
 *   "application/json": { message: "Hello, world!" }
 * };
 *
 * const richest = findRichestMediaType(bundle); // "text/html"
 * const withFallback = ensureTextPlainFallback(bundle);
 * ```
 */

// Core types and constants
export type {
  ApplicationMimeType,
  ImageMimeType,
  JupyterMimeType,
  KnownMimeType,
  MediaBundle,
  TextMimeType,
} from "./types.ts";

export {
  APPLICATION_MIME_TYPES,
  IMAGE_MIME_TYPES,
  JUPYTER_MIME_TYPES,
  KNOWN_MIME_TYPES,
  TEXT_MIME_TYPES,
} from "./types.ts";

// Type guards
export {
  isApplicationMimeType,
  isImageMimeType,
  isJsonMimeType,
  isJupyterMimeType,
  isKnownMimeType,
  isTextBasedMimeType,
  isTextMimeType,
} from "./types.ts";

// Utility functions
export {
  ensureTextPlainFallback,
  toAIMediaBundle,
  validateMediaBundle,
} from "./types.ts";
