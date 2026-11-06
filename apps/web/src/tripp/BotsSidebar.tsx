import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useNavigate, useParams } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useState } from "react";

import { ProjectFavicon } from "../components/ProjectFavicon";
import { SidebarChromeFooter, SidebarChromeHeader } from "../components/sidebar/SidebarChrome";
import { SidebarContent, SidebarGroup } from "../components/ui/sidebar";
import { Button } from "../components/ui/button";
import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { useThreadShell } from "../state/entities";
import { usePrimaryEnvironmentId } from "../state/environments";
import { buildThreadRouteParams } from "../threadRoutes";
import { cn } from "~/lib/utils";
import { type Bot, useBots } from "./bots";
import { CreateBotDialog } from "./CreateBotDialog";
import { useDeveloperMode } from "./developerMode";

function useActiveProjectKey(): string | null {
  const params = useParams({ strict: false }) as {
    environmentId?: string;
    threadId?: string;
  };
  const ref =
    params.environmentId && params.threadId
      ? scopeThreadRef(params.environmentId as never, params.threadId as never)
      : null;
  const shell = useThreadShell(ref);
  return shell ? `${shell.environmentId}:${shell.projectId}` : null;
}

function BotRow(props: {
  readonly bot: Bot;
  readonly active: boolean;
  readonly onOpen: () => void;
}) {
  const { bot } = props;
  const subtitle = bot.working
    ? "Working…"
    : bot.needsYou
      ? "Needs you"
      : (bot.latestThread?.title ?? "No conversations yet");
  return (
    <button
      type="button"
      onClick={props.onOpen}
      aria-current={props.active ? "page" : undefined}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
        props.active
          ? "bg-sidebar-row-selected text-sidebar-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-row-hover",
      )}
    >
      <ProjectFavicon project={bot.project} className="size-7 shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{bot.name}</span>
        <span
          className={cn(
            "truncate text-xs",
            bot.needsYou ? "text-warning" : "text-sidebar-muted-foreground",
          )}
        >
          {subtitle}
        </span>
      </span>
      {bot.working ? (
        <span
          aria-label="Working"
          className="size-2 shrink-0 animate-pulse rounded-full bg-primary"
        />
      ) : bot.needsYou ? (
        <span aria-label="Needs you" className="size-2 shrink-0 rounded-full bg-warning" />
      ) : null}
    </button>
  );
}

export function BotsSidebar(props: { readonly isElectron: boolean }) {
  const bots = useBots();
  const activeKey = useActiveProjectKey();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const navigate = useNavigate();
  const handleNewThread = useNewThreadHandler();
  const [createOpen, setCreateOpen] = useState(false);
  const [, setDeveloperMode] = useDeveloperMode();

  const openBot = (bot: Bot) => {
    if (bot.latestThread) {
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(
          scopeThreadRef(bot.latestThread.environmentId, bot.latestThread.id),
        ),
      });
      return;
    }
    void handleNewThread(bot.ref, { envMode: "local" });
  };

  return (
    <>
      <SidebarChromeHeader isElectron={props.isElectron} />
      <SidebarContent className="min-h-full">
        <SidebarGroup>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between px-2 pb-1">
              <span className="text-2xs font-medium tracking-wide text-sidebar-muted-foreground uppercase">
                Bots
              </span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Create a Bot"
                className="size-6"
                onClick={() => setCreateOpen(true)}
              >
                <PlusIcon className="size-3.5" />
              </Button>
            </div>
            {bots.length === 0 ? (
              <div className="flex flex-col items-start gap-2 px-2 py-6 text-sm text-sidebar-muted-foreground">
                <p>No Bots yet. A Bot is a teammate with a name, a job, and a memory.</p>
                <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
                  Create your first Bot
                </Button>
              </div>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {bots.map((bot) => (
                  <li key={`${bot.project.environmentId}:${bot.project.id}`}>
                    <BotRow
                      bot={bot}
                      active={activeKey === `${bot.project.environmentId}:${bot.project.id}`}
                      onOpen={() => openBot(bot)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SidebarGroup>
        <SidebarGroup className="mt-auto">
          <button
            type="button"
            onClick={() => setDeveloperMode(true)}
            className="px-2 py-1 text-left text-2xs text-sidebar-muted-foreground hover:text-sidebar-foreground"
          >
            Switch to developer view
          </button>
        </SidebarGroup>
      </SidebarContent>
      <SidebarChromeFooter />
      <CreateBotDialog
        environmentId={primaryEnvironmentId}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </>
  );
}
