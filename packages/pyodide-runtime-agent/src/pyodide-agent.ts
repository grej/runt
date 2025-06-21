// Enhanced Pyodide Runtime Agent
//
// This module provides a Pyodide-based Python runtime agent with advanced
// IPython integration, rich display support, and true interruption support
// via Pyodide's built-in interrupt system.

import { createRuntimeConfig, RuntimeAgent } from "@runt/lib";
import type { ExecutionContext } from "@runt/lib";
import { createLogger } from "@runt/lib";
import { getEssentialPackages } from "./cache-utils.ts";
import type { Store } from "npm:@livestore/livestore";
import type { schema } from "@runt/schema";

/**
 * Configuration options for PyodideRuntimeAgent
 */
export interface PyodideAgentOptions {
  /** Custom package list to load (overrides default essential packages) */
  packages?: string[];
}

/**
 * Enhanced Pyodide-based Python runtime agent using web workers
 *
 * Extends the generic RuntimeAgent with advanced Python execution capabilities
 * including IPython integration, rich display support, matplotlib SVG output,
 * pandas HTML tables, and enhanced error formatting.
 */
export class PyodideRuntimeAgent {
  private agent: RuntimeAgent;
  private worker: Worker | null = null;
  private interruptBuffer?: SharedArrayBuffer;
  private isInitialized = false;
  private currentExecutionContext: ExecutionContext | null = null;
  private pendingExecutions = new Map<string, {
    resolve: (result: unknown) => void;
    reject: (error: unknown) => void;
  }>();
  private logger = createLogger("pyodide-agent");
  public config: ReturnType<typeof createRuntimeConfig>;
  private options: PyodideAgentOptions;

  constructor(args: string[] = Deno.args, options: PyodideAgentOptions = {}) {
    try {
      this.config = createRuntimeConfig(args, {
        kernelType: "python3-pyodide",
        capabilities: {
          canExecuteCode: true,
          canExecuteSql: false,
          canExecuteAi: false,
        },
      });
    } catch (error) {
      // Configuration errors should still go to console for CLI usability
      console.error("❌ Configuration Error:");
      console.error(error instanceof Error ? error.message : String(error));
      console.error("\nExample usage:");
      console.error(
        "  deno run --allow-all --env-file=.env pyodide-agent.ts --notebook my-notebook --auth-token your-token",
      );
      console.error("\nOr set environment variables in .env:");
      console.error("  NOTEBOOK_ID=my-notebook");
      console.error("  AUTH_TOKEN=your-token");
      Deno.exit(1);
    }

    this.agent = new RuntimeAgent(this.config, this.config.capabilities, {
      onStartup: this.initializePyodideWorker.bind(this),
      onShutdown: this.cleanupWorker.bind(this),
    });

    this.options = options;
    this.agent.onExecution(this.executePython.bind(this));
    this.agent.onCancellation(this.handleCancellation.bind(this));
  }

  /**
   * Start the Pyodide runtime agent
   */
  async start(): Promise<void> {
    this.logger.info("Starting Pyodide Python runtime agent");
    await this.agent.start();
  }

  /**
   * Shutdown the runtime agent
   */
  async shutdown(): Promise<void> {
    await this.agent.shutdown();
  }

  /**
   * Keep the agent alive
   */
  async keepAlive(): Promise<void> {
    await this.agent.keepAlive();
  }

  /**
   * Get the LiveStore instance (for testing)
   */
  get store(): Store<typeof schema> {
    return this.agent.liveStore;
  }

