import { HttpClient } from "@actions/http-client";

const POLL_INTERVAL_MS = 5_000;

interface ExecRequest {
  server_id: string;
  command: string;
  working_directory?: string;
  env?: Record<string, string>;
  timeout_seconds: number;
  run_id?: string;
  run_context?: {
    provider: string;
    repository: string;
    workflow: string;
    trigger: string;
    actor: string;
    sha?: string;
    ref?: string;
  };
}

interface ExecResponse {
  operation_id: string;
  status: "completed" | "running" | "failed" | "timeout";
  exit_code?: number;
  stdout?: string;
  stderr?: string;
  duration_ms?: number;
}

interface OperationDetail {
  operation_id: string;
  status: "running" | "completed" | "failed" | "timeout";
  result?: {
    exit_code?: number;
    stdout?: string;
    stderr?: string;
    duration_ms?: number;
  };
}

export class ReocloClient {
  private http: HttpClient;
  private baseUrl: string;

  constructor(apiKey: string, apiUrl: string) {
    this.baseUrl = apiUrl.replace(/\/+$/, "");
    this.http = new HttpClient("reoclo-github-action-checkout", [], {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });
  }

  private async postExec(request: ExecRequest): Promise<ExecResponse> {
    const url = `${this.baseUrl}/api/automation/v1/exec`;
    const response = await this.http.postJson<ExecResponse>(url, request);
    if (response.statusCode !== 200) {
      throw new Error(
        `Reoclo API returned ${response.statusCode}: ${JSON.stringify(response.result)}`,
      );
    }
    if (!response.result) {
      throw new Error("Reoclo API returned empty response");
    }
    return response.result;
  }

  private async waitForCompletion(operationId: string): Promise<ExecResponse> {
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const url = `${this.baseUrl}/api/automation/v1/operations/${operationId}`;
      const response = await this.http.getJson<OperationDetail>(url);
      if (!response.result) {
        throw new Error("Reoclo API returned empty response");
      }
      const detail = response.result;
      if (detail.status !== "running") {
        return {
          operation_id: detail.operation_id,
          status: detail.status,
          exit_code: detail.result?.exit_code,
          stdout: detail.result?.stdout,
          stderr: detail.result?.stderr,
          duration_ms: detail.result?.duration_ms,
        };
      }
    }
  }

  async run(
    serverId: string,
    command: string,
    opts: { timeoutSeconds?: number; env?: Record<string, string>; cwd?: string } = {},
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const request: ExecRequest = {
      server_id: serverId,
      command,
      working_directory: opts.cwd,
      env: opts.env,
      timeout_seconds: opts.timeoutSeconds ?? 120,
      run_id: process.env["GITHUB_RUN_ID"],
      run_context: {
        provider: "github_actions",
        repository: process.env["GITHUB_REPOSITORY"] ?? "",
        workflow: process.env["GITHUB_WORKFLOW"] ?? "",
        trigger: process.env["GITHUB_EVENT_NAME"] ?? "",
        actor: process.env["GITHUB_ACTOR"] ?? "",
        sha: process.env["GITHUB_SHA"],
        ref: process.env["GITHUB_REF"],
      },
    };

    let response = await this.postExec(request);

    if (response.status === "running") {
      response = await this.waitForCompletion(response.operation_id);
    }

    const exitCode = response.exit_code ?? 1;
    const stdout = response.stdout ?? "";
    const stderr = response.stderr ?? "";

    if (exitCode !== 0) {
      throw new Error(
        `Command failed (exit ${exitCode}):\n${stderr || stdout}`,
      );
    }

    return { exitCode, stdout, stderr };
  }
}
