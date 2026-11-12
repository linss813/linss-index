// TOAST UI 3.x exposes runtime exports but omits its bundled type export.
declare module '@toast-ui/editor' {
  const Editor: typeof import('../node_modules/@toast-ui/editor/types/index').default;
  export default Editor;
}
