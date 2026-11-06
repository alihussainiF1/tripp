import { useAtomValue } from "@effect/atom-react";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  AuthFilesystemWriteScope,
  AuthOrchestrationOperateScope,
  type EnvironmentId,
  type ModelSelection,
  type ProjectIconColor,
  type ProjectIconOverride,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { useState } from "react";

import { ProjectMonogram } from "../components/ProjectMonogram";
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
import { ProviderModelPicker } from "../components/chat/ProviderModelPicker";
import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { useEnvironmentSettings, useUpdateEnvironmentSettings } from "../hooks/useSettings";
import { newProjectId } from "../lib/utils";
import { getCustomModelOptionsByInstance } from "../modelSelection";
import {
  providerInstanceEntriesFor,
  resolveProjectDefaultProviderModelSelection,
} from "../providerInstances";
import { projectEnvironment } from "../state/projects";
import { EMPTY_SERVER_PROVIDERS, serverEnvironment } from "../state/server";
import { readEnvironmentScope } from "../state/session";
import { useAtomCommand } from "../state/use-atom-command";
import { cn } from "~/lib/utils";
import { botFolderFiles, botWorkspaceRoot } from "./bots";

const AVATAR_COLORS: ReadonlyArray<ProjectIconColor> = [
  "violet",
  "blue",
  "teal",
  "green",
  "amber",
  "orange",
  "rose",
  "gray",
];

const monogramSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function monogramFor(name: string): string {
  const first = monogramSegmenter.segment(name.trim())[Symbol.iterator]().next().value;
  return first ? first.segment.toUpperCase() : "B";
}

function avatarFor(name: string, color: ProjectIconColor, emoji: string): ProjectIconOverride {
  const trimmedEmoji = emoji.trim();
  if (trimmedEmoji.length > 0) return { kind: "emoji", emoji: trimmedEmoji };
  return { kind: "monogram", text: monogramFor(name), color };
}

