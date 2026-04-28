import { useDBStore } from "@/stores";
import { cn } from "@/utils/classnames";
import { modal } from "@/components/ui/modals";
import { QueryTab } from "./query-tab";
import { Button } from "@/components/ui/button";
import { forwardRef, ComponentProps } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import {
  IconPlus,
  IconX,
  IconDownload,
  IconSettings,
} from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/sonner";
import { BackupRestoreModal } from "../backup-restore/modal";

export const QueryPlayground = forwardRef<
  HTMLDivElement,
  ComponentProps<"div">
>(({ className, ...props }, ref) => {
  const tabs = useDBStore((s) => s.databases[s.active!.name].tabs);
  const activeTabId = useDBStore((s) => s.databases[s.active!.name].activeTabId);

  const createNewTab = () => {
    useDBStore.getState().createTab();
  };

  const closeTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const db = useDBStore.getState().databases[useDBStore.getState().active!.name];
    if (db.tabs.length <= 1) {
      toast.error("cannot close the last tab");
      return;
    }
    useDBStore.getState().closeTab(tabId);
  };

  const switchTab = (tabId: string) => {
    useDBStore.getState().setActiveTab(tabId);
  };

  const openBackupModal = () => {
    modal.open({
      title: "Backup Database",
      children: <BackupRestoreModal type="backup" />,
      size: "lg",
    });
  };

  const openRestoreModal = () => {
    modal.open({
      title: "Restore Database",
      children: <BackupRestoreModal type="restore" />,
      size: "lg",
    });
  };

  const openBackupLogsModal = () => {
    modal.open({
      title: "Backup & Restore Logs",
      children: <BackupRestoreModal type="logs" />,
      size: "xl",
    });
  };

  return (
    <div
      ref={ref}
      {...props}
      className={cn("flex size-full flex-1 flex-col overflow-hidden", className)}
    >
      <div className="flex items-center justify-between border-b bg-muted/50 px-2 py-1">
        <Tabs.Root
          value={activeTabId}
          onValueChange={switchTab}
          className="flex-1"
        >
          <Tabs.List className="flex items-center gap-1 overflow-x-auto">
            {tabs.map((tab) => (
              <Tabs.Trigger
                key={tab.id}
                value={tab.id}
                className={cn(
                  "group flex items-center gap-1.5 rounded-t-lg px-3 py-1.5 text-sm transition-all",
                  "hover:bg-muted/80",
                  activeTabId === tab.id
                    ? "bg-background shadow-sm font-medium"
                    : "text-muted-foreground"
                )}
              >
                <span className="max-w-[150px] truncate">{tab.name}</span>
                {tab.isExecuting && (
                  <span className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
                )}
                <button
                  onClick={(e) => closeTab(tab.id, e)}
                  className={cn(
                    "ml-1 rounded p-0.5 opacity-0 transition-opacity",
                    "hover:bg-destructive/10 hover:text-destructive",
                    "group-hover:opacity-100"
                  )}
                >
                  <IconX className="h-3 w-3" />
                </button>
              </Tabs.Trigger>
            ))}
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={createNewTab}
            >
              <IconPlus className="h-4 w-4" />
            </Button>
          </Tabs.List>
        </Tabs.Root>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8">
              <IconSettings className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={openBackupModal}>
              <IconDownload className="mr-2 h-4 w-4" />
              <span>Backup Database</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={openRestoreModal}>
              <IconPlus className="mr-2 h-4 w-4" />
              <span>Restore Database</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={openBackupLogsModal}>
              <IconDownload className="mr-2 h-4 w-4" />
              <span>View Backup Logs</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1 overflow-hidden">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              "h-full w-full",
              activeTabId === tab.id ? "block" : "hidden"
            )}
          >
            <QueryTab tabId={tab.id} />
          </div>
        ))}
      </div>
    </div>
  );
});
