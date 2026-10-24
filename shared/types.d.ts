// The package's `main` is a CommonJS file inside a `"type": "module"` package, so Node and Vite
// both load the ES build directly. Re-expose its typings under that path.
declare module '@dimforge/rapier3d-compat/rapier.es.js' {
  import RAPIER from '@dimforge/rapier3d-compat';
  export * from '@dimforge/rapier3d-compat';
  export default RAPIER;
}
