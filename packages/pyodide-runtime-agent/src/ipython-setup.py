"""
IPython Bootstrap Setup for Enhanced Pyodide Runtime

This module sets up a complete IPython environment with rich display support,
matplotlib integration, enhanced error formatting, and proper output handling.

Note: For HTTPS requests, use the `requests` library instead of urllib:
    import requests
    import pandas as pd
    from io import StringIO

    response = requests.get("https://example.com/data.csv")
    df = pd.read_csv(StringIO(response.text))
"""

import os
import sys
import io
import json
import traceback
from IPython.core.interactiveshell import InteractiveShell
from IPython.core.displayhook import DisplayHook
from IPython.core.displaypub import DisplayPublisher
from IPython.core.history import HistoryManager
import matplotlib
import matplotlib.pyplot as plt

# Configure matplotlib for rich SVG output
matplotlib.use("svg")
plt.rcParams["figure.dpi"] = 100
plt.rcParams["savefig.dpi"] = 100
plt.rcParams["figure.facecolor"] = "white"
plt.rcParams["savefig.facecolor"] = "white"
plt.rcParams["figure.figsize"] = (8, 6)

os.environ.update(
    {
        "TERM": "xterm-256color",
        "FORCE_COLOR": "1",
        "COLORTERM": "truecolor",
        "CLICOLOR": "1",
        "CLICOLOR_FORCE": "1",
    }
)


# Mock terminal support for rich colors
class ColorfulStream:
    """Stream wrapper that reports as a TTY for color support"""

    def __init__(self, original):
        self._original = original

    def __getattr__(self, name):
        return getattr(self._original, name)

    def isatty(self):
        return True

    def write(self, text):
        return self._original.write(text)

    def flush(self):
        return self._original.flush()


# Replace stdout and stderr with colorful versions
sys.stdout = ColorfulStream(sys.stdout)
sys.stderr = ColorfulStream(sys.stderr)


class LiteHistoryManager(HistoryManager):
    """Lightweight history manager for web environment"""

    def __init__(self, shell=None, config=None, **traits):
        self.enabled = False
        super().__init__(shell=shell, config=config, **traits)


class RichDisplayPublisher(DisplayPublisher):
    """Enhanced display publisher for rich output handling"""

    def __init__(self, shell=None, *args, **kwargs):
        super().__init__(shell, *args, **kwargs)
        self.js_callback = None

    def publish(
        self,
        data,
        metadata=None,
        source=None,
        *,
        transient=None,
        update=False,
        **kwargs,
    ):
        """Publish display data with proper serialization"""
        if self.js_callback and data:
            # Convert data to serializable format
            serializable_data = self._make_serializable(data)
            serializable_metadata = self._make_serializable(metadata or {})
            serializable_transient = self._make_serializable(transient or {})

            self.js_callback(
                serializable_data, serializable_metadata, serializable_transient, update
            )

    def clear_output(self, wait=False):
        """Clear output signal"""
        # TODO: Implement clear_output with our schema and protocol
        print(f"[CLEAR_OUTPUT:{wait}]", flush=True)

    def _make_serializable(self, obj):
        """Convert objects to JSON-serializable format"""
        if obj is None:
            return {}

        if hasattr(obj, "to_dict"):
            return obj.to_dict()

        if isinstance(obj, dict):
            result = {}
            for key, value in obj.items():
                try:
                    # Test if value is JSON serializable
                    json.dumps(value)
                    result[str(key)] = value
                except (TypeError, ValueError) as e:
                    # Log serialization issues to structured logs
                    print(
                        f"[SERIALIZATION_WARNING] Non-serializable value for key '{key}': {e}",
                        flush=True,
                    )
                    # Convert non-serializable values to strings
                    result[str(key)] = str(value)
            return result

        try:
            # Test if object is JSON serializable
            json.dumps(obj)
            return obj
        except (TypeError, ValueError):
            return str(obj)


