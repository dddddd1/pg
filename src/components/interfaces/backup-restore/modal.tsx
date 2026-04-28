import { useState, useCallback, useRef } from "react";
import { useDBStore, BackupRestoreLog } from "@/stores";
import { backupDatabase, backupTables } from "@/utils/backup-restore";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { modal } from "@/components/ui/modals";
import {
  IconDatabase,
  IconTable,
  IconLoader,
  IconCheck,
  IconX,
  IconFileUpload,
  IconDownload,
  IconPlus,
} from "@tabler/icons-react";
import { cn } from "@/utils/classnames";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface BackupRestoreModalProps {
  type: "backup" | "restore" | "logs";
}

export const BackupRestoreModal = ({ type }: BackupRestoreModalProps) => {
  const connection = useDBStore((s) => s.active!);
  const schema = useDBStore((s) => s.databases[s.active!.name].schema);
  const logs = useDBStore((s) => s.databases[s.active!.name].backupRestoreLogs);

  const [isProcessing, setIsProcessing] = useState(false);
  const [backupTarget, setBackupTarget] = useState<"database" | "tables">("database");
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredSchemas = schema?.filter((s) => {
    return !s.schema.startsWith("pg_") && s.schema !== "information_schema";
  }) || [];

  const toggleTable = (schemaName: string, tableName: string) => {
    const key = `${schemaName}.${tableName}`;
    setSelectedTables((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const toggleSchemaTables = (schemaName: string) => {
    const schemaTables = filteredSchemas.find((s) => s.schema === schemaName)?.tables || [];
    const allSelected = schemaTables.every((t) => selectedTables.has(`${schemaName}.${t.table}`));

    setSelectedTables((prev) => {
      const newSet = new Set(prev);
      schemaTables.forEach((t) => {
        const key = `${schemaName}.${t.table}`;
        if (allSelected) {
          newSet.delete(key);
        } else {
          newSet.add(key);
        }
      });
      return newSet;
    });
  };

  const performBackup = useCallback(async () => {
    if (!connection) return;

    modal.openConfirmModal({
      title: "Confirm Backup",
      children:
        backupTarget === "database"
          ? "Are you sure you want to backup the entire database?"
          : `Are you sure you want to backup ${selectedTables.size} selected table(s)?`,
      onConfirm: async () => {
        setIsProcessing(true);

        const logId = useDBStore.getState().addBackupRestoreLog({
          type: "backup",
          target: backupTarget === "database" ? connection.name : Array.from(selectedTables).join(", "),
          targetType: backupTarget,
          status: "pending",
          details: {
            tables: backupTarget === "tables" ? Array.from(selectedTables) : undefined,
          },
        });

        try {
          let result;

          if (backupTarget === "database") {
            result = await backupDatabase(connection.postgres, schema);
          } else {
            if (selectedTables.size === 0) {
              throw new Error("Please select at least one table to backup");
            }
            const tablesToBackup = Array.from(selectedTables).map((key) => {
              const [schemaName, ...tableParts] = key.split(".");
              return { schema: schemaName, table: tableParts.join(".") };
            });
            result = await backupTables(connection.postgres, tablesToBackup);
          }

          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const filename =
            backupTarget === "database"
              ? `backup-${connection.name}-${timestamp}.sql`
              : `backup-tables-${timestamp}.sql`;

          const blob = new Blob([result.sql], { type: "application/sql" });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          a.click();
          window.URL.revokeObjectURL(url);

          useDBStore.getState().updateBackupRestoreLog(logId, {
            status: "success",
            completedAt: new Date().toLocaleString(),
            filename,
            details: {
              tables: result.tables,
              rowCount: result.totalRows,
              size: `${(result.sql.length / 1024).toFixed(2)} KB`,
            },
          });

          toast.success(`Backup completed successfully. ${result.totalRows} rows backed up.`);
          modal.closeAll();
        } catch (error) {
          useDBStore.getState().updateBackupRestoreLog(logId, {
            status: "failed",
            completedAt: new Date().toLocaleString(),
            error: (error as Error).message,
          });
          toast.error(`Backup failed: ${(error as Error).message}`);
        } finally {
          setIsProcessing(false);
        }
      },
    });
  }, [connection, schema, backupTarget, selectedTables]);

  const performRestore = useCallback(async () => {
    if (!connection || !restoreFile) return;

    modal.openConfirmModal({
      title: "Confirm Restore",
      children: `Are you sure you want to restore from "${restoreFile.name}"? This will execute the SQL file and may modify existing data.`,
      onConfirm: async () => {
        setIsProcessing(true);

        const logId = useDBStore.getState().addBackupRestoreLog({
          type: "restore",
          target: restoreFile.name,
          targetType: "database",
          status: "pending",
          filename: restoreFile.name,
          details: {
            size: `${(restoreFile.size / 1024).toFixed(2)} KB`,
          },
        });

        try {
          const sql = await restoreFile.text();

          if (!sql.trim()) {
            throw new Error("The selected file is empty");
          }

          await connection.postgres.exec(sql);

          await useDBStore.getState().reload();

          useDBStore.getState().updateBackupRestoreLog(logId, {
            status: "success",
            completedAt: new Date().toLocaleString(),
          });

          toast.success("Restore completed successfully.");
          modal.closeAll();
        } catch (error) {
          useDBStore.getState().updateBackupRestoreLog(logId, {
            status: "failed",
            completedAt: new Date().toLocaleString(),
            error: (error as Error).message,
          });
          toast.error(`Restore failed: ${(error as Error).message}`);
        } finally {
          setIsProcessing(false);
        }
      },
    });
  }, [connection, restoreFile]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith(".sql")) {
        toast.error("Please select a .sql file");
        return;
      }
      setRestoreFile(file);
    }
  };

  const getStatusBadgeClass = (status: BackupRestoreLog["status"]) => {
    switch (status) {
      case "success":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "failed":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      case "pending":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    }
  };

  const getStatusIcon = (status: BackupRestoreLog["status"]) => {
    switch (status) {
      case "success":
        return <IconCheck className="h-4 w-4" />;
      case "failed":
        return <IconX className="h-4 w-4" />;
      case "pending":
        return <IconLoader className="h-4 w-4 animate-spin" />;
    }
  };

  const getTypeIcon = (type: "backup" | "restore") => {
    if (type === "backup") {
      return <IconDownload className="h-4 w-4 text-blue-500" />;
    }
    return <IconPlus className="h-4 w-4 text-green-500" />;
  };

  if (type === "logs") {
    return (
      <div className="max-h-[60vh] overflow-y-auto">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <IconDatabase className="h-12 w-12 mb-4 opacity-50" />
            <p>No backup or restore logs yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex flex-col gap-2 rounded-lg border p-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getTypeIcon(log.type)}
                    <span className="font-medium">
                      {log.type === "backup" ? "Backup" : "Restore"}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
                        getStatusBadgeClass(log.status)
                      )}
                    >
                      {getStatusIcon(log.status)}
                      {log.status}
                    </span>
                  </div>
                </div>
                <div className="text-muted-foreground text-xs">
                  <div>Target: {log.target}</div>
                  <div>Type: {log.targetType}</div>
                  <div>Created: {log.createdAt}</div>
                  {log.completedAt && <div>Completed: {log.completedAt}</div>}
                  {log.filename && <div>File: {log.filename}</div>}
                  {log.details?.tables && (
                    <div>Tables: {log.details.tables.join(", ")}</div>
                  )}
                  {log.details?.rowCount !== undefined && (
                    <div>Rows: {log.details.rowCount}</div>
                  )}
                  {log.details?.size && <div>Size: {log.details.size}</div>}
                  {log.error && (
                    <div className="text-destructive">Error: {log.error}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (type === "restore") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Select SQL File</Label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".sql"
            onChange={handleFileSelect}
            className="hidden"
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors hover:bg-muted/50"
          >
            <IconFileUpload className="h-8 w-8 text-muted-foreground" />
            {restoreFile ? (
              <div className="text-center">
                <p className="font-medium">{restoreFile.name}</p>
                <p className="text-muted-foreground text-xs">
                  {(restoreFile.size / 1024).toFixed(2)} KB
                </p>
              </div>
            ) : (
              <div className="text-center">
                <p className="font-medium">Click to select a SQL file</p>
                <p className="text-muted-foreground text-xs">
                  Only .sql files are supported
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button
            onClick={performRestore}
            disabled={!restoreFile || isProcessing}
            className="gap-2"
          >
            {isProcessing ? (
              <IconLoader className="h-4 w-4 animate-spin" />
            ) : (
              <IconPlus className="h-4 w-4" />
            )}
            <span>Restore</span>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Backup Target</Label>
        <Select
          value={backupTarget}
          onValueChange={(v) => setBackupTarget(v as "database" | "tables")}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="database">
              <div className="flex items-center gap-2">
                <IconDatabase className="h-4 w-4" />
                <span>Entire Database</span>
              </div>
            </SelectItem>
            <SelectItem value="tables">
              <div className="flex items-center gap-2">
                <IconTable className="h-4 w-4" />
                <span>Selected Tables</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {backupTarget === "tables" && (
        <div className="space-y-2">
          <Label>Select Tables</Label>
          <div className="max-h-[300px] overflow-y-auto rounded-lg border">
            {filteredSchemas.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                No tables available
              </div>
            ) : (
              <Accordion type="multiple" defaultValue={filteredSchemas.map((s) => s.schema)}>
                {filteredSchemas.map((schema) => (
                  <AccordionItem key={schema.schema} value={schema.schema}>
                    <AccordionTrigger className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSchemaTables(schema.schema);
                          }}
                          className="flex items-center gap-2"
                        >
                          <input
                            type="checkbox"
                            checked={
                              schema.tables.length > 0 &&
                              schema.tables.every((t) =>
                                selectedTables.has(`${schema.schema}.${t.table}`)
                              )
                            }
                            onChange={() => toggleSchemaTables(schema.schema)}
                            className="h-4 w-4 rounded border border-primary"
                          />
                          <IconDatabase className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{schema.schema}</span>
                          <span className="text-muted-foreground text-xs">
                            ({schema.tables.length} tables)
                          </span>
                        </button>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-0">
                      {schema.tables.map((table) => (
                        <div
                          key={table.table}
                          className="flex items-center gap-2 border-t px-3 py-2 hover:bg-muted/50"
                        >
                          <input
                            type="checkbox"
                            checked={selectedTables.has(`${schema.schema}.${table.table}`)}
                            onChange={() => toggleTable(schema.schema, table.table)}
                            className="h-4 w-4 rounded border border-primary"
                          />
                          <IconTable className="h-4 w-4 text-muted-foreground" />
                          <span>{table.table}</span>
                          <span className="text-muted-foreground text-xs">
                            {table.columns.length} columns
                          </span>
                        </div>
                      ))}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4">
        <Button
          onClick={performBackup}
          disabled={
            isProcessing ||
            (backupTarget === "tables" && selectedTables.size === 0)
          }
          className="gap-2"
        >
          {isProcessing ? (
            <IconLoader className="h-4 w-4 animate-spin" />
          ) : (
            <IconDownload className="h-4 w-4" />
          )}
          <span>Backup & Download</span>
        </Button>
      </div>
    </div>
  );
};