import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { ScopedProjectRef } from "@t3tools/contracts";
import { isThreadWorking } from "@t3tools/client-runtime/state/thread-inbox";
import { isSidebarHiddenThread } from "../components/Sidebar.logic";
import { useProjects, useThreadShellsForProjectRefs } from "../state/entities";

/**
 * A tripp Bot is a T3 project whose folder lives under `~/.tripp/bots/<slug>/`.
 * The folder holds the Bot's standing instructions and memory, which every provider
 * reads natively, so no server change is needed to give a Bot a personality.
 */
const TRIPP_BOTS_ROOT = "~/.tripp/bots";
const TRIPP_BOTS_SEGMENT = "/.tripp/bots/";

export function isBotProject(project: Pick<EnvironmentProject, "workspaceRoot">): boolean {
  return project.workspaceRoot.replaceAll("\\", "/").includes(TRIPP_BOTS_SEGMENT);
}

function botSlug(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug.slice(0, 48) : "bot";
}

export function botWorkspaceRoot(name: string): string {
  return `${TRIPP_BOTS_ROOT}/${botSlug(name)}`;
}

export interface BotFolderFiles {
  readonly "bot.json": string;
  readonly "AGENTS.md": string;
  readonly "CLAUDE.md": string;
  readonly "MEMORY.md": string;
}

export function botFolderFiles(input: {
  readonly name: string;
  readonly label: string;
  readonly job: string;
  readonly createdAt: string;
}): BotFolderFiles {
  const name = input.name.trim();
  const label = input.label.trim();
  const job = input.job.trim();
  const manifest = {
    version: 1,
    name,
    label,
    createdAt: input.createdAt,
  };
  const instructions = `# ${name}

You are ${name}${label ? `, ${label}` : ""}. You are a durable AI teammate in tripp: you keep one
ongoing conversation with your user, you remember what matters, and you do real work in the tools
and folders you are given.

## Your job

${job || "Your user will describe your job in the first message. Ask for it if they have not."}

## Memory

- \`MEMORY.md\` in this folder is your long-term memory. Read it at the start of every task.
- When the user says "remember that ..." or states a lasting preference, rule, or fact, append it
  to the matching section of \`MEMORY.md\` right away and confirm in one short line.
- Keep a dated line under **Work log** for each task you finish, with the outcome.
- Never store passwords, API keys, or card numbers in memory.

## Working style

- State the outcome first, then what you did. Keep replies short.
- Ask before sending, publishing, deleting, purchasing, or changing production systems.
- When a task needs a folder or repo, work inside it and say which one you used.
- You can reach other Bots through the tripp MCP tools: list threads to find a Bot by name, then
  send it a message and wait for its reply. Say when you hand work to another Bot.
`;
  const memory = `# ${name} memory

## Preferences

## Rules

## Facts

## Work log
`;
  return {
    "bot.json": `${JSON.stringify(manifest, null, 2)}\n`,
    "AGENTS.md": instructions,
    "CLAUDE.md": instructions,
    "MEMORY.md": memory,
  };
}

export interface Bot {
  readonly ref: ScopedProjectRef;
  readonly project: EnvironmentProject;
  readonly name: string;
  readonly latestThread: EnvironmentThreadShell | null;
  readonly working: boolean;
  readonly needsYou: boolean;
}

function threadNeedsYou(thread: EnvironmentThreadShell): boolean {
  return (
    thread.hasPendingApprovals ||
    thread.hasPendingUserInput ||
    thread.hasActionableProposedPlan ||
    (thread.pendingSubagentRequest ?? null) !== null ||
    (thread.pendingGuestMessageCount ?? 0) > 0
  );
}

export function useBots(): ReadonlyArray<Bot> {
  const projects = useProjects();
  const botProjects = projects.filter(
    (project) => project.archivedAt == null && isBotProject(project),
  );
  const refs = botProjects.map((project) => scopeProjectRef(project.environmentId, project.id));
  const shells = useThreadShellsForProjectRefs(refs);
  const latestByProject = new Map<string, EnvironmentThreadShell>();
  const workingByProject = new Set<string>();
  const needsYouByProject = new Set<string>();
  for (const shell of shells) {
    if (shell.archivedAt != null || isSidebarHiddenThread(shell)) continue;
    const key = `${shell.environmentId}:${shell.projectId}`;
    const current = latestByProject.get(key);
    if (!current || shell.updatedAt > current.updatedAt) latestByProject.set(key, shell);
    if (isThreadWorking(shell)) workingByProject.add(key);
    if (threadNeedsYou(shell)) needsYouByProject.add(key);
  }
  const bots = botProjects.map((project, index): Bot => {
    const key = `${project.environmentId}:${project.id}`;
    return {
      ref: refs[index]!,
      project,
      name: project.title,
      latestThread: latestByProject.get(key) ?? null,
      working: workingByProject.has(key),
      needsYou: needsYouByProject.has(key),
    };
  });
  // Pinned first, then most recent conversation first, then name.
  return bots.sort((left, right) => {
    const pinned = Number(right.project.pinnedAt != null) - Number(left.project.pinnedAt != null);
    if (pinned !== 0) return pinned;
    const leftAt = left.latestThread?.updatedAt ?? "";
    const rightAt = right.latestThread?.updatedAt ?? "";
    if (leftAt !== rightAt) return leftAt < rightAt ? 1 : -1;
    return left.name.localeCompare(right.name);
  });
}
