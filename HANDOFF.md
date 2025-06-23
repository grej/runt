# HANDOFF: AI Cells Integration for Runt PyodideRuntimeAgent

**Date**: January 2025\
**Branch**: `ai-cells-integration`\
**Status**: Working prototype ready for merge\
**Context**: Basic AI integration functional, provider abstraction needed next

## What This Delivers

Added AI cell support to runt's PyodideRuntimeAgent. This is a working prototype
that demonstrates AI cells executing alongside Python cells with basic OpenAI
integration.

**Core functionality working**:

- AI cells execute when `cellType: "ai"` is set
- OpenAI API integration with real API calls
- Basic tool calling - AI can create new cells
- Context awareness - AI sees previous cells and outputs
- Graceful fallback to mock responses without API key

**Current limitations**:

- Hardcoded to OpenAI only
- Single tool function (`create_cell`)
- No streaming responses
- No provider abstraction
- No deterministic testing model

## Files Changed

### New Files

```
packages/pyodide-runtime-agent/src/openai-client.ts     # OpenAI API wrapper
packages/pyodide-runtime-agent/test/ai-cell-integration.test.ts  # AI tests
```

### Modified Files

```
packages/pyodide-runtime-agent/src/pyodide-agent.ts     # AI execution pipeline
packages/pyodide-runtime-agent/deno.json                # Dependencies
packages/pyodide-runtime-agent/src/lib.ts               # Exports
packages/pyodide-runtime-agent/src/mod.ts               # Exports
```

### Dependencies Added

```json
{
  "@openai/openai": "jsr:@openai/openai@^4.98.0",
  "npm:strip-ansi": "npm:strip-ansi@^7.1.0"
}
```

## How It Works

1. **Cell Detection**: `executePython()` detects `cellType === "ai"`
2. **Context Gathering**: Collects previous cells and their text outputs
3. **API Call**: Sends to OpenAI with `create_cell` tool enabled
4. **Tool Execution**: AI can create new cells with proper positioning
5. **Output**: Returns markdown response with tool call tracking

## Usage

```bash
# Set API key for real responses
export OPENAI_API_KEY="your-key"

# Start runtime
NOTEBOOK_ID=test AUTH_TOKEN=token deno run --allow-all src/mod.ts
```

AI cells work like Python cells but with `cellType: "ai"`:

```typescript
store.commit(events.cellCreated({
  id: "ai-cell-1",
  cellType: "ai",
  position: 1,
  createdBy: "user",
}));

store.commit(events.cellSourceChanged({
  id: "ai-cell-1",
  source: "Create a Python cell that plots a sine wave",
  modifiedBy: "user",
}));
```

## Testing

Tests work with or without API key:

- With `OPENAI_API_KEY`: Tests real OpenAI responses
- Without key: Uses mock responses

```bash
deno task ci  # Full test suite
```

## Next Steps Needed

This prototype proves AI cells work but needs:

1. **Provider abstraction** for different AI services
2. **Streaming responses** (requires schema changes)
3. **More tools** (`modify_cell`, `execute_cell`)
4. **Deterministic test model**
5. **Model selection UI**

## Technical Notes

- All typing is clean with schema interfaces
- Error handling for API failures
- Context filtering (text outputs only)
- Tool calls tracked in output metadata
- Session management works across restarts

## Ready to Merge

This is a functional prototype that demonstrates AI integration without breaking
existing functionality. The hardcoded OpenAI approach is fine for proving the
concept - provider abstraction can come next.

**What works**: Basic AI assistance with cell creation **What's limited**:
Single provider, single tool, no streaming **What's next**: Provider system and
expanded capabilities

````
Now for the provider plan:

## Provider Architecture Plan

### 1. Provider Interface

Create a generic provider interface that all AI services implement:

```typescript
interface AIProvider {
  name: string;
  models: string[];
  
  // Core execution
  executePrompt(params: {
    messages: ChatMessage[];
    model?: string;
    tools?: Tool[];
    systemPrompt?: string;
  }): Promise<AIResponse>;
  
  // Streaming (future)
  executePromptStream(params: ExecuteParams): AsyncIterableIterator<AIStreamChunk>;
  
  // Capabilities
  supportsTools(): boolean;
  supportsStreaming(): boolean;
  getAvailableModels(): Promise<string[]>;
}
````

### 2. Provider Implementations

**OpenAIProvider** (current functionality)

- Uses existing OpenAI client
- Supports tools and streaming
- Model selection from OpenAI's API

**OllamaProvider** (local models)

- HTTP calls to local Ollama instance
- Model list from `/api/tags`
- Tools support varies by model

**TestProvider** (deterministic testing)

- Hardcoded responses
- Predictable outputs for CI
- Tool calling simulation

### 3. Provider Registry

```typescript
class ProviderRegistry {
  private providers = new Map<string, AIProvider>();

  register(provider: AIProvider): void;
  get(name: string): AIProvider | undefined;
  list(): AIProvider[];
  getDefault(): AIProvider;
}
```

### 4. Schema Changes for Streaming

For streaming AI responses, we need delta updates:

```typescript
// New event for updating existing outputs
interface OutputDeltaEvent {
  cellId: string;
  outputId: string;
  delta: {
    text?: string; // Append to existing text
    data?: Record<string, unknown>; // Merge with existing data
    metadata?: Record<string, unknown>; // Merge metadata
  };
}
```

This lets us:

- Stream AI responses in real-time
- Update outputs incrementally
- Show progress indicators
- Handle interruptions cleanly

### 5. Configuration

Provider selection through environment or config:

```typescript
interface AIConfig {
  defaultProvider: string;
  providers: {
    openai?: { apiKey: string; baseURL?: string };
    ollama?: { baseURL: string };
    test?: { responses: Record<string, string> };
  };
}
```

### 6. Implementation Order

1. **Provider interface** - Define the contract
2. **Refactor existing OpenAI code** - Make it a provider
3. **Add TestProvider** - For reliable testing
4. **Registry and configuration** - Provider selection
5. **OllamaProvider** - Local model support
6. **Streaming schema changes** - Delta updates
7. **Streaming implementation** - Real-time responses

This gives you a clean path from the current prototype to a flexible,
multi-provider system with streaming support.