  /**
   * Initialize enhanced Pyodide worker with rich display support
   */
  private async initializePyodideWorker(): Promise<void> {
    try {
      this.logger.info("Initializing enhanced Pyodide worker");

      // Determine packages to load based on options
      const packagesToLoad = this.options.packages || getEssentialPackages();

      this.logger.info("Loading packages", {
        packageCount: packagesToLoad.length,
        packages: packagesToLoad,
      });

      // Create SharedArrayBuffer for interrupt signaling
      this.interruptBuffer = new SharedArrayBuffer(4);
      const interruptView = new Int32Array(this.interruptBuffer);
      interruptView[0] = 0; // Initialize to no interrupt

      // Create worker with enhanced Pyodide
      this.worker = new Worker(
        new URL("./pyodide-worker.ts", import.meta.url),
        { type: "module" },
      );

      // Set up worker message handling
      this.worker.addEventListener(
        "message",
        this.handleWorkerMessage.bind(this),
      );
      this.worker.addEventListener("error", (error) => {
        this.logger.error("Worker error", error);
      });

      // Initialize enhanced Pyodide in worker
      await this.sendWorkerMessage("init", {
        interruptBuffer: this.interruptBuffer,
        packages: packagesToLoad,
      });

      this.isInitialized = true;
      this.logger.info("Enhanced Pyodide worker initialized successfully");
    } catch (error) {
      this.logger.error("Failed to initialize enhanced Pyodide worker", error);
      throw error;
    }
  }

