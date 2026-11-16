# Python Data Model Patterns

Implement dunder methods so objects work naturally with Python builtins and syntax. Prefer protocol compliance over custom API methods.

## Iteration: `__iter__` / `__next__`

Use instead of custom `.get_items()` or `.iterate()` methods.

```python
# WRONG
class BadPool:
    def get_items(self):
        return self.items

# CORRECT
class ConnectionPool:
    def __init__(self, connections):
        self._connections = list(connections)

    def __iter__(self):
        return iter(self._connections)

# Works with: for, list(), unpacking, map, filter, zip
for conn in pool:
    conn.execute(query)
```

## Context Managers: `__enter__` / `__exit__`

Use instead of manual `.connect()` / `.disconnect()` with try/finally.

```python
# WRONG
conn = Connection()
conn.connect()
try:
    conn.execute(query)
finally:
    conn.disconnect()

# CORRECT
class Connection:
    def __enter__(self):
        self._conn = create_connection()
        return self._conn

    def __exit__(self, exc_type, exc_val, exc_tb):
        self._conn.close()
        return False  # propagate exceptions

with Connection() as conn:
    conn.execute(query)
```

For simple cases, use `contextlib.contextmanager`:

```python
from contextlib import contextmanager

@contextmanager
def transaction(db):
    db.begin()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
```

## Properties: `@property`

Use instead of `.get_x()` / `.set_x()` method pairs. Add validation in setters.

```python
# WRONG
class BadUser:
    def get_email(self): return self._email
    def set_email(self, v): self._email = v

# CORRECT
class User:
    def __init__(self, email: str):
        self.email = email  # triggers setter

    @property
    def email(self) -> str:
        return self._email

    @email.setter
    def email(self, value: str):
        if '@' not in value:
            raise ValueError(f"Invalid email: {value}")
        self._email = value
```

For reusable validation across classes, use descriptors:

```python
class ValidatedString:
    def __init__(self, validator):
        self._validator = validator

    def __set_name__(self, owner, name):
        self._name = f"_{name}"

    def __get__(self, obj, objtype=None):
        return getattr(obj, self._name, None) if obj else self

    def __set__(self, obj, value):
        self._validator(value)
        setattr(obj, self._name, value)
```

## Representation: `__repr__` / `__str__`

Always implement `__repr__` for debugging. Implement `__str__` only when a user-friendly format differs.

```python
class Order:
    def __init__(self, order_id: str, total: float):
        self.order_id = order_id
        self.total = total

    def __repr__(self) -> str:
        return f"Order({self.order_id!r}, total={self.total})"

    def __str__(self) -> str:
        return f"Order #{self.order_id}: ${self.total:.2f}"
```

## Equality and Hashing: `__eq__` / `__hash__`

Required for objects used in sets or as dict keys. If `__eq__` is defined, `__hash__` must also be defined (or set to `None` for unhashable).

```python
class Coordinate:
    def __init__(self, x: float, y: float):
        self.x = x
        self.y = y

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Coordinate):
            return NotImplemented
        return self.x == other.x and self.y == other.y

    def __hash__(self) -> int:
        return hash((self.x, self.y))
```

## Container Protocol: `__getitem__` / `__len__`

Implement when an object should behave like a sequence or mapping.

```python
class Config:
    def __init__(self, data: dict):
        self._data = data

    def __getitem__(self, key: str):
        return self._data[key]

    def __len__(self) -> int:
        return len(self._data)

    def __contains__(self, key: str) -> bool:
        return key in self._data
```

## Decision Guide

| If the object... | Implement |
|---|---|
| Can be looped over | `__iter__` (+ `__next__` if custom iterator) |
| Manages a resource | `__enter__` / `__exit__` |
| Has computed or validated attributes | `@property` |
| Needs readable debug output | `__repr__` |
| Is compared by value | `__eq__` + `__hash__` |
| Acts like a list or dict | `__getitem__` + `__len__` |
| Has a meaningful string form | `__str__` |
