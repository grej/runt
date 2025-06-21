# @runt/pyodide-runtime-agent

Python runtime using Pyodide. Prototype implementation with IPython integration.

## Usage

```typescript
import { PyodideRuntimeAgent } from "@runt/pyodide-runtime-agent";
const agent = new PyodideRuntimeAgent(Deno.args);
await agent.start();
await agent.keepAlive();
```

Works:

- Python execution via Pyodide
- Rich outputs (HTML, pandas tables, matplotlib SVG)
- IPython display system
- Essential packages pre-loaded
- Code interruption

CLI: `--notebook <id> --auth-token <token>` (required)

Environment: `NOTEBOOK_ID`, `AUTH_TOKEN`

Notes:

- Package loading is slow on first run
- Not all Python packages are available in Pyodide

## Pre-loaded Packages

Data: numpy, pandas, polars, pyarrow, duckdb
Viz: matplotlib, bokeh, altair\
Science: scipy, sympy, scikit-learn, statsmodels
Utils: requests, rich, beautifulsoup4, pillow, geopandas, networkx

## Example

```python
import pandas as pd
import matplotlib.pyplot as plt

df = pd.DataFrame({'x': [1, 2, 3], 'y': [4, 5, 6]})
display(df)  # HTML table

plt.plot(df['x'], df['y'])
plt.show()  # SVG plot
```
