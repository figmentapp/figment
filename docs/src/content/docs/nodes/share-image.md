---
title: "Share Image"
---

# Share Image

This node shares its input image with other applications on the same Mac, in real time, through [Syphon](https://syphon.github.io). Any app that can receive Syphon (Max/MSP, TouchDesigner, Resolume, VDMX, MadMapper, OBS Studio, Processing, openFrameworks, ...) can pick up the Figment output as a live texture.

The node passes its input through unchanged, so you can place it anywhere in your chain.

:::note
Syphon is macOS only. On Windows the node does nothing and prints a warning in the console. Spout support for Windows is planned.
:::

## How to use it

- Add a **Share Image** node after the image you want to share.
- Optionally, change the **Server Name**. The default is `Figment`.
- Open the receiving app. Figment appears in its list of Syphon servers as `Figment` (application name) with the server name you set.

Frames go out only while a client is connected. An unconnected Share Image node costs nothing.

You can add several Share Image nodes with different server names to publish more than one image at the same time.

## Parameters

- **Enable** Turn sharing on or off. The image still passes through when sharing is off.
- **Server Name** The name that Syphon clients see. Changing the name keeps connected clients attached.

## Receiving in other applications

Syphon identifies a server by two names: the **application name** (always `Figment`) and the **server name** (the parameter on the node, `Figment` by default). Most apps let you select either one from a list.

### Max/MSP

1. Install the **Syphon** package from the Package Manager.
2. Create a rendering context, for example `jit.world @name ctx`.
3. Add `jit.gl.syphonclient @servername Figment` and drive it with a `qmetro` or the bang from `jit.world`.
4. Connect its output to `jit.gl.videoplane @drawto ctx` (or any other `jit.gl` object that accepts a texture).

Send the message `getavailableservers` to `jit.gl.syphonclient` to list running servers.

### TouchDesigner

1. Add a **Syphon Spout In** TOP.
2. In the **Sender Name** parameter, choose the Figment entry from the drop-down list.
3. Use the TOP like any other texture.

### Processing

Install the **Syphon** library from the Contribution Manager.

```java
import codeanticode.syphon.*;

SyphonClient client;
PGraphics canvas;

void setup() {
  size(1280, 720, P3D);
  client = new SyphonClient(this, "Figment", "Figment"); // app name, server name
}

void draw() {
  if (client.newFrame()) {
    canvas = client.getGraphics(canvas);
    image(canvas, 0, 0, width, height);
  }
}
```

### openFrameworks

Use the [ofxSyphon](https://github.com/astellato/ofxSyphon) addon.

```cpp
ofxSyphonClient client;

void ofApp::setup() {
  client.setup();
  client.set("Figment", "Figment"); // server name, app name
}

void ofApp::draw() {
  client.draw(0, 0, ofGetWidth(), ofGetHeight());
}
```

### Other applications

- **Resolume Arena / Avenue**: Sources panel → Syphon → Figment.
- **VDMX**: add a Syphon source in the Layer Source list.
- **MadMapper**: Media → Syphon.
- **OBS Studio**: add a **Syphon Client** source.

:::tip
To check that Figment is publishing, open the free **Simple Client** from the [Syphon downloads](https://syphon.github.io). Figment should appear in its server list as soon as the network renders.
:::
