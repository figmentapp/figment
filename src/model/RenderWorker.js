import * as Comlink from 'comlink';
import Network, { getDefaultNetwork } from './Network';
import Library from './Library';

const RENDER_STATE_IDLE = 'idle';
const RENDER_STATE_RENDERING = 'rendering';

let _appPath = null;
let _network = null;
let _library = null;
let _renderState = RENDER_STATE_IDLE;
let _scheduledNetwork = null;

async function renderNetwork(network) {
  let result;
  try {
    await network.render();
    result = { success: true };
    // postMessage({ type: 'RENDER_DONE', frameId: network.frameId });
  } catch (error) {
    result = { success: false, error: error.message };
    // postMessage({ type: 'RENDER_ERROR', error: error.message });
  } finally {
    // See if there is another network to render
    if (_scheduledNetwork !== null) {
      const nextNetwork = _scheduledNetwork;
      _scheduledNetwork = null;
      renderNetwork(nextNetwork);
    } else {
      _renderState = RENDER_STATE_IDLE;
    }
  }
  return result;
}

function scheduleRender(network) {
  _scheduledNetwork = network;
  requestAnimationFrame(renderNetwork);
}

const service = {
  init: (appPath) => {
    _appPath = appPath;
    _library = new Library();
    const nodeTypes = _library.nodeTypes.map((n) => ({ name: n.name, type: n.type, description: n.description }));
    return { nodeTypes };
  },
  loadNetwork: (networkSchema) => {
    const schema = networkSchema || getDefaultNetwork(_appPath);
    _network = new Network(_library);
    _network.parse(schema);
    return _network.toSchema();
  },
  renderFrame: async () => {
    if (_renderState === RENDER_STATE_IDLE) {
      _renderState = RENDER_STATE_RENDERING;
      const result = await renderNetwork(_network);
      return result;
    } else {
      // Worker is busy, schedule this render
      // Replace any existing scheduled render with this newer one.
      if (networkSchema) {
        _scheduledNetwork = new Network(_library);
        _scheduledNetwork.parse(networkSchema);
      } else {
        _scheduledNetwork = _network;
      }
    }
  },
};

Comlink.expose(service);

// onmessage = (e) => {
//   const { type, ...data } = e.data;
//   switch (type) {
//     case 'INIT':
//       _appPath = data?.appPath || null;
//       _library = new Library();
//       postMessage({
//         type: 'INIT_DONE',
//         nodeTypes: _library.nodeTypes.map((n) => ({ name: n.name, type: n.type, description: n.description })),
//       });
//       break;
//     case 'LOAD':
//       // Initialize library and network
//       const networkSchema = data?.network || getDefaultNetwork(_appPath);
//       _network = new Network(_library);
//       _network.parse(networkSchema);
//       postMessage({ type: 'LOAD_DONE', network: _network.serialize() });
//       break;
//     case 'RENDER':
//       if (_renderState === RENDER_STATE_IDLE) {
//         _renderState = RENDER_STATE_RENDERING;
//         renderNetwork(data.network);
//       } else {
//         // Worker is busy, schedule this render
//         // Replace any existing scheduled render with this newer one.
//         _scheduledNetwork = e.network;
//       }
//       break;
//     default:
//       postMessage({ type: 'ERROR', error: `Unknown message type: ${type}` });
//   }
// };
