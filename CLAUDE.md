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

## Walker naming convention

- **Spaceship** — the main walker (`walkers[0]`, rendered with `variant="main"` in `WalkerToken`). The one the camera follows; its arrival at the goal ends the run.
- **UFO** — every other walker: extra searchers and Bidirectional Search's reverse half (rendered with `variant="forward"`/`"reverse"`, the tinted sub-ship shape). Code and upgrade copy should call these "UFOs," not "other searchers" or "non-main walkers."
