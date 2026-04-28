export type AgentTool = "web_search" | "bash";

export interface CustomTool {
  definition: {
    name: string;
    description: string;
    input_schema: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
  handler: (input: unknown) => Promise<string>;
}

export interface AgentRunnerOptions {
  prompt: string;
  systemPrompt: string;
  tools: AgentTool[];
  customTools?: CustomTool[];
  cwd?: string;
  env?: Record<string, string>;
  maxTurns: number;
  onLogLine: (text: string) => void;
}

export interface AgentRunResult {
  status: "success" | "failed";
  finalText?: string;
  error?: string;
}

export interface AgentRunner {
  run(opts: AgentRunnerOptions): Promise<AgentRunResult>;
}
