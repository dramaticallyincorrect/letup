import Anthropic from '@anthropic-ai/sdk'
import { sql } from 'drizzle-orm'
import type { DB } from './db'
import { aiUsageLogs } from './db/schema'

// Micro-units per token by model, anchored to real Anthropic pricing.
// Scale: 1 USD = 12,500,000 micro-units (haiku 4.5 input $1/MTok → 12.5 mu/token).
// Unknown models fall back to haiku (cheapest) so new models never go untracked.
export const MU_PER_USD = 12_500_000
// Display unit: 1 credit = $0.10 of real API cost.
// Pro allocation of 100 credits = $10 cost; sold at $15 = $5 worst-case margin.
export const MU_PER_CREDIT = 1_250_000
export function microUnitsToCredits(microUnits: bigint | number | string): number {
  return Math.floor(Number(microUnits) / MU_PER_CREDIT)
}

const MODEL_RATES: Record<string, { input: number; output: number; cacheCreation: number; cacheRead: number }> = {
  'claude-haiku-4-5':    { input: 12.5,  output: 62.5, cacheCreation: 15.625, cacheRead: 1.25    },
  'claude-sonnet-4-6':   { input: 37.5,  output: 187.5,cacheCreation: 46.875, cacheRead: 3.75    },
  'claude-opus-4-7':     { input: 62.5,  output: 312.5,cacheCreation: 78.125, cacheRead: 6.25    },
  'deepseek-v4-flash':   { input: 1.75,  output: 3.5,  cacheCreation: 1.75,   cacheRead: 0.035   },
  'deepseek-v4-pro':     { input: 21.75, output: 43.5, cacheCreation: 21.75,  cacheRead: 0.18125 },
}

const HAIKU_RATES = MODEL_RATES['claude-haiku-4-5']

const DEEPSEEK_PROMO_END = Date.parse('2026-05-31T23:59:59Z')

function deepseekDiscount(model: string, now: number): number {
  if (!model.startsWith('deepseek-v4')) return 1
  return now <= DEEPSEEK_PROMO_END ? 0.5 : 1
}

function getRates(model: string) {
  // Match by prefix so versioned model IDs (e.g. claude-haiku-4-5-20251001) still resolve.
  for (const [key, rates] of Object.entries(MODEL_RATES)) {
    if (model.startsWith(key)) return rates
  }
  return HAIKU_RATES
}

export function tokensToMicroUnits(usage: Anthropic.Usage, model: string, now: number = Date.now()): bigint {
  const r = getRates(model)
  const raw =
    (usage.input_tokens ?? 0) * r.input +
    (usage.output_tokens ?? 0) * r.output +
    ((usage as any).cache_creation_input_tokens ?? 0) * r.cacheCreation +
    ((usage as any).cache_read_input_tokens ?? 0) * r.cacheRead
  return BigInt(Math.round(raw * deepseekDiscount(model, now)))
}

export class InsufficientCreditsError extends Error {
  constructor() {
    super('Insufficient credits')
    this.name = 'InsufficientCreditsError'
  }
}

// Atomically deducts microUnits from the user's balance.
// Throws InsufficientCreditsError if balance < microUnits or no row exists.
export async function checkAndDeductCredits(db: DB, userId: string, microUnits: bigint): Promise<bigint> {
  if (microUnits <= 0n) {
    const row = await db.execute(sql`SELECT balance FROM user_credits WHERE user_id = ${userId}`)
    return BigInt((row[0]?.balance as string | number | bigint | undefined) ?? 0)
  }
  const result = await db.execute(sql`
    UPDATE user_credits
    SET balance = balance - ${microUnits}, updated_at = now()
    WHERE user_id = ${userId} AND balance >= ${microUnits}
    RETURNING balance
  `)
  if (result.length === 0) {
    throw new InsufficientCreditsError()
  }
  return BigInt(result[0].balance as string | number | bigint)
}

// Returns true if the user has any credit balance > 0.
export async function hasCredits(db: DB, userId: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT balance FROM user_credits WHERE user_id = ${userId} AND balance > 0 LIMIT 1
  `)
  return result.length > 0
}

export async function logUsage(
  db: DB,
  userId: string,
  source: string,
  model: string,
  usage: Anthropic.Usage,
  microUnitsUsed: bigint,
  appVersionId?: string,
  userMessage?: string,
  buildSessionId?: string,
  durationSeconds?: number,
): Promise<void> {
  await db.insert(aiUsageLogs).values({
    userId,
    source,
    model,
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheCreationTokens: (usage as any).cache_creation_input_tokens ?? 0,
    cacheReadTokens: (usage as any).cache_read_input_tokens ?? 0,
    microUnitsUsed,
    appVersionId: appVersionId ?? null,
    userMessage: userMessage ?? null,
    buildSessionId: buildSessionId ?? null,
    durationSeconds: durationSeconds ?? null,
  })
}
