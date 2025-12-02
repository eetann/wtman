# Configuration

wtman uses YAML configuration files to define worktree settings and hooks that run before and after worktree operations.

## Configuration Files

Configuration files are stored in the `.wtman/` directory:

```
.wtman/
  config.yaml                # Team-shared (commit to repository)
  config.user.yaml           # User-specific, applies to all worktrees
  config.user.worktree.yaml  # User-specific, worktree-specific
```

### File Descriptions

| File | Scope | Git |
|------|-------|-----|
| `config.yaml` | Team-shared settings | Commit |
| `config.user.yaml` | Personal settings for all worktrees | Add to `.gitignore` |
| `config.user.worktree.yaml` | Personal settings for a specific worktree | Add to `.gitignore` |

### Location

- **Main repository**: `.wtman/config.yaml` and `.wtman/config.user.yaml`
- **Each worktree**: `.wtman/config.user.worktree.yaml` (worktree-specific hooks)

## Configuration Format

```yaml
worktree:
  path: "<path template>"
  separator: "<separator type>"

pre-worktree-add:
  - name: <step name>
    <action>: <value>

post-worktree-add:
  - name: <step name>
    <action>: <value>

pre-worktree-remove:
  - name: <step name>
    <action>: <value>

post-worktree-remove:
  - name: <step name>
    <action>: <value>
```

## Worktree Settings

The `worktree` section controls where worktrees are created and how branch names are transformed into directory names.

### Path Template

The `path` option defines where worktrees will be created. You can use template variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `${{ original.dir }}` | Full path to the main repository | `/path/to/foo` |
| `${{ original.name }}` | Directory name of the main repository | `foo` |
| `${{ branch }}` | Transformed branch name | `feature-add-cart` |

#### Path Examples

| Use Case | Configuration | Result (branch: `feature/add-cart`) |
|----------|---------------|-------------------------------------|
| Inside project | `path: "./worktrees/${{ branch }}"` | `./worktrees/feature-add-cart` |
| Sibling with repo name prefix | `path: "../${{ original.name }}-${{ branch }}"` | `../foo-feature-add-cart` |
| Sibling with custom prefix | `path: "../awesome-${{ branch }}"` | `../awesome-feature-add-cart` |
| Dedicated sibling directory | `path: "../worktrees/${{ branch }}"` | `../worktrees/feature-add-cart` |
| Absolute path | `path: "/another/path/${{ branch }}"` | `/another/path/feature-add-cart` |

### Branch Name Separator

The `separator` option controls how `/` characters in branch names are transformed:

| Value | Input | Output |
|-------|-------|--------|
| `hyphen` (default) | `feature/add-cart` | `feature-add-cart` |
| `underscore` | `feature/add-cart` | `feature_add-cart` |
| `slash` | `feature/add-cart` | `feature/add-cart` |

### Worktree Settings Example

```yaml
# .wtman/config.yaml
worktree:
  path: "../${{ original.name }}-${{ branch }}"
  separator: hyphen
```

```yaml
# .wtman/config.user.yaml
# Override only the separator, inherit path from config.yaml
worktree:
  separator: underscore
```

## Hooks

Each step must have exactly one action (`run`, `copy`, `link`, `mkdir`, or `remove`).

### Available Hooks

| Hook | Description |
|------|-------------|
| `pre-worktree-add` | Runs before creating a worktree |
| `post-worktree-add` | Runs after creating a worktree |
| `pre-worktree-remove` | Runs before removing a worktree |
| `post-worktree-remove` | Runs after removing a worktree |

### Available Actions

| Action | Description | Value Type |
|--------|-------------|------------|
| `run` | Execute a shell command | `string` |
| `copy` | Copy files/directories from original to worktree | `string` or `string[]` |
| `link` | Create symbolic links from original to worktree | `string` or `string[]` |
| `mkdir` | Create directories in worktree | `string` or `string[]` |
| `remove` | Remove files/directories | `string` or `string[]` |

> **Note**: `copy`, `link`, `mkdir`, and `remove` are planned features.

