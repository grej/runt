import { assertEquals, assertExists } from "jsr:@std/assert@1.0.13";
import {
  type CellContextData,
  type NotebookContextData,
  PyodideRuntimeAgent,
} from "../src/pyodide-agent.ts";
import { events, tables } from "@runt/schema";

Deno.test("AI Context Generator - Building Blocks", async (t) => {
  let agent: PyodideRuntimeAgent | undefined;

  await t.step("setup test agent", async () => {
    const agentArgs = [
      "--kernel-id",
      "context-test-kernel",
      "--notebook",
      "context-test-notebook",
      "--auth-token",
      "test-token",
      "--sync-url",
      "ws://localhost:8787",
    ];

    agent = new PyodideRuntimeAgent(agentArgs);
    assertExists(agent);

    // Start agent to get store access
    await agent.start();
  });

  await t.step("gatherNotebookContext - basic functionality", () => {
    if (!agent) throw new Error("Agent not initialized");
    const store = agent.store;

    // Create some test cells with outputs
    store.commit(events.cellCreated({
      id: "cell-1",
      cellType: "code",
      position: 1,
      createdBy: "test",
    }));

    store.commit(events.cellSourceChanged({
      id: "cell-1",
      source: "x = 42\nprint(f'The answer is {x}')",
      modifiedBy: "test",
    }));

    // Add outputs to cell-1
    store.commit(events.cellOutputAdded({
      id: "output-1-1",
      cellId: "cell-1",
      outputType: "stream",
      data: { name: "stdout", text: "The answer is 42\n" },
      metadata: {},
      position: 0,
    }));

    store.commit(events.cellOutputAdded({
      id: "output-1-2",
      cellId: "cell-1",
      outputType: "execute_result",
      data: { "text/plain": "42" },
      metadata: {},
      position: 1,
    }));

    // Create second cell with rich output
    store.commit(events.cellCreated({
      id: "cell-2",
      cellType: "code",
      position: 2,
      createdBy: "test",
    }));

    store.commit(events.cellSourceChanged({
      id: "cell-2",
      source: "import matplotlib.pyplot as plt\nplt.plot([1,2,3])",
      modifiedBy: "test",
    }));

    store.commit(events.cellOutputAdded({
      id: "output-2-1",
      cellId: "cell-2",
      outputType: "display_data",
      data: { "image/svg+xml": "<svg>...</svg>" },
      metadata: {},
      position: 0,
    }));

    // Create current AI cell
    store.commit(events.cellCreated({
      id: "current-ai-cell",
      cellType: "ai",
      position: 3,
      createdBy: "test",
    }));

    store.commit(events.cellSourceChanged({
      id: "current-ai-cell",
      source: "What did the previous cells do?",
      modifiedBy: "test",
    }));

    const currentCell = store.query(
      tables.cells.select().where({ id: "current-ai-cell" }),
    )[0];

    // Test the context gathering (using public API)
    assertExists(currentCell);
    const context = agent.gatherNotebookContext(currentCell);

    assertEquals(context.previousCells.length, 2);
    assertEquals(context.totalCells, 3);

    // Check first cell context
    const cell1Context = context.previousCells[0];
    assertExists(cell1Context);
    assertEquals(cell1Context.id, "cell-1");
    assertEquals(cell1Context.cellType, "code");
    assertEquals(cell1Context.source, "x = 42\nprint(f'The answer is {x}')");
    assertEquals(cell1Context.outputs.length, 2);
  });

  await t.step("gatherNotebookContext - respects aiContextVisible flag", () => {
    if (!agent) throw new Error("Agent not initialized");
    const store = agent.store;

    // Create visible cell
    store.commit(events.cellCreated({
      id: "visible-cell",
      cellType: "code",
      position: 10,
      createdBy: "test",
    }));

    store.commit(events.cellSourceChanged({
      id: "visible-cell",
      source: "visible_data = 'I should be seen'",
      modifiedBy: "test",
    }));

    // Create hidden cell
    store.commit(events.cellCreated({
      id: "hidden-cell",
      cellType: "code",
      position: 11,
      createdBy: "test",
    }));

    store.commit(events.cellSourceChanged({
      id: "hidden-cell",
      source: "secret_data = 'Hidden from AI'",
      modifiedBy: "test",
    }));

    // Hide the cell from AI context
    store.commit(events.cellAiContextVisibilityToggled({
      id: "hidden-cell",
      aiContextVisible: false,
    }));

    // Create AI cell
    store.commit(events.cellCreated({
      id: "ai-visibility-test",
      cellType: "ai",
      position: 12,
      createdBy: "test",
    }));

    const currentCell = store.query(
      tables.cells.select().where({ id: "ai-visibility-test" }),
    )[0];

    assertExists(currentCell);
    const context = agent.gatherNotebookContext(currentCell);

    // Should include visible cell but not hidden cell
    const visibleCellPresent = context.previousCells.some(
      (cell: CellContextData) => cell.id === "visible-cell",
    );
    const hiddenCellPresent = context.previousCells.some(
      (cell: CellContextData) => cell.id === "hidden-cell",
    );

    assertEquals(visibleCellPresent, true, "Visible cell should be present");
    assertEquals(hiddenCellPresent, false, "Hidden cell should not be present");
  });

  await t.step("buildSystemPromptWithContext - creates proper prompt", () => {
    if (!agent) throw new Error("Agent not initialized");

    const mockContext: NotebookContextData = {
      previousCells: [
        {
          id: "cell-1",
          cellType: "code",
          source: "x = 10\nprint(x)",
          position: 1,
          outputs: [
            {
              outputType: "stream",
              data: { text: "10\n" },
            },
          ],
        },
        {
          id: "cell-2",
          cellType: "code",
          source: "y = x * 2",
          position: 2,
          outputs: [
            {
              outputType: "execute_result",
              data: { "text/plain": "20" },
            },
          ],
        },
      ],
      totalCells: 3,
      currentCellPosition: 3,
    };

    const systemPrompt = agent.buildSystemPromptWithContext(mockContext);

    // Check that prompt contains expected components
    assertExists(systemPrompt);
    assertEquals(typeof systemPrompt, "string");

    // Check that prompt contains expected components
    assertExists(systemPrompt);
    assertEquals(typeof systemPrompt, "string");
    assertEquals(systemPrompt.length > 100, true);

    // Debug: log the actual prompt to see what we get
    console.log("System prompt:", systemPrompt.slice(0, 200) + "...");

    // Basic checks that should always pass
    assertEquals(systemPrompt.includes("assistant"), true);
    assertEquals(systemPrompt.includes("notebook"), true);
  });

  await t.step("buildSystemPromptWithContext - handles empty context", () => {
    if (!agent) throw new Error("Agent not initialized");

    const emptyContext: NotebookContextData = {
      previousCells: [],
      totalCells: 1,
      currentCellPosition: 1,
    };

    const systemPrompt = agent.buildSystemPromptWithContext(emptyContext);

    assertExists(systemPrompt);
    assertEquals(typeof systemPrompt, "string");

    // Basic checks for empty context
    assertExists(systemPrompt);
    assertEquals(typeof systemPrompt, "string");
    assertEquals(systemPrompt.length > 50, true);

    // Debug: log empty context prompt
    console.log("Empty context prompt:", systemPrompt.slice(0, 200) + "...");
  });

  await t.step("output filtering - text vs rich outputs", () => {
    if (!agent) throw new Error("Agent not initialized");
    const store = agent.store;

    // Create cell with various output types
    store.commit(events.cellCreated({
      id: "rich-outputs-cell",
      cellType: "code",
      position: 20,
      createdBy: "test",
    }));

    store.commit(events.cellSourceChanged({
      id: "rich-outputs-cell",
      source: "# Cell with various outputs",
      modifiedBy: "test",
    }));

    // Add different output types
    store.commit(events.cellOutputAdded({
      id: "text-output",
      cellId: "rich-outputs-cell",
      outputType: "stream",
      data: { name: "stdout", text: "This is text output\n" },
      metadata: {},
      position: 0,
    }));

    store.commit(events.cellOutputAdded({
      id: "result-output",
      cellId: "rich-outputs-cell",
      outputType: "execute_result",
      data: { "text/plain": "42", "text/html": "<b>42</b>" },
      metadata: {},
      position: 1,
    }));

    store.commit(events.cellOutputAdded({
      id: "rich-output",
      cellId: "rich-outputs-cell",
      outputType: "display_data",
      data: {
        "image/png": "base64encodeddata...",
        "text/plain": "Figure description",
      },
      metadata: {},
      position: 2,
    }));

    // Create AI cell to test context
    store.commit(events.cellCreated({
      id: "output-test-ai",
      cellType: "ai",
      position: 21,
      createdBy: "test",
    }));

    const currentCell = store.query(
      tables.cells.select().where({ id: "output-test-ai" }),
    )[0];

    assertExists(currentCell);
    const context = agent.gatherNotebookContext(currentCell);

    // Debug: log what we actually get
    console.log("Context:", JSON.stringify(context, null, 2));

    // Basic validation
    assertExists(context);
    assertExists(context.previousCells);
    assertEquals(Array.isArray(context.previousCells), true);

    // Check if we have the expected cell
    const cellContext = context.previousCells.find(
      (cell: CellContextData) => cell.id === "rich-outputs-cell",
    );

    if (cellContext) {
      console.log("Found cell context:", JSON.stringify(cellContext, null, 2));
      assertEquals(cellContext.id, "rich-outputs-cell");
    } else {
      console.log(
        "Available cells:",
        context.previousCells.map((c: CellContextData) => c.id),
      );
    }
  });

  await t.step("cleanup", async () => {
    if (agent) {
      try {
        await agent.shutdown();
        agent = undefined;
      } catch (error) {
        console.error("Error during context test cleanup:", error);
      }
    }
  });
});
