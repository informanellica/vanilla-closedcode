# closedcode

The closedcode server/CLI sidecar, written in plain Node.js (ESM JavaScript —
there is no TypeScript build step in this package).

It is not run directly from source. It is bundled with esbuild into `dist/` and
shipped inside the desktop app:

```bash
node script/build-node.js
```

See the repository root for full build and packaging instructions.
