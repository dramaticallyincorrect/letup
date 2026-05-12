import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { join } from 'node:path'
import { config } from 'dotenv'

config({ path: join(__dirname, '../.env') })
config({ path: join(__dirname, '../.env.local'), override: true })

const client = postgres(process.env.DATABASE_URL!, { max: 1 })
const db = drizzle(client)

migrate(db, { migrationsFolder: join(__dirname, '../drizzle') })
  .then(() => {
    console.log('Migrations applied successfully')
    process.exit(0)
  })
  .catch((err) => {
    console.error('Migration failed:', err)
    process.exit(1)
  })
