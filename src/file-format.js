export const LATEST_FORMAT_VERSION = 2;

export function upgradeProject(project) {
  if (typeof project.version !== 'number') {
    throw new Error('Project version is not a number');
  }
  if (project.version === LATEST_FORMAT_VERSION) {
    return project;
  } else if (project.version > LATEST_FORMAT_VERSION) {
    throw new Error('Project version is too new, please upgrade Figment.');
  } else if (project.version === 1) {
    // Version 2 introduces expressions.
    // A values object for a node looked like this:
    // "values": { "amount": 0.9 }
    // The new syntax is now this:
    // "values": { "amount": { "type": "value", "value": 0.9 } }
    // And using an expression:
    // "values": { "amount": { "type": "expression", "expression": "$FRAME * 0.9" } }
    const newProject = structuredClone(project);
    newProject.version = 2;
    for (const node of newProject.nodes) {
      if (node.values) {
        // Convert all direct values to value objects.
        for (const key in node.values) {
          node.values[key] = { type: 'value', value: node.values[key] };
        }
      }
    }
    // Recursively do further upgrades, if necessary.
    return upgradeProject(newProject);
  }
}
