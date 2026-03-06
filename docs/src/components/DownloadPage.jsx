import React, { useEffect, useMemo, useState } from "react";

const version = "0.6.3";

const downloadOptions = [
  {
    id: "macos-apple-silicon",
    platform: "macOS",
    variant: "Apple Silicon",
    url: `https://figmentapp.s3.amazonaws.com/releases/Figment-${version}-arm64.dmg`,
  },
  {
    id: "windows-installer",
    platform: "Windows",
    variant: "Installer",
    url: `https://figmentapp.s3.amazonaws.com/releases/Figment%20Setup%20${version}.exe`,
  },
];

function detectPreferredOption(options) {
  if (typeof navigator === "undefined") return options[0];

  const signature = `${navigator.userAgentData?.platform ?? ""} ${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`.toLowerCase();

  if (signature.includes("win")) {
    return options.find((option) => option.id.startsWith("windows")) ?? options[0];
  }

  if (signature.includes("mac")) {
    return options.find((option) => option.id.startsWith("macos")) ?? options[0];
  }

  return options[0];
}

function PlatformIcon({ platform }) {
  if (platform.toLowerCase().includes("win")) {
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
  const [primaryOption, setPrimaryOption] = useState(downloadOptions[0]);

  useEffect(() => {
    setPrimaryOption(detectPreferredOption(downloadOptions));
  }, []);

  const alternativeOptions = useMemo(
    () => downloadOptions.filter((option) => option.id !== primaryOption.id),
    [primaryOption.id],
  );

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
          <span>v{version}</span>
        </p>

        <details className="download-options">
          <summary>Other versions</summary>
          <div className="download-options-list">
            {alternativeOptions.map((option) => (
              <a className="download-option" href={option.url} key={option.id}>
                <span className="download-option-title">
                  <PlatformIcon platform={option.platform} />
                  {option.platform}
                </span>
                <span className="download-option-meta">{option.variant}</span>
              </a>
            ))}
          </div>
        </details>

        <p className="text-sm">
          Version {version} -{" "}
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
          <p className="text-sm">
            Learn how to use Figment to create, share, and collaborate on projects.
          </p>
          <a className="button button--primary" href="/docs/tutorials/getting-started">
            Getting Started
          </a>
        </div>
        <div className="col col-4 tile">
          <h3 className="text-lg">Download example projects</h3>
          <p className="text-sm">
            We've created some example projects showing some of the features of Figment.
          </p>
          <a
            className="button button--primary"
            href="https://figmentapp.s3.amazonaws.com/examples/figment-examples-2022-02-24.zip"
          >
            Download projects
          </a>
        </div>
        <div className="col col-4 tile">
          <h3 className="text-lg">PIX2PIX Deep Dive</h3>
          <p className="text-sm">
            Watch how to train a machine learning model from scratch using Figment and Google Colab.
          </p>
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
