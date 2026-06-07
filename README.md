# Reoclo Checkout (`@reoclo/checkout`)

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Reoclo%20Checkout-2188ff?logo=github&logoColor=white)](https://github.com/marketplace/actions/reoclo-checkout)
[![Release](https://img.shields.io/github/v/release/reoclo/checkout?logo=github&label=release&color=2188ff&sort=semver)](https://github.com/reoclo/checkout/releases/latest)
[![CI](https://github.com/reoclo/checkout/actions/workflows/ci.yml/badge.svg)](https://github.com/reoclo/checkout/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

Clone or update a repository on a [Reoclo](https://reoclo.com) managed server from GitHub Actions.

Works like `actions/checkout`, but the code ends up on your remote server instead of the GitHub runner. Pairs with [`@reoclo/run`](https://github.com/reoclo/run) for build and deploy steps.

## Why

`actions/checkout` lands the code on the GitHub-hosted runner. To deploy that code to a remote server you then need SSH keys, rsync setup, or a separate deploy tool. `@reoclo/checkout` skips that hop:

- **Code lands on the deploy target directly.** No SSH keys or rsync wiring.
- **Uses your existing `github.token`.** No separate deploy credential to rotate.
- **Auditable.** Every checkout is recorded with the originating repository, workflow, actor, and ref.
- **Pairs with [`@reoclo/run`](https://github.com/reoclo/run) and [`@reoclo/docker-auth`](https://github.com/reoclo/docker-auth)** for full build and deploy workflows.

## Quick Start

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout on server
        uses: reoclo/checkout@v2
        with:
          api_key: ${{ secrets.REOCLO_API_KEY }}
          server_id: ${{ secrets.REOCLO_SERVER_ID }}
          token: ${{ github.token }}

      - name: Build and deploy
        uses: reoclo/run@v2
        with:
          api_key: ${{ secrets.REOCLO_API_KEY }}
          server_id: ${{ secrets.REOCLO_SERVER_ID }}
          working_directory: /opt/deploy/workspace
          command: |
            docker compose build && docker compose up -d
          timeout: 600
```

## Setup

1. Create an Automation API key in the Reoclo dashboard. Navigate to **API Keys**, select the **Automation Keys** tab, and click **Create Key**.
2. Add `REOCLO_API_KEY` and `REOCLO_SERVER_ID` as GitHub Actions secrets.
3. The action uses `github.token` by default for repository access, so no extra token setup is needed for same-repo checkouts.

For detailed setup, see the [Reoclo documentation](https://docs.reoclo.com/guides/github-actions).

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api_key` | yes | - | Reoclo automation API key |
| `server_id` | yes | - | Target server ID |
| `repository` | no | Current repo | Repository to checkout (owner/repo) |
| `ref` | no | Current SHA | Branch, tag, or SHA to checkout |
| `path` | no | `/opt/deploy/workspace` | Directory on the server |
| `token` | no | `github.token` | Token for repository access |
| `clean` | no | `true` | `rm -rf` the target path (including `.git`) before fetching. Set `false` for incremental updates against an existing clone. |
| `depth` | no | `1` | Fetch depth for the requested ref (`0` = full history). Shallow fetches are SHA-targeted, so any ref on any branch resolves at `depth: 1`. |
| `fetch_tags` | no | `false` | Also fetch tags, even when `depth > 0`. |
| `filter` | no | _empty_ | Partial-clone filter applied to fetch (e.g. `blob:none`, `tree:0`). |
| `sparse_checkout` | no | _empty_ | Sparse checkout patterns, one per line. Empty = full working tree. |
| `sparse_checkout_cone_mode` | no | `true` | Use cone mode for sparse checkout. |
| `submodules` | no | `false` | Checkout submodules (true / false / recursive) |
| `lfs` | no | `false` | Download Git LFS objects after checkout. |
| `persist_credentials` | no | `true` | Keep the token in `.git/config`. Set `false` to scrub it after checkout. |
| `github_server_url` | no | `$GITHUB_SERVER_URL` or `https://github.com` | Base URL for GitHub (use your GHES URL for GitHub Enterprise Server). |

## Outputs

| Output | Description |
|--------|-------------|
| `commit_sha` | The checked-out commit SHA on the server (40 chars) |
| `commit` | Alias for `commit_sha` (matches `actions/checkout` naming) |
| `short_sha` | First 7 chars of the commit SHA (useful for Docker tags) |
| `ref` | The ref that was checked out |
| `path` | The path on the server where the repo was checked out |

## Examples

### Checkout a specific branch

```yaml
- uses: reoclo/checkout@v2
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    server_id: ${{ secrets.REOCLO_SERVER_ID }}
    ref: release/2026.1
```

### Checkout into a custom directory

```yaml
- uses: reoclo/checkout@v2
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    server_id: ${{ secrets.REOCLO_SERVER_ID }}
    path: /opt/myapp
```

### Checkout a different repository

```yaml
- uses: reoclo/checkout@v2
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    server_id: ${{ secrets.REOCLO_SERVER_ID }}
    repository: myorg/private-tools
    token: ${{ secrets.PRIVATE_TOOLS_TOKEN }}
    path: /opt/tools
```

### Incremental updates (skip clean)

```yaml
- uses: reoclo/checkout@v2
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    server_id: ${{ secrets.REOCLO_SERVER_ID }}
    clean: 'false'
    depth: 0
```

### Sparse checkout (monorepo subdirectory)

For large monorepos, fetch only the subtrees you need. Combine with `filter: blob:none` for a partial clone that downloads blobs on demand:

```yaml
- uses: reoclo/checkout@v2
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    server_id: ${{ secrets.REOCLO_SERVER_ID }}
    sparse_checkout: |
      services/api
      services/web
      packages/shared
    filter: blob:none
```

### Git LFS

```yaml
- uses: reoclo/checkout@v2
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    server_id: ${{ secrets.REOCLO_SERVER_ID }}
    lfs: 'true'
```

### GitHub Enterprise Server

Pass your GHES base URL — the action will derive the clone URL from it:

```yaml
- uses: reoclo/checkout@v2
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    server_id: ${{ secrets.REOCLO_SERVER_ID }}
    github_server_url: https://github.acme-corp.com
    token: ${{ secrets.GHES_PAT }}
```

### Scrub credentials after checkout

By default the action writes the token into `.git/config` so subsequent `git fetch` calls authenticate. For long-lived deploy paths where you don't want the token resident, scrub it:

```yaml
- uses: reoclo/checkout@v2
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    server_id: ${{ secrets.REOCLO_SERVER_ID }}
    persist_credentials: 'false'
```

### Full clone with submodules

```yaml
- uses: reoclo/checkout@v2
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    server_id: ${{ secrets.REOCLO_SERVER_ID }}
    depth: 0
    submodules: 'recursive'
```

### Full workflow: checkout, build, deploy

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: reoclo/checkout@v2
        with:
          api_key: ${{ secrets.REOCLO_API_KEY }}
          server_id: ${{ secrets.REOCLO_SERVER_ID }}

      - uses: reoclo/run@v2
        with:
          api_key: ${{ secrets.REOCLO_API_KEY }}
          server_id: ${{ secrets.REOCLO_SERVER_ID }}
          working_directory: /opt/deploy/workspace
          command: |
            docker compose build
            docker compose up -d
          timeout: 600
```

## How It Works

`v2` is a thin wrapper around the [`reoclo` CLI](https://github.com/reoclo/cli) (the same
engine that powers Gitea Actions and Woodpecker), so behaviour is identical across CI systems:

1. A composite step installs the pinned `reoclo` CLI (downloaded once per job; no Node runtime needed).
2. It runs `reoclo checkout <server_id> … --output json` with `REOCLO_AUTOMATION_KEY` from `api_key`,
   mapping each input to a flag.
3. The CLI calls the Reoclo automation API, which dispatches the git operation to the target
   server's runner agent: `git init` + `git fetch origin <ref> --depth <depth>` +
   `git checkout --detach FETCH_HEAD`. Fetching the requested ref directly means **any SHA on any
   branch** resolves at `depth: 1` — no "shallow clone is of the default branch, so non-default
   refs fail" trap. Sparse-checkout, partial-clone filter, submodules, and LFS are applied on the
   server as requested; the token is scrubbed from `.git/config` unless `persist_credentials: true`.
4. The resolved commit SHA / ref / path are mapped to this action's outputs.

`jq` (used to parse the CLI's JSON output) is preinstalled on GitHub-hosted and standard Gitea
`act_runner` images.

## Gitea Actions

The repo is mirrored to `git.boxpositron.dev/reoclo/checkout`, so the same action runs on a
self-hosted Gitea `act_runner`:

```yaml
- uses: git.boxpositron.dev/reoclo/checkout@v2
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    server_id: ${{ secrets.REOCLO_SERVER_ID }}
```

## License

MIT
