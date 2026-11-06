import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { useNavigate } from "@tanstack/react-router";
import { MoreHorizontalIcon } from "lucide-react";
import { useState } from "react";

import { requestConfirmDialog } from "../confirmDialog";
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
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "../components/ui/menu";
import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { projectEnvironment } from "../state/projects";
import { useOrchestrationCommand } from "../state/use-orchestration-command";
import { botKey, usePrimaryBotKey } from "./primaryBot";

function reportFailure(title: string, result: Parameters<typeof squashAtomCommandFailure>[0]) {
  const error = squashAtomCommandFailure(result);
  toastManager.add(
    stackedThreadToast({
      type: "error",
      title,
      description: error instanceof Error ? error.message : "Something went wrong.",
    }),
  );
}

/** Row actions for one Bot: rename, pin, primary, hide, delete. */
export function BotRowMenu(props: { readonly bot: EnvironmentProject }) {
  const { bot } = props;
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(bot.title);
  const [primaryKey, setPrimaryKey] = usePrimaryBotKey();
  const navigate = useNavigate();
  const updateProject = useOrchestrationCommand(projectEnvironment.update, {
    reportFailure: false,
  });
  const deleteProject = useOrchestrationCommand(projectEnvironment.delete, {
    reportFailure: false,
  });
  const isPrimary = primaryKey === botKey(bot);

  const update = async (
    input: {
      title?: string;
      pinned?: boolean;
      archived?: boolean;
    },
    failureTitle: string,
  ) => {
    const result = await updateProject({
      environmentId: bot.environmentId,
      input: { projectId: bot.id, ...input },
    });
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      reportFailure(failureTitle, result);
    }
  };

  const remove = async () => {
    const confirmed = await requestConfirmDialog(
      `Delete ${bot.title}? Its conversations and routines are removed. The folder with its instructions and memory stays on disk.`,
      { variant: "destructive" },
    );
    if (confirmed !== true) return;
    const result = await deleteProject({
      environmentId: bot.environmentId,
      input: { projectId: bot.id, force: true },
    });
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) reportFailure("Could not delete the Bot", result);
      return;
    }
    if (isPrimary) setPrimaryKey(null);
    void navigate({ to: "/" });
  };

  return (
    <>
      <Menu>
        <MenuTrigger
          render={
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Actions for ${bot.title}`}
              className="size-6 shrink-0"
            />
          }
        >
          <MoreHorizontalIcon className="size-3.5" />
        </MenuTrigger>
        <MenuPopup side="bottom" align="end">
          <MenuItem
            onClick={() => {
              setName(bot.title);
              setRenaming(true);
            }}
          >
            Rename
          </MenuItem>
          <MenuItem
            onClick={() => void update({ pinned: bot.pinnedAt == null }, "Could not pin the Bot")}
          >
            {bot.pinnedAt == null ? "Pin" : "Unpin"}
          </MenuItem>
          <MenuItem disabled={isPrimary} onClick={() => setPrimaryKey(botKey(bot))}>
            {isPrimary ? "Primary Bot" : "Make primary"}
          </MenuItem>
          <MenuSeparator />
          <MenuItem onClick={() => void update({ archived: true }, "Could not hide the Bot")}>
            Hide from sidebar
          </MenuItem>
          <MenuItem variant="destructive" onClick={() => void remove()}>
            Delete
          </MenuItem>
        </MenuPopup>
      </Menu>
      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogPopup className="w-full sm:w-[26rem]">
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = name.trim();
              if (trimmed.length === 0 || trimmed === bot.title) {
                setRenaming(false);
                return;
              }
              setRenaming(false);
              void update({ title: trimmed }, "Could not rename the Bot");
            }}
          >
            <DialogHeader>
              <DialogTitle>Rename {bot.title}</DialogTitle>
              <DialogDescription>The folder and memory stay where they are.</DialogDescription>
            </DialogHeader>
            <DialogPanel>
              <Input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={60}
                aria-label="Bot name"
              />
            </DialogPanel>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setRenaming(false)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogPopup>
      </Dialog>
    </>
  );
}
