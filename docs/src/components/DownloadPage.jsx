import React, { useEffect, useMemo, useState } from 'react';

const S3_BASE = 'https://figmentapp.s3.amazonaws.com/releases';

const PLATFORM_TEMPLATES = {
  macos: {
    id: 'macos-apple-silicon',
    platform: 'macOS',
    variant: 'Apple Silicon',
    manifest: 'latest-mac.yml',
    pickFile: (manifest) => manifest.files.find((file) => file.url.endsWith('.dmg')),
  },
  windows: {
    id: 'windows-installer',
    platform: 'Windows',
    variant: 'Installer',
    manifest: 'latest.yml',
    pickFile: (manifest) => ({ url: manifest.path }),
  },
};

function parseManifest(yamlText) {
  const result = { files: [] };
  for (const rawLine of yamlText.split('\n')) {
    const stripQuotes = (value) => value.trim().replace(/^['"]|['"]$/g, '');

    const versionMatch = rawLine.match(/^version:\s*(.+)$/);
    if (versionMatch) {
      result.version = stripQuotes(versionMatch[1]);
      continue;
    }

    const pathMatch = rawLine.match(/^path:\s*(.+)$/);
    if (pathMatch) {
      result.path = stripQuotes(pathMatch[1]);
      continue;
    }

    const fileUrlMatch = rawLine.match(/^\s+-\s*url:\s*(.+)$/);
    if (fileUrlMatch) {
      result.files.push({ url: stripQuotes(fileUrlMatch[1]) });
    }
  }
  return result;
}

async function fetchManifest(name) {
  const response = await fetch(`${S3_BASE}/${name}`, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`${name}: HTTP ${response.status}`);
  }
  return parseManifest(await response.text());
}

function buildOption(template, manifest) {
  const file = template.pickFile(manifest);
  if (!file || !file.url || !manifest.version) return null;
  return {
    id: template.id,
    platform: template.platform,
    variant: template.variant,
    version: manifest.version,
    url: `${S3_BASE}/${encodeURIComponent(file.url)}`,
  };
}

function detectPreferredOption(options) {
  if (typeof navigator === 'undefined') return options[0];

  const signature = `${navigator.userAgentData?.platform ?? ''} ${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`.toLowerCase();

  if (signature.includes('win')) {
    return options.find((option) => option.id.startsWith('windows')) ?? options[0];
  }

  if (signature.includes('mac')) {
    return options.find((option) => option.id.startsWith('macos')) ?? options[0];
  }

  return options[0];
}

function PlatformIcon({ platform }) {
  if (platform.toLowerCase().includes('win')) {
    return (
      <svg aria-hidden="true" className="download-platform-icon" viewBox="0 0 24 24">
        <path d="M2.5 3.5 11 2.2V11H2.5V3.5Zm9.7-1.5L21.5.7V11h-9.3V2Zm-9.7 10h8.5v8.8L2.5 19.5V12Zm9.7 0h9.3v10.3l-9.3-1.4V12Z" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="download-platform-icon" viewBox="0 0 24 24">
      <path d="M16.7 12.8c0-2.2 1.8-3.2 1.9-3.3-1-1.5-2.7-1.7-3.2-1.7-1.4-.1-2.7.8-3.4.8-.7 0-1.8-.8-2.9-.8-1.5 0-2.8.9-3.6 2.2-1.6 2.7-.4 6.7 1.2 9 .8 1.1 1.7 2.3 2.9 2.2 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.2.9-1.3 1.2-2.6 1.2-2.7-.1 0-2.3-.9-2.3-3.5ZM14.5 6.4c.6-.7 1-1.7.9-2.7-.9 0-2 .6-2.6 1.3-.6.7-1.1 1.7-1 2.7 1 .1 2.1-.5 2.7-1.3Z" />
    </svg>
  );
}

function DownloadHeader() {
  const [status, setStatus] = useState('loading');
  const [options, setOptions] = useState([]);
  const [primaryId, setPrimaryId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      fetchManifest(PLATFORM_TEMPLATES.macos.manifest).then((m) => buildOption(PLATFORM_TEMPLATES.macos, m)),
      fetchManifest(PLATFORM_TEMPLATES.windows.manifest).then((m) => buildOption(PLATFORM_TEMPLATES.windows, m)),
    ]).then((results) => {
      if (cancelled) return;
      const resolved = results.filter((result) => result.status === 'fulfilled' && result.value).map((result) => result.value);
      setOptions(resolved);
      setStatus(resolved.length > 0 ? 'ready' : 'error');
      if (resolved.length > 0) {
        setPrimaryId(detectPreferredOption(resolved).id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const primaryOption = useMemo(() => options.find((option) => option.id === primaryId) ?? options[0] ?? null, [options, primaryId]);
  const alternativeOptions = useMemo(() => options.filter((option) => option.id !== primaryOption?.id), [options, primaryOption]);

  if (status === 'loading') {
    return (
      <header className="hero hero--primary">
        <div className="container text-center download-hero">
          <h1 className="text-2xl">Download Figment</h1>
          <p className="download-primary-meta">Loading latest release…</p>
        </div>
      </header>
    );
  }

  if (status === 'error' || !primaryOption) {
    return (
      <header className="hero hero--primary">
        <div className="container text-center download-hero">
          <h1 className="text-2xl">Download Figment</h1>
          <p className="download-primary-meta">Downloads are temporarily unavailable. Please check back shortly.</p>
        </div>
      </header>
    );
  }

  return (
    <header className="hero hero--primary">
      <div className="container text-center download-hero">
        <h1 className="text-2xl">Download Figment</h1>

        <a className="download-primary" href={primaryOption.url}>
          <PlatformIcon platform={primaryOption.platform} />
          Download Figment for {primaryOption.platform}
        </a>

        <p className="download-primary-meta">
          <span>{primaryOption.platform}</span>
          <span className="download-primary-separator">|</span>
          <span>{primaryOption.variant}</span>
          <span className="download-primary-separator">|</span>
          <span>v{primaryOption.version}</span>
        </p>

        {alternativeOptions.length > 0 && (
          <details className="download-options">
            <summary>Other versions</summary>
            <div className="download-options-list">
              {alternativeOptions.map((option) => (
                <a className="download-option" href={option.url} key={option.id}>
                  <span className="download-option-title">
                    <PlatformIcon platform={option.platform} />
                    {option.platform}
                  </span>
                  <span className="download-option-meta">
                    {option.variant} · v{option.version}
                  </span>
                </a>
              ))}
            </div>
          </details>
        )}

        <p className="text-sm">
          Version {primaryOption.version} -{' '}
          <a className="color-reverse" href="/release-notes">
            What's New
          </a>
        </p>
      </div>
    </header>
  );
}

function NextSteps() {
  return (
    <section className="container py-5 text-center">
      <h2 className="text-2xl">Next Steps</h2>
      <p>Thanks for downloading Figment! Here are some things you can do next:</p>
      <div className="row tiles">
        <div className="col col-4 tile">
          <h3 className="text-lg">Follow the tutorial</h3>
          <p className="text-sm">Learn how to use Figment to create, share, and collaborate on projects.</p>
          <a className="button button--primary" href="/docs/tutorials/getting-started">
            Getting Started
          </a>
        </div>
        <div className="col col-4 tile">
          <h3 className="text-lg">Download example projects</h3>
          <p className="text-sm">We've created some example projects showing some of the features of Figment.</p>
          <a className="button button--primary" href="https://figmentapp.s3.amazonaws.com/examples/figment-examples-2022-02-24.zip">
            Download projects
          </a>
        </div>
        <div className="col col-4 tile">
          <h3 className="text-lg">PIX2PIX Deep Dive</h3>
          <p className="text-sm">Watch how to train a machine learning model from scratch using Figment and Google Colab.</p>
          <a className="button button--primary" href="https://www.youtube.com/watch?v=CbB7kAb0UDM">
            YouTube Tutorial
          </a>
        </div>
      </div>
    </section>
  );
}

export default function DownloadPage() {
  return (
    <>
      <DownloadHeader />
      <NextSteps />
    </>
  );
}
