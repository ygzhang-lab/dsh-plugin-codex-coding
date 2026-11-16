---
name: pnpm
description: Node.js package manager with strict dependency resolution. Use when running pnpm specific commands, configuring workspaces, or managing dependencies with catalogs, patches, or overrides.
metadata:
  author: Anthony Fu
  version: "2026.1.28"
  source: Generated from https://github.com/pnpm/pnpm, scripts located at https://github.com/antfu/skills
---

pnpm is a fast, disk space efficient package manager. It uses a content-addressable store to deduplicate packages across all projects on a machine, saving significant disk space. pnpm enforces strict dependency resolution by default, preventing phantom dependencies. Configuration should preferably be placed in `pnpm-workspace.yaml` for pnpm-specific settings.

**Important:** When working with pnpm projects, agents should check for `pnpm-workspace.yaml` and `.npmrc` files to understand workspace structure and configuration. Always use `--frozen-lockfile` in CI environments.

> The skill is based on pnpm 10.x, generated at 2026-01-28.

## Safety boundaries

- Run clean-up commands from the project root and use explicit project paths (`./node_modules`, `./dist`). Never run `rm -rf` against `~`, `/`, a variable, or a directory you did not inspect; prefer `pnpm install --force` or `pnpm rebuild` when a reinstall is enough.
- `pnpm config set` writes the user config by default. Prefer the project `.npmrc` or add `--location project`; do not change machine-wide config for one repository.
- `pnpm link --global` and `pnpm add -g` change user-wide pnpm state. Prefer `pnpm dlx`, a project devDependency, or a `link:` dependency; clean up global links with `pnpm unlink --global <pkg>`.
- `pnpm publish` and `pnpm publish -r` are release actions. Confirm the versions, review `pnpm pack` output, and publish only when the user explicitly asks.
- Store permission fixes: locate the store with `pnpm store path` first, and only `chmod` that exact directory when it belongs to you. Never `chmod -R` a whole home directory or a shared path.

## Core

| Topic | Description | Reference |
|-------|-------------|-----------|
| CLI Commands | Install, add, remove, update, run, exec, dlx, and workspace commands | [core-cli](references/core-cli.md) |
| Configuration | pnpm-workspace.yaml, .npmrc settings, and package.json fields | [core-config](references/core-config.md) |
| Workspaces | Monorepo support with filtering, workspace protocol, and shared lockfile | [core-workspaces](references/core-workspaces.md) |
| Store | Content-addressable storage, hard links, and disk efficiency | [core-store](references/core-store.md) |

## Features

| Topic | Description | Reference |
|-------|-------------|-----------|
| Catalogs | Centralized dependency version management for workspaces | [features-catalogs](references/features-catalogs.md) |
| Overrides | Force specific versions of dependencies including transitive | [features-overrides](references/features-overrides.md) |
| Patches | Modify third-party packages with custom fixes | [features-patches](references/features-patches.md) |
| Aliases | Install packages under custom names using npm: protocol | [features-aliases](references/features-aliases.md) |
| Hooks | Customize resolution with .pnpmfile.cjs hooks | [features-hooks](references/features-hooks.md) |
| Peer Dependencies | Auto-install, strict mode, and dependency rules | [features-peer-deps](references/features-peer-deps.md) |

## Best Practices

| Topic | Description | Reference |
|-------|-------------|-----------|
| CI/CD Setup | GitHub Actions, GitLab CI, Docker, and caching strategies | [best-practices-ci](references/best-practices-ci.md) |
| Migration | Migrating from npm/Yarn, handling phantom deps, monorepo migration | [best-practices-migration](references/best-practices-migration.md) |
| Performance | Install optimizations, store caching, workspace parallelization | [best-practices-performance](references/best-practices-performance.md) |
