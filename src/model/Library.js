export default class Library {
  constructor() {
    // Extract raw sources of every node in src/nodes
    const modules = import.meta.glob('../nodes/**/*.js', { query: '?raw', eager: true });

    this.nodeTypes = Object.entries(modules).map(([filePath, source]) => {
      // filePath looks like "../nodes/image/blur.js"
      const [, categoryGuess, slug] = filePath.match(/^\.\.\/nodes\/([^/]+)\/([^/]+)\.js$/) || [null, null, null];

      // Extract the metadata from the JSDoc
      const meta = {};
      const header = source.default.match(/\/\*\*([\s\S]*?)\*\//)?.[1] ?? '';
      for (const line of header.split('\n')) {
        const [, tag, value] = line.match(/@(\w+)\s+(.+)/) || [];
        if (tag) meta[tag] = value.trim();
      }
      const name = meta.name ?? slug.replace(/-/g, ' ');
      const category = meta.category ?? categoryGuess;
      const description = meta.description ?? source.match(/\/\/\s*(.+)/)?.[1].trim() ?? '';

      return {
        name,
        type: `${category}.${slug}`, // e.g. 'image.blur'
        source: source.default,
        description,
      };
    });

    for (const n of this.nodeTypes) {
      if (!n.source) throw new Error(`Node ${n.type} has no source`);
    }
  }

  findByType(type) {
    return this.nodeTypes.find((node) => node.type === type);
  }
}
