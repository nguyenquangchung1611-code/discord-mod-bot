# Discord Mod Bot (keyword/regex)

A lightweight content-moderation bot. It scans every message against rules you
define, and on a match it **deletes the message**, **times the user out**, and
**logs** the action. No external API, no cost.

## What it does
- Matches messages against **keyword** and **regex** rules in `rules.json`.
- Auto-applies a Discord timeout that **escalates with repeat offenses** (no bans).
- Re-scans **edited** messages so violations can't be slipped in via edit.
- **DMs the user privately** with the rule broken, the timeout length, and the
  strike number — nothing is posted publicly in the channel.
- Exempts configured roles/users (e.g. mods).
- Lets admins manage rules live with `/rules`, and strikes with `/strikes`.

## Escalation (timeout length)
Timeout length is driven by how many strikes a user has, **not** by which rule
they broke. Default ladder:

| Strike | Timeout |
|---|---|
| 1st | 1 hour |
| 2nd | 6 hours |
| 3rd and beyond | 1 day (max) |

Strikes older than `strikeResetDays` (default 30) are forgiven, so the count
resets for users who behave. Strike history persists across restarts in
`strikes.json` (auto-created, git-ignored).

Tune both in the `settings.escalation` block of `rules.json`:
```jsonc
"escalation": {
  "timeoutMinutesLadder": [60, 360, 1440], // minutes per strike tier
  "strikeResetDays": 30                     // 0 = strikes never expire
}
```

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Create the bot** at <https://discord.com/developers/applications>:
   - **Bot** tab → *Reset Token* → copy it.
   - Enable **MESSAGE CONTENT INTENT** (Privileged Gateway Intents).
   - **OAuth2 → URL Generator** → scopes `bot` + `applications.commands`,
     permissions **Moderate Members** + **Manage Messages** + **Read Messages**.
     Open the generated URL to invite the bot.
   - In your server's role settings, drag the bot's role **above** the roles of
     people it should be able to time out (Discord blocks timeouts otherwise).

3. **Configure secrets**
   ```bash
   cp .env.example .env
   ```
   Fill in `DISCORD_TOKEN`, `CLIENT_ID`, and (recommended) `GUILD_ID`.

4. **Register slash commands**
   ```bash
   npm run register
   ```

5. **Run the bot**
   ```bash
   npm start
   ```

## Editing rules

Edit `rules.json` directly, then run `/rules reload` in Discord (or restart).

```jsonc
{
  "id": "invite-links",            // unique name
  "description": "No invite links",// shown in logs
  "type": "regex",                 // "keyword" or "regex"
  "patterns": ["discord\\.gg/\\w+"],// list; any match triggers the rule
  "enabled": true                  // set false to disable without deleting
}
```
> Timeout length comes from the escalation ladder above, not from individual
> rules — so every rule shares the same 1h / 6h / 1d progression.

- **keyword** rules match whole words (word-boundary guarded, case-insensitive).
- **regex** rules use raw JavaScript regex — remember to escape backslashes in JSON (`\\`).

### Wordlists from a file
For long lists, put a rule's terms in a `.txt` file (one per line, `#` for
comments) and reference it with `patternsFile`:
```jsonc
{
  "id": "profanity",
  "type": "keyword",
  "patternsFile": "wordlists/profanity.txt",
  "patterns": [],   // optional extra inline terms, merged with the file
  "enabled": true
}
```
A starter [`wordlists/profanity.txt`](wordlists/profanity.txt) (common English
profanity) ships with the bot — edit it and run `/rules reload`.

**For a comprehensive multi-language slur/profanity list**, drop in the
community-maintained [LDNOOBW list](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words):
download the `en` file (or any language) into `wordlists/` and point a rule's
`patternsFile` at it. It's the de-facto standard used by many platforms.

> ⚠️ Word-list filters always have trade-offs: they miss creative spelling
> ("f u c k", "sh!t") and can false-positive on substrings. The bot guards
> whole-word matches so "assistant" won't trigger on "ass", but no keyword list
> is perfect — review your mod logs and tune the list over time.

### `settings` block in `rules.json`
| Field | Meaning |
|---|---|
| `deleteViolatingMessage` | delete the message on a match (true/false) |
| `dmUserOnViolation` | DM the user privately with the rule, timeout, and strike (true/false) |
| `logChannelId` | channel ID to post moderation logs (blank = no logging) |
| `exemptRoleIds` | role IDs never moderated (e.g. mods) |
| `exemptUserIds` | user IDs never moderated |

## Managing rules & strikes from Discord
Requires the **Moderate Members** permission.
- `/rules list` — show all rules
- `/rules add id:<name> type:<keyword|regex> pattern:<text> [description:<text>]`
- `/rules remove id:<name>`
- `/rules reload` — re-read `rules.json` from disk
- `/strikes check user:@someone` — show a user's active strike count
- `/strikes clear user:@someone` — forgive a user's strikes (resets to 0)

> Replace the placeholder `badword1`/`badword2` entries in `rules.json` with your
> own banned terms before going live.
