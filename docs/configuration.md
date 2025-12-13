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
  template: "<path template>"
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

### Template

The `template` option defines where worktrees will be created. You can use template variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `${{ original.path }}` | Full path to the main repository | `/path/to/foo` |
| `${{ original.basename }}` | Directory name of the main repository | `foo` |
| `${{ worktree.branch }}` | Branch name (separator conversion applied) | `feature-add-cart` |

> **Note**: In the template, `${{ worktree.branch }}` is automatically transformed using the `separator` setting.

#### Template Examples

| Use Case | Configuration | Result (branch: `feature/add-cart`) |
|----------|---------------|-------------------------------------|
| Inside project | `template: "./worktrees/${{ worktree.branch }}"` | `./worktrees/feature-add-cart` |
| Sibling with repo name prefix | `template: "../${{ original.basename }}-${{ worktree.branch }}"` | `../foo-feature-add-cart` |
| Sibling with custom prefix | `template: "../awesome-${{ worktree.branch }}"` | `../awesome-feature-add-cart` |
| Dedicated sibling directory | `template: "../worktrees/${{ worktree.branch }}"` | `../worktrees/feature-add-cart` |
| Absolute path | `template: "/another/path/${{ worktree.branch }}"` | `/another/path/feature-add-cart` |

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
  template: "../${{ original.basename }}-${{ worktree.branch }}"
  separator: hyphen
```

```yaml
# .wtman/config.user.yaml
# Override only the separator, inherit template from config.yaml
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

#### Common Variables

These variables are available in both `worktree.template` and hooks:

| Variable | Description | Example |
|----------|-------------|---------|
| `${{ original.path }}` | Full path to the main repository | `/path/to/foo` |
| `${{ original.basename }}` | Directory name of the main repository | `foo` |
| `${{ worktree.branch }}` | Branch name | `feature/add-cart` |

> **Note**: In `worktree.template`, `${{ worktree.branch }}` is automatically transformed using the `separator` setting (e.g., `feature/add-cart` → `feature-add-cart`). In hooks, it remains the raw branch name.

#### Hook-Only Variables

These variables are only available in hooks (determined after worktree creation):

| Variable | Description | Example |
|----------|-------------|---------|
| `${{ worktree.path }}` | Path to the worktree directory | `/path/to/foo-feature-add-cart` |
| `${{ worktree.basename }}` | Directory name of the worktree | `foo-feature-add-cart` |

## Merging Behavior

Configuration files are loaded in the following order:

1. `.wtman/config.yaml` (team-shared)
2. `.wtman/config.user.yaml` (user-specific)
3. `.wtman/config.user.worktree.yaml` (worktree-specific)

### Worktree Settings (Override)

The `worktree` section uses **override** merging. Each property (`template`, `separator`) is individually overridden by later configuration files.

```yaml
# config.yaml
worktree:
  template: "../${{ original.basename }}-${{ worktree.branch }}"
  separator: hyphen

# config.user.yaml
worktree:
  separator: underscore  # Only separator is overridden

# Result:
#   template: "../${{ original.basename }}-${{ worktree.branch }}"  (from config.yaml)
#   separator: underscore                                           (from config.user.yaml)
```

### Hooks (Concatenate)

Hooks are **concatenated** from all files. For example, if `config.yaml` defines a `post-worktree-add` hook and `config.user.yaml` also defines one, both will run in order.

## Examples

### Team Configuration

```yaml
# .wtman/config.yaml
worktree:
  template: "../${{ original.basename }}-${{ worktree.branch }}"
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
