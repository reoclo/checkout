# Reoclo Checkout (`@reoclo/checkout`)

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
| `clean` | no | `true` | Remove target directory before cloning |
| `depth` | no | `1` | Clone depth (0 for full clone) |
| `submodules` | no | `false` | Checkout submodules (true / false / recursive) |

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
    ref: release/2026.1
```

### Checkout into a custom directory

```yaml
- uses: reoclo/checkout@v1
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    server_id: ${{ secrets.REOCLO_SERVER_ID }}
    path: /opt/myapp
```

### Checkout a different repository

```yaml
- uses: reoclo/checkout@v1
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    server_id: ${{ secrets.REOCLO_SERVER_ID }}
    repository: myorg/private-tools
    token: ${{ secrets.PRIVATE_TOOLS_TOKEN }}
    path: /opt/tools
```

### Incremental updates (skip clean)

```yaml
- uses: reoclo/checkout@v1
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    server_id: ${{ secrets.REOCLO_SERVER_ID }}
    clean: 'false'
    depth: 0
```

### Full clone with submodules

```yaml
- uses: reoclo/checkout@v1
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
      - uses: reoclo/checkout@v1
        with:
          api_key: ${{ secrets.REOCLO_API_KEY }}
          server_id: ${{ secrets.REOCLO_SERVER_ID }}

      - uses: reoclo/run@v1
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

1. The action posts to `POST /api/automation/v1/checkout` with the repository, ref, target path, and token.
2. The Reoclo API authenticates the key, checks scopes, and dispatches a `git clone` or `git fetch` to the target server's runner agent.
3. The runner executes the clone or update locally on the server.
4. The API returns the resolved commit SHA and operation ID for audit.

## License

MIT
