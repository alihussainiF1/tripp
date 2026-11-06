# tripp — spec v0.1 (for review)

tripp is a Grok Bot style app built as a fork of T3 Code. You create named Bots, talk to them from any device, give them standing instructions and memory, and put them on schedules. Underneath, every Bot runs on T3 Code's existing machinery: provider adapters (Claude Code, Codex, Grok Build, Cursor, OpenCode, …), threads, scheduled tasks, the MCP orchestrator, terminals and browser previews, and remote access.

Decisions already made: fresh fork of `pingdotgg/t3code` main → `alihussainiF1/tripp`, checkout at `/home/ali/code_dev/tripp`, web app first, self-hosted on this Linux box first with a cloud deploy path, no "Grok" in branding.

---

## 1. What Grok Bot is (research summary)

From xAI's docs and community reimplementations:

- **Bots** are durable, named teammates. Each has a name, avatar (shape + colour, generated, or uploaded), optional label, _one ongoing conversation_, and memory that accumulates. There is no instructions form; you define the job in chat and say "remember that". No model picker.
- **Primary Bot** is your main contact; it checks in and coordinates the others.
- **Memory** is per Bot: preferences, rules, a dated work log, plus a few shared facts (name, time zone). Viewed and edited through chat.
- **Routines** attach a schedule or event trigger to one Bot. Managed in the Bot's details: name, "When to run", Pause/Resume, Test, Edit, Delete, run history. Results post into the Bot's chat.
- **Skills** are reusable instruction files shared by all your Bots.
- **The computer**: every Bot has a browser, terminal and filesystem; you can open it, watch, and take over for logins.
- **Chat**: composer with attachments, dictation, voice, `@mentions` of Bots/routines/apps; transcript shows tool activity, files, questions and approval cards. Group chats with 2 to 6 Bots. `Cmd/Ctrl+K` palette, `Cmd/Ctrl+N` new Bot.
- **Shell**: left sidebar is the Bot roster (pin, sections, hide); header shows the Bot's name and opens its details; right panel shows details, routines, library and the computer preview. Mobile mirrors this with a home list and Bot profile.
- **Connect apps** installs integrations and MCP servers account-wide.

## 2. Mapping onto T3 Code

The cheapest faithful mapping, confirmed against the upstream code at commit `6577c6b6` (2026-11-06):

| Grok Bot concept      | tripp implementation                                                                                                                                                                                   | Why this works                                                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bot                   | A T3 **project** whose folder lives at `~/.tripp/bots/<slug>/` and holds `bot.json`, `AGENTS.md`, `CLAUDE.md` and `MEMORY.md`                                                                          | Every provider already reads `AGENTS.md`/`CLAUDE.md` from the project folder. Zero changes to the six provider adapters. Project already has `title`, `projectIcon` (emoji/monogram/icon + colour) and `defaultModelSelection`. |
| Bot's conversation    | The Bot project's most recent non-archived **thread**. "New conversation" starts a fresh thread; older ones appear under History.                                                                      | Threads already give streaming, approvals, attachments, forks, tags, pinning.                                                                                                                                                   |
| Standing instructions | `AGENTS.md` and `CLAUDE.md` in the Bot folder, written by the Bot editor and editable by the Bot itself                                                                                                | Native loading per provider.                                                                                                                                                                                                    |
| Memory                | `MEMORY.md` in the Bot folder; instructions tell the agent when to append; "Remember that…" works by convention. Shared facts in `~/.tripp/shared/FACTS.md`, referenced from every Bot's instructions. | Cross-provider, inspectable, versionable.                                                                                                                                                                                       |
| Model                 | Project `defaultModelSelection`, shown as a picker in the Bot editor (an improvement on Grok Bot)                                                                                                      | Exists.                                                                                                                                                                                                                         |
| Routines              | T3 **scheduled tasks** filtered by `projectId` = Bot, surfaced in the Bot details panel with Pause/Test/Edit/Delete                                                                                    | Scheduler supports interval, fixed time, once, webhook; `continue` mode posts into the ongoing chat.                                                                                                                            |
| Primary Bot           | A key in tripp's settings; its chat is the home screen                                                                                                                                                 | Trivial.                                                                                                                                                                                                                        |
| Bot-to-bot handoff    | `@BotName` in a message resolves to the target Bot's thread; the agent instructions teach `t3_thread_send` / `t3_thread_read` / `t3_thread_wait`                                                       | MCP orchestrator already exposes these.                                                                                                                                                                                         |
| Open computer         | T3's terminal drawer plus the browser preview panel, scoped to the Bot's thread                                                                                                                        | Exists. Grok Bot's cloud VM becomes "this server".                                                                                                                                                                              |
| Skills                | `~/.tripp/skills/` installed into each provider's skill directory                                                                                                                                      | Convention plus a small installer.                                                                                                                                                                                              |
| Connect apps          | T3 **Settings → Integrations** and MCP servers (renamed "Connect apps")                                                                                                                                | Exists.                                                                                                                                                                                                                         |
| Access from anywhere  | `tripp serve` on this box, reached over Tailscale or a Cloudflare tunnel, responsive web app installable as a PWA                                                                                      | T3's pairing, auth, and remote access all exist. T3 Connect's relay is dropped in v1.                                                                                                                                           |