  /**
   * Send message to worker and wait for response
   */
  private sendWorkerMessage(type: string, data: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error("Worker not initialized"));
        return;
      }

      const messageId = crypto.randomUUID();
      this.pendingExecutions.set(messageId, { resolve, reject });

      this.worker.postMessage({
        id: messageId,
        type,
        data,
      });
    });
  }

  /**
   * Handle messages from worker
   */
  private handleWorkerMessage(event: MessageEvent): void {
    const { id, type, data, error } = event.data;

    if (type === "log") {
      this.logger.debug("Worker log", { message: data });
      return;
    }

    if (type === "stream_output") {
      // Handle real-time streaming outputs with enhanced formatting
      if (this.currentExecutionContext) {
        switch (data.type) {
          case "stdout":
            this.currentExecutionContext.stdout(data.text);
            break;
          case "stderr":
            this.currentExecutionContext.stderr(data.text);
            break;
          case "result":
          case "execute_result":
            if (data.data !== null && data.data !== undefined) {
              this.currentExecutionContext.result(
                this.formatRichOutput(data.data, data.metadata),
              );
            }
            break;
          case "display_data":
            if (data.data !== null && data.data !== undefined) {
              this.currentExecutionContext.display(
                this.formatRichOutput(data.data, data.metadata),
                data.metadata || {},
              );
            }
            break;
          case "update_display_data":
            if (data.data != null) {
              // Handle display updates - could extend ExecutionContext to support this
              this.currentExecutionContext.display(
                this.formatRichOutput(data.data, data.metadata),
                data.metadata
                  ? { ...data.metadata, update: true }
                  : { update: true },
              );
            }
            break;
          case "error":
            this.currentExecutionContext.error(
              data.data.ename || "PythonError",
              data.data.evalue || "Unknown error",
              data.data.traceback || [String(data.data)],
            );
            break;
        }
      }
      return;
    }

    const pending = this.pendingExecutions.get(id);
    if (!pending) return;

    this.pendingExecutions.delete(id);

    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(data);
    }
  }

  /**
   * Execute Python code using Pyodide worker
   */
  private async executePython(context: ExecutionContext) {
    const {
      cell,
      stderr,
      result,
      error,
      abortSignal,
    } = context;
    const code = cell.source?.trim() || "";

    if (!this.isInitialized || !this.worker) {
      throw new Error("Pyodide worker not initialized");
    }

    if (!code) {
      return { success: true };
    }

    try {
      // Set up abort handling
      let isAborted = false;
      const abortHandler = () => {
        isAborted = true;
        if (this.interruptBuffer) {
          const view = new Int32Array(this.interruptBuffer);
          view[0] = 2; // SIGINT
        }
      };

      if (abortSignal.aborted) {
        // TODO: Use a special display for this
        stderr("🛑 Execution was already cancelled\n");
        return { success: false, error: "Execution cancelled" };
      }

      abortSignal.addEventListener("abort", abortHandler);

      try {
        // Set current execution context for real-time streaming
        this.currentExecutionContext = context;

        // Execute Python code in worker - outputs stream in real-time
        const executionResult = await this.sendWorkerMessage("execute", {
          code,
        }) as { result: unknown };

        if (isAborted) {
          stderr("🛑 Python execution was cancelled\n");
          return { success: false, error: "Execution cancelled" };
        }

        // Note: Most outputs are already streamed via handleWorkerMessage
        // Only handle final result if it wasn't already streamed
        if (
          executionResult.result !== null &&
          executionResult.result !== undefined
        ) {
          result(this.formatRichOutput(executionResult.result));
        }

        return { success: true };
      } finally {
        abortSignal.removeEventListener("abort", abortHandler);
        // Clear interrupt signal
        if (this.interruptBuffer) {
          const view = new Int32Array(this.interruptBuffer);
          view[0] = 0;
        }
        // Clear execution context
        this.currentExecutionContext = null;
      }
    } catch (err) {
      if (
        abortSignal.aborted ||
        (err instanceof Error && err.message.includes("cancelled"))
      ) {
        stderr("🛑 Python execution was cancelled\n");
        return { success: false, error: "Execution cancelled" };
      }

      // Handle Python errors
      if (err instanceof Error) {
        const errorLines = err.message.split("\n");
        const errorName = errorLines[0] || "PythonError";
        const errorValue = errorLines[1] || err.message;
        const traceback = errorLines.length > 2 ? errorLines : [err.message];

        error(errorName, errorValue, traceback);
        return { success: false, error: errorValue };
      }

      throw err;
    }
  }

  /**
   * Format rich output with proper MIME type handling
   */
  private formatRichOutput(
    result: unknown,
    metadata?: Record<string, unknown>,
  ): Record<string, string> {
    if (result === null || result === undefined) {
      return { "text/plain": "" };
    }

    // If result is already a formatted output dict with MIME types
    if (
      typeof result === "object" &&
      result !== null &&
      ("text/plain" in result ||
        "text/html" in result ||
        "image/svg+xml" in result ||
        "application/json" in result)
    ) {
      return result as Record<string, string>;
    }

    // Handle rich data types
    if (typeof result === "object" && result !== null) {
      // Check if it's a rich data structure with data and metadata
      if ("data" in result && typeof result.data === "object") {
        return this.formatRichOutput(result.data, metadata);
      }

      // Format as JSON with pretty printing
      try {
        const jsonStr = JSON.stringify(result, null, 2);
        return {
          "text/plain": jsonStr,
          "application/json": JSON.stringify(result),
        };
      } catch {
        return { "text/plain": String(result) };
      }
    }

    // Handle primitive types
    if (typeof result === "string") {
      // Check if it's HTML content
      if (result.includes("<") && result.includes(">")) {
        return {
          "text/html": result,
          "text/plain": result.replace(/<[^>]*>/g, ""), // Strip HTML for plain text
        };
      }
      return { "text/plain": result };
    }

    if (typeof result === "number" || typeof result === "boolean") {
      return { "text/plain": String(result) };
    }

    return { "text/plain": String(result) };
  }

  /**
   * Handle cancellation events
   */
  private handleCancellation(
    queueId: string,
    cellId: string,
    reason: string,
  ): void {
    this.logger.info("Python execution cancellation", {
      queueId,
      cellId,
      reason,
    });

    // Signal interrupt to Pyodide worker
    if (this.interruptBuffer) {
      const view = new Int32Array(this.interruptBuffer);
      view[0] = 2; // SIGINT
    }
  }

  /**
   * Cleanup worker resources
   */
  private cleanupWorker(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.logger.info("Pyodide worker cleanup completed");
  }
}

/**
 * Main function to run the Pyodide runtime agent
 */
async function main() {
  const agent = new PyodideRuntimeAgent();
  const logger = createLogger("pyodide-main");

  try {
    await agent.start();

    logger.info("Pyodide runtime agent started", {
      kernelId: agent.config.kernelId,
      kernelType: agent.config.kernelType,
      notebookId: agent.config.notebookId,
      sessionId: agent.config.sessionId,
      syncUrl: agent.config.syncUrl,
      heartbeatInterval: agent.config.heartbeatInterval,
    });

    await agent.keepAlive();
  } catch (error) {
    logger.error("Failed to start Pyodide agent", error);
    Deno.exit(1);
  } finally {
    await agent.shutdown();
  }
}

// Run as script if this file is executed directly
if (import.meta.main) {
  await main();
}
