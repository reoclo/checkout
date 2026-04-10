# Reoclo Checkout (`@reoclo/checkout`)

Clone or update a repository on a [Reoclo](https://reoclo.com)-managed server from GitHub Actions.

Works like `actions/checkout`, but the code ends up on your remote server instead of the GitHub runner. Pairs with [`@reoclo/run`](https://github.com/reoclo/run) for build and deploy steps.

## Quick Start

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout on server
        uses: reoclo/checkout@v1
        with:
          api_key: ${{ secrets.REOCLO_API_KEY }}
          server_id: ${{ secrets.REOCLO_SERVER_ID }}
          token: ${{ github.token }}

      - name: Build and deploy
        uses: reoclo/run@v1
        with:
          api_key: ${{ secrets.REOCLO_API_KEY }}
          server_id: ${{ secrets.REOCLO_SERVER_ID }}
          working_directory: /opt/deploy/workspace
          command: |
            docker compose build && docker compose up -d
          timeout: 600
```

## Setup

1. **Create an Automation API key** in the Reoclo dashboard: **Settings > Automation Keys > Create Key**
2. Add `REOCLO_API_KEY` and `REOCLO_SERVER_ID` as GitHub Actions secrets
3. The action uses `github.token` by default for repository access - no extra token setup needed for same-repo checkouts

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
| `clean` | no | `true` | Remove target directory before cloning |
| `depth` | no | `1` | Clone depth (0 for full clone) |
| `submodules` | no | `false` | Checkout submodules (true/false/recursive) |
| `api_url` | no | `https://api.reoclo.com` | Reoclo API URL (for self-hosted) |

## Outputs

| Output | Description |
|--------|-------------|
| `commit_sha` | The checked-out commit SHA on the server |
| `ref` | The ref that was checked out |
| `path` | The path on the server where the repo was checked out |

## Examples

### Checkout a specific branch

```yaml
- uses: reoclo/checkout@v1
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    server_id: ${{ secrets.REOCLO_SERVER_ID }}
    ref: develop
    token: ${{ github.token }}
```

### Checkout into a custom directory

```yaml
- uses: reoclo/checkout@v1
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    server_id: ${{ secrets.REOCLO_SERVER_ID }}
    path: /opt/myapp/src
    token: ${{ github.token }}
```

### Checkout a different repository

```yaml
- uses: reoclo/checkout@v1
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    server_id: ${{ secrets.REOCLO_SERVER_ID }}
    repository: myorg/shared-config
    token: ${{ secrets.CROSS_REPO_TOKEN }}
```

### Incremental updates (skip clean)

```yaml
- uses: reoclo/checkout@v1
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    server_id: ${{ secrets.REOCLO_SERVER_ID }}
    clean: false
    token: ${{ github.token }}
```

If the repo already exists at the target path, the action will `git fetch` and checkout the ref instead of re-cloning.

### Full clone with submodules

```yaml
- uses: reoclo/checkout@v1
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    server_id: ${{ secrets.REOCLO_SERVER_ID }}
    depth: 0
    submodules: recursive
    token: ${{ github.token }}
```

### Full workflow: checkout, build, deploy

```yaml
name: Deploy to Production
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Fetch secrets
        uses: bitwarden/sm-action@v2
        with:
          access_token: ${{ secrets.BW_ACCESS_TOKEN }}
          secrets: |
            abc123 > DB_URL

      - name: Checkout code on server
        uses: reoclo/checkout@v1
        with:
          api_key: ${{ secrets.REOCLO_API_KEY }}
          server_id: ${{ secrets.REOCLO_SERVER_ID }}
          token: ${{ github.token }}

      - name: Build
        uses: reoclo/run@v1
        with:
          api_key: ${{ secrets.REOCLO_API_KEY }}
          server_id: ${{ secrets.REOCLO_SERVER_ID }}
          working_directory: /opt/deploy/workspace
          command: docker build -t myapp:latest .
          timeout: 600

      - name: Deploy
        uses: reoclo/run@v1
        with:
          api_key: ${{ secrets.REOCLO_API_KEY }}
          server_id: ${{ secrets.REOCLO_SERVER_ID }}
          working_directory: /opt/deploy/workspace
          command: docker compose up -d
          env: |
            DB_URL=${{ env.DB_URL }}
          timeout: 300
```

## How It Works

1. If `clean` is true, removes the target directory on the server
2. Clones the repository using the provided token (or fetches if the repo exists and `clean` is false)
3. Checks out the specified ref (branch, tag, or SHA)
4. Initializes submodules if requested
5. Returns the resolved commit SHA as an output

All git operations run on the server via Reoclo's automation API and are fully audited.

## License

MIT
