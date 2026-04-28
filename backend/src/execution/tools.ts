import { getDb } from "../db/client.js";
import type { CustomTool } from "../agents/runner.js";

export function createCardTools(cardId: string): CustomTool[] {
  const db = getDb();

  const setCardMetadata: CustomTool = {
    definition: {
      name: "set_card_metadata",
      description:
        "Shallow-merge structured data onto the current card. Use this to save results produced by your run — quiz questions, analysis, scores, summaries, etc. The data will be displayed on the card.",
      input_schema: {
        type: "object",
        properties: {
          metadata: {
            type: "object",
            description: "Key-value pairs to merge into the card's metadata",
          },
        },
        required: ["metadata"],
      },
    },
    handler: async (input) => {
      const { metadata } = input as { metadata: Record<string, unknown> };
      const card = db
        .prepare("SELECT metadata_json FROM cards WHERE id = ?")
        .get(cardId) as { metadata_json: string } | undefined;
      if (!card) return "Card not found.";

      const existing = (() => {
        try {
          return JSON.parse(card.metadata_json || "{}") as Record<string, unknown>;
        } catch {
          return {} as Record<string, unknown>;
        }
      })();

      db.prepare("UPDATE cards SET metadata_json = ? WHERE id = ?").run(
        JSON.stringify({ ...existing, ...metadata }),
        cardId
      );
      return "Metadata updated.";
    },
  };

  return [setCardMetadata];
}
