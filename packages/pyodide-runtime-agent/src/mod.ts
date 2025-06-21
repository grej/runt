// Main exports for @runt/pyodide-runtime-agent
//
// This module exports the enhanced Pyodide-specific runtime agent for building
// Python runtime agents that integrate with the @runt/lib framework
// and use web workers with rich display support and true interrupt support.

export { PyodideRuntimeAgent } from "./pyodide-agent.ts";

// Export cache utilities for advanced package management
export {
  getCacheConfig,
  getCacheDir,
  getEssentialPackages,
  getOnDemandPackages,
  getPreloadPackages,
} from "./cache-utils.ts";

// Re-export useful types from @runt/lib for convenience
export type {
  CancellationHandler,
  ExecutionContext,
  ExecutionHandler,
  ExecutionResult,
  RuntimeAgentEventHandlers,
} from "@runt/lib";
