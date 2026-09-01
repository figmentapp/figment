// Turns `:::tip`, `:::note`, and `:::info` container directives into
// <aside class="admonition admonition-<kind>"> blocks with a title.
// Requires remark-directive to run first, so the ::: fences are parsed.
import { visit } from 'unist-util-visit';

const KINDS = {
  tip: 'Tip',
  note: 'Note',
  info: 'Info',
};

export default function remarkAdmonitions() {
  return (tree) => {
    visit(tree, 'containerDirective', (node) => {
      const title = KINDS[node.name];
      if (!title) return;
      const data = node.data || (node.data = {});
      data.hName = 'aside';
      data.hProperties = { className: ['admonition', `admonition-${node.name}`] };
      node.children.unshift({
        type: 'paragraph',
        data: { hName: 'p', hProperties: { className: ['admonition-title'] } },
        children: [{ type: 'text', value: title }],
      });
    });
  };
}
