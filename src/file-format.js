export const LATEST_FORMAT_VERSION = 5;

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
  } else if (project.version === 2) {
    // Version 3 renames the Load Movie node parameter "animate" to "play".
    const newProject = structuredClone(project);
    newProject.version = 3;
    for (const node of newProject.nodes) {
      if (!node || !node.type) continue;
      if (node.type === 'image.loadMovie' && node.values && 'animate' in node.values) {
        node.values.play = node.values.animate;
        delete node.values.animate;
      }
    }
    // Recursively do further upgrades, if necessary.
    return upgradeProject(newProject);
  } else if (project.version === 3) {
    // Version 4 adds `midi` messages, so it can't be loaded in older versions.
    // Older versions of the project just work though.
    const newProject = structuredClone(project);
    newProject.version = 4;
    return upgradeProject(newProject);
  } else if (project.version === 4) {
    // Version 5 renames the Save Image node parameter "enable" to "save".
    // The "enable" select port (On Export/Always/Never) is now called "save",
    // and a new boolean "enable" port was added for conditional saving.
    const newProject = structuredClone(project);
    newProject.version = 5;
    for (const node of newProject.nodes) {
      if (!node || !node.type) continue;
      if (node.type === 'image.saveImage' && node.values && 'enable' in node.values) {
        node.values.save = node.values.enable;
        delete node.values.enable;
      }
    }
    return upgradeProject(newProject);
  }
}