#### Action Examples

```yaml
# Run a shell command
- name: Install dependencies
  run: bun install

# Copy files (original → worktree)
- name: Copy environment files
  copy:
    - .env
    - .env.local

# Create symbolic links (original → worktree)
- name: Link shared resources
  link:
    - .mywork
    - node_modules

# Create directories
- name: Create temp directory
  mkdir: tmp

# Remove files/directories
- name: Clean up
  remove:
    - tmp
    - .cache
```

### Template Variables

You can use GitHub Actions-style variables with the `${{ }}` syntax.

#### Variables for Worktree Settings

These variables are available in the `worktree.path` template:

| Variable | Description | Example |
|----------|-------------|---------|
| `${{ original.dir }}` | Full path to the main repository | `/path/to/foo` |
| `${{ original.name }}` | Directory name of the main repository | `foo` |
| `${{ branch }}` | Transformed branch name (after separator conversion) | `feature-add-cart` |

#### Variables for Hooks

These variables are available in hook commands:

| Variable | Description | Example |
|----------|-------------|---------|
| `${{ original.dir }}` | Path to the original (main) repository | `/path/to/foo` |
| `${{ worktree.dir }}` | Path to the worktree directory | `/path/to/foo-feature-add-cart` |
| `${{ worktree.branch }}` | Branch name of the worktree (raw, not transformed) | `feature/add-cart` |

## Merging Behavior

Configuration files are loaded in the following order:

1. `.wtman/config.yaml` (team-shared)
2. `.wtman/config.user.yaml` (user-specific)
3. `.wtman/config.user.worktree.yaml` (worktree-specific)

### Worktree Settings (Override)

The `worktree` section uses **override** merging. Each property (`path`, `separator`) is individually overridden by later configuration files.

```yaml
# config.yaml
worktree:
  path: "../${{ original.name }}-${{ branch }}"
  separator: hyphen

# config.user.yaml
worktree:
  separator: underscore  # Only separator is overridden

# Result:
#   path: "../${{ original.name }}-${{ branch }}"  (from config.yaml)
#   separator: underscore                           (from config.user.yaml)
```

### Hooks (Concatenate)

Hooks are **concatenated** from all files. For example, if `config.yaml` defines a `post-worktree-add` hook and `config.user.yaml` also defines one, both will run in order.

## Examples

### Team Configuration

```yaml
# .wtman/config.yaml
worktree:
  path: "../${{ original.name }}-${{ branch }}"
  separator: hyphen

pre-worktree-add:
  - name: Validate branch name
    run: echo "Creating worktree for ${{ worktree.branch }}..."

post-worktree-add:
  - name: Copy environment files
    copy:
      - .env
      - .env.local
  - name: Install dependencies
    run: bun install
```

### User Configuration

```yaml
# .wtman/config.user.yaml
worktree:
  separator: underscore  # Override team's separator preference

post-worktree-add:
  - name: Link personal notes
    link: .mywork
  - name: Share node_modules
    link: node_modules
```

### Worktree-Specific Configuration

```yaml
# .wtman/config.user.worktree.yaml (in the worktree directory)
pre-worktree-remove:
  - name: Stop Docker containers
    run: docker-compose down
  - name: Clean up test data
    remove:
      - tmp
      - .cache
```

### Execution Order

Given the above configurations, when adding a worktree:

```
1. echo "Creating worktree..."     # from config.yaml (pre)
2. [worktree is created]
3. copy .env, .env.local           # from config.yaml (post)
4. bun install                     # from config.yaml (post)
5. link .mywork                    # from config.user.yaml (post)
6. link node_modules               # from config.user.yaml (post)
```

When removing a worktree:

```
1. docker-compose down             # from config.user.worktree.yaml (pre)
2. remove tmp, .cache              # from config.user.worktree.yaml (pre)
3. [worktree is removed]
```

## Recommended .gitignore

Add the following to your `.gitignore`:

```gitignore
# wtman user-specific configuration
.wtman/*.user.yaml
.wtman/*.user.worktree.yaml
```
