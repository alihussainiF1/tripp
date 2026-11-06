import {
  executeAtomQuery,
  isAtomCommandInterrupted,
  runAtomCommand,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { useEffect, useState } from "react";

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
import { Textarea } from "../components/ui/textarea";
import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { projectEnvironment } from "../state/projects";

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly contents: string }
  | { readonly status: "error"; readonly message: string };

/**
 * Edits one text file in a Bot's folder. `mirrorTo` lists other files that
 * receive the same contents on save, so AGENTS.md and CLAUDE.md stay identical.
 */
export function BotFileDialog(props: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly relativePath: string;
  readonly mirrorTo?: ReadonlyArray<string>;
  readonly title: string;
  readonly description: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="w-full sm:w-[40rem]">
        {/* The popup mounts per open, so the editor below reloads the file each time. */}
        <BotFileEditor {...props} onClose={() => props.onOpenChange(false)} />
      </DialogPopup>
    </Dialog>
  );
}

function BotFileEditor(props: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly relativePath: string;
  readonly mirrorTo?: ReadonlyArray<string>;
  readonly title: string;
  readonly description: string;
  readonly onClose: () => void;
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const { environmentId, cwd, relativePath } = props;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- loads the file once per open; the popup remounts for each open
  useEffect(() => {
    let cancelled = false;
    void executeAtomQuery(
      appAtomRegistry,
      projectEnvironment.readFile({
        environmentId,
        input: { cwd, relativePath, allowMissing: true },
      }),
      { label: "Read Bot file", reportFailure: false, refresh: true },
    ).then((result) => {
      if (cancelled) return;
      if (result._tag === "Failure") {
        const error = squashAtomCommandFailure(result);
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not read the file.",
        });
        return;
      }
      setState({ status: "ready", contents: result.value.contents });
      setDraft(result.value.contents);
    });
    return () => {
      cancelled = true;
    };
  }, [environmentId, cwd, relativePath]);

  const save = async () => {
    setSaving(true);
    try {
      for (const path of [props.relativePath, ...(props.mirrorTo ?? [])]) {
        const written = await runAtomCommand(
          appAtomRegistry,
          projectEnvironment.writeFile,
          { environmentId, input: { cwd, relativePath: path, contents: draft } },
          { label: "Write Bot file", reportFailure: false },
        );
        if (written._tag === "Failure") {
          if (!isAtomCommandInterrupted(written)) {
            const error = squashAtomCommandFailure(written);
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title: `Could not save ${path}`,
                description: error instanceof Error ? error.message : "The save failed.",
              }),
            );
          }
          return;
        }
      }
      props.onClose();
    } finally {
      setSaving(false);
    }
  };

  const dirty = state.status === "ready" && draft !== state.contents;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{props.title}</DialogTitle>
        <DialogDescription>{props.description}</DialogDescription>
      </DialogHeader>
      <DialogPanel>
        {state.status === "loading" ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : state.status === "error" ? (
          <p className="text-sm text-destructive">{state.message}</p>
        ) : (
          <Textarea
            aria-label={props.relativePath}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={18}
            spellCheck={false}
          />
        )}
      </DialogPanel>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={props.onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={() => void save()} disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </>
  );
}