Everything above is additive. tripp code lives in new folders (`apps/web/src/tripp/`, `packages/tripp/`) with a handful of small edits to existing files, so `git merge upstream/main` stays practical.

## 3. Data layout

### `~/.tripp/bots/<slug>/bot.json`

One file per Bot. ~5 to 30 rows total.

| Field        | Links to           | Meaning                                                              |
| ------------ | ------------------ | -------------------------------------------------------------------- |
| `id` key     | → T3 `projects.id` | The Bot _is_ this project                                            |
| `slug`       |                    | Folder name, URL-safe                                                |
| `name`       |                    | Display name                                                         |
| `label`      |                    | Optional job title shown under the name                              |
| `avatar`     |                    | `{ kind: "shape" \| "emoji" \| "image", shape, color, emoji, file }` |
| `createdAt`  |                    | ISO time                                                             |
| `primary`    |                    | `true` on exactly one Bot                                            |
| `workspaces` |                    | Folders this Bot may work in, listed in its instructions             |

### Bot folder files

- `AGENTS.md` and `CLAUDE.md`: generated from a template plus the user's job description. The template tells the Bot its name, how to use memory, how to reach other Bots, and approval boundaries.
- `MEMORY.md`: sections _Preferences_, _Rules_, _Work log_ (dated).
- `routines/` is not needed: routines are scheduled tasks in T3's database with `projectId` = this Bot.

### tripp settings (in T3 `settings.json`, key `tripp`)

`primaryBotId`, `timezone`, `hiddenBotIds`, `sections` (name → bot ids), `pinnedBotIds`.

No new database tables in v1. If Bot metadata outgrows this, v2 adds a `bots` table and RPC following the scheduled tasks pattern.

## 4. UI

Design direction: calm, chat-first, few chromes. One accent colour, large type, generous spacing, Bot avatars as the primary visual anchor. Dark and light. A new `tripp` theme in T3's theme system, Inter stays as the typeface.

### Desktop shell

```
┌──────────────┬──────────────────────────────────────┬──────────────────┐
│ tripp     +  │ ◉ Scout · Research assistant     ⋯  │ Details           │
│ 🔍 Search ⌘K │ ────────────────────────────────────  │ ───────────────   │
│              │                                       │ Model  Claude     │
│ PINNED       │   Scout: Morning briefing is ready…   │ Memory  12 facts  │
│ ◉ Scout    ● │   [file card] briefing-2026-11-06.md  │                   │
│ ◉ Ops        │                                       │ ROUTINES          │
│              │   You: Add the Linear tickets too     │ ⏰ Daily briefing  │
│ ALL BOTS     │                                       │    8:00 weekdays  │
│ ◉ Writer     │   Scout is working…  [▸ terminal]     │ ⏸ Weekly digest   │
│ ◉ Finance    │                                       │                   │
│              │                                       │ HISTORY           │
│              │ ┌───────────────────────────────────┐ │ Today · Yesterday │
│ Hidden (2)   │ │ Message Scout…        📎 🎙  ⏎   │ │                   │
│ ⚙ Settings   │ └───────────────────────────────────┘ │ Open computer ▸   │
└──────────────┴──────────────────────────────────────┴──────────────────┘
```

- **Sidebar**: Bot roster replaces T3's project/thread tree. Pin, sections, hide, right-click menu (Rename, Change avatar, Hide, Delete). `+` opens _Create a Bot_. Unread dot when a Bot has a result, question or approval waiting.
- **Chat**: T3's `ChatView`, `MessagesTimeline` and `ChatComposer` reused as-is. Header shows avatar, name, label, status (Idle / Working / Needs you). Clicking the name opens Details.
- **Details panel**: Model picker, Instructions (opens editor), Memory (read and edit `MEMORY.md`), Routines (list with toggle, Test, Edit, Delete, "Add routine"), History (past conversations), Open computer (terminal + browser preview).
- **Create a Bot** dialog: name, avatar shape + colour (or emoji), label, model, provider; first message is prefilled with "Here's your job: …" so the user defines the role in chat, matching Grok Bot.
- **Command palette** (`⌘K`): switch Bots, search messages, routines, settings. `⌘N` new Bot.
- **Settings** keeps T3's pages, re-grouped: General, Appearance, Providers ("Agents"), Connect apps (Integrations + MCP), Routines (all), Sharing & access, Computers.

### Phone (responsive web, PWA)

Home = Bot list with search and `+`. Tap a Bot → chat full screen. Bot name → profile sheet with Routines, Memory, History. Sidebar drawer and right-panel sheet already exist in T3's web app below 768px and 980px.

### Removed or hidden from the T3 UI

