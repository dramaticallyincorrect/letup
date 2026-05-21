import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from './db'
import { user, session, account, verification, userRelations } from './db/auth-schema'
import { userCredits, userSubscriptions } from './db/schema'

const FREE_CREDITS_MICRO_UNITS = 18_750_000n // 15 credits × 1,250,000 mu/credit ($1.50 one-time grant)

export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: "pg",
        schema: { user, session, account, verification, userRelations },
    }),
    emailAndPassword: {
        enabled: true,
    },
    socialProviders: {
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        },
    },
    trustedOrigins: [process.env.FRONTEND_URL ?? 'http://localhost:5173'],
    databaseHooks: {
        user: {
            create: {
                after: async (newUser) => {
                    await Promise.all([
                        db.insert(userCredits).values({
                            userId: newUser.id,
                            balance: FREE_CREDITS_MICRO_UNITS,
                            updatedAt: new Date(),
                        }).onConflictDoNothing(),
                        db.insert(userSubscriptions).values({
                            userId: newUser.id,
                            plan: 'free',
                            status: 'active',
                        }).onConflictDoNothing(),
                    ])
                },
            },
        },
    },
});