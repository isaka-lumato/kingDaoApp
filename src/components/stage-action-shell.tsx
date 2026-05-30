"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Drawer } from "@base-ui/react/drawer";
import { Popover } from "@base-ui/react/popover";
import type { StageField } from "@/lib/pipeline";
import StageActionMenu from "./stage-action-menu";

const MD = "(min-width: 768px)";
function subscribe(cb: () => void) {
  const mq = window.matchMedia(MD);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function getSnapshot() {
  return window.matchMedia(MD).matches;
}
function getServerSnapshot() {
  // SSR can't know the viewport — pick desktop so initial markup is consistent.
  // Both branches render the same trigger; only the menu surface differs, and
  // the menu only mounts when open.
  return true;
}

type Props = {
  trigger: ReactNode;
  consignment: React.ComponentProps<typeof StageActionMenu>["consignment"];
  targetStage?: StageField;
  /** Optional className for the trigger wrapper (e.g. to make the row look tappable). */
  triggerClassName?: string;
};

export default function StageActionShell({
  trigger,
  consignment,
  targetStage,
  triggerClassName,
}: Props) {
  const isDesktop = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  if (isDesktop) {
    return (
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          render={(props) => (
            <button type="button" {...props} className={triggerClassName}>
              {trigger}
            </button>
          )}
        />
        <Popover.Portal>
          <Popover.Positioner sideOffset={8} align="start">
            <Popover.Popup className="z-50 rounded-lg border border-border bg-card shadow-2xl outline-none">
              <StageActionMenu
                consignment={consignment}
                targetStage={targetStage}
                onActionComplete={close}
              />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    );
  }

  return (
    <Drawer.Root open={open} onOpenChange={setOpen}>
      <Drawer.Trigger
        render={(props) => (
          <button type="button" {...props} className={triggerClassName}>
            {trigger}
          </button>
        )}
      />
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <Drawer.Popup className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl border border-border bg-card shadow-2xl outline-none pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto my-2 h-1 w-10 rounded-full bg-muted-foreground/30" />
          <StageActionMenu
            consignment={consignment}
            targetStage={targetStage}
            onActionComplete={close}
          />
        </Drawer.Popup>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
