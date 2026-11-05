/**
 * Minimal ambient typings for the node APIs the sim CLI uses. src/ is typechecked under
 * tsconfig.app.json (DOM libs, no node types), so 'node:fs' isn't known there — same reason
 * cli.ts declares `process` itself rather than pulling in all of @types/node.
 */
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string
}
