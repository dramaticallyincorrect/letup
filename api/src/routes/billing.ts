import { FastifyPluginAsync } from 'fastify'
import { eq, sql } from 'drizzle-orm'
import { Paddle, Environment, EventName } from '@paddle/paddle-node-sdk'
import { Fastify } from '../fastify_type'
import { userSubscriptions, userCredits } from '../db/schema'
import { microUnitsToCredits } from '../credits'

const MONTHLY_CREDITS = 125_000_000n   // 100 credits  × 1,250,000 mu/credit
const ANNUAL_CREDITS  = 1_500_000_000n // 1200 credits × 1,250,000 mu/credit
const FREE_CREDITS    = 18_750_000n    // 15 credits   × 1,250,000 mu/credit

const ANNUAL_PRICE_ID = process.env.ANNUAL_PREMIUM_PRICE_ID ?? ''

const paddle = new Paddle(process.env.PADDLE_API_KEY!, {
  environment: process.env.PADDLE_ENVIRONMENT === 'production'
    ? Environment.production
    : Environment.sandbox,
})

const billingPlugin: FastifyPluginAsync = async (fastify) => {
  getBillingStatus(fastify as Fastify)
  getBillingPrices(fastify as Fastify)
  getBillingPortal(fastify as Fastify)
  void fastify.register(webhookPlugin)
}

function getBillingStatus(fastify: Fastify) {
  fastify.get('/billing/status', async (request, reply) => {
    const userId = request.assertAuthenticated()

    const [subscription] = await fastify.db
      .select()
      .from(userSubscriptions)
      .where(eq(userSubscriptions.userId, userId))

    const creditResult = await fastify.db.execute(sql`
      SELECT balance FROM user_credits WHERE user_id = ${userId}
    `)

    const microUnitsBalance = creditResult.length > 0 ? String(creditResult[0].balance) : '0'
    const credits = microUnitsToCredits(microUnitsBalance)

    return reply.send({
      plan: subscription?.plan ?? 'free',
      status: subscription?.status ?? 'active',
      currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
      credits,
      microUnitsBalance,
      billingCycle: subscription?.billingCycle ?? 'monthly',
    })
  })
}

// Currencies Paddle treats as zero-decimal (amount already in major units)
const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA',
  'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
])

function minorToMajor(minorUnits: string, currencyCode: string): number {
  const value = parseFloat(minorUnits)
  return ZERO_DECIMAL_CURRENCIES.has(currencyCode.toUpperCase()) ? value : value / 100
}

function getBillingPrices(fastify: Fastify) {
  fastify.get('/billing/prices', async (request, reply) => {
    const monthlyPriceId = process.env.MONTHLY_PREMIUM_PRICE
    const annualPriceId = process.env.ANNUAL_PREMIUM_PRICE_ID

    const items: { priceId: string; quantity: number }[] = []
    if (monthlyPriceId) items.push({ priceId: monthlyPriceId, quantity: 1 })
    if (annualPriceId) items.push({ priceId: annualPriceId, quantity: 1 })

    if (items.length === 0) {
      return reply.send({ monthly: null, annual: null, currencyCode: 'USD' })
    }

    const preview = await paddle.pricingPreview.preview({
      items,
      customerIpAddress: request.ip ?? null,
    })

    const currency = preview.currencyCode as string
    const locale = (request.headers['accept-language'] ?? 'en-US').split(',')[0]
    const byPriceId = new Map(
      preview.details.lineItems.map(item => [item.price.id, item]),
    )

    const monthlyItem = monthlyPriceId ? byPriceId.get(monthlyPriceId) : undefined
    const annualItem = annualPriceId ? byPriceId.get(annualPriceId) : undefined

    const annualMinor = annualItem ? parseFloat(annualItem.totals.total) : null
    const monthlyMinor = monthlyItem ? parseFloat(monthlyItem.totals.total) : null

    // Compute annual/12 in major units and format matching the user's locale
    const decimals = ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 0 : 2
    const annualMonthlyFormatted = annualMinor !== null
      ? new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(annualMinor / (decimals === 0 ? 1 : 100) / 12)
      : null

    return reply.send({
      currencyCode: currency,
      monthly: monthlyMinor !== null
        ? {
          total: String(minorToMajor(String(monthlyMinor), currency)),
          formatted: monthlyItem!.formattedTotals.total,
        }
        : null,
      annual: annualMinor !== null
        ? {
          total: String(minorToMajor(String(annualMinor), currency)),
          formatted: annualItem!.formattedTotals.total,
          monthlyFormatted: annualMonthlyFormatted,
        }
        : null,
    })
  })
}

