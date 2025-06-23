/**
 * # Media Types for AI-Aware Notebooks
 *
 * When Python objects are displayed in Jupyter notebooks, they can provide multiple
 * representations - HTML for rich display, plain text for accessibility, JSON for
 * data interchange. But what format works best for AI?
 *
 * This module helps convert rich Jupyter output into formats that work well with
 * Large Language Models while preserving the flexibility to extend with custom types.
 *
 * ## Example: Converting Rich Output for AI
 *
 * ```typescript
 * const richOutput = {
 *   "text/html": "<table><tr><td>Data</td></tr></table>",
 *   "text/markdown": "| Data |\n|------|",
 *   "application/json": { rows: [{ data: "Data" }] },
 *   "image/png": "base64-encoded-chart"
 * };
 *
 * // Convert to AI-friendly formats
 * const aiOutput = toAIMediaBundle(richOutput);
 * // Result: markdown (better for LLMs than HTML), JSON, and images
 * // { "text/markdown": "| Data |\n|------|", "application/json": {...}, "image/png": "..." }
 * ```
 *
 * ## Custom Media Types
 *
 * Any `application/*+json` media type is automatically recognized:
 *
 * ```typescript
 * isJsonMimeType("application/vnd.anode.aitool+json") // true
 * isJsonMimeType("application/vnd.plotly.v1+json")    // true
 * ```
 */

/**
 * Core text-based media types
 */
export const TEXT_MIME_TYPES = [
  "text/plain",
  "text/html",
  "text/markdown",
  "text/latex",
] as const;

/**
 * Application media types
 */
export const APPLICATION_MIME_TYPES = [
  "application/json",
  "application/javascript",
] as const;

/**
 * Image media types (base64 encoded content)
 */
export const IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "image/gif",
] as const;

/**
 * Jupyter-specific vendor media types
 */
export const JUPYTER_MIME_TYPES = [
  "application/vnd.jupyter.widget-state+json",
  "application/vnd.jupyter.widget-view+json",
  "application/vnd.plotly.v1+json",
  "application/vnd.dataresource+json",
  "application/vnd.vegalite.v2+json",
  "application/vnd.vegalite.v3+json",
  "application/vnd.vegalite.v4+json",
  "application/vnd.vegalite.v5+json",
  "application/vnd.vegalite.v6+json",
  "application/vnd.vega.v3+json",
  "application/vnd.vega.v4+json",
  "application/vnd.vega.v5+json",
  "application/geo+json",
  "application/vdom.v1+json",
] as const;

/**
 * All known/standard media types
 */
export const KNOWN_MIME_TYPES = [
  ...TEXT_MIME_TYPES,
  ...APPLICATION_MIME_TYPES,
  ...IMAGE_MIME_TYPES,
  ...JUPYTER_MIME_TYPES,
] as const;

export type TextMimeType = typeof TEXT_MIME_TYPES[number];
export type ApplicationMimeType = typeof APPLICATION_MIME_TYPES[number];
export type ImageMimeType = typeof IMAGE_MIME_TYPES[number];
export type JupyterMimeType = typeof JUPYTER_MIME_TYPES[number];
export type KnownMimeType = typeof KNOWN_MIME_TYPES[number];

/**
 * A media bundle represents rich content that can be displayed in multiple formats.
 * Keys are MIME types, values are the content in that format.
 */
export interface MediaBundle {
  [mimeType: string]: unknown;
}

/**
 * Type guard to check if a MIME type is a known text format
 */
export function isTextMimeType(mimeType: string): mimeType is TextMimeType {
  return (TEXT_MIME_TYPES as readonly string[]).includes(mimeType);
}

/**
 * Type guard to check if a MIME type is a known application format
 */
export function isApplicationMimeType(
  mimeType: string,
): mimeType is ApplicationMimeType {
  return (APPLICATION_MIME_TYPES as readonly string[]).includes(mimeType);
}

/**
 * Type guard to check if a MIME type is a known image format
 */
export function isImageMimeType(mimeType: string): mimeType is ImageMimeType {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);
}

/**
 * Type guard to check if a MIME type is a Jupyter vendor format
 */
export function isJupyterMimeType(
  mimeType: string,
): mimeType is JupyterMimeType {
  return (JUPYTER_MIME_TYPES as readonly string[]).includes(mimeType);
}

/**
 * Type guard to check if a MIME type is any known format
 */
export function isKnownMimeType(mimeType: string): mimeType is KnownMimeType {
  return (KNOWN_MIME_TYPES as readonly string[]).includes(mimeType);
}

/**
 * Check if a MIME type is a JSON-based format (ends with +json)
 * This includes both known types and custom extensions
 */
export function isJsonMimeType(mimeType: string): boolean {
  return mimeType.endsWith("+json") || mimeType === "application/json";
}

/**
 * Check if a MIME type appears to be text-based and should be treated as a string
 */
export function isTextBasedMimeType(mimeType: string): boolean {
  return (
    mimeType.startsWith("text/") ||
    mimeType === "application/javascript" ||
    mimeType === "image/svg+xml"
  );
}

