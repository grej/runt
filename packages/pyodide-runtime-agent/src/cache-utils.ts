/**
 * Cache utilities for Pyodide package management
 *
 * This module provides utilities for managing Pyodide package caching
 * and defines essential packages for a good development experience.
 */

/**
 * Get essential packages for Pyodide kernel initialization
 * These are loaded by default to provide a good development experience
 */
export function getEssentialPackages(): string[] {
  return [
    "ipython",
    "matplotlib",
    "numpy",
    "pandas",
    "polars",
    "duckdb",
    "pyarrow",
    "requests",
    "micropip",
    "pyodide-http",
    "scipy",
    "sympy",
    "bokeh",
    "scikit-learn",
    "altair",
    "geopandas",
    "rich",
    "networkx",
    "beautifulsoup4",
    "lxml",
    "pillow",
    "statsmodels",
  ];
}

/**
 * Get cache directory path for Pyodide packages
 */
export function getCacheDir(): string {
  // Try to get home directory, fallback to local directory
  const homeDir = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || ".";
  return `${homeDir}/.runt/pyodide-cache`;
}

/**
 * Get cache configuration for Pyodide loadPyodide() options
 */
export function getCacheConfig(): { packageCacheDir: string } {
  return {
    packageCacheDir: getCacheDir(),
  };
}

/**
 * Get packages that should be pre-loaded for performance
 * These are the most commonly used packages that significantly improve startup time
 */
export function getPreloadPackages(): string[] {
  return [
    "ipython",
    "numpy",
    "pandas",
    "matplotlib",
    "requests",
    "micropip",
    "pyodide-http",
    "rich",
  ];
}

/**
 * Get packages that can be loaded on-demand
 * These are useful but not essential for basic functionality
 */
export function getOnDemandPackages(): string[] {
  return [
    "scipy",
    "polars",
    "duckdb",
    "pyarrow",
    "bokeh",
    "scikit-learn",
    "altair",
    "geopandas",
    "networkx",
    "beautifulsoup4",
    "lxml",
    "pillow",
    "statsmodels",
    "sympy",
  ];
}
