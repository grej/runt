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
    "pyodide-http",
    "scipy", // Scientific computing
    "sympy", // Symbolic mathematics
    "bokeh", // Interactive visualization
    "scikit-learn", // Machine learning
    "altair", // Statistical visualization
    "geopandas", // Geospatial data analysis
    "rich", // Beautiful terminal output with colors
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
    "ipython", // Core interactive Python
    "numpy", // Fundamental arrays and math
    "pandas", // Data analysis
    "matplotlib", // Plotting
    "requests", // HTTP requests
    "micropip", // Package management
    "pyodide-http", // HTTP support
    "rich", // Terminal formatting
  ];
}

/**
 * Get packages that can be loaded on-demand
 * These are useful but not essential for basic functionality
 */
export function getOnDemandPackages(): string[] {
  return [
    "scipy", // Scientific computing (larger package)
    "polars", // Fast DataFrames
    "duckdb", // SQL analytics
    "pyarrow", // Arrow format
    "bokeh", // Interactive visualization
    "scikit-learn", // Machine learning
    "altair", // Statistical visualization
    "geopandas", // Geospatial analysis
    "networkx", // Graph analysis
    "beautifulsoup4", // Web scraping
    "lxml", // XML processing
    "pillow", // Image processing
    "statsmodels", // Statistical modeling
    "sympy", // Symbolic mathematics
  ];
}

/**
 * Get packages that are commonly used together
 * Useful for warming up cache or bulk loading
 */
export function getPackageGroups(): Record<string, string[]> {
  return {
    "data-science": ["numpy", "pandas", "matplotlib", "scipy", "scikit-learn"],
    "web-scraping": ["requests", "beautifulsoup4", "lxml", "pyodide-http"],
    "visualization": ["matplotlib", "bokeh", "altair"],
    "dataframes": ["pandas", "polars", "pyarrow", "duckdb"],
    "geospatial": ["geopandas", "matplotlib"],
    "machine-learning": ["numpy", "pandas", "scikit-learn", "scipy"],
    "symbolic": ["sympy", "numpy", "matplotlib"],
    "network": ["networkx", "matplotlib"],
  };
}
