export function shouldRedrawViewer(state, prevState) {
  return state.network !== prevState.network || state.version !== prevState.version;
}