function getBillingPortal(fastify: Fastify) {
  fastify.get('/billing/portal', async (request, reply) => {
    const userId = request.assertAuthenticated()

    const [subscription] = await fastify.db
      .select()
      .from(userSubscriptions)
      .where(eq(userSubscriptions.userId, userId))

    if (!subscription?.paddleCustomerId) {
      return reply.status(404).send({ error: 'No active subscription' })
    }

    const subscriptionIds = subscription.paddleSubscriptionId
      ? [subscription.paddleSubscriptionId]
      : []

    const session = await paddle.customerPortalSessions.create(
      subscription.paddleCustomerId,
      subscriptionIds,
    )

    return reply.send({ url: session.urls.general.overview })
  })
}

// Scoped plugin so the content-type parser override only affects the webhook route
const webhookPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    ;(_req as any).rawBody = body
    try {
      done(null, JSON.parse(body as string))
    } catch (e) {
      done(e as Error, undefined)
    }
  })

  fastify.post('/billing/webhook', async (request, reply) => {
    const signature = request.headers['paddle-signature'] as string
    const rawBody = (request as any).rawBody as string
    const secret = process.env.PADDLE_WEBHOOK_SECRET!

    let event
    try {
      event = await paddle.webhooks.unmarshal(rawBody, secret, signature)
    } catch {
      request.log.warn('Invalid Paddle webhook signature')
      return reply.status(400).send({ error: 'invalid signature' })
    }

    await handleWebhookEvent(fastify as Fastify, event)
    return reply.send({ ok: true })
  })
}

async function handleWebhookEvent(fastify: Fastify, event: { eventType: string; data: any }) {
  const { eventType, data } = event
  const userId: string | undefined = data.customData?.userId

  if (eventType === EventName.SubscriptionCreated) {
    if (!userId) return

    const priceId: string | undefined = data.items?.[0]?.price?.id
    const billingCycle = priceId && ANNUAL_PRICE_ID && priceId === ANNUAL_PRICE_ID ? 'annual' : 'monthly'

    const now = new Date()
    const creditsToAllocate = billingCycle === 'annual' ? ANNUAL_CREDITS : MONTHLY_CREDITS

    await Promise.all([
      fastify.db
        .insert(userSubscriptions)
        .values({
          userId,
          plan: 'pro',
          status: 'active',
          paddleCustomerId: data.customerId,
          paddleSubscriptionId: data.id,
          billingCycle,
          nextCreditRefillAt: null,
          currentPeriodEnd: data.currentBillingPeriod?.endsAt
            ? new Date(data.currentBillingPeriod.endsAt)
            : null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: userSubscriptions.userId,
          set: {
            plan: 'pro',
            status: 'active',
            paddleCustomerId: data.customerId,
            paddleSubscriptionId: data.id,
            billingCycle,
            nextCreditRefillAt: null,
            currentPeriodEnd: data.currentBillingPeriod?.endsAt
              ? new Date(data.currentBillingPeriod.endsAt)
              : null,
            updatedAt: now,
          },
        }),
      fastify.db
        .insert(userCredits)
        .values({ userId, balance: creditsToAllocate, updatedAt: now })
        .onConflictDoUpdate({
          target: userCredits.userId,
          set: { balance: creditsToAllocate, updatedAt: now },
        }),
    ])
  }

  if (eventType === EventName.SubscriptionUpdated) {
    if (!userId) return

    const [existing] = await fastify.db
      .select({ billingCycle: userSubscriptions.billingCycle })
      .from(userSubscriptions)
      .where(eq(userSubscriptions.userId, userId))

    await fastify.db
      .update(userSubscriptions)
      .set({
        status: data.status,
        currentPeriodEnd: data.currentBillingPeriod?.endsAt
          ? new Date(data.currentBillingPeriod.endsAt)
          : null,
        updatedAt: new Date(),
      })
      .where(eq(userSubscriptions.userId, userId))

    if (data.status === 'active') {
      const credits = existing?.billingCycle === 'annual' ? ANNUAL_CREDITS : MONTHLY_CREDITS
      await fastify.db
        .insert(userCredits)
        .values({ userId, balance: credits, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: userCredits.userId,
          set: { balance: credits, updatedAt: new Date() },
        })
    }
  }

  if (eventType === EventName.SubscriptionCanceled) {
    if (!userId) return

    await fastify.db
      .update(userSubscriptions)
      .set({ plan: 'free', status: 'canceled', updatedAt: new Date() })
      .where(eq(userSubscriptions.userId, userId))

    // Cap credits at free tier on cancellation
    await fastify.db.execute(sql`
      UPDATE user_credits
      SET balance = LEAST(balance, ${FREE_CREDITS}), updated_at = NOW()
      WHERE user_id = ${userId}
    `)
  }
}

export default billingPlugin
