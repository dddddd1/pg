import { useDBStore } from "@/stores";
import { cn } from "@/utils/classnames";
import { DataViewer } from "./data-viewer";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { modal } from "@/components/ui/modals";
import { OnMount } from "@monaco-editor/react";
import { Button } from "@/components/ui/button";
import { CodeEditor } from "@/components/ui/code-editor";
import { forwardRef, ComponentProps, useRef, useEffect, useState } from "react";
import { useIsDesktop } from "@/components/hooks/use-is-desktop";
import { AllDatabaseSchemaTree } from "@/components/interfaces/schema-tree";
import {
  IconReload,
  IconPlayerPlay,
  IconTableColumn,
  IconDotsVertical,
  IconLoader,
} from "@tabler/icons-react";
import {
  ResizablePanel,
  ResizableHandle,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface QueryTabProps extends ComponentProps<"div"> {
  tabId: string;
}

export const QueryTab = forwardRef<HTMLDivElement, QueryTabProps>(
  ({ className, tabId, ...props }, ref) => {
    const isDesktop = useIsDesktop();

    const editor = useRef<Parameters<OnMount>["0"]>();
    const [isExecuting, setIsExecuting] = useState(false);

    const tab = useDBStore((s) => {
      const db = s.databases[s.active!.name];
      return db.tabs.find((t) => t.id === tabId);
    });

    const activeTabId = useDBStore((s) => s.databases[s.active!.name].activeTabId);
    const isActive = activeTabId === tabId;

    const setQuery = (query: string | undefined) =>
      useDBStore.setState((s) => {
        const connection = s.active!;
        const t = s.databases[connection.name].tabs.find((t) => t.id === tabId);
        if (t) {
          t.query = query;
        }
      });

    const runAllQuery = () => {
      if (!tab?.query || !isActive) return;

      setIsExecuting(true);

      useDBStore
        .getState()
        .execute(tab.query, tabId)
        .then(() => toast.success("completed", { duration: 500 }))
        .catch((err) => toast.error((err as Error).message, { duration: 500 }))
        .finally(() => setIsExecuting(false));
    };

    const runSelectedQuery = () => {
      if (!editor.current || !isActive) return;

      const selection = editor.current.getSelection();

      if (!selection)
        return toast.error("no selected query to run", { duration: 1000 });

      const query = editor.current.getModel()?.getValueInRange(selection);

      if (!query || query.trim().length === 0)
        return toast.error("no selected query to run", { duration: 1000 });

      setIsExecuting(true);

      useDBStore
        .getState()
        .execute(query, tabId)
        .then(() => toast.success("completed", { duration: 500 }))
        .catch((err) => toast.error((err as Error).message, { duration: 500 }))
        .finally(() => setIsExecuting(false));
    };

    useEffect(() => {
      if (isActive && tab) {
        setIsExecuting(tab.isExecuting);
      }
    }, [tab?.isExecuting, isActive]);

    if (!tab) return null;

    const lastHistory = tab.history ? tab.history[tab.history.length - 1] : undefined;

    if (tab.lastError)
      return (
        <div
          ref={ref}
          {...props}
          className={cn("flex size-full flex-1 flex-col p-0", className)}
        >
          <div className="flex size-full flex-col items-center justify-center gap-2 bg-muted text-center font-mono text-destructive text-xs">
            <div>{tab.lastError}</div>
            <div>({lastHistory?.executionTime} ms)</div>
          </div>
        </div>
      );

    return (
      <div
        ref={ref}
        {...props}
        className={cn("flex size-full flex-1 flex-col p-0", className)}
      >
        <ResizablePanelGroup
          direction="horizontal"
          className="h-full flex-1"
          autoSaveId={`playground-layout-${tabId}`}
        >
          {isDesktop && (
            <>
              <ResizablePanel id="database-schema" defaultSize={20} order={1}>
                <div className="flex h-full flex-col gap-2 overflow-hidden p-2">
                  <div className="flex flex-row items-center justify-between border-b py-1">
                    <Label>Schema</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-6"
                          onClick={() => useDBStore.getState().reload()}
                        >
                          <IconReload className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Reload Schema</TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="flex-1 overflow-auto">
                    <AllDatabaseSchemaTree />
                  </div>
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle direction="vertical" />
            </>
          )}
          <ResizablePanel id="main-editor" order={2}>
            <ResizablePanelGroup direction="vertical">
              <ResizablePanel id="query-editor" className="flex">
                <div className="relative flex w-full flex-col gap-y-2 p-2 md:block md:gap-y-0 md:p-0">
                  <div className="flex items-center justify-between gap-2">
                    {!isDesktop && (
                      <Button
                        size="xs"
                        variant="outline"
                        className="gap-1 text-xs"
                        onClick={() =>
                          modal.open({ children: <AllDatabaseSchemaTree /> })
                        }
                      >
                        <IconTableColumn className="size-4" />
                        <span>Table</span>
                      </Button>
                    )}
                    <div className="right-4 bottom-2 z-50 flex items-center gap-0.5 md:absolute">
                      <Button
                        size="xs"
                        onClick={runAllQuery}
                        className="gap-1 text-xs md:rounded-r-none"
                        disabled={tab.query == undefined || tab.query.trim().length === 0 || isExecuting}
                      >
                        {isExecuting ? (
                          <IconLoader className="size-4 animate-spin" />
                        ) : (
                          <span>Run</span>
                        )}
                        <IconPlayerPlay className="size-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild className="hidden md:flex">
                          <Button
                            size="icon"
                            className="size-7 rounded-l-none"
                            disabled={tab.query == undefined || !tab.query.trim().length || isExecuting}
                          >
                            <IconDotsVertical className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={runSelectedQuery}>
                            Run Selection
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <CodeEditor
                    value={tab.query}
                    language="pgsql"
                    onChange={setQuery}
                    className="bg-muted"
                    defaultLanguage="pgsql"
                    onMount={(_editor, monaco) => {
                      editor.current = _editor;

                      editor.current.addCommand(
                        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
                        runSelectedQuery
                      );
                    }}
                    options={{
                      folding: isDesktop,
                      lineNumbers: isDesktop ? "on" : "off",
                      readOnly: isExecuting,
                    }}
                  />
                </div>
              </ResizablePanel>
              {tab.datagrid && tab.datagrid.length > 0 && (
                <>
                  <ResizableHandle withHandle direction="vertical" />
                  <ResizablePanel id="data-viewer" className="flex">
                    <DataViewer data={tab.datagrid} tabId={tabId} />
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    );
  }
);