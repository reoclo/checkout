export declare class ReocloClient {
    private http;
    private baseUrl;
    constructor(apiKey: string, apiUrl: string);
    private postExec;
    private waitForCompletion;
    run(serverId: string, command: string, opts?: {
        timeoutSeconds?: number;
        env?: Record<string, string>;
        cwd?: string;
    }): Promise<{
        exitCode: number;
        stdout: string;
        stderr: string;
    }>;
}
