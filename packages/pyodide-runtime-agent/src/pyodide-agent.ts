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
import {
  type CellData,
  events,
  type OutputData as SchemaOutputData,
  schema,
  tables,
} from "@runt/schema";
import { openaiClient } from "./openai-client.ts";
import stripAnsi from "npm:strip-ansi";

/**
 * Type definitions for AI context generation - exported for reuse in other runtime agents
 */
export interface CellContextData {
  id: string;
  cellType: string;
  source: string;
  position: number;
  outputs: Array<{
    outputType: string;
    data: Record<string, unknown>;
  }>;
}

export interface NotebookContextData {
  previousCells: CellContextData[];
  totalCells: number;
  currentCellPosition: number;
}

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
          canExecuteAi: true,
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
   * Execute Python code or AI prompts using Pyodide worker or OpenAI
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

    // Handle AI cells differently
    if (cell.cellType === "ai") {
      return this.executeAI(context);
    }

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

  /**
   * Execute AI prompts using OpenAI
   */
  private async executeAI(context: ExecutionContext) {
    const {
      cell,
      stderr,
      result,
      error,
      abortSignal,
    } = context;
    const prompt = cell.source?.trim() || "";

    if (!prompt) {
      return { success: true };
    }

    try {
      if (abortSignal.aborted) {
        stderr("🛑 AI execution was already cancelled\n");
        return { success: false, error: "Execution cancelled" };
      }

      this.logger.info("Executing AI prompt", {
        cellId: cell.id,
        provider: cell.aiProvider || "openai",
        model: cell.aiModel || "gpt-4o-mini",
        promptLength: prompt.length,
      });

      // Gather notebook context for AI awareness
      const context_data = await this.gatherNotebookContext(cell);
      this.logger.info("Gathered notebook context", {
        previousCells: context_data.previousCells.length,
        totalCells: context_data.totalCells,
      });

      // Use real OpenAI API if configured, otherwise fall back to mock
      if (
        openaiClient.isReady() &&
        (cell.aiProvider === "openai" || !cell.aiProvider)
      ) {
        const outputs = await openaiClient.generateResponse(prompt, {
          model: cell.aiModel || "gpt-4o-mini",
          provider: cell.aiProvider || "openai",
          systemPrompt: this.buildSystemPromptWithContext(context_data),
          enableTools: true,
          currentCellId: cell.id,
          onToolCall: async (toolCall) => {
            this.logger.info("AI requested tool call", {
              toolName: toolCall.name,
              cellId: cell.id,
            });
            await this.handleToolCall(cell, toolCall);
          },
        });

        this.logger.info("Generated AI outputs", { count: outputs.length });

        // Send outputs to execution context
        outputs.forEach((output) => {
          if (output.type === "display_data") {
            context.display(output.data, output.metadata || {});
          } else if (output.type === "execute_result") {
            result(output.data);
          } else if (output.type === "error" && output.data) {
            const errorData = output.data as {
              ename?: string;
              evalue?: string;
              traceback?: string[];
            };
            error(
              errorData.ename || "AIError",
              errorData.evalue || "Unknown error",
              errorData.traceback || ["Unknown error"],
            );
          }
        });
      } else {
        // Generate fake AI response for development/testing
        const outputs = await this.generateFakeAiResponse(cell, context_data);
        this.logger.info("Generated fake AI outputs", {
          count: outputs.length,
        });

        outputs.forEach((output) => {
          if (
            output.type === "display_data" || output.type === "execute_result"
          ) {
            context.display(output.data, output.metadata || {});
          } else if (output.type === "error" && output.data) {
            const errorData = output.data as {
              ename?: string;
              evalue?: string;
              traceback?: string[];
            };
            error(
              errorData.ename || "AIError",
              errorData.evalue || "Unknown error",
              errorData.traceback || ["Unknown error"],
            );
          }
        });
      }

      return { success: true };
    } catch (err) {
      if (
        abortSignal.aborted ||
        (err instanceof Error && err.message.includes("cancelled"))
      ) {
        stderr("🛑 AI execution was cancelled\n");
        return { success: false, error: "Execution cancelled" };
      }

      // Handle AI errors
      if (err instanceof Error) {
        const errorLines = err.message.split("\n");
        const errorName = errorLines[0] || "AIError";
        const errorValue = errorLines[1] || err.message;
        const traceback = errorLines.length > 2 ? errorLines : [err.message];

        error(errorName, errorValue, traceback);
        return { success: false, error: errorValue };
      }

      throw err;
    }
  }

  /**
   * Gather context from previous cells for AI execution
   */
  public gatherNotebookContext(currentCell: CellData): NotebookContextData {
    // Query all cells that come before the current cell AND are visible to AI
    const allCells = this.store.query(
      tables.cells.select().orderBy("position", "asc"),
    ) as CellData[];

    const previousCells = allCells
      .filter((cell: CellData) =>
        cell.position < currentCell.position &&
        cell.aiContextVisible !== false
      )
      .map((cell: CellData) => {
        // Get outputs for each cell
        const outputs = this.store.query(
          tables.outputs
            .select()
            .where({ cellId: cell.id })
            .orderBy("position", "asc"),
        ) as SchemaOutputData[];

        // Filter outputs to only include text/plain and text/markdown for AI context
        const filteredOutputs = outputs.map((output: SchemaOutputData) => {
          const outputData = output.data;
          const filteredData: Record<string, unknown> = {};

          if (outputData && typeof outputData === "object") {
            if (outputData["text/plain"]) {
              filteredData["text/plain"] = outputData["text/plain"];
            }
            if (outputData["text/markdown"]) {
              filteredData["text/markdown"] = outputData["text/markdown"];
            }
            // For stream outputs, include the text directly
            if (outputData.text && outputData.name) {
              filteredData.text = outputData.text;
              filteredData.name = outputData.name;
            }
            // For error outputs, include error info
            if (outputData.ename && outputData.evalue) {
              filteredData.ename = outputData.ename;
              filteredData.evalue = outputData.evalue;
              if (outputData.traceback) {
                filteredData.traceback = outputData.traceback;
              }
            }
          }

          return {
            outputType: output.outputType,
            data: Object.keys(filteredData).length > 0
              ? filteredData
              : (outputData as Record<string, unknown>),
          };
        });

        return {
          id: cell.id,
          cellType: cell.cellType,
          source: cell.source || "",
          position: cell.position,
          outputs: filteredOutputs,
        };
      });

    return {
      previousCells,
      totalCells: allCells.length,
      currentCellPosition: currentCell.position,
    };
  }

  /**
   * Build system prompt with notebook context
   */
  public buildSystemPromptWithContext(context: NotebookContextData): string {
    let systemPrompt =
      `You are a helpful AI assistant in a Jupyter-like notebook environment. You have access to the context of previous cells in the notebook.

**Notebook Context:**
- Total cells: ${context.totalCells}
- Current cell position: ${context.currentCellPosition}
- Previous cells visible to AI: ${context.previousCells.length}

**Previous Cell Contents (only cells marked as visible to AI):**
`;

    if (context.previousCells.length === 0) {
      systemPrompt +=
        "No previous cells are visible to AI in this notebook (either no previous cells exist or they have been hidden from AI context).\n";
    } else {
      context.previousCells.forEach((cell, index) => {
        systemPrompt += `
Cell ${index + 1} (Position ${cell.position}, Type: ${cell.cellType}):
\`\`\`${cell.cellType === "code" ? "python" : cell.cellType}
${cell.source}
\`\`\`
`;

        // Include outputs if they exist
        if (cell.outputs && cell.outputs.length > 0) {
          systemPrompt += `
Output:
`;
          cell.outputs.forEach((output) => {
            if (output.outputType === "stream") {
              // Handle stream outputs (stdout/stderr)
              if (output.data.text && typeof output.data.text === "string") {
                systemPrompt += `\`\`\`
${this.stripAnsi(output.data.text)}
\`\`\`
`;
              }
            } else if (output.outputType === "error") {
              // Handle error outputs
              if (
                output.data.ename && typeof output.data.ename === "string" &&
                output.data.evalue && typeof output.data.evalue === "string"
              ) {
                systemPrompt += `\`\`\`
Error: ${this.stripAnsi(output.data.ename)}: ${
                  this.stripAnsi(output.data.evalue)
                }
\`\`\`
`;
              }
            } else if (
              output.outputType === "execute_result" ||
              output.outputType === "display_data"
            ) {
              // Handle rich outputs
              if (
                output.data["text/plain"] &&
                typeof output.data["text/plain"] === "string"
              ) {
                systemPrompt += `\`\`\`
${this.stripAnsi(output.data["text/plain"])}
\`\`\`
`;
              }
              if (output.data["text/markdown"]) {
                systemPrompt += `
${output.data["text/markdown"]}
`;
              }
            }
          });
        }
      });
    }

    systemPrompt += `
**Instructions:**
- Provide clear, concise responses and include code examples when appropriate
- Reference previous cells when relevant to provide context-aware assistance
- If you see variables, functions, or data structures defined in previous cells, you can reference them
- You can see the outputs from previous code executions to understand the current state
- Help with debugging, optimization, or extending the existing code
- Suggest next steps based on the notebook's progression`;

    return systemPrompt;
  }

  /**
   * Handle tool calls from AI
   */
  private handleToolCall(currentCell: CellData, toolCall: {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }): void {
    const { name, arguments: args } = toolCall;

    switch (name) {
      case "create_cell": {
        const cellType = String(args.cellType || "code");
        const content = String(args.content || "");
        const position = String(args.position || "after_current");

        // Calculate position for new cell
        const newPosition = this.calculateNewCellPosition(
          currentCell,
          position,
        );

        // Generate unique cell ID
        const newCellId = `cell-${Date.now()}-${
          Math.random().toString(36).slice(2)
        }`;

        this.logger.info("Creating cell via AI tool call", {
          cellType,
          position: newPosition,
          contentLength: content.length,
        });

        // Create the new cell
        this.store.commit(
          events.cellCreated({
            id: newCellId,
            cellType: cellType as "code" | "markdown" | "raw" | "sql" | "ai",
            position: newPosition,
            createdBy: `ai-assistant-${this.config.sessionId}`,
          }),
        );

        // Set the cell source if provided
        if (content.length > 0) {
          this.store.commit(
            events.cellSourceChanged({
              id: newCellId,
              source: content,
              modifiedBy: `ai-assistant-${this.config.sessionId}`,
            }),
          );
        }

        this.logger.info("Created cell successfully", {
          cellId: newCellId,
          contentPreview: content.slice(0, 100),
        });
        break;
      }

      default:
        this.logger.warn("Unknown AI tool", { toolName: name });
    }
  }

  /**
   * Calculate new cell position based on placement preference
   */
  private calculateNewCellPosition(
    currentCell: CellData,
    placement: string,
  ): number {
    const allCells = this.store.query(
      tables.cells.select().orderBy("position", "asc"),
    ) as CellData[];

    switch (placement) {
      case "before_current":
        return currentCell.position - 0.1;
      case "at_end": {
        const maxPosition = allCells.length > 0
          ? Math.max(...allCells.map((c: CellData) => c.position))
          : 0;
        return maxPosition + 1;
      }
      case "after_current":
      default:
        return currentCell.position + 0.1;
    }
  }

  /**
   * Generate fake AI response for testing with rich output support
   */
  private async generateFakeAiResponse(
    cell: CellData,
    context?: {
      previousCells: Array<{
        id: string;
        cellType: string;
        source: string;
        position: number;
        outputs: Array<{
          outputType: string;
          data: Record<string, unknown>;
        }>;
      }>;
      totalCells: number;
      currentCellPosition: number;
    },
  ): Promise<
    Array<{
      type: string;
      data: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    }>
  > {
    const provider = cell.aiProvider || "openai";
    const model = cell.aiModel || "gpt-4o-mini";
    const prompt = cell.source || "";

    // Simulate AI thinking time (reduced for better dev experience)
    await new Promise((resolve) =>
      setTimeout(resolve, 200 + Math.random() * 500)
    );

    // Generate context-aware response
    let contextInfo = "";
    if (context && context.previousCells.length > 0) {
      contextInfo = `

## 📚 Notebook Context Analysis

I can see **${context.previousCells.length} previous cells** in this notebook:

`;
      context.previousCells.forEach((cell, index) => {
        const preview = cell.source.slice(0, 100);
        contextInfo += `- **Cell ${index + 1}** (${cell.cellType}): ${preview}${
          cell.source.length > 100 ? "..." : ""
        }\n`;
      });
    } else if (context) {
      contextInfo =
        "\n\n## 📚 Notebook Context\n\nThis appears to be the first cell in your notebook.\n";
    }

    const response = `I understand you're asking: "${prompt}"

This is a **mock response** from \`${model}\` with notebook context awareness.${contextInfo}

## 🔍 Analysis & Suggestions

Based on your prompt and notebook context:
- 💡 **Context Understanding**: I can see the progression of your work
- 📊 **Data Insights**: Previous cells provide valuable context
- 🚀 **Next Steps**: Building on existing code and variables

\`\`\`python
# Example based on notebook context
import pandas as pd
df = pd.read_csv('data.csv')
df.head()
\`\`\`

> **Note**: This is a simulated response. Real AI integration will provide deeper context analysis.`;

    return [{
      type: "execute_result",
      data: {
        "text/markdown": response,
        "text/plain": response.replace(/[#*`>|\-]/g, "").replace(/\n+/g, "\n")
          .trim(),
      },
      metadata: {
        "anode/ai_response": true,
        "anode/ai_provider": provider,
        "anode/ai_model": model,
      },
    }];
  }

  /**
   * Strip ANSI escape codes from text for AI consumption
   */
  private stripAnsi(text: string): string {
    return stripAnsi(text);
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
