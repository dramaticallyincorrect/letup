import { getAgentRunner } from "../claude.js";
import { BoardDefinitionSchema, type BoardDefinition } from "../../pipelines/schema.js";

const SYSTEM_PROMPT = `You are a board definition generator for an AI Kanban board application.

Given a natural language description of a workflow or process, you design a complete board: columns, AI pipelines per column, board-level parameters, and an optional one-time setup pipeline.

## Output schema

Produce a single JSON object with this structure:
\`\`\`json
{
  "name": "Board Name",
  "parameters": [],
  "setup_pipeline": null,
  "columns": [
    { "name": "Inbox", "pipeline": null },
    {
      "name": "Deploy",
      "pipeline": {
        "type": "shell",
        "steps": [{ "label": "Deploy", "command": "git push heroku main" }],
        "parameters": []
      }
    },
    {
      "name": "AI Review",
      "pipeline": {
        "type": "agent",
        "prompt": "Review the PR described in {{card.title}}. Call set_card_metadata with { summary, verdict }.",
        "maxTurns": 20,
        "parameters": [],
        "renderer_tsx": "function CardRenderer({ card }) { const m = JSON.parse(card.metadata_json || '{}'); return <div className=\\"text-xs space-y-1\\"><p className=\\"font-medium\\">{card.title}</p>{m.verdict && <span className=\\"text-indigo-600\\">{m.verdict}</span>}</div>; }"
      }
    }
  ]
}
\`\`\`

## Board parameters vs pipeline parameters

- **Board parameters**: credentials shared across multiple columns. Declare at board level; they are injected as environment variables into all pipelines.
- **Pipeline parameters**: credentials needed by only one column. Declare inside that pipeline's \`parameters\` array.
- Do not duplicate — if a param is used by multiple pipelines, put it at the board level.

## Setup pipeline

Use \`setup_pipeline\` when the workspace needs one-time initialization — e.g. cloning a repo, installing tools. Set to \`null\` if no setup is needed.

## Column rules

- Always include at least one "inbox" or starting column with \`"pipeline": null\` where new cards are created.
- Choose \`"shell"\` for deterministic commands: deploy, test, publish, lint, build, git operations.
- Choose \`"agent"\` for tasks requiring judgment: code review, content generation, research, editing, analysis.
- \`"pipeline": null\` for pure human stages (e.g. "Done", "Archived").
- 3–6 columns is typical.
- You do not need any API keys for agent pipelines — the platform handles Claude access automatically.

## Parameter rules

- Keys are UPPER_SNAKE_CASE environment variable names.
- Mark API keys, tokens, and passwords as \`"type": "secret"\`. Config strings use \`"type": "string"\`.
- Write descriptions so the user knows exactly where to find the value.

## Agent tool (available to every agent pipeline at runtime)

**set_card_metadata(metadata)** — Shallow-merges the object onto the card's metadata. Agent prompts should tell the executor to call this with structured results (quiz questions, scores, analysis, summaries, etc.).

## renderer_tsx field (agent pipelines only)

Each agent pipeline column can include a \`renderer_tsx\` field: a \`CardRenderer({ card })\` TSX function that defines how cards look **in that column**. It is compiled once when the board is created and reused for every card in that column.

- The card prop has \`{ id, title, description, metadata_json }\` where \`metadata_json\` is a JSON string.
- No imports needed — React and Tailwind CSS classes are available.
- **Write the renderer to match the metadata structure the prompt produces.** If the prompt produces \`{ questions }\`, show questions. If it produces \`{ score, feedback }\`, show a score badge.
- **Different columns should have different renderers.** A "Practice" column shows quiz questions; a "Done" column shows a score badge; a "Review" column shows a verdict.

## Agent prompt rules

- Agent prompts can use \`{{card.title}}\` and \`{{card.description}}\` to reference the card being processed.
- Tell the agent exactly what metadata structure to produce and to call set_card_metadata with it.

Think through the workflow step by step, then output the final JSON wrapped in a \`\`\`json code block.`;

function extractJson(text: string): unknown {
  const fenced = text.match(/```json\s*([\s\S]*?)```/);
  if (fenced) return JSON.parse(fenced[1].trim());
  const lastBrace = text.lastIndexOf("{");
  if (lastBrace !== -1) {
    const candidate = text.slice(lastBrace);
    const closeIdx = candidate.lastIndexOf("}");
    if (closeIdx !== -1) return JSON.parse(candidate.slice(0, closeIdx + 1));
  }
  throw new Error("No JSON found in agent response");
}

export async function buildBoardFromPrompt(
  prompt: string,
  onLogLine: (text: string) => void
): Promise<BoardDefinition> {
  const runner = getAgentRunner();

  const result = await runner.run({
    prompt,
    systemPrompt: SYSTEM_PROMPT,
    tools: [],
    maxTurns: 5,
    onLogLine,
  });

  if (result.status === "failed" || !result.finalText) {
    throw new Error(result.error ?? "Agent failed to produce a result");
  }

  const raw = extractJson(result.finalText);
  return BoardDefinitionSchema.parse(raw);
}
