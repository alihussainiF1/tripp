import { useAtomValue } from "@effect/atom-react";
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  AuthOrchestrationOperateScope,
  type EnvironmentId,
  type ScheduledTask,
  type ThreadId,
} from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import {
  BrainIcon,
  CalendarClockIcon,
  FileTextIcon,
  MessageSquarePlusIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
} from "lucide-react";
import { useState } from "react";

import { isSidebarHiddenThread } from "../components/Sidebar.logic";
import { ThreadDetailsControl } from "../components/chat/ThreadDetailsControl";
import { ThreadDetailsSection } from "../components/chat/ThreadDetailsSection";
import {
  THREAD_DETAILS_PANEL_ICON_CLASS,
  THREAD_DETAILS_PANEL_ROW_CONTENT_CLASS,
} from "../components/chat/threadDetailsPanelStyles";
import {
  ScheduledRelativeLabel,
  scheduleLabel,
} from "../components/settings/ScheduledTasksSettings";
import { ProjectFavicon } from "../components/ProjectFavicon";
import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { cn } from "../lib/utils";
import { useThreadShellsForProjectRefs } from "../state/entities";
import { useEnvironmentQuery } from "../state/query";
import { serverEnvironment } from "../state/server";
import { readEnvironmentScope } from "../state/session";
import { useAtomCommand } from "../state/use-atom-command";
import { buildThreadRouteParams } from "../threadRoutes";
import { BotFileDialog } from "./BotFileDialog";

const STATUS_DOT_CLASS: Record<ScheduledTask["lastRunStatus"], string> = {
  never: "bg-muted-foreground/40",
  running: "bg-info",
  succeeded: "bg-success",
  failed: "bg-destructive",
};

