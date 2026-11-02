# CLAUDE.md

## Running anything node/npm

`node`, `npm`, and `npx` are **not on PATH** in this environment. Every command that
needs them must be run through the Nix flake, either by prefixing it:

```sh
nix develop --command npm run dev
nix develop --command npm run build
nix develop --command npm run lint
nix develop --command npx tsc --noEmit
```

or by entering the shell once and running commands normally for the rest of the session:

```sh
nix develop
npm run dev
```

If `npm`/`npx`/`node` aren't found, that's the signal you forgot `nix develop` — don't
conclude the toolchain is unavailable or skip verification.
