import Anthropic from "@anthropic-ai/sdk";
import { spawn } from "node:child_process";
import type { AgentRunner, AgentRunnerOptions, AgentRunResult, CustomTool } from "./runner.js";

const BASH_TOOL: Anthropic.Tool = {
  name: "bash",
  description:
    "Run a shell command in the board workspace. Use for reading/writing files, running programs, installing packages, etc. stdout and stderr are combined in the output.",
  input_schema: {
    type: "object" as const,
    properties: {
      command: { type: "string", description: "Shell command to execute" },
    },
    required: ["command"],
  },
};

async function execBash(
  command: string,
  cwd?: string,
  env?: Record<string, string>
): Promise<string> {
  return new Promise((resolve) => {
    let output = "";
    const child = spawn("sh", ["-c", command], {
      cwd: cwd ?? process.cwd(),
      env: { ...process.env, ...env },
    });
    child.stdout.on("data", (d: Buffer) => {
      output += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      output += d.toString();
    });
    const timer = setTimeout(() => {
      child.kill();
      resolve((output || "") + "\n[timed out after 30s]");
    }, 30_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (!output) output = "(no output)";
      if (code !== 0) output += `\n[exit ${code}]`;
      resolve(output);
    });
  });
}

function buildToolList(opts: AgentRunnerOptions): { tools: Anthropic.Tool[]; customByName: Map<string, CustomTool> } {
  const tools: Anthropic.Tool[] = opts.tools.includes("bash") ? [BASH_TOOL] : [];
  const customByName = new Map<string, CustomTool>();

  for (const ct of opts.customTools ?? []) {
    tools.push({
      name: ct.definition.name,
      description: ct.definition.description,
      input_schema: ct.definition.input_schema as Anthropic.Tool["input_schema"],
    });
    customByName.set(ct.definition.name, ct);
  }

  return { tools, customByName };
}

export class ClaudeAgentRunner implements AgentRunner {
  private client: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY || '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';
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable is not set");
    this.client = new Anthropic({ apiKey });
  }

  async run(opts: AgentRunnerOptions): Promise<AgentRunResult> {
    const { tools, customByName } = buildToolList(opts);

    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: opts.prompt },
    ];

    let turns = 0;
    let finalText = "";

    while (turns < opts.maxTurns) {
      turns++;

      const stream = this.client.messages.stream({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system: opts.systemPrompt,
        messages,
        tools: tools.length > 0 ? tools : undefined,
      });

      let currentText = "";
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          currentText += event.delta.text;
          opts.onLogLine(event.delta.text);
        }
      }

      const finalMessage = await stream.finalMessage();

      if (finalMessage.stop_reason === "end_turn") {
        finalText = currentText;
        break;
      }

      if (finalMessage.stop_reason === "tool_use") {
        const toolUseBlocks = finalMessage.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
        );

        messages.push({ role: "assistant", content: finalMessage.content });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of toolUseBlocks) {
          let content: string;
          if (block.name === "bash" && opts.tools.includes("bash")) {
            const { command } = block.input as { command: string };
            opts.onLogLine(`\n$ ${command}\n`);
            content = await execBash(command, opts.cwd, opts.env);
            opts.onLogLine(content + "\n");
          } else if (customByName.has(block.name)) {
            const ct = customByName.get(block.name)!;
            opts.onLogLine(`\n[tool: ${block.name}]\n`);
            try {
              content = await ct.handler(block.input);
              opts.onLogLine(content + "\n");
            } catch (err) {
              content = `Error: ${String(err)}`;
              opts.onLogLine(content + "\n");
            }
          } else {
            content = `Tool "${block.name}" is not available.`;
          }
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content,
          });
        }

        messages.push({ role: "user", content: toolResults });
        continue;
      }

      // Any other stop reason — treat as complete
      finalText = currentText;
      break;
    }

    return { status: "success", finalText };
  }
}

let _runner: ClaudeAgentRunner | null = null;

export function getAgentRunner(): AgentRunner {
  if (!_runner) _runner = new ClaudeAgentRunner();
  return _runner;
}