class RichDisplayHook(DisplayHook):
    """Enhanced display hook for execution results with rich formatting"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.js_callback = None
        self.execution_count = 0

    def __call__(self, result):
        """Handle execution results with proper serialization"""
        if result is not None:
            self.execution_count += 1

            # Format the result using IPython's rich formatting
            try:
                format_dict, md_dict = self.compute_format_data(result)

                # Make data serializable
                if self.js_callback and format_dict:
                    serializable_data = self._make_serializable(format_dict)
                    serializable_metadata = self._make_serializable(md_dict or {})

                    self.js_callback(
                        self.execution_count, serializable_data, serializable_metadata
                    )

            except Exception as e:
                # Log formatting errors to structured logs instead of stderr
                print(
                    f"[DISPLAY_HOOK_ERROR] ErrorWarning: Error formatting result: {e}",
                    file=sys.stderr,
                )
                # Fallback to simple string representation
                if self.js_callback:
                    fallback_data = {"text/plain": str(result)}
                    self.js_callback(self.execution_count, fallback_data, {})

        return result

    def _make_serializable(self, obj):
        """Convert objects to JSON-serializable format"""
        if obj is None:
            return {}

        if isinstance(obj, dict):
            result = {}
            for key, value in obj.items():
                try:
                    # Test if value is JSON serializable
                    json.dumps(value)
                    result[str(key)] = value
                except (TypeError, ValueError) as e:
                    # Log serialization issues to structured logs
                    print(
                        f"[SERIALIZATION_WARNING] Non-serializable value for key '{key}': {e}",
                        flush=True,
                    )
                    # Convert non-serializable values to strings
                    result[str(key)] = str(value)
            return result

        try:
            # Test if object is JSON serializable
            json.dumps(obj)
            return obj
        except (TypeError, ValueError):
            return str(obj)


shell = InteractiveShell.instance(
    displayhook_class=RichDisplayHook,
    display_pub_class=RichDisplayPublisher,
)

# Override history manager
shell.history_manager = LiteHistoryManager(shell=shell, parent=shell)

# Enhanced matplotlib show function with SVG capture
_original_show = plt.show


def _capture_matplotlib_show(block=None):
    """Capture matplotlib plots as high-quality SVG and send via display system"""
    if plt.get_fignums():
        fig = plt.gcf()
        svg_buffer = io.StringIO()

        try:
            # Save as SVG with high quality settings
            fig.savefig(
                svg_buffer,
                format="svg",
                bbox_inches="tight",
                facecolor="white",
                edgecolor="none",
                dpi=100,
                transparent=False,
            )
            svg_content = svg_buffer.getvalue()
            svg_buffer.close()

            # Use IPython's display system to show SVG
            from IPython.display import display, SVG

            display(SVG(svg_content))

            # Clear the figure
            plt.clf()

        except Exception as e:
            print(f"Error capturing matplotlib plot: {e}", file=sys.stderr)

    return _original_show(block=block) if block is not None else _original_show()


# Replace matplotlib show with our enhanced version
plt.show = _capture_matplotlib_show


def setup_rich_formatters():
    """Set up rich formatters for pandas, numpy, and other data types"""

    try:
        import pandas as pd

        # Enhanced pandas display options
        pd.set_option("display.max_rows", 100)
        pd.set_option("display.max_columns", 20)
        pd.set_option("display.width", None)
        pd.set_option("display.max_colwidth", 50)

    except ImportError:
        print("INFO: Pandas not available for rich formatting")

    try:
        import numpy as np

        # Enhanced numpy display
        np.set_printoptions(precision=4, suppress=True, linewidth=120)

    except ImportError:
        print("INFO: NumPy not available for rich formatting")


# Apply rich formatters
setup_rich_formatters()


def format_exception(exc_type, exc_value, exc_traceback):
    """Format exceptions with rich formatting and color support"""
    try:
        # Use IPython's enhanced traceback formatting
        from IPython.core.ultratb import VerboseTB

        # Try different VerboseTB initialization approaches for compatibility
        try:
            tb_formatter = VerboseTB(mode="Minimal", color_scheme="Neutral")
        except TypeError:
            # Fallback for newer IPython versions that don't support mode parameter
            try:
                tb_formatter = VerboseTB(color_scheme="Neutral")
            except TypeError:
                # Final fallback with no parameters
                tb_formatter = VerboseTB()

        formatted_tb = tb_formatter.format_exception(exc_type, exc_value, exc_traceback)
        return "".join(formatted_tb)
    except Exception as format_error:
        # Log formatting errors to structured logs instead of stderr
        print(
            f"[FORMATTER_ERROR] Failed to format exception: {format_error}", flush=True
        )
        # Fallback to standard traceback
        return "".join(traceback.format_exception(exc_type, exc_value, exc_traceback))


# Override exception formatting
sys.excepthook = lambda exc_type, exc_value, exc_traceback: print(
    format_exception(exc_type, exc_value, exc_traceback), file=sys.stderr
)


# Set up global callbacks (will be overridden by worker)
def default_display_callback(data, metadata, transient, update=False):
    """Default display callback - does nothing"""
    pass


def default_execution_callback(execution_count, data, metadata):
    """Default execution callback - does nothing"""
    pass


# Make callbacks available globally
js_display_callback = default_display_callback
js_execution_callback = default_execution_callback

# Export the configured shell for use by the worker
__all__ = ["shell", "js_display_callback", "js_execution_callback"]