function routineLine(task: ScheduledTask) {
  return (
    <>
      {scheduleLabel(task.schedule)}
      {task.blockedByPolicy !== undefined ? (
        ` · ${task.blockedByPolicy}`
      ) : task.enabled && task.nextRunAt !== null ? (
        <>
          {" · next "}
          <ScheduledRelativeLabel value={task.nextRunAt} />
        </>
      ) : task.enabled ? (
        ""
      ) : (
        " · paused"
      )}
    </>
  );
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Bot, Routines and History sections for the thread details card of a Bot conversation. */
export function BotDetailsPanel(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly bot: EnvironmentProject;
}) {
  const { environmentId, bot } = props;
  const navigate = useNavigate();
  const handleNewThread = useNewThreadHandler();
  const [editing, setEditing] = useState<"instructions" | "memory" | null>(null);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  const canOperate = useAtomValue(
    serverEnvironment.runScheduledTaskNow.permissionAtom(environmentId),
  );
  const tasksQuery = useEnvironmentQuery(
    serverEnvironment.scheduledTasksLive({ environmentId, input: {} }),
  );
  const setTaskEnabled = useAtomCommand(serverEnvironment.setScheduledTaskEnabled, {
    label: "routine toggle",
  });
  const runTaskNow = useAtomCommand(serverEnvironment.runScheduledTaskNow, {
    label: "routine test run",
  });
  const routines = (tasksQuery.data?.tasks ?? []).filter((task) => task.projectId === bot.id);

  const threads = useThreadShellsForProjectRefs([scopeProjectRef(environmentId, bot.id)])
    .filter((thread) => thread.archivedAt == null && !isSidebarHiddenThread(thread))
    .sort((left, right) => (left.updatedAt < right.updatedAt ? 1 : -1))
    .slice(0, 8);

  const reportFailure = (title: string, error: unknown) => {
    toastManager.add(
      stackedThreadToast({
        type: "error",
        title,
        description: error instanceof Error ? error.message : String(error),
      }),
    );
  };

  const toggleRoutine = async (task: ScheduledTask) => {
    if (busyTaskId !== null || !readEnvironmentScope(environmentId, AuthOrchestrationOperateScope))
      return;
    setBusyTaskId(task.id);
    const result = await setTaskEnabled({
      environmentId,
      input: { id: task.id, enabled: !task.enabled },
    });
    setBusyTaskId(null);
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      reportFailure("Could not update the routine", squashAtomCommandFailure(result));
    }
  };

  const testRoutine = async (task: ScheduledTask) => {
    if (busyTaskId !== null || !readEnvironmentScope(environmentId, AuthOrchestrationOperateScope))
      return;
    setBusyTaskId(task.id);
    const result = await runTaskNow({ environmentId, input: { id: task.id } });
    setBusyTaskId(null);
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      reportFailure("Could not start the routine", squashAtomCommandFailure(result));
    }
  };

  const openRoutineEditor = (taskId?: ScheduledTask["id"]) => {
    if (taskId) {
      void navigate({ to: "/settings/scheduled-tasks", search: { environmentId, taskId } });
    } else {
      void navigate({ to: "/settings/scheduled-tasks", search: { environmentId } });
    }
  };

  return (
    <>
      <ThreadDetailsSection headingId="bot-details-heading" title="Bot" separated={false}>
        <div className="flex flex-col">
          <div className={cn("flex h-9 items-center", THREAD_DETAILS_PANEL_ROW_CONTENT_CLASS)}>
            <ProjectFavicon project={bot} className="size-5 shrink-0" />
            <span className="truncate text-sm font-medium text-foreground">{bot.title}</span>
          </div>
          <ThreadDetailsControl
            onClick={() =>
              void handleNewThread(scopeProjectRef(environmentId, bot.id), { envMode: "local" })
            }
          >
            <MessageSquarePlusIcon className={THREAD_DETAILS_PANEL_ICON_CLASS} />
            New conversation
          </ThreadDetailsControl>
          <ThreadDetailsControl onClick={() => setEditing("instructions")}>
            <FileTextIcon className={THREAD_DETAILS_PANEL_ICON_CLASS} />
            Instructions
          </ThreadDetailsControl>
          <ThreadDetailsControl onClick={() => setEditing("memory")}>
            <BrainIcon className={THREAD_DETAILS_PANEL_ICON_CLASS} />
            Memory
          </ThreadDetailsControl>
        </div>
      </ThreadDetailsSection>

      <ThreadDetailsSection
        headingId="bot-routines-heading"
        title="Routines"
        actions={
          <ThreadDetailsControl
            size="icon-xs"
            variant="ghost"
            part="icon"
            aria-label="Add routine"
            onClick={() => openRoutineEditor()}
          >
            <PlusIcon className="size-3.5" />
          </ThreadDetailsControl>
        }
      >
        {routines.length === 0 ? (
          <p
            className={cn(
              "py-1 text-2xs text-muted-foreground",
              THREAD_DETAILS_PANEL_ROW_CONTENT_CLASS,
            )}
          >
            No routines yet. Ask {bot.title} to set one up, or add one here.
          </p>
        ) : (
          <ul className="m-0 max-h-[13.5rem] list-none overflow-y-auto p-0">
            {routines.map((task) => (
              <li
                key={task.id}
                className={cn(
                  "flex items-center rounded-lg py-1.5",
                  THREAD_DETAILS_PANEL_ROW_CONTENT_CLASS,
                )}
              >
                <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
                  <CalendarClockIcon className={THREAD_DETAILS_PANEL_ICON_CLASS} />
                  <span
                    aria-hidden
                    className={cn(
                      "absolute -top-1 -right-1 size-1.5 rounded-full",
                      STATUS_DOT_CLASS[task.lastRunStatus],
                    )}
                  />
                </span>
                <button
                  type="button"
                  className="min-w-0 flex-1 cursor-pointer text-left"
                  onClick={() => openRoutineEditor(task.id)}
                >
                  <span className="block truncate text-sm font-medium text-foreground/80">
                    {task.title}
                  </span>
                  <span className="block truncate text-2xs text-muted-foreground">
                    {routineLine(task)}
                  </span>
                </button>
                <ThreadDetailsControl
                  size="icon-xs"
                  variant="ghost"
                  part="icon"
                  aria-label={task.enabled ? `Pause ${task.title}` : `Resume ${task.title}`}
                  disabled={busyTaskId !== null}
                  onClick={() => void toggleRoutine(task)}
                >
                  {task.enabled ? (
                    <PauseIcon className="size-3.5" />
                  ) : (
                    <PlayIcon className="size-3.5" />
                  )}
                </ThreadDetailsControl>
                {task.schedule.type === "webhook" ? null : (
                  <ThreadDetailsControl
                    size="icon-xs"
                    variant="ghost"
                    part="icon"
                    aria-label={`Test ${task.title} now`}
                    disabled={
                      !canOperate || busyTaskId !== null || task.lastRunStatus === "running"
                    }
                    onClick={() => void testRoutine(task)}
                  >
                    <span className="text-2xs font-medium">Test</span>
                  </ThreadDetailsControl>
                )}
              </li>
            ))}
          </ul>
        )}
      </ThreadDetailsSection>

      <ThreadDetailsSection headingId="bot-history-heading" title="History">
        {threads.length === 0 ? (
          <p
            className={cn(
              "py-1 text-2xs text-muted-foreground",
              THREAD_DETAILS_PANEL_ROW_CONTENT_CLASS,
            )}
          >
            No conversations yet.
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {threads.map((thread) => (
              <li key={thread.id}>
                <ThreadDetailsControl
                  aria-current={thread.id === props.threadId ? "page" : undefined}
                  onClick={() =>
                    void navigate({
                      to: "/$environmentId/$threadId",
                      params: buildThreadRouteParams(scopeThreadRef(environmentId, thread.id)),
                    })
                  }
                >
                  <span className="min-w-0 flex-1 truncate">{thread.title}</span>
                  <span className="shrink-0 text-2xs text-muted-foreground">
                    {formatWhen(thread.updatedAt)}
                  </span>
                </ThreadDetailsControl>
              </li>
            ))}
          </ul>
        )}
      </ThreadDetailsSection>

      <BotFileDialog
        environmentId={environmentId}
        cwd={bot.workspaceRoot}
        relativePath="AGENTS.md"
        mirrorTo={["CLAUDE.md"]}
        title={`${bot.title}'s instructions`}
        description="Standing instructions every provider reads before a turn. Saved to AGENTS.md and CLAUDE.md in the Bot's folder."
        open={editing === "instructions"}
        onOpenChange={(open) => setEditing(open ? "instructions" : null)}
      />
      <BotFileDialog
        environmentId={environmentId}
        cwd={bot.workspaceRoot}
        relativePath="MEMORY.md"
        title={`${bot.title}'s memory`}
        description="What the Bot has chosen to remember. Edit or remove anything here; the Bot reads it at the start of every task."
        open={editing === "memory"}
        onOpenChange={(open) => setEditing(open ? "memory" : null)}
      />
    </>
  );
}
