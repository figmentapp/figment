import { getCollection } from 'astro:content'

const SITE = 'https://figmentapp.com'

// Order for the custom-nodes section (most important content first).
const CUSTOM_NODE_SLUGS = [
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
]

const GUIDE_SLUGS = ['tutorials/getting-started', 'tutorials/custom-nodes', 'expressions', 'structuring', 'export', 'tutorials/pix2pix']

function line(entry: any): string {
  const url = `${SITE}/docs/${entry.slug}.md`
  const desc = entry.data.description ? `: ${entry.data.description}` : ''
  return `- [${entry.data.title}](${url})${desc}`
}

export async function GET() {
  const entries = await getCollection('docs')
  const bySlug = new Map(entries.map((e) => [e.slug, e]))
  const pick = (slugs: string[]) =>
    slugs
      .map((s) => bySlug.get(s))
      .filter(Boolean)
      .map(line)
      .join('\n')

  const nodePages = entries
    .filter((e) => e.slug.startsWith('nodes/'))
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map(line)
    .join('\n')

  const text = `# Figment

> Figment is a free, open-source, node-based desktop app for creative AI coding, built on Electron and WebGPU. You connect nodes into networks that load, transform and generate images and video in real time — webcam input, ML models (face/hand/pose detection, pix2pix, ONNX), GPU image filters, and outputs to files, OSC or WebSockets. Every node is a small JavaScript file; custom nodes are written in JavaScript with WGSL shaders.

Important notes for code generation:

- Custom nodes run as \`new Function('node', 'figment', source)\` — only the \`node\` and \`figment\` globals exist. There is no \`import\`, \`require\`, \`twgl\`, \`m4\` or \`gl\`.
- Shaders are WGSL (WebGPU), NOT GLSL. Use \`figment.createImageFilter\` / \`createImageGenerator\` / \`createFeedbackFilter\` for image nodes.
- The full custom-node documentation as one file: ${SITE}/llms-full.txt

## Writing custom nodes

${pick(CUSTOM_NODE_SLUGS)}

## Using Figment

${pick(GUIDE_SLUGS)}

## Built-in node reference

- [Nodes overview](${SITE}/docs/nodes.md)
${nodePages}

## Optional

- [Release notes](${SITE}/release-notes/)
- [Source code](https://github.com/figmentapp/figment) — every built-in node lives in src/nodes/
`
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
