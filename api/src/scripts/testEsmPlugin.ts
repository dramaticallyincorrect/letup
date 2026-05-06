import { build } from 'esbuild'

const esmShCache = new Map<string, string>()

async function testCompile(label: string, files: Map<string, string>) {
  console.log(`\n=== ${label} ===`)
  const start = Date.now()
  try {
    const result = await build({
      entryPoints: ['index.tsx'],
      bundle: true,
      format: 'cjs',
      write: false,
      jsx: 'transform',
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
      target: 'es2020',
      external: ['react', 'framer-motion', '@/components/ui/*', '@/lib/utils', 'radix-ui', 'lucide-react', 'class-variance-authority', 'tailwind-merge', 'ai', 'db'],
      plugins: [
        {
          name: 'virtual-fs',
          setup(b) {
            b.onResolve({ filter: /.*/ }, args => {
              if (args.namespace === 'virtual' && args.path.startsWith('.')) {
                return { path: args.path, namespace: 'virtual' }
              }
              if (files.has(args.path)) return { path: args.path, namespace: 'virtual' }
              return null
            })
            b.onLoad({ filter: /.*/, namespace: 'virtual' }, args => {
              const content = files.get(args.path)
              if (content == null) return { errors: [{ text: `File not found: ${args.path}` }] }
              const loader = args.path.endsWith('.tsx') ? 'tsx' : args.path.endsWith('.ts') ? 'ts' : 'js'
              return { contents: content, loader }
            })
          },
        },
        {
          name: 'esm-sh',
          setup(b) {
            b.onResolve({ filter: /^[^./]/ }, args => {
              if (args.namespace === 'virtual') return null
              return { path: `https://esm.sh/${args.path}`, namespace: 'esm-sh' }
            })
            b.onResolve({ filter: /.*/, namespace: 'esm-sh' }, args => ({
              path: new URL(args.path, args.importer).toString(),
              namespace: 'esm-sh',
            }))
            b.onLoad({ filter: /.*/, namespace: 'esm-sh' }, async args => {
              const cached = esmShCache.get(args.path)
              if (cached) return { contents: cached, loader: 'js' as const }
              const res = await fetch(args.path)
              if (!res.ok) throw new Error(`esm.sh fetch failed for ${args.path}: ${res.status}`)
              const contents = await res.text()
              esmShCache.set(args.path, contents)
              return { contents, loader: 'js' as const }
            })
          },
        },
      ],
    })
    const elapsed = Date.now() - start
    const output = result.outputFiles[0].text
    console.log(`✅ Compiled in ${elapsed}ms, output size: ${(output.length / 1024).toFixed(1)} KB`)
    // Show first relevant line of output to confirm the package was bundled
    const firstFn = output.split('\n').find(l => l.includes('function') || l.includes('exports.'))
    if (firstFn) console.log('   Sample:', firstFn.trim().slice(0, 100))
    return output
  } catch (e: unknown) {
    const elapsed = Date.now() - start
    const msg = e instanceof Error ? e.message : String(e)
    console.log(`❌ Failed in ${elapsed}ms: ${msg.split('\n')[0]}`)
    return null
  }
}

// Test 1: No npm imports (should use fast path, no esm.sh fetch)
await testCompile('No npm imports (baseline)', new Map([
  ['index.tsx', `
    import React from 'react'
    export default function App() { return React.createElement('div', null, 'hello') }
  `],
]))

// Test 2: date-fns import
await testCompile('date-fns import', new Map([
  ['index.tsx', `
    import React from 'react'
    import { format } from 'date-fns'
    export default function App() {
      return React.createElement('div', null, format(new Date(), 'yyyy-MM-dd'))
    }
  `],
]))

// Test 3: Second date-fns import (should hit cache, be faster)
await testCompile('date-fns import (cached)', new Map([
  ['index.tsx', `
    import React from 'react'
    import { formatDistance } from 'date-fns'
    export default function App() {
      return React.createElement('div', null, formatDistance(new Date(), new Date()))
    }
  `],
]))

// Test 4: Node.js built-in (should fail)
await testCompile('Node.js fs import (should fail)', new Map([
  ['index.tsx', `
    import React from 'react'
    import fs from 'fs'
    export default function App() { return React.createElement('div', null, String(fs)) }
  `],
]))
