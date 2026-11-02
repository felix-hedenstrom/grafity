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

### Stopping a dev server you started

Never stop a dev server with a broad matcher like `pkill -f vite` or `pkill -f node` —
the user often already has their own `npm run dev` running (Vite will print "Port 5173
is in use, trying another one..." if so), and a broad pkill kills that one too. Only
kill the specific PID you started (e.g. capture it from `run_in_background` / `$!`, or
`kill` the exact PID), and only tear down a server you personally launched for
verification — never touch the user's own processes.

## Walker naming convention

- **Spaceship** — the main walker (`walkers[0]`, rendered with `variant="main"` in `WalkerToken`). The one the camera follows; its arrival at the goal ends the run.
- **UFO** — every other walker: extra searchers and Bidirectional Search's reverse half (rendered with `variant="forward"`/`"reverse"`, the tinted sub-ship shape). Code and upgrade copy should call these "UFOs," not "other searchers" or "non-main walkers."