/**
 * Convert rich Jupyter output to AI-friendly formats
 *
 * AI models work better with certain formats:
 * - Markdown is more compact and structured than HTML
 * - JSON preserves data structure for reasoning
 * - Images work with vision-capable models
 * - Plain text provides universal fallback
 *
 * @example
 * ```typescript
 * const bundle = {
 *   "text/html": "<h1>Sales Report</h1><p>Revenue: $10,000</p>",
 *   "text/markdown": "# Sales Report\n\nRevenue: $10,000",
 *   "application/json": { revenue: 10000, currency: "USD" }
 * };
 *
 * const aiBundle = toAIMediaBundle(bundle);
 * // Prefers markdown over HTML, keeps JSON structure
 * // { "text/markdown": "# Sales Report\n\nRevenue: $10,000", "application/json": {...} }
 * ```
 */
export function toAIMediaBundle(bundle: MediaBundle): MediaBundle {
  const result: MediaBundle = {};

  // Always include text/plain if available
  if (bundle["text/plain"]) {
    result["text/plain"] = bundle["text/plain"];
  }

  // Prefer markdown over HTML for AI
  if (bundle["text/markdown"]) {
    result["text/markdown"] = bundle["text/markdown"];
  } else if (bundle["text/html"] && typeof bundle["text/html"] === "string") {
    // Convert HTML to markdown-ish plain text for AI
    const plainFromHtml = bundle["text/html"].replace(/<[^>]*>/g, "");
    if (!result["text/plain"]) {
      result["text/plain"] = plainFromHtml;
    }
  }

  // Include JSON for structured data
  if (bundle["application/json"]) {
    result["application/json"] = bundle["application/json"];
  }

  // Include images that some AI providers support
  for (const imageType of IMAGE_MIME_TYPES) {
    if (bundle[imageType]) {
      result[imageType] = bundle[imageType];
    }
  }

  return result;
}

/**
 * Every media bundle should have text/plain for maximum compatibility
 *
 * Some AI providers only support text, and text/plain ensures your output
 * is never completely invisible to an AI system.
 *
 * @example
 * ```typescript
 * const bundle = { "text/html": "<b>Important data</b>" };
 * const withFallback = ensureTextPlainFallback(bundle);
 * // { "text/html": "<b>Important data</b>", "text/plain": "Important data" }
 * ```
 */
export function ensureTextPlainFallback(bundle: MediaBundle): MediaBundle {
  if (bundle["text/plain"]) {
    return bundle;
  }

  const result = { ...bundle };

  // Try to generate text/plain from other formats
  if (typeof result["text/html"] === "string") {
    // Strip HTML tags for plain text
    result["text/plain"] = result["text/html"].replace(/<[^>]*>/g, "");
  } else if (typeof result["text/markdown"] === "string") {
    // Markdown is readable as plain text
    result["text/plain"] = result["text/markdown"];
  } else {
    // Use first available string content
    const firstStringValue = Object.values(result).find(
      (value): value is string => typeof value === "string",
    );
    if (firstStringValue) {
      result["text/plain"] = firstStringValue;
    } else {
      // Last resort: JSON stringify first available content
      const firstEntry = Object.entries(result)[0];
      if (firstEntry && firstEntry[1] != null) {
        try {
          result["text/plain"] = JSON.stringify(firstEntry[1], null, 2);
        } catch {
          result["text/plain"] = String(firstEntry[1]);
        }
      } else {
        result["text/plain"] = "";
      }
    }
  }

  return result;
}

/**
 * Clean up media bundles to ensure consistent types
 *
 * Raw output from Python can have inconsistent types - JSON as strings,
 * numbers as strings, etc. This normalizes everything.
 *
 * @example
 * ```typescript
 * const rawBundle = {
 *   "application/json": '{"value": 42}',  // JSON as string
 *   "text/plain": 123,                    // Number as text
 *   "text/html": null                     // Invalid value
 * };
 *
 * const clean = validateMediaBundle(rawBundle);
 * // { "application/json": {value: 42}, "text/plain": "123" }
 * // (null values removed, types corrected)
 * ```
 */
export function validateMediaBundle(bundle: MediaBundle): MediaBundle {
  const result: MediaBundle = {};

  for (const [mimeType, value] of Object.entries(bundle)) {
    if (value == null) continue;

    if (isTextBasedMimeType(mimeType)) {
      // Text-based types should be strings
      result[mimeType] = String(value);
    } else if (isJsonMimeType(mimeType)) {
      // JSON types should be objects or properly formatted JSON strings
      if (typeof value === "object") {
        result[mimeType] = value;
      } else if (typeof value === "string") {
        try {
          result[mimeType] = JSON.parse(value);
        } catch {
          result[mimeType] = value; // Keep as string if not valid JSON
        }
      } else {
        result[mimeType] = value;
      }
    } else {
      // Keep other types as-is
      result[mimeType] = value;
    }
  }

  return result;
}
