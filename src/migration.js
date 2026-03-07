// WebGL → WebGPU migration utilities
// Detects old WebGL code in custom node types and communicates with the migration API.

const MIGRATION_API_BASE = 'https://migration.figmentapp.com';

const WEBGL_MARKERS = [
  'gl_FragColor',
  'texture2D(',
  'varying vec2 v_uv',
  'precision mediump float',
  'figment.createShaderProgram(',
  'new figment.Framebuffer(',
  'framebuffer.bind()',
  'figment.drawQuad(',
  'figment.clear()',
];

export function hasWebGLCode(source) {
  if (!source || typeof source !== 'string') return false;
  return WEBGL_MARKERS.some((marker) => source.includes(marker));
}

export function findWebGLTypes(project) {
  if (!Array.isArray(project.types)) return [];
  return project.types.filter((t) => t.source && hasWebGLCode(t.source));
}

export async function submitMigration(project) {
  const blob = new Blob([JSON.stringify(project)], { type: 'application/json' });
  const form = new FormData();
  form.append('file', blob, 'project.fgmt');

  const res = await fetch(`${MIGRATION_API_BASE}/api/migrate-to-webgpu`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Migration submit failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function pollStatus(taskId) {
  const res = await fetch(`${MIGRATION_API_BASE}/api/migrate-to-webgpu/status?id=${encodeURIComponent(taskId)}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Status poll failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function fetchResult(taskId) {
  const res = await fetch(`${MIGRATION_API_BASE}/api/migrate-to-webgpu/result?id=${encodeURIComponent(taskId)}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Result fetch failed (${res.status}): ${text}`);
  }
  return res.json();
}

const POLL_INTERVAL_MS = 2000;

export function startPolling(taskId, onUpdate) {
  let stopped = false;

  async function tick() {
    if (stopped) return;
    try {
      const status = await pollStatus(taskId);
      if (stopped) return;
      onUpdate(status);
      if (status.status === 'completed' || status.status === 'failed' || status.status === 'partial') {
        return; // terminal state
      }
    } catch (err) {
      if (stopped) return;
      onUpdate({ status: 'error', error: err.message });
      return;
    }
    setTimeout(tick, POLL_INTERVAL_MS);
  }

  tick();
  return () => {
    stopped = true;
  };
}
