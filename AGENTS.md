# AI Agent Development Context

This document provides context for AI assistants working on the runt runtime
agent library.

## Project Overview

Runt is a TypeScript/Deno library for building runtime agents that connect to
Anode notebooks. It uses LiveStore for event-sourcing and real-time sync between
multiple users.

**Current Status**: Working system with 72 passing tests. Core functionality is
implemented. Main areas needing work are better error handling and more robust
connection management.

## Architecture

- **Schema Package** (`@runt/schema`): LiveStore schema definitions with
  TypeScript types
- **Library Package** (`@runt/lib`): Runtime agent implementation with lifecycle
  management
- **Pyodide Package** (`@runt/pyodide-runtime-agent`): Python runtime using
  Pyodide with IPython integration for rich display support
- **LiveStore**: Event-sourcing framework for local-first apps with real-time
  sync
- **Deno**: TypeScript runtime with built-in testing and formatting

## What Actually Works

- LiveStore integration with event-sourced state management
- Runtime agent lifecycle (start, execute, shutdown)
- Jupyter-compatible output system (stdout, stderr, rich display data)
- Real-time collaboration via LiveStore sync
- CLI configuration with environment variable fallbacks
- Cross-package TypeScript imports with proper typing
- CI/CD pipeline with multi-platform testing
- Python code execution via Pyodide with rich formatting
- Direct Python code execution with IPython rich formatting
- HTML rendering, pandas tables, matplotlib SVG plots
- Real-time interrupt support via SharedArrayBuffer
- JSR publishing for all packages

## What Needs Work

- Error handling is basic
- Test coverage is good but could expand edge cases
- LiveStore complex types require `--allow-slow-types` for publishing
- Pyodide package loading can be slow on first run

## Development Workflow

The user typically runs:

```bash
deno task ci        # lint, format, type-check, test
deno task test      # just run tests
deno task dev       # run example echo agent
```

When making changes:

1. Edit code
2. Run `deno task ci` to check everything
3. Commit changes
4. GitHub Actions runs the same checks

## Key Constraints

- **LiveStore Materializers**: Must be pure functions. Never use `ctx.query()`
  in materializers - it causes hash mismatches and runtime failures.
- **Event Schema**: Events can't be removed once added. Changes must be backward
  compatible.
- **Session Management**: Each runtime restart gets a unique `sessionId`. Handle
  session overlap during restarts.
- **Output Timing**: Use the ExecutionContext output methods (`stdout`,
  `stderr`, `display`, `result`, `error`, `clear`) for real-time output during
  execution.
- **Pyodide Code Execution**: Use direct `pyodide.runPythonAsync()` instead of
  IPython's `shell.run_cell()` to avoid code transformations. Process results
  through IPython's displayhook for rich formatting.
- **Duplicate Outputs**: When displayhook handles a result, don't return data
  from the execution handler to avoid duplicate execute_result outputs.

## File Structure

```
runt/
├── packages/
│   ├── schema/          # LiveStore schema definitions
│   │   └── mod.ts       # Events, tables, materializers
│   ├── lib/             # Runtime agent library
│   │   ├── src/         # Source code
│   │   ├── examples/    # Working examples
│   │   └── test/        # Integration tests
│   └── pyodide-runtime-agent/  # Python runtime implementation
│       └── src/         # Pyodide agent, worker, IPython setup
├── .github/workflows/   # CI/CD
└── deno.json           # Tasks and dependencies
```

## Common Issues

**LiveStore "materializer hash mismatch"**: Caused by non-deterministic
materializers. All data needed by materializers must be in the event payload,
not queried during materialization.

**Import errors**: Make sure all imports use the workspace aliases
(`@runt/schema`, `@runt/lib`) or relative paths correctly.

**Test permissions**: Tests need `--allow-env --allow-net --allow-read` flags.

**Publishing**: Requires `--allow-slow-types` flag due to LiveStore's complex
types.

**Duplicate execute results**: When using IPython's displayhook for formatting,
don't return data from the execution handler.

## Testing

- **Unit tests**: Core functionality in `src/`
- **Integration tests**: Cross-package interactions in `test/`
- **Example tests**: Ensure examples work in `examples/`

Run tests with: `deno test --allow-env --allow-net --allow-read`

Current test count: 72 passing, 0 failing

## Dependencies

- `@livestore/livestore`: Event-sourcing framework
- `@livestore/adapter-node`: Node.js platform adapter
- `@livestore/sync-cf`: Cloudflare Workers sync backend
- `@std/cli`: Deno standard library for CLI parsing
- `@opentelemetry/api`: Structured logging and tracing
- `pyodide`: Python runtime in WebAssembly (for pyodide package)

All dependencies are pinned in `deno.json` import maps.

## Communication Style

- Be direct about what works and what doesn't
- Don't oversell capabilities or use marketing language
- Focus on helping developers solve actual problems
- It's okay to say "this is a prototype" or "this part needs work"
- Code examples are better than long explanations
- Keep documentation concise and consolidate when possible

## Development Guidelines

- Follow existing code patterns
- Write tests for new functionality
- Update documentation when adding features
- Use TypeScript strictly - fix all type errors
- Follow Deno formatting conventions (`deno fmt`)
- Keep commits focused and descriptive

## For AI Assistants

When working on this codebase:

- Read the existing code to understand patterns
- Run tests after making changes
- Check that CI passes before submitting
- Don't make assumptions about complex LiveStore behavior
- Ask for clarification if event-sourcing concepts are unclear
- Focus on making the code work reliably rather than adding features

The goal is to make this library useful for developers building runtime agents,
not to impress anyone with complexity.

## Recent Fixes Applied

- Fixed Pyodide code execution by using direct execution instead of IPython
  transforms
- Eliminated duplicate execute_result outputs by proper displayhook handling
- Added proper JSR publishing configuration for all packages
- Consolidated documentation to reduce redundancy
- Upgraded Pyodide to version 0.27.7
- Moved dependency version constraints to deno.json imports
