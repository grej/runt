/**
 * # Media Types for AI-Aware Runtime Agents
 *
 * When your Python code outputs tables, plots, or rich data, it creates multiple
 * representations - HTML for humans, JSON for data, plain text for accessibility.
 * But which format should we send to AI models?
 *
 * This module helps runtime agents convert Jupyter-style rich output into formats
 * that work well with Large Language Models.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { toAIMediaBundle, validateMediaBundle } from "@runt/lib/media";
 *
 * // Raw output from Python execution
 * const rawOutput = {
 *   "text/html": "<table><tr><td>Revenue: $50K</td></tr></table>",
 *   "text/markdown": "| Revenue |\n|$50K|",
 *   "application/json": { revenue: 50000, currency: "USD" }
 * };
 *
 * // Convert for AI consumption (prefers markdown, keeps structured data)
 * const aiBundle = toAIMediaBundle(rawOutput);
 * // Send this to your AI model for better understanding
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
