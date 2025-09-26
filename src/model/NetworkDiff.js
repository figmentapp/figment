// The network diff computes changes between the schema of two networks.
// The result is a list of nodes to be added or removed, connections that
// were added or removed, and port values that where updated.
// This is used in the RenderWorker to call the appropriate
// lifecycle methods are called (node.onStart / node.onStop).

const connKey = (c) => `${c.outNode}-${c.outPort}-${c.inNode}-${c.inPort}`;
const portValueKey = (nodeId, portName) => `${nodeId}-${portName}`;

// Create a normalized value from the port value for comparison
function normalizeValue(portValue) {
  if (!portValue) return null;
  if (portValue.type === 'expression') {
    return `expr:${portValue.expression}`;
  } else {
    return `val:${JSON.stringify(portValue.value)}`;
  }
}

// Compute which port values changed between two node schemas
function computeValueChanges(currentNode, desiredNode) {
  const changedPorts = [];
  const currentValues = currentNode?.values || {};
  const desiredValues = desiredNode?.values || {};

  // Get all port names from both current and desired
  const allPortNames = new Set([...Object.keys(currentValues), ...Object.keys(desiredValues)]);

  for (const portName of allPortNames) {
    const currentValue = currentValues[portName];
    const desiredValue = desiredValues[portName];
    const currentNormalized = normalizeValue(currentValue);
    const desiredNormalized = normalizeValue(desiredValue);
    if (currentNormalized !== desiredNormalized) {
      changedPorts.push(portName);
    }
  }

  return changedPorts;
}

function nodeNeedsUpdate(currentNode, desiredNode) {
  if (currentNode.x !== desiredNode.x || currentNode.y !== desiredNode.y) return true;
  if (currentNode.name !== desiredNode.name) return true;
  const changedPorts = computeValueChanges(currentNode, desiredNode);
  if (changedPorts.length > 0) return true;
  return false;
}

function computeNodeChanges(currentNode, desiredNode) {
  const changes = {};
  if (currentNode.x !== desiredNode.x || currentNode.y !== desiredNode.y) {
    changes.position = { x: desiredNode.x, y: desiredNode.y };
  }
  if (currentNode.name !== desiredNode.name) {
    changes.name = desiredNode.name;
  }
  const changedPorts = computeValueChanges(currentNode, desiredNode);
  if (changedPorts.length > 0) {
    changes.changedPorts = changedPorts;
    changes.values = {};
    for (const portName of changedPorts) {
      changes.values[portName] = desiredNode.values?.[portName];
    }
  }
  return changes;
}

// Compute diff between network schemas
// A network schema is the result of Network.serialize()
export function computeDiff(currentSchema, desiredSchema) {
  const diff = {
    nodesToCreate: [],
    nodesToDelete: [],
    nodesToUpdate: [],
    nodesToRecompile: [],
    connectionsToAdd: [],
    connectionsToRemove: [],
  };

  // Build lookup maps
  const currentNodesMap = new Map(currentSchema.nodes.map((n) => [n.id, n]));
  const desiredNodesMap = new Map(desiredSchema.nodes.map((n) => [n.id, n]));

  // Find nodes to create (in desired but not in current) or update
  for (const [id, desiredNode] of desiredNodesMap) {
    const currentNode = currentNodesMap.get(id);
    if (!currentNode) {
      // Node doesn't exist - create it
      diff.nodesToCreate.push(desiredNode);
    } else if (currentNode.type !== desiredNode.type) {
      // Type changed - recreate the node
      diff.nodesToDelete.push(currentNode);
      diff.nodesToCreate.push(desiredNode);
    } else if (currentNode.source !== desiredNode.source) {
      // Source changed - recompile the node
      diff.nodesToRecompile.push(desiredNode);
    } else if (nodeNeedsUpdate(currentNode, desiredNode)) {
      diff.nodesToUpdate.push({ id, changes: computeNodeChanges(currentNode, desiredNode) });
    }
  }

  // Find nodes to delete (in current but not in desired)
  for (const [id, node] of currentNodesMap) {
    if (!desiredNodesMap.has(id)) {
      diff.nodesToDelete.push(node);
    }
  }

  // Diff connections
  const currentConnSet = new Set(currentSchema.connections.map((c) => connKey(c)));
  const desiredConnSet = new Set(desiredSchema.connections.map((c) => connKey(c)));
  diff.connectionsToAdd = desiredSchema.connections.filter((c) => !currentConnSet.has(connKey(c)));
  diff.connectionsToRemove = currentSchema.connections.filter((c) => !desiredConnSet.has(connKey(c)));

  return diff;
}