function CreateBotForm(props: {
  readonly environmentId: EnvironmentId;
  readonly onClose: () => void;
}) {
  const { environmentId } = props;
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [emoji, setEmoji] = useState("");
  const [color, setColor] = useState<ProjectIconColor>("violet");
  const [job, setJob] = useState("");
  const [modelKey, setModelKey] = useState<ModelSelection | null>(null);
  const [saving, setSaving] = useState(false);

  const settings = useEnvironmentSettings(environmentId);
  const providers =
    useAtomValue(serverEnvironment.providersValueAtom(environmentId)) ?? EMPTY_SERVER_PROVIDERS;
  const instanceEntries = providerInstanceEntriesFor(providers, settings, null);
  const defaultSelection = resolveProjectDefaultProviderModelSelection(providers, settings, null);
  const activeSelection = modelKey ?? defaultSelection;
  const activeInstanceId =
    activeSelection?.instanceId ?? instanceEntries[0]?.instanceId ?? ("" as never);
  const activeModel = activeSelection?.model ?? "";
  const modelOptionsByInstance = getCustomModelOptionsByInstance(
    settings,
    providers,
    activeInstanceId,
    activeModel,
  );

  const createProject = useAtomCommand(projectEnvironment.create, { reportFailure: false });
  const updateProject = useAtomCommand(projectEnvironment.update, { reportFailure: false });
  const writeFile = useAtomCommand(projectEnvironment.writeFile, { reportFailure: false });
  const updateSettings = useUpdateEnvironmentSettings(environmentId);
  const handleNewThread = useNewThreadHandler();

  const canSubmit = name.trim().length > 0 && !saving;

  const fail = (title: string, error: unknown) => {
    toastManager.add(
      stackedThreadToast({
        type: "error",
        title,
        description: error instanceof Error ? error.message : "Something went wrong.",
      }),
    );
  };

  const submit = async () => {
    if (!canSubmit) return;
    if (
      !readEnvironmentScope(environmentId, AuthOrchestrationOperateScope) ||
      !readEnvironmentScope(environmentId, AuthFilesystemWriteScope)
    ) {
      fail("Cannot create a Bot", new Error("This connection cannot create projects or files."));
      return;
    }
    setSaving(true);
    try {
      const projectId = newProjectId();
      const trimmedName = name.trim();
      const created = await createProject({
        environmentId,
        input: {
          projectId,
          title: trimmedName,
          workspaceRoot: botWorkspaceRoot(trimmedName),
          createWorkspaceRootIfMissing: true,
          defaultModelSelection: null,
        },
      });
      if (created._tag === "Failure") {
        if (!isAtomCommandInterrupted(created)) {
          fail("Could not create the Bot", squashAtomCommandFailure(created));
        }
        return;
      }
      const workspaceRoot = created.value.workspaceRoot;
      const files = botFolderFiles({
        name: trimmedName,
        label,
        job,
        createdAt: new Date().toISOString(),
      });
      for (const [relativePath, contents] of Object.entries(files)) {
        const written = await writeFile({
          environmentId,
          input: { cwd: workspaceRoot, relativePath, contents },
        });
        if (written._tag === "Failure") {
          if (!isAtomCommandInterrupted(written)) {
            fail(`Could not write ${relativePath}`, squashAtomCommandFailure(written));
          }
          return;
        }
      }
      const updated = await updateProject({
        environmentId,
        input: { projectId, projectIcon: avatarFor(trimmedName, color, emoji), faviconPath: null },
      });
      if (updated._tag === "Failure" && !isAtomCommandInterrupted(updated)) {
        fail("Could not save the Bot's avatar", squashAtomCommandFailure(updated));
      }
      // Per-project defaults live in server settings once the server folded them.
      // "local" matters: a Bot folder is not a git repo, so a worktree default would fail.
      await updateSettings({
        projectSettingsOverrides: {
          [projectId]: {
            defaultModelSelection: activeSelection
              ? createModelSelection(activeSelection.instanceId, activeSelection.model)
              : null,
            defaultThreadEnvMode: "local",
          },
        },
      });
      props.onClose();
      const prompt =
        job.trim().length > 0
          ? `Hi ${trimmedName}. Here is your job:\n\n${job.trim()}\n\nRead AGENTS.md and MEMORY.md in your folder, save anything lasting from this message to memory, then introduce yourself in two lines and tell me what you need to get started.`
          : `Hi ${trimmedName}. Read AGENTS.md and MEMORY.md in your folder, then introduce yourself in two lines and ask me what your job should be.`;
      await handleNewThread(scopeProjectRef(environmentId, projectId), {
        envMode: "local",
        prompt,
      });
    } finally {
      setSaving(false);
    }
  };

  const preview = avatarFor(name || "Bot", color, emoji);

  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>Create a Bot</DialogTitle>
        <DialogDescription>
          A Bot is a teammate with a name, a job, and its own memory. Describe the job here or in
          the first message.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted text-2xl">
              {preview.kind === "emoji" ? (
                <span aria-hidden>{preview.emoji}</span>
              ) : preview.kind === "monogram" ? (
                <ProjectMonogram text={preview.text} color={preview.color} className="size-9" />
              ) : null}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Input
                autoFocus
                placeholder="Name, for example Scout"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={60}
              />
              <Input
                placeholder="Label, for example Research assistant (optional)"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                maxLength={80}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Colour</span>
            {AVATAR_COLORS.map((option) => (
              <button
                key={option}
                type="button"
                aria-label={option}
                aria-pressed={option === color}
                onClick={() => setColor(option)}
                className={cn(
                  "size-6 rounded-full border-2 border-transparent p-0.5 transition-colors",
                  option === color && "border-foreground",
                )}
              >
                <ProjectMonogram text=" " color={option} className="size-full rounded-full" />
              </button>
            ))}
            <Input
              aria-label="Emoji instead of a monogram"
              placeholder="or an emoji"
              className="w-28"
              value={emoji}
              onChange={(event) => setEmoji(event.target.value)}
              maxLength={8}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">Model</span>
            <div>
              <ProviderModelPicker
                environmentId={environmentId}
                disabled={saving}
                activeInstanceId={activeInstanceId}
                model={activeModel}
                lockedProvider={null}
                instanceEntries={instanceEntries}
                modelOptionsByInstance={modelOptionsByInstance}
                isComposerOwned={false}
                onInstanceModelChange={(instanceId, model) =>
                  setModelKey(createModelSelection(instanceId, model))
                }
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">Job</span>
            <Textarea
              placeholder="What this Bot owns, which sources it uses, and what it must ask before doing."
              value={job}
              onChange={(event) => setJob(event.target.value)}
              rows={4}
            />
          </div>
        </div>
      </DialogPanel>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={props.onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {saving ? "Creating…" : "Create"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CreateBotDialog(props: {
  readonly environmentId: EnvironmentId | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="w-full sm:w-[34rem]">
        {props.environmentId ? (
          <CreateBotForm
            environmentId={props.environmentId}
            onClose={() => props.onOpenChange(false)}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Create a Bot</DialogTitle>
              <DialogDescription>
                Connect a computer first, then create a Bot on it.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" onClick={() => props.onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogPopup>
    </Dialog>
  );
}
