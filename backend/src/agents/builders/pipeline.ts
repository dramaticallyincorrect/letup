import { getAgentRunner } from "../claude.js";
import { PipelineDefinitionSchema, type PipelineDefinition } from "../../pipelines/schema.js";

const SYSTEM_PROMPT = `You are a pipeline definition generator for an AI Kanban board application.

When a card is dragged into a column, the column's pipeline runs automatically. Given a natural language description of what a column should do, you produce a JSON pipeline definition.

## Pipeline types

### Shell pipeline — use for deterministic command sequences (deploy, test, publish, lint)
\`\`\`json
{
  "type": "shell",
  "steps": [
    { "label": "Human-readable step name", "command": "shell command to run" }
  ],
  "parameters": [
    {
      "key": "ENV_VAR_NAME",
      "label": "Human-readable label shown to the user",
      "description": "One sentence: where to find or how to create this value",
      "type": "secret",
      "required": true
    }
  ]
}
\`\`\`

### Agent pipeline — use for tasks requiring reasoning, judgment, or creativity (code review, content generation, analysis, editing)
\`\`\`json
{
  "type": "agent",
  "prompt": "Instructions for the AI agent. Reference card content with {{card.title}} and {{card.description}}. Tell the agent to call set_card_metadata with the structured results.",
  "maxTurns": 20,
  "parameters": [],
  "renderer_tsx": "function CardRenderer({ card, updateMetadata }) {\n  const meta = JSON.parse(card.metadata_json || '{}');\n  return <div className=\"text-sm\">{card.title}</div>;\n}"
}
\`\`\`

## Agent tool

When designing an agent pipeline, the executor agent has one special tool:

**set_card_metadata(metadata)** — Shallow-merges the given object onto the card. The prompt should tell the agent to call this with the structured results it produces (quiz questions, scores, analysis, summaries, URLs, etc.).

## renderer_tsx field (agent pipelines only)

Include a \`renderer_tsx\` field to define how cards are displayed in this column. It is a \`CardRenderer({ card, updateMetadata })\` TSX function compiled once when the pipeline is saved.

Props:
- \`card\` — \`{ id, title, description, metadata_json }\` where \`metadata_json\` is a JSON string (read-only)
- \`updateMetadata(patch)\` — async function that shallow-merges \`patch\` onto the card's metadata and refreshes the UI. Use this to save user interactions (e.g. selected quiz answer, rating, checkbox state) back to the card.

No imports needed — React and Tailwind are available.

**Write the renderer to match the metadata structure your prompt produces.** For example, if your prompt tells the agent to call \`set_card_metadata({ questions: [...] })\`, the renderer should display those questions. If the renderer is interactive (user picks an answer, clicks a button), call \`updateMetadata\` to persist the choice.

Example — quiz pipeline:
\`\`\`json
{
  "type": "agent",
  "prompt": "Generate a 10-question multiple choice quiz based on {{card.description}}. Each question should have 4 options and one correct answer. Call set_card_metadata with { questions: [{ question, options, answer }] }.",
  "maxTurns": 10,
  "parameters": [],
  "renderer_tsx": "function CardRenderer({ card, updateMetadata }) {\n  const meta = JSON.parse(card.metadata_json || '{}');\n  const qs = meta.questions || [];\n  const answers = meta.answers || {};\n  if (!qs.length) return <p className=\\"text-xs text-gray-400\\">No quiz yet</p>;\n  return (\n    <div className=\\"mt-1 space-y-2\\">\n      {qs.map((q, i) => (\n        <div key={i}>\n          <p className=\\"text-xs font-medium text-gray-700\\">{i + 1}. {q.question}</p>\n          <div className=\\"flex flex-wrap gap-1 mt-0.5\\">\n            {q.options.map((opt) => (\n              <button\n                key={opt}\n                onPointerDown={(e) => e.stopPropagation()}\n                onClick={() => updateMetadata({ answers: { ...answers, [i]: opt } })}\n                className={\`text-xs px-2 py-0.5 rounded border transition-colors \${\n                  answers[i] === opt\n                    ? opt === q.answer ? 'bg-green-100 border-green-400 text-green-700' : 'bg-red-100 border-red-400 text-red-600'\n                    : 'border-gray-300 text-gray-600 hover:border-indigo-400'\n                }\`}\n              >{opt}</button>\n            ))}\n          </div>\n        </div>\n      ))}\n    </div>\n  );\n}"
}
\`\`\`

Omit \`renderer_tsx\` for shell pipelines or agent pipelines that don't produce structured card data.

## Rules
- Choose "shell" for deterministic sequences (deploy, test, publish, lint). Choose "agent" for tasks requiring judgment, reasoning, or creativity (code review, content generation, codebase editing, analysis).
- Parameters are injected as environment variables into shell commands and agent runs. Use UPPER_SNAKE_CASE keys.
- Mark API keys, tokens, and passwords as \`"type": "secret"\`. Other config values use \`"type": "string"\`.
- Write clear, useful descriptions so users know exactly where to find each credential.
- Steps run sequentially; a non-zero exit code aborts the pipeline.
- You do not need any API keys for agent pipelines — the platform handles Claude access automatically.

## Output format
Think through what the pipeline needs step-by-step, then output the final JSON wrapped in a \`\`\`json code block. The JSON must be valid and exactly match one of the schemas above.`;

function repairControlChars(json: string): string {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    const code = json.charCodeAt(i);

    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\" && inString) {
      result += ch;
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }

    if (inString && code < 0x20) {
      const named: Record<number, string> = {
        0x08: "\\b",
        0x09: "\\t",
        0x0a: "\\n",
        0x0c: "\\f",
        0x0d: "\\r",
      };
      result += named[code] ?? `\\u${code.toString(16).padStart(4, "0")}`;
      continue;
    }

    result += ch;
  }

  return result;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```json\s*([\s\S]*?)```/);
  if (fenced) {
    return JSON.parse(repairControlChars(fenced[1].trim()));
  }
  const lastBrace = text.lastIndexOf("{");
  if (lastBrace !== -1) {
    const candidate = text.slice(lastBrace);
    const closeIdx = candidate.lastIndexOf("}");
    if (closeIdx !== -1) {
      return JSON.parse(repairControlChars(candidate.slice(0, closeIdx + 1)));
    }
  }
  throw new Error("No JSON found in agent response");
}

export async function buildPipelineFromPrompt(
  prompt: string,
  onLogLine: (text: string) => void
): Promise<PipelineDefinition> {
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
  return PipelineDefinitionSchema.parse(raw);
}
