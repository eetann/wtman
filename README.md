<p align="center">
    <a href="https://www.npmjs.com/package/wtman"><img src="https://img.shields.io/npm/v/wtman?color=CB0200" alt="link to npm.js" /></a>
</p>

# wtman

**wtman** is a CLI tool for managing Git worktrees more conveniently.

It automates worktree path naming using templates and executes routine tasks like `npm install` or copying `.env` files through hooks. With separate team and user configurations that merge automatically, it's easy to adopt in any project.

## Features

- **Template-based path generation** - Automatically determine worktree paths from branch names
- **Hook automation** - Execute commands and file operations when creating or removing worktrees
- **Three-layer configuration merge** - Automatically merge team, user, and worktree-specific settings
- **Metadata management** - Attach descriptions and tags to worktrees

## Installation

```bash
npm install -g wtman
```

## Quick Start

```bash
# Create a worktree
wtman add feature/awesome-feature

# Create with description and tags
wtman add feature/auth --desc "Implement authentication" --tag feature,wip

# List worktrees
wtman list

# Remove a worktree (interactive selection)
wtman remove
```

## Commands

### `wtman add <branch>`

Create a new worktree.

```bash
wtman add <branch> [--desc <description>] [--tag <tags>]
```

| Option | Description |
|--------|-------------|
| `--desc` | Set a description for the worktree |
| `--tag` | Set tags (comma-separated) |

**Workflow:**
1. Load configuration and generate path from `worktree.template`
2. Execute `pre-worktree-add` hooks
3. Create worktree with `git worktree add`
4. Execute `post-worktree-add` hooks
5. Save metadata

### `wtman remove`

Remove a worktree. Running without arguments opens interactive selection.

```bash
wtman remove [-b <branch>] [-w <path>] [--force] [--delete-branch|--keep-branch]
```

| Option | Description |
|--------|-------------|
| `-b` | Specify by branch name |
| `-w` | Specify by path |
| `--force` | Skip confirmation and force removal |
| `--delete-branch` | Also delete the branch |
| `--keep-branch` | Keep the branch |

**Safety features:**
- Warns if there are uncommitted changes
- Warns if there are commits not pushed to remote

### `wtman list`

Display a list of worktrees.

```bash
wtman list [-f <format>]
```

| Option | Value | Description |
|--------|-------|-------------|
| `-f` | `table` | Table format (default) |
| | `json` | JSON format |
| | `tsv` | Tab-separated format |

## Configuration

Configuration is written in YAML format. There are three levels of configuration files that merge automatically.

### Configuration Files

| File | Purpose | Git-tracked |
|------|---------|-------------|
| `.wtman/config.yaml` | Team shared settings | Yes |
| `.wtman/config.user.yaml` | User-specific settings | No |
| `.wtman/config.user.worktree.yaml` | Worktree-specific settings | No |

**Merge order:** Team → User → Worktree (later settings take precedence)

> **Note:** It's recommended to add `config.user.*.yaml` to `.gitignore`

### Configuration Schema

```yaml
worktree:
  template: "../${{ original.basename }}-${{ worktree.branch }}"  # Path template
  separator: hyphen       # hyphen | underscore | slash
  deleteBranch: ask       # ask | always | never

pre-worktree-add: []      # Hooks before worktree creation
post-worktree-add: []     # Hooks after worktree creation
pre-worktree-remove: []   # Hooks before worktree removal
post-worktree-remove: []  # Hooks after worktree removal
```

### Configuration Example

```yaml
# .wtman/config.yaml
worktree:
  template: "../${{ original.basename }}-${{ worktree.branch }}"
  separator: hyphen

post-worktree-add:
  - name: Install dependencies
    run: npm install

  - name: Copy environment file
    copy: .env.example

  - name: Link node_modules
    link: node_modules
```

## Hooks

You can define processes that automatically execute when creating or removing worktrees.

### Phases

| Phase | Timing | Default Working Directory |
|-------|--------|---------------------------|
| `pre-worktree-add` | Before creation | Main tree |
| `post-worktree-add` | After creation | Worktree |
| `pre-worktree-remove` | Before removal | Worktree |
| `post-worktree-remove` | After removal | Main tree |

### Actions

#### `run` - Execute shell command

```yaml
post-worktree-add:
  - name: Install dependencies
    run: npm install
```

#### `copy` - Copy files/directories

Copy files from the main tree to the worktree.

```yaml
post-worktree-add:
  - name: Copy config files
    copy:
      - .env.example
      - config/local/
```

#### `link` - Create symbolic links

Create symbolic links in the worktree pointing to the main tree.

```yaml
post-worktree-add:
  - name: Link shared directories
    link:
      - node_modules
      - .cache
```

#### `mkdir` - Create directories

```yaml
post-worktree-add:
  - name: Create directories
    mkdir:
      - logs
      - tmp
```

#### `remove` - Remove files/directories

```yaml
pre-worktree-remove:
  - name: Clean up
    remove:
      - .env.local
      - logs/
```

### Specifying Working Directory

Use the `working-directory` option to change the working directory.

```yaml
post-worktree-add:
  - name: Install frontend dependencies
    working-directory: frontend
    run: npm install
```

## Template Variables

You can embed variables using the `${{ variable.name }}` format.

### Available Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `${{ original.path }}` | Absolute path of main tree | `/home/user/project` |
| `${{ original.basename }}` | Directory name of main tree | `project` |
| `${{ worktree.path }}` | Absolute path of worktree | `/home/user/project-feature` |
| `${{ worktree.basename }}` | Directory name of worktree | `project-feature` |
| `${{ worktree.branch }}` | Branch name | `feature-auth` |

> **Note:** `worktree.path` and `worktree.basename` are only available in `post-worktree-add` and `pre-worktree-remove`

### Branch Name Conversion (separator)

Use `worktree.separator` to convert `/` in branch names.

| separator | Input | Output |
|-----------|-------|--------|
| `hyphen` | `feature/auth` | `feature-auth` |
| `underscore` | `feature/auth` | `feature_auth` |
| `slash` | `feature/auth` | `feature/auth` |

## Metadata

You can attach descriptions and tags to worktrees. They are stored in `.wtman/worktrees.yaml`.

```bash
# Set when adding
wtman add feature/auth --desc "Authentication feature" --tag feature,high-priority

# View in list
wtman list
```
