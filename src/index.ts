import * as core from "@actions/core";
import { ReocloClient } from "./client.js";

const TREE_READ_HINT = [
  "",
  "Hint: this usually means the requested ref is not reachable from the cloned tree.",
  "If you are deploying from a non-default branch, the action now fetches the requested",
  "ref directly, so this should not happen on @v1.0.2+. If it still does:",
  "  - Pass `ref: ${{ github.sha }}` explicitly, or",
  "  - Set `depth: 0` to fetch full history.",
].join("\n");

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

async function run(): Promise<void> {
  try {
    const apiKey = core.getInput("api_key", { required: true });
    const serverId = core.getInput("server_id", { required: true });
    const repository = core.getInput("repository") || process.env["GITHUB_REPOSITORY"] || "";
    const ref = core.getInput("ref") || process.env["GITHUB_SHA"] || "";
    const targetPath = core.getInput("path") || "/opt/deploy/workspace";
    const token = core.getInput("token") || process.env["GITHUB_TOKEN"] || "";
    const clean = core.getInput("clean") !== "false";
    const depth = parseInt(core.getInput("depth") || "1", 10);
    const fetchTags = core.getInput("fetch_tags") === "true";
    const filter = core.getInput("filter") || "";
    const sparseCheckout = (core.getInput("sparse_checkout") || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const sparseConeMode = core.getInput("sparse_checkout_cone_mode") !== "false";
    const submodules = core.getInput("submodules") || "false";
    const lfs = core.getInput("lfs") === "true";
    const persistCredentials = core.getInput("persist_credentials") !== "false";
    const githubServerUrl = (
      core.getInput("github_server_url") ||
      process.env["GITHUB_SERVER_URL"] ||
      "https://github.com"
    ).replace(/\/+$/, "");
    const apiUrl = core.getInput("api_url") || "https://api.reoclo.com";

    if (!repository) {
      core.setFailed("repository is required (set input or run in a GitHub Actions context)");
      return;
    }

    const client = new ReocloClient(apiKey, apiUrl);
    const bareRepoUrl = `${githubServerUrl}/${repository}.git`;
    const authedRepoUrl = token
      ? bareRepoUrl.replace(/^(https?:\/\/)/, `$1x-access-token:${token}@`)
      : bareRepoUrl;

    // Step 1: Clean if requested. `clean: true` removes the entire target path
    // (including `.git`) so the next step starts from a known-empty state.
    if (clean) {
      core.info(`Cleaning ${targetPath}...`);
      await client.run(serverId, `rm -rf "${targetPath}"`, { timeoutSeconds: 60 });
    }

    // Step 2: Initialize repo state (or reuse existing one for incremental updates).
    const dirExists = await client.run(
      serverId,
      `test -d "${targetPath}/.git" && echo exists || echo missing`,
      { timeoutSeconds: 15 },
    ).then((r: { stdout: string }) => r.stdout.trim() === "exists").catch(() => false);

    if (!dirExists) {
      core.info(`Initializing ${targetPath}...`);
      const initCmd = [
        `mkdir -p "${targetPath}"`,
        `cd "${targetPath}"`,
        `git init -q`,
        `git remote add origin "${authedRepoUrl}"`,
      ].join(" && ");
      await client.run(serverId, initCmd, { timeoutSeconds: 60 });
    } else {
      // Update remote URL in case token rotated between runs.
      await client.run(
        serverId,
        `cd "${targetPath}" && git remote set-url origin "${authedRepoUrl}"`,
        { timeoutSeconds: 30 },
      );
    }

    // Step 3: Configure sparse checkout before fetching so unwanted blobs are
    // skipped when paired with a filter.
    if (sparseCheckout.length > 0) {
      core.info(`Configuring sparse checkout (${sparseCheckout.length} patterns, ${sparseConeMode ? "cone" : "no-cone"})...`);
      const coneFlag = sparseConeMode ? "--cone" : "--no-cone";
      const patternsArg = sparseCheckout.map(shellQuote).join(" ");
      const sparseCmd = [
        `cd "${targetPath}"`,
        `git sparse-checkout init ${coneFlag}`,
        `git sparse-checkout set ${patternsArg}`,
      ].join(" && ");
      await client.run(serverId, sparseCmd, { timeoutSeconds: 60 });
    }

    // Step 4: Fetch the requested ref directly. This is what makes any SHA on
    // any branch resolvable, even with a shallow `--depth 1` fetch.
    const fetchTarget = ref || "HEAD";
    const fetchFlags = [
      depth > 0 ? `--depth ${depth}` : "",
      fetchTags ? "--tags" : "--no-tags",
      filter ? `--filter=${shellQuote(filter)}` : "",
      "--force",
    ].filter(Boolean).join(" ");
    core.info(`Fetching ${fetchTarget}...`);
    const fetchCmd = `cd "${targetPath}" && git fetch ${fetchFlags} origin ${shellQuote(fetchTarget)}`;
    try {
      await client.run(serverId, fetchCmd, { timeoutSeconds: 300 });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to fetch ${fetchTarget} from origin:\n${message}\n` +
          "Hint: confirm the ref exists and the token has read access to the repository.",
      );
    }

    // Step 5: Detached checkout of the fetched commit.
    core.info(`Checking out ${fetchTarget}...`);
    try {
      await client.run(
        serverId,
        `cd "${targetPath}" && git checkout --force --detach FETCH_HEAD`,
        { timeoutSeconds: 60 },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/unable to read tree/i.test(message)) {
        throw new Error(`Checkout failed: ${message}${TREE_READ_HINT}`);
      }
      throw err;
    }

    // Step 6: Submodules
    if (submodules === "true") {
      core.info("Initializing submodules...");
      await client.run(
        serverId,
        `cd "${targetPath}" && git submodule update --init`,
        { timeoutSeconds: 120 },
      );
    } else if (submodules === "recursive") {
      core.info("Initializing submodules (recursive)...");
      await client.run(
        serverId,
        `cd "${targetPath}" && git submodule update --init --recursive`,
        { timeoutSeconds: 300 },
      );
    }

    // Step 7: Git LFS. Skips silently if LFS objects are absent.
    if (lfs) {
      core.info("Downloading Git LFS objects...");
      const lfsCmd = [
        `cd "${targetPath}"`,
        `git lfs install --local`,
        `git lfs pull`,
      ].join(" && ");
      await client.run(serverId, lfsCmd, { timeoutSeconds: 600 });
    }

    // Step 8: Scrub credentials if requested. Replaces the authed origin URL
    // with the bare URL so subsequent on-server git operations don't reveal
    // the token via `git remote -v` or `.git/config`.
    if (!persistCredentials && token) {
      core.info("Scrubbing credentials from .git/config (persist_credentials=false)...");
      await client.run(
        serverId,
        `cd "${targetPath}" && git remote set-url origin "${bareRepoUrl}"`,
        { timeoutSeconds: 30 },
      );
    }

    // Step 9: Resolve outputs.
    const shaResult = await client.run(
      serverId,
      `cd "${targetPath}" && git rev-parse HEAD`,
      { timeoutSeconds: 15 },
    );
    const commitSha = shaResult.stdout.trim();

    core.setOutput("commit_sha", commitSha);
    core.setOutput("commit", commitSha);
    core.setOutput("short_sha", commitSha.slice(0, 7));
    core.setOutput("ref", ref || commitSha);
    core.setOutput("path", targetPath);

    core.info(`Checked out ${repository}@${commitSha.slice(0, 8)} into ${targetPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(`Checkout failed: ${message}`);
  }
}

run();