Project folder tree, worktree and branch controls, pull request pages, diff review, source control settings. They stay in the code behind a "Developer mode" toggle so nothing breaks and merges stay simple.

## 5. Phases

**Phase 0: foundation (1 to 2 days)**
Fork, rename user-visible branding to tripp (about 200 strings, new icon), point telemetry off, drop T3 Connect from the UI, add the `tripp` theme, confirm `vp i` + `vp run dev` work on this box, register the repo as a T3 Code project.

**Phase 1: Bots (3 to 5 days)**
Bot folder format and templates; Bot service in `packages/tripp` (create, list, rename, avatar, delete, primary); roster sidebar; Create a Bot dialog; Bot chat header; Details panel with Model, Instructions, Memory, History. Memory and instruction conventions written into the Bot template. Home screen = primary Bot.

**Phase 2: Routines and handoffs (2 to 3 days)**
Routines tab backed by scheduled tasks in `continue` mode; Add routine prefill; Test run; run status. `@Bot` mention resolution and the handoff instruction block. Unread indicators. Command palette entries.

**Phase 3: Anywhere (1 to 2 days)**
`tripp serve` as a systemd service on this box; Tailscale route plus pairing from phone; PWA manifest and icons; a `Dockerfile` and a deploy note for a VPS so the same build runs in the cloud. Web push stays out until a relay exists.

**Later**: group chats (one thread, several Bots taking turns via MCP), voice chat, image avatars, skills library UI, shared Bots and multi-user, Electron and native mobile builds, a tripp relay for push notifications and public webhooks.

## 6. What the fork loses and how we cover it

| Lost                                                                                              | Covered by                                                      |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| T3 Connect tunnel, push notifications, public webhook URLs (needs their Clerk + Cloudflare relay) | Tailscale or Cloudflare tunnel in v1; own relay later if wanted |
| Hosted app.t3.codes                                                                               | `tripp serve` serves the web build itself                       |
| Desktop and mobile store builds, auto-update feeds                                                | Web + PWA first; rebuild later                                  |
| Model manifest from upstream GitHub                                                               | Keep the URL for now; mirror into the repo later                |
| Telemetry to T3's ingest                                                                          | Disabled                                                        |

## 7. Environment on this box (checked 2026-11-06)

- Installed: Claude Code, Codex, Cursor agent, Tailscale (this host is `holmes`, 100.93.197.49), Docker, `vp`.
- Not installed: Grok Build CLI, OpenCode, cloudflared. Grok Build is optional; install only if you want xAI models as a Bot provider.
- Machine: 24 cores, 62 GB RAM, 769 GB free. Plenty for running several Bots and the dev server.
- Tailscale already works, so phone access in Phase 3 is a pairing link away.

## 8. Open questions for Ali

1. Bots as separate folders is the recommended shape. Do you also want a shared `/workspace` folder that all Bots work in by default, like Grok Bot?
2. Default provider for new Bots: Claude Code, Codex, or ask every time?
3. Phone access: Tailscale (easiest, private) or a Cloudflare tunnel (works from any network without the Tailscale app)?
4. Should "Developer mode" expose the full T3 Code UI (worktrees, PRs, diffs) or should those be removed outright?

## Sources

- xAI Grok Bot docs: overview, get-started, bots, skills-routines-and-automations, chat-and-collaboration, computer-and-apps, mobile, shared-bots (docs.x.ai/grok-bot/*)
- Reviews: therundown.ai/tools/grok-bot, buildfastwithai.com (grok-bot-review), mem0.ai/blog (grok-bot-review), stork.ai/en/grok-bot, aireiter.com, agent-finder.co, layer3labs.io/guides/grok-bot-review
- Reimplementations and companions: github.com/ashhart/OpenBot, github.com/Deepusleepy/t3-tots
- T3 Code source at /tmp/t3code-upstream (commit 6577c6b6), docs/internals, docs/orchestration-v2, AGENTS.md

---

## Status (2026-11-06)

Delivered and verified end to end on holmes (dev server and the production service):

- Fork, rename, icons, telemetry off, Bots/Developer view toggle.
- Bot roster sidebar; Create a Bot (name, label, avatar, model, job); Bot folder with `bot.json`, `AGENTS.md`, `CLAUDE.md`, `MEMORY.md`.
- Bot details card: New conversation, Instructions editor, Memory editor, Routines (add, pause, resume, test, edit), History.
- Routines run on schedule and post into the Bot's conversation (verified with a one-minute routine).
- Bot-to-Bot handoff through the T3 MCP tools (Ops asked Scout a question and reported back).
- Home opens the primary Bot's ongoing conversation. Row actions: rename, pin, make primary, hide, delete. Hidden Bots list.
- Production: `vp run build`, `scripts/tripp-service.sh install`, bound to the Tailscale address on port 3901. See `docs/tripp/RUN.md`.

Not done yet: a dedicated tripp theme (Iris is close), image avatars, group chats, voice, shared Bots, Electron and native mobile builds, T3 Connect replacement (tunnel, push, public webhooks).
