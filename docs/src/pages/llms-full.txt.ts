import { getCollection } from 'astro:content'

const SITE = 'https://figmentapp.com'

// Everything an AI assistant needs to write a working Figment custom node,
// concatenated into a single plain-markdown file.
const FULL_SLUGS = [
  'custom-nodes',
  'custom-nodes/ports',
  'custom-nodes/api',
  'custom-nodes/shaders',
  'custom-nodes/cookbook',
  'custom-nodes/cookbook/blur-node',
  'custom-nodes/cookbook/generator-node',
  'custom-nodes/cookbook/fetch-api-data',
  'custom-nodes/cookbook/parameters-and-buttons',
  'custom-nodes/cookbook/feedback-effects',
  'tutorials/custom-nodes',
  'expressions',
]

export async function GET() {
  const entries = await getCollection('docs')
  const bySlug = new Map(entries.map((e) => [e.slug, e]))

  const sections = FULL_SLUGS.map((slug) => {
    const entry = bySlug.get(slug)
    if (!entry) return ''
    const url = `${SITE}/docs/${slug.replace(/\/index$/, '').replace(/^index$/, '')}`.replace(/\/$/, '')
    return `<!-- Source: ${url} -->\n\n${entry.body.trim()}`
  })
    .filter(Boolean)
    .join('\n\n---\n\n')

  const text = `# Figment — Writing Custom Nodes (full documentation)

> Figment is a free, open-source, node-based desktop app for creative AI coding, built on Electron and WebGPU (https://figmentapp.com). This file bundles the complete custom-node documentation so an AI assistant can write working nodes. Shaders are WGSL, not GLSL. Only the \`node\` and \`figment\` globals exist inside a node — no imports.

---

${sections}
`
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
