import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => ({
  test: {
    include: ['test/**/*.test.ts'],
    env: loadEnv(mode, process.cwd(), ''),
    server: {
      deps: {
        inline: ['@fastify/autoload'],
      },
    },
  },
}))
