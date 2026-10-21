# Foundry troubleshooting

## Node version

Use **Node 22.13.0 or later** (see `.nvmrc`):

```bash
fnm use   # or nvm use
npm run build
```

## Cursor API key

Resolution order:

1. `export CURSOR_API_KEY=...`
2. Pi stored key: `~/.pi/agent/auth.json` → `cursor` provider

Verify (never prints the key):

```bash
foundry doctor --for plan
foundry doctor --for plan --deep   # live Composer smoke (~60s)
```

## Cursor SDK

Use Node 22.13.0 or later, then run `npm ci` and `npm run build`. The patched SDK no longer uses sqlite3 or requires native module rebuilds.

## Pi CLI

Install Pi separately. Foundry requires `pi` on PATH for the hackathon demo matrix.

## GitHub publish

```bash
foundry publish              # local markdown drafts only
foundry publish --approve    # prompts before each gh issue create
```

Requires `gh auth login` for GitHub creation.

## Project layout

```bash
foundry init                 # creates .foundry/config.toml
foundry doctor --fix         # repairs Foundry-owned state only
```
