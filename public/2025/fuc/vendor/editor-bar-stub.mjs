// Local stand-in for Framer's hosted editor-bar init module.
//
// Framer's published runtime dynamically imports its editor bar from its own
// servers, which then pull further chunks from another Framer CDN host.
// That is the only thing in this mirror that would still phone home, and it
// serves no purpose outside the Framer editor. build.py rewrites that import
// to point here instead. createEditorBar must return a React-renderable
// component, so return one that renders nothing.
export function createEditorBar() {
  return function EditorBarDisabled() {
    return null;
  };
}
export default createEditorBar;
