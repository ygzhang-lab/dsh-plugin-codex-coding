---
name: fastapi
description: Build and configure FastAPI applications following best practices with uv project setup, Pydantic models, dependency injection, async/sync endpoints, SSE streaming, and OpenAPI docs. Use when developing APIs with FastAPI or setting up new FastAPI projects. DO NOT use for general Python style (use python-best-practices) or dataframe workflows.
---

# FastAPI

Official FastAPI skill to write code with best practices, keeping up to date with new versions and features.

## Project Setup with uv

Scaffold a new FastAPI project:

```bash
uv init my-api
cd my-api
uv add "fastapi[standard]"
```

Minimal `pyproject.toml`:

```toml
[project]
name = "my-api"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi[standard]>=0.115",
]

[tool.fastapi]
entrypoint = "src.my_api.main:app"

[dependency-groups]
dev = [
    "pytest>=8.0",
    "httpx>=0.27",
    "pytest-asyncio>=0.24",
]
```

Run with uv:

```bash
uv run fastapi dev          # development with hot reload
uv run fastapi run          # production
uv run fastapi dev --host 0.0.0.0 --port 8000
```

Without uv, use `fastapi dev` / `fastapi run` directly.

When the entrypoint in `pyproject.toml` is not possible, pass the path directly:

```bash
fastapi dev my_app/main.py
```

Prefer the `[tool.fastapi]` entrypoint when possible.

## Project Structure

Organize by feature using routers. Keep `main.py` thin.

```
src/
├── my_api/
│   ├── __init__.py
│   ├── main.py          # App factory, middleware, lifespan
│   ├── routers/
│   │   ├── items.py     # Router per domain
│   │   └── users.py
│   ├── models/
│   │   ├── item.py      # Pydantic schemas
│   │   └── user.py
│   ├── services/
│   │   └── item_service.py
│   ├── dependencies.py  # Shared dependencies
│   └── exceptions.py    # Custom exception classes
tests/
├── conftest.py
└── test_items.py
pyproject.toml
```

## Lifespan

Use the `lifespan` async context manager for startup/shutdown logic (replaces the deprecated `on_event`).

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialize DB pools, caches, ML models, etc.
    app.state.db = await create_db_pool()
    yield
    # Shutdown: cleanup
    await app.state.db.close()

app = FastAPI(lifespan=lifespan)
```

## Error Handling

Define custom exceptions and register global handlers. Document errors in OpenAPI via `responses`.

```python
# exceptions.py
class ItemNotFoundError(Exception):
    def __init__(self, item_id: int):
        self.item_id = item_id

# main.py
from fastapi import Request
from fastapi.responses import JSONResponse

@app.exception_handler(ItemNotFoundError)
async def handle_not_found(request: Request, exc: ItemNotFoundError):
    return JSONResponse(status_code=404, content={"detail": f"Item {exc.item_id} not found"})
```

```python
# Document in endpoint
@router.get("/{item_id}",
    response_model=Item,
    responses={404: {"description": "Item not found"}},
)
async def get_item(item_id: int) -> Item: ...
```

## Use `Annotated`

Prefer the `Annotated` style for parameter and dependency declarations.

It keeps the function signatures working in other contexts, respects the types, allows reusability.

### In Parameter Declarations

Use `Annotated` for parameter declarations, including `Path`, `Query`, `Header`, etc.:

```python
from typing import Annotated

from fastapi import FastAPI, Path, Query

app = FastAPI()


@app.get("/items/{item_id}")
async def read_item(
    item_id: Annotated[int, Path(ge=1, description="The item ID")],
    q: Annotated[str | None, Query(max_length=50)] = None,
):
    return {"message": "Hello World"}
```

### For Dependencies

Use `Annotated` for dependencies with `Depends()`.

Unless asked not to, create a new type alias for the dependency to allow re-using it.

```python
from typing import Annotated

from fastapi import Depends, FastAPI

app = FastAPI()


def get_current_user():
    return {"username": "johndoe"}


CurrentUserDep = Annotated[dict, Depends(get_current_user)]


@app.get("/items/")
async def read_item(current_user: CurrentUserDep):
    return {"message": "Hello World"}
```

## Required Parameters Without Ellipsis

Omit `...` from required parameters — it's implicit and redundant:

```python
from typing import Annotated

