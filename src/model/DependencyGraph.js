// A session runs the network. It keeps certain parameters for each frame, and caches results.

export default class DependencyGraph {
  constructor(network) {
    this.network = network;
    this.nodeOrder = [];
  }

  // Given the current network, build a dependency graph to see which nodes to execute first.
  // This topologically sorts the graph so that nodes that depend on other nodes come later in the list.
  // If nodes are independent from each other they are at the same "level", and
  // Given a graph like this:
  //  A -->--+
  //         +-->-- C -->-- D
  //  B -->--+
  // If elements in the list can be executed at the same time, these are indicated by their level.
  build() {
    // First create two key-value maps to indicate the upstream/downstream connections between nodes.
    const upstreamConnections = {};
    const downstreamConnections = {};
    for (const conn of this.network.connections) {
      const { outNode, inNode } = conn;
      if (!upstreamConnections[inNode]) {
        upstreamConnections[inNode] = [];
      }
      upstreamConnections[inNode].push(outNode);

      if (!downstreamConnections[outNode]) {
        downstreamConnections[outNode] = [];
      }
      downstreamConnections[outNode].push(inNode);
    }
    this.upstreamConnections = upstreamConnections;
    this.downstreamConnections = downstreamConnections;

    const visited = new Set();
    const stack = [];
    for (const node of this.network.nodes) {
      // Only visit nodes with no downstream connections (root nodes).
      if (visited.has(node.id)) continue;
      if (downstreamConnections[node.id] && downstreamConnections[node.id].length > 0) continue;
      this._visit(node.id, upstreamConnections, visited, stack);
    }
    this.nodeOrder = stack.map((id) => this.network.nodes.find((node) => node.id === id));
    return stack;
  }

  _visit(nodeId, upstreamConnections, visited, stack) {
    visited.add(nodeId);
    const upstreams = upstreamConnections[nodeId];
    if (upstreams) {
      for (const upstreamId of upstreams) {
        if (visited.has(upstreamId)) continue;
        this._visit(upstreamId, upstreamConnections, visited, stack);
      }
    }
    stack.push(nodeId);
  }
}
