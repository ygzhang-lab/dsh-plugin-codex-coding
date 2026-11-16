# Dependency & Supply Chain Security

Treat every third-party package as an attack surface.

## Adding a Dependency

Before recommending or adding any package, run through this checklist:

1. **Check CVEs**: Run `pip-audit` to query the OSV database. Cross-check [GitHub Advisory Database](https://github.com/advisories) for the package name
2. **Evaluate trust signals**: Check [scorecard.dev](https://scorecard.dev/) score, [PyPI Trusted Publishers](https://docs.pypi.org/trusted-publishers/) status, maintainer count, and commit activity
3. **Minimize transitive deps**: Prefer packages with fewer transitive dependencies — each one is an additional attack vector
4. **Prefer stdlib first**: Use `pathlib`, `json`, `dataclasses`, `tomllib`, `urllib.parse`, `shutil`, `csv`, `sqlite3` over third-party equivalents when they suffice

```bash
# Audit before adding
pip-audit

# Find unused deps in the project
uvx deptry .
```

## Writing pyproject.toml

Pin exact versions for production dependencies. Use ranges only in dev/optional groups:

```toml
[project]
dependencies = [
    "httpx==0.28.1",
    "pydantic==2.11.3",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0,<9.0",
    "ruff>=0.11.0,<1.0",
]
```

For deployment, generate hash-pinned requirements:

```bash
uv pip compile --generate-hashes requirements.in -o requirements.txt
```

## Red Flags When Reviewing Dependencies

Flag these during code review or when evaluating a package:

- `.pth` files in the package (auto-execution on import)
- `setup.py` with network calls, `subprocess`, or obfuscated code
- Single anonymous maintainer with no org backing
- Package name is a near-misspelling of a popular package (typosquatting)
- Sudden ownership change or version jump with no changelog
- Binary assets (`.so`, `.dll`, `.wav`, `.png`) without clear justification
