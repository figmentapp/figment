// A session runs the network. It keeps certain parameters for each frame, and caches results.

export default class Session {
  constructor(network) {
    this.network = network;
    this.dirtyNodes = Set();
    this.dag = [];
  }

  run(frame = 0) {
    // By default, the session runs every node in the network.
    // Nodes that are unchanged (not "dirty") and not time-dependent are not run.
    // Build a dependency graph of the nodes.
  }

  // Given the current network, build a dependency graph to see which nodes to execute first.
  // This topologically sorts the graph so that nodes that depend on other nodes come later in the list.
  // If nodes are indepdent from each other they are at the same "level", and
  // Given a graph like this:
  //  A -->--+
  //         +-->-- C -->-- D
  //  B -->--+
  // If elements in the list can be executed at the same time, these are indicated by their level.
  buildDependencyGraph() {
    // First create a key-value map to indicate the connections between nodes.
    const connections = {};
    for (const conn of this.network.connections) {
      const { outNode, inNode } = conn;
      if (!connections[outNode]) {
        connections[outNode] = [];
      }
      connections[outNode].push(inNode);
    }

    const visited = Set();
    const stack = [];
    for (const node of this.network.nodes) {
      if (!visited.has(node)) {
        this._visit(node, visited, stack);
      }
    }

    stack.reverse();
    return stack;
  }

  _visit(node, visited, stack) {
    visited.add(node);
    const downstreamConnections = connections[node];
    for (const downstreamNode of downstreamConnections) {
      this._visit(downstreamNode, visited, stack);
    }
    stack.push(node);
  }
}
