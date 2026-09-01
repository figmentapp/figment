import { getCollection } from 'astro:content'

// Serve the raw markdown of every docs page at /docs/<slug>.md, so AI
// assistants (and people) can fetch clean page content without HTML.
// Each HTML docs page points here via <link rel="alternate" type="text/markdown">.
export async function getStaticPaths() {
  const entries = await getCollection('docs')
  return entries.map((entry) => ({
    params: { slug: entry.slug },
    props: { entry },
  }))
}

export async function GET({ props }: { props: { entry: any } }) {
  const { entry } = props
  const body = entry.body.trim()
  // Most pages start with an H1; prepend one from the frontmatter when missing.
  const needsTitle = !body.startsWith('#')
  const header = needsTitle ? `# ${entry.data.title}\n\n` : ''
  return new Response(`${header}${body}\n`, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  })
}
