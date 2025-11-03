/**
 * Syphon/Spout frame sharing handler
 * Uses Electron's offscreen rendering with shared textures
 */

let _isActive = false;
let _serverName = 'Figment';
let _browserWindow = null;
let _frameData = null;
let _frameWidth = 0;
let _frameHeight = 0;

/**
 * Initialize Syphon/Spout sharing with the main window
 * @param {BrowserWindow} browserWindow - The main Electron browser window
 */
export function initializeSyphonSpout(browserWindow) {
  _browserWindow = browserWindow;

  // Listen for paint events when offscreen rendering is enabled
  // This is where we can access the shared texture
  browserWindow.webContents.on('paint', async (event, dirty, image) => {
    if (!_isActive) return;

    // Check if shared texture is available (Electron 29+)
    if (event.texture) {
      try {
        // The texture info contains the native handle that can be used
        // for Syphon/Spout integration
        const textureInfo = event.texture.textureInfo;

        // For now, we log the texture info as a placeholder
        // In a full implementation, this would be passed to native
        // Syphon/Spout libraries
        console.log('Shared texture available:', {
          target: textureInfo.target,
          internalFormat: textureInfo.internalFormat,
          type: textureInfo.type,
          width: textureInfo.width,
          height: textureInfo.height,
          // Note: textureInfo.texture is the native texture handle
          // This would be imported by native Syphon/Spout code
        });

        // Release the texture as soon as possible
        event.texture.release();
      } catch (err) {
        console.error('Error handling shared texture:', err);
      }
    } else if (_frameData) {
      // Fallback: use CPU-based frame data
      // This is less efficient but works without native texture support
      console.log('Sending frame via CPU fallback:', _frameWidth, 'x', _frameHeight);
    }
  });
}

/**
 * Start Syphon/Spout server
 * @param {string} serverName - The name of the Syphon/Spout server
 */
export function startSyphonSpout(serverName) {
  _serverName = serverName || 'Figment';
  _isActive = true;
  console.log(`Syphon/Spout server started: ${_serverName}`);

  // In a full implementation, this would initialize the native
  // Syphon (macOS) or Spout (Windows) server
}

/**
 * Stop Syphon/Spout server
 */
export function stopSyphonSpout() {
  _isActive = false;
  _frameData = null;
  _frameWidth = 0;
  _frameHeight = 0;
  console.log('Syphon/Spout server stopped');

  // In a full implementation, this would cleanup the native server
}

/**
 * Send a frame to the Syphon/Spout server
 * @param {Uint8Array} frameData - The frame pixel data (RGBA)
 * @param {number} width - Frame width
 * @param {number} height - Frame height
 */
export function sendSyphonSpoutFrame(frameData, width, height) {
  if (!_isActive) return;

  _frameData = frameData;
  _frameWidth = width;
  _frameHeight = height;

  // Store the frame data for the next paint event
  // In a full implementation with native modules, this would
  // send the frame directly to Syphon/Spout
}

/**
 * Check if Syphon/Spout is active
 * @returns {boolean}
 */
export function isSyphonSpoutActive() {
  return _isActive;
}
