import { z } from "zod";

export const ParameterSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().default(""),
  type: z.enum(["string", "secret"]),
  required: z.boolean().default(true),
});

const ShellStep = z.object({
  label: z.string().min(1),
  command: z.string().min(1),
});

export const ShellPipelineSchema = z.object({
  type: z.literal("shell"),
  steps: z.array(ShellStep).min(1),
  parameters: z.array(ParameterSchema).default([]),
});

export const AgentPipelineSchema = z.object({
  type: z.literal("agent"),
  prompt: z.string().min(1),
  maxTurns: z.number().int().positive().default(20),
  parameters: z.array(ParameterSchema).default([]),
});

export const PipelineDefinitionSchema = z.discriminatedUnion("type", [
  ShellPipelineSchema,
  AgentPipelineSchema,
]);

export type PipelineDefinition = z.infer<typeof PipelineDefinitionSchema>;
export type ShellPipeline = z.infer<typeof ShellPipelineSchema>;
export type AgentPipeline = z.infer<typeof AgentPipelineSchema>;
