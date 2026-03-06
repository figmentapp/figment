import React from "react";

import Mailchimp from "./Mailchimp.jsx";
import styles from "./HomePage.module.css";

function HomepageHeader() {
  return (
    <header className={`hero hero--primary ${styles.heroBanner}`}>
      <div className="container">
        <div className="row align-center">
          <div className="col col-6 text-left">
            <h1 className="text-2xl">
              Design, train and interact with <span className={styles.orange}>AI</span> visually
            </h1>
            <p className="text-lg max-w-40">
              Figment is a modular, node-based app that lets artists and researchers build custom AI
              projects without writing code.
            </p>
            <div className="cta__wrapper">
              <a className="cta__button" href="/download/">
                Download Figment
              </a>
            </div>
          </div>
          <div className="col col-6">
            <img src="/img/homepage/figment-screenshot-hero.png" alt="Screenshot of the Figment app" />
          </div>
        </div>
      </div>
    </header>
  );
}

function FeatureVisualToolkit() {
  return (
    <section className="homepage__feature homepage__feature--odd">
      <div className="container">
        <div className="row align-center">
          <div className="col col-6">
            <img
              src="/img/homepage/figment-screenshot-lookup.png"
              alt="Screenshot of the Figment app showing the lookup node"
            />
          </div>
          <div className="col col-6">
            <h2 className="text-2xl">Build AI workflows visually</h2>
            <p className="text-lg">
              Drag nodes for dataset preparation, augmentation, visual processing, and real-time
              inference onto the canvas to sketch ideas quickly and iterate in seconds.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureMachineLearning() {
  return (
    <section className="homepage__feature homepage__feature--even">
      <div className="container">
        <div className="row align-center">
          <div className="col col-6">
            <h2 className="text-2xl">Training & inference built in</h2>
            <p className="text-lg">
              Use pre-made MediaPipe models or bring your own TensorFlow.js and ONNX models. Train,
              fine-tune and run them live with minimal latency.
            </p>
          </div>
          <div className="col col-6">
            <img
              src="/img/homepage/figment-screenshot-ml.png"
              alt="Screenshot of the Figment app demonstrating face detection"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureFast() {
  return (
    <section className="homepage__feature homepage__feature--odd">
      <div className="container">
        <div className="row align-center">
          <div className="col col-6 text-center">
            <img
              className="image-w50"
              src="/img/homepage/logos.svg"
              alt="Technology logos used by Figment"
            />
          </div>
          <div className="col col-6">
            <h2 className="text-2xl">Optimised for realtime</h2>
            <p className="text-lg">
              Every node is GPU-accelerated for ultra-low latency. Connect Figment to Ableton Live or
              any OSC-compatible software for responsive performances and long-running installations.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureCoding() {
  return (
    <section className="homepage__feature homepage__feature--even">
      <div className="container">
        <div className="row align-center">
          <div className="col col-6">
            <h2 className="text-2xl">Extend Figment with code</h2>
            <p className="text-lg">
              Go under the hood and build custom nodes that extend Figment's functionality. Use
              Chrome's handy DevTools to debug issues.
            </p>
          </div>
          <div className="col col-6">
            <img
              src="/img/homepage/figment-screenshot-coding.png"
              alt="Screenshot of the Figment app demonstrating coding"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function AlgorithmicGaze() {
  return (
    <section className="homepage__feature homepage__feature--odd">
      <div className="container flex flex-col items-center">
        <figure className="mb-5">
          <img src="/img/homepage/hunger-of-the-pine-cover.jpeg" alt="Hunger of the Pine project" />
          <figcaption>Hunger of the Pine. Kristof Vrancken and Lieven Menschaert (2021)</figcaption>
        </figure>
        <p className="text-lg max-w-40 text-center">
          Figment is developed as part of{" "}
          <a className="color-reverse" href="https://algorithmicgaze.com" target="_blank" rel="noopener noreferrer">
            The Algorithmic Gaze
          </a>
          , a research project exploring the impact of AI through interesting projects and
          democratizing the tools of machine learning.
        </p>
      </div>
    </section>
  );
}

function Newsletter() {
  return (
    <section className="homepage__feature homepage__feature--even">
      <div className="container flex flex-col items-center">
        <p className="text-lg max-w-40 text-center">
          Sign up for the Figment mailing list to get all the latest news about our software and other
          projects.
        </p>
        <Mailchimp />
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <>
      <HomepageHeader />
      <main>
        <FeatureVisualToolkit />
        <FeatureMachineLearning />
        <FeatureFast />
        <FeatureCoding />
        <AlgorithmicGaze />
        <Newsletter />
      </main>
    </>
  );
}
