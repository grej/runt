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
    "polars", // Fast DataFrames
    "duckdb", // SQL analytics
    "pyarrow", // Arrow format for polars/duckdb interop
    "requests",
    "micropip",
    "pyodide-http", // Enable HTTPS support for urllib (needed for pandas.read_csv with URLs)
    "scipy", // Scientific computing
    "sympy", // Symbolic mathematics
    "bokeh", // Interactive visualization
    "scikit-learn", // Machine learning
    "altair", // Statistical visualization
    "geopandas", // Geospatial data analysis
    "rich", // Beautiful terminal output with colors
    "networkx", // Network analysis
    "beautifulsoup4", // Web scraping
    "lxml", // XML/HTML parsing
    "pillow", // Image processing
    "statsmodels", // Statistical modeling
  ];
}

/**
 * Get cache directory path for Pyodide packages
 */
export function getCacheDir(): string {
  // In Deno/web worker context, we'll use a simpler cache path
  return "./.runt/pyodide-cache";
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
    "numpy",
    "pandas",
    "matplotlib",
    "scipy",
    "requests",
    "micropip",
    "pyodide-http", // Critical for pandas URL loading
    "ipython",
    "rich",
  ];
}

/**
 * Get packages that can be loaded on-demand
 * These are useful but not essential for basic functionality
 */
export function getOnDemandPackages(): string[] {
  return [
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
