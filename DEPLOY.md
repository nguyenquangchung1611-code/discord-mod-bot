# Deploying the bot to a host

This bot is a **background worker** — it connects out to Discord and does **not**
listen on an HTTP port. Pick a host/plan that supports always-on workers (not a
"web service" that sleeps on inactivity).

## Environment variables (all platforms)

| Variable | Required | Notes |
|---|---|---|
| `DISCORD_TOKEN` | ✅ | Bot token from the Developer Portal |
| `CLIENT_ID` | ✅ | Application ID (only needed for command registration) |
| `GUILD_ID` | recommended | Your server ID — makes slash commands appear instantly |
| `REGISTER_ON_START` | recommended | Set to `true` so the bot registers `/rules` & `/strikes` on boot (no shell step needed) |
| `DATA_DIR` | recommended | Path to a **persistent volume** so `strikes.json` survives redeploys (e.g. `/data`) |

> Without a persistent `DATA_DIR`, strike counts reset on every redeploy/restart.
> Everything else (rules, wordlists) is baked into the deploy, so it's fine.

---

## Option A — Railway (easiest)

1. Push this folder to a GitHub repo.
2. On <https://railway.app> → **New Project → Deploy from GitHub repo** → pick it.
3. Railway auto-detects the Dockerfile (or Node). It runs `node index.js`.
4. **Variables** tab → add `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`,
   `REGISTER_ON_START=true`, `DATA_DIR=/data`.
5. **Volumes** → **New Volume** → mount path `/data`.
6. Deploy. Check **Deploy Logs** for `Logged in as ...`.

## Option B — Fly.io

1. Install flyctl and `fly launch` in this folder (it detects the Dockerfile).
   Say **no** to adding a public IP / HTTP service — it's a worker.
2. Create a volume: `fly volumes create data --size 1`
3. In `fly.toml` add a mount:
   ```toml
   [[mounts]]
     source = "data"
     destination = "/data"
   ```
4. Set secrets:
   ```bash
   fly secrets set DISCORD_TOKEN=... CLIENT_ID=... GUILD_ID=... REGISTER_ON_START=true DATA_DIR=/data
   ```
5. `fly deploy` → `fly logs` to confirm login.

## Option C — Render

1. Push to GitHub.
2. On <https://render.com> → **New → Background Worker** (NOT a Web Service —
   web services sleep and bind a port; this bot does neither).
3. Connect the repo. Render uses the Dockerfile, or set start command `node index.js`.
4. **Environment** → add the variables above, `DATA_DIR=/data`.
5. **Disks** → add a persistent disk mounted at `/data`.
6. Create the worker and watch logs for `Logged in as ...`.

---

## After first deploy
- Confirm the log line `Logged in as <bot>#1234`.
- In Discord, run `/rules list` to confirm slash commands registered.
- Make sure the bot's role is **above** the members it should moderate
  (Server Settings → Roles), or timeouts will fail.
- Set `logChannelId` in `rules.json` to a mod channel, commit, and redeploy
  (or edit and `/rules reload` if your host gives you a shell).

## Updating rules later
Because rules live in `rules.json` / `wordlists/*.txt` baked into the deploy,
the simplest workflow is: edit → commit → push → host redeploys. Or use the
`/rules add|remove` and `/rules reload` slash commands for quick live changes
(note: live edits made via slash commands are lost on redeploy unless you also
commit them to the repo).
