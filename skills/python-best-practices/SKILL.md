---
name: python-best-practices
description: Apply modern Python best practices, conventions, and architectural patterns to production-ready code. Use when writing, reviewing, or refactoring Python to follow PEP 8, type hints, pytest and hypothesis testing, dataframe workflows (Pandas, Polars, DuckDB, Spark), and Python data model patterns (dunder methods, iterators, context managers, descriptors). For Python 3.12+ with pyproject.toml and Ruff. DO NOT use for FastAPI (use fastapi skill).
---

# Python Best Practices

## Domain-Specific References

Load the relevant reference when the task involves these domains:

- **FastAPI applications**: Defer to the `fastapi` skill for project setup, endpoints, error handling, and Pydantic integration
- **Dataframe / data engineering**: Read [references/dataframe.md](references/dataframe.md) — columnar thinking, vectorization over row loops, method chaining, Pandas → Polars → DuckDB → Spark
- **Python data model**: Read [references/datamodel.md](references/datamodel.md) — `__iter__`/`__next__`, `__enter__`/`__exit__`, descriptors, `@property`, native-feeling APIs
- **Dependency & supply chain security**: Read [references/security.md](references/security.md) — CVE checking, supply chain attack prevention, dependency auditing, emergency response

## Code Style

- Python 3.12+ with pyproject.toml configuration
- Follow PEP 8; use Ruff for linting and formatting
- After writing or modifying Python files, run Ruff to lint, auto-fix, and format: `ruff check --fix . && ruff format .`
- 4 spaces indentation, 120-char line limit
- Type hints required for all public APIs using built-in generics (`list[str]`, `dict[str, int]`), not `typing.List`/`typing.Dict`
- Provide PEP 257 docstrings for all public functions and classes
- Break complex functions into smaller, well-named functions

### Naming Conventions

```python
# Files: snake_case
mcp_server.py

# Classes: PascalCase
class CustomerQueryTool:

# Functions/variables: snake_case
async def analyze_customer_query():
server_config = get_config()

# Constants: SCREAMING_SNAKE_CASE
MAX_RETRY_ATTEMPTS = 3
```

## Project Structure

Use this layout for new Python projects:

```
project-name/
├── pyproject.toml          # Project metadata, dependencies, tool config
├── src/
│   └── package_name/
│       ├── __init__.py
│       ├── main.py
│       └── models.py
├── tests/
│   ├── conftest.py         # Shared fixtures
│   └── test_main.py
└── README.md
```

- Use `src/` layout to prevent accidental imports of uninstalled code
- Configure all tools (ruff, pytest, mypy) in `pyproject.toml`
- Prefer `uv` for dependency management; fall back to `pip`

## Configuration & Environment Variables

Always use `python-dotenv` for environment variable management. Include it in project dependencies and call `load_dotenv()` at the application entry point before any `os.environ` access.

- Add `python-dotenv` to `[project.dependencies]` in `pyproject.toml`
- Call `load_dotenv()` once at the top of the entry point (`main.py`), never inside library code
- Add `.env` to `.gitignore`; commit a `.env.example` with placeholder values for documentation
- Use `os.environ["KEY"]` (not `os.getenv`) to fail fast on missing required values
- For typed configuration, prefer `pydantic-settings` (`BaseSettings` with `env_file`)

```python
# main.py — entry point
from dotenv import load_dotenv

load_dotenv()  # must precede any os.environ access

import os

DATABASE_URL = os.environ["DATABASE_URL"]
API_KEY = os.environ["API_KEY"]
```

## Testing

- Use pytest with `conftest.py` for shared fixtures
- Use `@pytest.mark.parametrize` for input variation
- Use `Faker()` for generating realistic test data
- Use `hypothesis` for property-based testing of pure functions
- Use `schemathesis` for property-based testing of API endpoints
- Use `pytest-snapshot` for snapshot testing API responses
- Measure coverage with `pytest-cov`; write tests for uncovered paths
- Handle edge cases: empty inputs, invalid types, boundary values, large datasets

```python
# Example: parametrized test with fixture
@pytest.fixture
def sample_user(faker):
    return {"name": faker.name(), "email": faker.email()}

@pytest.mark.parametrize("quantity,expected", [(0, 0), (5, 50), (-1, ValueError)])
def test_calculate_total(quantity, expected):
    if isinstance(expected, type) and issubclass(expected, Exception):
        with pytest.raises(expected):
            calculate_total(price=10, quantity=quantity)
    else:
        assert calculate_total(price=10, quantity=quantity) == expected
```

## Dependency & Supply Chain Security

Run `pip-audit` before adding or upgrading any dependency. Pin exact versions in production. Treat every third-party package as an attack surface — see [references/security.md](references/security.md) for CVE checking workflow, supply chain attack patterns, CI automation, and emergency response.

## Error Handling

- Prefer specific exceptions over generic `Exception`
- Use custom exception classes for domain errors
- Document raised exceptions in docstrings
- Handle cleanup with context managers (`with`), not bare `try/finally`
