import { FastifyPluginAsync } from 'fastify'
import { eq, sql } from 'drizzle-orm'
import { Paddle, Environment, EventName } from '@paddle/paddle-node-sdk'
import { Fastify } from '../fastify_type'
import { userSubscriptions, userCredits } from '../db/schema'
import { microUnitsToCredits } from '../credits'

const PREMIUM_CREDITS = 125_000_000n // 100 credits × 1,250,000 mu/credit ($10 raw API cost)
const FREE_CREDITS = 18_750_000n     // 15 credits  × 1,250,000 mu/credit ($1.50 raw API cost)

const paddle = new Paddle(process.env.PADDLE_API_KEY!, {
  environment: process.env.PADDLE_ENVIRONMENT === 'production'
    ? Environment.production
    : Environment.sandbox,
})

const billingPlugin: FastifyPluginAsync = async (fastify) => {
  getBillingStatus(fastify as Fastify)
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

    await Promise.all([
      fastify.db
        .insert(userSubscriptions)
        .values({
          userId,
          plan: 'pro',
          status: 'active',
          paddleCustomerId: data.customerId,
          paddleSubscriptionId: data.id,
          currentPeriodEnd: data.currentBillingPeriod?.endsAt
            ? new Date(data.currentBillingPeriod.endsAt)
            : null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: userSubscriptions.userId,
          set: {
            plan: 'pro',
            status: 'active',
            paddleCustomerId: data.customerId,
            paddleSubscriptionId: data.id,
            currentPeriodEnd: data.currentBillingPeriod?.endsAt
              ? new Date(data.currentBillingPeriod.endsAt)
              : null,
            updatedAt: new Date(),
          },
        }),
      fastify.db
        .insert(userCredits)
        .values({ userId, balance: PREMIUM_CREDITS, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: userCredits.userId,
          set: { balance: PREMIUM_CREDITS, updatedAt: new Date() },
        }),
    ])
  }

  if (eventType === EventName.SubscriptionUpdated) {
    if (!userId) return

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

    // Top up credits on each billing renewal
    if (data.status === 'active') {
      await fastify.db
        .insert(userCredits)
        .values({ userId, balance: PREMIUM_CREDITS, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: userCredits.userId,
          set: { balance: PREMIUM_CREDITS, updatedAt: new Date() },
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
