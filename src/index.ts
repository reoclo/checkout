import * as core from "@actions/core";
import { ReocloClient } from "./client.js";

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
    const submodules = core.getInput("submodules") || "false";
    const apiUrl = core.getInput("api_url") || "https://api.reoclo.com";

    if (!repository) {
      core.setFailed("repository is required (set input or run in a GitHub Actions context)");
      return;
    }

    const client = new ReocloClient(apiKey, apiUrl);
    const cloneUrl = token
      ? `https://x-access-token:${token}@github.com/${repository}.git`
      : `https://github.com/${repository}.git`;

    // Step 1: Clean if requested
    if (clean) {
      core.info(`Cleaning ${targetPath}...`);
      await client.run(serverId, `rm -rf "${targetPath}"`, { timeoutSeconds: 60 });
    }

    // Step 2: Clone or fetch
    const depthFlag = depth > 0 ? `--depth ${depth}` : "";
    const dirExists = await client.run(serverId, `test -d "${targetPath}/.git" && echo exists || echo missing`, { timeoutSeconds: 15 }).then(
      (r: { stdout: string }) => r.stdout.trim() === "exists",
    ).catch(() => false);

    if (dirExists && !clean) {
      // Incremental update
      core.info(`Fetching updates in ${targetPath}...`);
      const fetchCmd = [
        `cd "${targetPath}"`,
        // Update remote URL in case token changed
        `git remote set-url origin "${cloneUrl}"`,
        `git fetch origin ${depthFlag}`,
      ].join(" && ");
      await client.run(serverId, fetchCmd, { timeoutSeconds: 120 });
    } else {
      // Fresh clone
      core.info(`Cloning ${repository} into ${targetPath}...`);
      const cloneCmd = [
        `mkdir -p "$(dirname "${targetPath}")"`,
        `git clone ${depthFlag} "${cloneUrl}" "${targetPath}"`,
      ].join(" && ");
      await client.run(serverId, cloneCmd, { timeoutSeconds: 300 });
    }

    // Step 3: Checkout the ref
    if (ref) {
      core.info(`Checking out ${ref}...`);
      await client.run(serverId, `cd "${targetPath}" && git checkout --force "${ref}"`, { timeoutSeconds: 60 });
    }

    // Step 4: Submodules
    if (submodules === "true") {
      core.info("Initializing submodules...");
      await client.run(serverId, `cd "${targetPath}" && git submodule update --init`, { timeoutSeconds: 120 });
    } else if (submodules === "recursive") {
      core.info("Initializing submodules (recursive)...");
      await client.run(serverId, `cd "${targetPath}" && git submodule update --init --recursive`, { timeoutSeconds: 300 });
    }

    // Step 5: Get the resolved commit SHA
    const shaResult = await client.run(serverId, `cd "${targetPath}" && git rev-parse HEAD`, { timeoutSeconds: 15 });
    const commitSha = shaResult.stdout.trim();

    const refResult = await client.run(serverId, `cd "${targetPath}" && git rev-parse --abbrev-ref HEAD`, { timeoutSeconds: 15 });
    const checkedOutRef = refResult.stdout.trim();

    // Set outputs
    core.setOutput("commit_sha", commitSha);
    core.setOutput("ref", checkedOutRef);
    core.setOutput("path", targetPath);

    core.info(`Checked out ${repository}@${commitSha.slice(0, 8)} into ${targetPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(`Checkout failed: ${message}`);
  }
}

run();
