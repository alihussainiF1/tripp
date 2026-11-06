import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  type EnvironmentId,
  MIN_SCHEDULED_TASK_INTERVAL_MS,
  type ScheduledTaskUpsertInput,
  type ThreadId,
} from "@t3tools/contracts";
import { useState } from "react";

import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { useEnvironmentSettings } from "../hooks/useSettings";
import { resolveProjectDefaultProviderModelSelection } from "../providerInstances";
import { EMPTY_SERVER_PROVIDERS, serverEnvironment } from "../state/server";
import { useAtomCommand } from "../state/use-atom-command";
import { cn } from "../lib/utils";

type ScheduleKind = "daily" | "weekdays" | "hourly" | "interval";

const SCHEDULE_OPTIONS: ReadonlyArray<{ kind: ScheduleKind; label: string }> = [
  { kind: "daily", label: "Every day" },
  { kind: "weekdays", label: "Weekdays" },
  { kind: "hourly", label: "Every hour" },
  { kind: "interval", label: "Every N minutes" },
];

function buildSchedule(
  kind: ScheduleKind,
  timeOfDay: string,
  everyMinutes: number,
): ScheduledTaskUpsertInput["schedule"] {
  switch (kind) {
    case "daily":
      return { type: "fixed_time", timeOfDay };
    case "weekdays":
      return { type: "fixed_time", timeOfDay, weekdays: [1, 2, 3, 4, 5] };
    case "hourly":
      return { type: "interval", everyMs: 60 * 60_000 };
    case "interval":
      return {
        type: "interval",
        everyMs: Math.max(MIN_SCHEDULED_TASK_INTERVAL_MS, Math.round(everyMinutes) * 60_000),
      };
  }
}

/**
 * Creates a routine for a Bot: a scheduled task that posts into the Bot's
 * conversation, runs in the Bot's folder, and uses the Bot's default model.
 */
export function AddRoutineDialog(props: {
  readonly environmentId: EnvironmentId;
  readonly bot: EnvironmentProject;
  /** The conversation the routine posts into. A new conversation is started when null. */
  readonly threadId: ThreadId | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="w-full sm:w-[32rem]">
        <AddRoutineForm {...props} onClose={() => props.onOpenChange(false)} />
      </DialogPopup>
    </Dialog>
  );
}

function AddRoutineForm(props: {
  readonly environmentId: EnvironmentId;
  readonly bot: EnvironmentProject;
  readonly threadId: ThreadId | null;
  readonly onClose: () => void;
}) {
  const { environmentId, bot } = props;
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<ScheduleKind>("weekdays");
  const [timeOfDay, setTimeOfDay] = useState("08:00");
  const [everyMinutes, setEveryMinutes] = useState(30);
  const [saving, setSaving] = useState(false);

  const settings = useEnvironmentSettings(environmentId);
  const providers =
    useAtomValue(serverEnvironment.providersValueAtom(environmentId)) ?? EMPTY_SERVER_PROVIDERS;
  const upsertTask = useAtomCommand(serverEnvironment.upsertScheduledTask, {
    reportFailure: false,
  });

  const canSubmit = title.trim().length > 0 && prompt.trim().length > 0 && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    const modelSelection = resolveProjectDefaultProviderModelSelection(providers, settings, bot.id);
    if (!modelSelection) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "No model available",
          description: "Enable a provider in Settings before adding a routine.",
        }),
      );
      return;
    }
    setSaving(true);
    try {
      const input: ScheduledTaskUpsertInput = {
        title: title.trim(),
        prompt: prompt.trim(),
        enabled: true,
        schedule: buildSchedule(kind, timeOfDay, everyMinutes),
        projectId: bot.id,
        threadId: props.threadId,
        threadMode: props.threadId ? "continue" : "new_thread",
        workspaceStrategy: { type: "root" },
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
      };
      const result = await upsertTask({ environmentId, input });
      if (result._tag === "Failure") {
        if (!isAtomCommandInterrupted(result)) {
          const error = squashAtomCommandFailure(result);
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not save the routine",
              description: error instanceof Error ? error.message : "The save failed.",
            }),
          );
        }
        return;
      }
      props.onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>Add a routine for {bot.title}</DialogTitle>
        <DialogDescription>
          {bot.title} runs the instruction on this schedule and posts the result
          {props.threadId ? " into this conversation." : " into a new conversation."}
        </DialogDescription>
      </DialogHeader>
      <DialogPanel>
        <div className="flex flex-col gap-4">
          <Input
            autoFocus
            aria-label="Routine name"
            placeholder="Name, for example Daily briefing"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={80}
          />
          <Textarea
            aria-label="Instruction"
            placeholder="What should the Bot do each time? Say where to look, what to produce, and when to stop and ask."
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={4}
          />
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">When to run</span>
            <div className="flex flex-wrap gap-2">
              {SCHEDULE_OPTIONS.map((option) => (
                <button
                  key={option.kind}
                  type="button"
                  aria-pressed={kind === option.kind}
                  onClick={() => setKind(option.kind)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    kind === option.kind
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {kind === "daily" || kind === "weekdays" ? (
              <Input
                type="time"
                aria-label="Time of day"
                className="w-32"
                value={timeOfDay}
                onChange={(event) => setTimeOfDay(event.target.value)}
              />
            ) : kind === "interval" ? (
              <Input
                type="number"
                aria-label="Minutes between runs"
                className="w-32"
                min={1}
                value={everyMinutes}
                onChange={(event) => setEveryMinutes(Number(event.target.value) || 1)}
              />
            ) : null}
          </div>
        </div>
      </DialogPanel>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={props.onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {saving ? "Saving…" : "Add routine"}
        </Button>
      </DialogFooter>
    </form>
  );
}