from fastapi import FastAPI, Query
from pydantic import BaseModel, Field


class Item(BaseModel):
    name: str
    description: str | None = None
    price: float = Field(gt=0)


app = FastAPI()


@app.post("/items/")
async def create_item(item: Item, project_id: Annotated[int, Query()]): ...
```

## Return Type or Response Model

When possible, include a return type. It will be used to validate, filter, document, and serialize the response.

```python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()


class Item(BaseModel):
    name: str
    description: str | None = None


@app.get("/items/me")
async def get_item() -> Item:
    return Item(name="Plumbus", description="All-purpose home device")
```

**Important**: Return types or response models are what filter data ensuring no sensitive information is exposed. And they are used to serialize data with Pydantic (in Rust), this is the main idea that can increase response performance.

The return type doesn't have to be a Pydantic model, it could be a different type, like a list of integers, or a dict, etc.

### When to use `response_model` instead

If the return type is not the same as the type that you want to use to validate, filter, or serialize, use the `response_model` parameter on the decorator instead.

```python
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()


class Item(BaseModel):
    name: str
    description: str | None = None


@app.get("/items/me", response_model=Item)
async def get_item() -> Any:
    return {"name": "Foo", "description": "A very nice Item"}
```

This can be particularly useful when filtering data to expose only the public fields and avoid exposing sensitive information. Use `response_model=PublicModel` with `-> Any` return type to strip internal fields like `secret_key`.

## Performance

Rely on return types or `response_model` for serialization — Pydantic handles it in Rust. `ORJSONResponse` and `UJSONResponse` are deprecated.

## Including Routers

When declaring routers, prefer to add router level parameters like prefix, tags, etc. to the router itself, instead of in `include_router()`.

Do this:

```python
from fastapi import APIRouter, FastAPI

app = FastAPI()

router = APIRouter(prefix="/items", tags=["items"])


@router.get("/")
async def list_items():
    return []


# In main.py
app.include_router(router)
```

Apply shared dependencies at the router level via `dependencies=[Depends(...)]`.

## Dependency Injection

See [the dependency injection reference](references/dependencies.md) for detailed patterns including `yield` with `scope`, and class dependencies.

Use dependencies when the logic can't be declared in Pydantic validation, depends on external resources, needs cleanup (with `yield`), or is shared across endpoints.

## Async vs Sync *path operations*

Use `async` *path operations* only when fully certain that the logic called inside is compatible with async and await (it's called with `await`) or that doesn't block.

```python
from fastapi import FastAPI

app = FastAPI()


# Use async def when calling async code
@app.get("/async-items/")
async def read_async_items():
    data = await some_async_library.fetch_items()
    return data


# Use plain def when calling blocking/sync code or when in doubt
@app.get("/items/")
def read_items():
    data = some_blocking_library.fetch_items()
    return data
```

In case of doubt, or by default, use regular `def` functions, those will be run in a threadpool so they don't block the event loop.

The same rules apply to dependencies.

Running blocking code inside `async` functions will severely degrade performance — use plain `def` instead, or see [the other tools reference](references/other-tools.md) for Asyncer.

## Streaming (JSON Lines, SSE, bytes)

See [the streaming reference](references/streaming.md) for JSON Lines, Server-Sent Events (`EventSourceResponse`, `ServerSentEvent`), and byte streaming (`StreamingResponse`) patterns.

## Tooling and Other Libraries

See [the other tools reference](references/other-tools.md) for uv, Ruff, ty, Asyncer, SQLModel, and HTTPX.

## Use `Annotated` Instead of Pydantic RootModels

Prefer regular type annotations with `Annotated` and Pydantic validation — FastAPI creates a `TypeAdapter` automatically, making `RootModel` unnecessary:

```python
from typing import Annotated

from fastapi import Body, FastAPI
from pydantic import Field

app = FastAPI()


@app.post("/items/")
async def create_items(items: Annotated[list[int], Field(min_length=1), Body()]):
    return items
```

## One HTTP Operation per Function

Use separate functions per HTTP method to keep concerns clear:

```python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()


class Item(BaseModel):
    name: str


@app.get("/items/")
async def list_items():
    return []


@app.post("/items/")
async def create_item(item: Item):
    return item
```