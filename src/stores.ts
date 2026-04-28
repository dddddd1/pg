import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { Results, PGlite } from "@electric-sql/pglite";
import { postgresTransformer } from "@/utils/postgres";
import { createJSONStorage, persist } from "zustand/middleware";
import { Cell, DataGridValue } from "@/components/ui/data-viewer";
import { generateMermaidErd, getDatabaseSchema } from "@/postgres/setup";
import {
  SampleDataMeta,
  SampleDatakey,
  getSampleDatabaseQuery,
} from "@/postgres/sample-data";
import {
  removeIDBItem,
  postgreIDBName,
  zustandIDBStorage,
  postgreIDBConnection,
} from "@/utils/idb";

interface Connection {
  name: string;
  postgres: PGlite;
}

export interface QueryResult {
  affectedRows: number;
  totalRecords?: number;
}

export interface QueryHistory {
  error?: string;
  statement: string;
  createdAt?: string;
  executionTime?: number; // ms
  results?: QueryResult[];
}

export type TableType = "BASE TABLE" | "VIEW";

export type TableColumn = {
  type: string;
  column: string;
  nullable: boolean;
  length: string | null;
};

export interface DatabaseSchema {
  schema: string;
  tables: {
    table: string;
    type: TableType;
    columns: TableColumn[];
  }[];
}

export interface QueryTab {
  id: string;
  name: string;
  query?: string;
  datagrid?: DataGridValue<Cell>[];
  history: QueryHistory[];
  isExecuting: boolean;
  lastError?: string;
}

export interface BackupRestoreLog {
  id: string;
  type: "backup" | "restore";
  target: string;
  targetType: "database" | "tables" | "table";
  status: "success" | "failed" | "pending";
  createdAt: string;
  completedAt?: string;
  error?: string;
  filename?: string;
  details?: {
    tables?: string[];
    rowCount?: number;
    size?: string;
  };
}

export interface Database {
  name: string;

  createdAt?: string;

  description?: string;

  history: QueryHistory[];

  schema: DatabaseSchema[];

  /**
   * we are using mermaid js syntax
   * to generating erd
   */
  erd: string;

  query?: string;

  datagrid?: DataGridValue<Cell>[];

  tabs: QueryTab[];

  activeTabId: string;

  backupRestoreLogs: BackupRestoreLog[];
}

interface State {
  active: Connection | undefined;

  databases: Record<string, Database>;

  create: (data: Pick<Database, "name" | "description">) => Promise<void>;

  update: (name: string, data: Pick<Database, "description">) => Promise<void>;

  import: (data: SampleDataMeta<SampleDatakey>) => Promise<void>;

  remove: (name: string) => Promise<void>;

  connect: (name: string) => Promise<void>;

  execute: (query: string, tabId?: string) => Promise<Results[] | undefined>;

  reload: () => Promise<void>;

  createTab: (name?: string) => string;

  closeTab: (tabId: string) => void;

  setActiveTab: (tabId: string) => void;

  updateTab: (tabId: string, updates: Partial<QueryTab>) => void;

  addBackupRestoreLog: (log: Omit<BackupRestoreLog, "id" | "createdAt">) => string;

  updateBackupRestoreLog: (logId: string, updates: Partial<BackupRestoreLog>) => void;
}

export const useDBStore = create<State>()(
  persist(
    immer((set, get) => ({
      active: undefined,

      databases: {},

      createTab: (name) => {
        const connection = get().active!;
        const db = get().databases[connection.name];

        const newTabId = `tab-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const tabName = name || `Query ${db.tabs.length + 1}`;

        const newTab: QueryTab = {
          id: newTabId,
          name: tabName,
          query: "SELECT * FROM information_schema.tables",
          datagrid: undefined,
          history: [],
          isExecuting: false,
          lastError: undefined,
        };

        set((state) => {
          state.databases[connection.name].tabs.push(newTab);
          state.databases[connection.name].activeTabId = newTabId;
        });

        return newTabId;
      },

      closeTab: (tabId) => {
        const connection = get().active!;
        const db = get().databases[connection.name];

        if (db.tabs.length <= 1) return;

        const tabIndex = db.tabs.findIndex((t) => t.id === tabId);
        if (tabIndex === -1) return;

        set((state) => {
          const tabs = state.databases[connection.name].tabs;
          const activeTabId = state.databases[connection.name].activeTabId;

          tabs.splice(tabIndex, 1);

          if (activeTabId === tabId) {
            const newActiveIndex = Math.min(tabIndex, tabs.length - 1);
            state.databases[connection.name].activeTabId = tabs[newActiveIndex].id;
          }
        });
      },

      setActiveTab: (tabId) => {
        const connection = get().active!;

        set((state) => {
          state.databases[connection.name].activeTabId = tabId;
        });
      },

      updateTab: (tabId, updates) => {
        const connection = get().active!;

        set((state) => {
          const tab = state.databases[connection.name].tabs.find((t) => t.id === tabId);
          if (tab) {
            Object.assign(tab, updates);
          }
        });
      },

      addBackupRestoreLog: (log) => {
        const connection = get().active!;
        const logId = `log-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

        const newLog: BackupRestoreLog = {
          id: logId,
          createdAt: new Date().toLocaleString(),
          ...log,
        };

        set((state) => {
          state.databases[connection.name].backupRestoreLogs.unshift(newLog);
        });

        return logId;
      },

      updateBackupRestoreLog: (logId, updates) => {
        const connection = get().active!;

        set((state) => {
          const log = state.databases[connection.name].backupRestoreLogs.find((l) => l.id === logId);
          if (log) {
            Object.assign(log, updates);
          }
        });
      },

      create: async (data) => {
        if (get().databases[data.name])
          throw new Error(`db with name: ${data.name} already exists`);

        const postgres = new PGlite(postgreIDBConnection(data.name));

        const schema = await getDatabaseSchema(postgres);

        const erd = await generateMermaidErd(postgres);

        const initialTabId = `tab-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

        return set((state) => {
          state.active = {
            name: data.name,
            postgres: postgres,
          };

          state.databases[data.name] = {
            name: data.name,
            description: data.description,
            createdAt: new Date().toLocaleString(),
            query: "SELECT * FROM information_schema.tables",
            history: [],
            erd: erd,
            schema: schema,
            tabs: [
              {
                id: initialTabId,
                name: "Query 1",
                query: "SELECT * FROM information_schema.tables",
                datagrid: undefined,
                history: [],
                isExecuting: false,
                lastError: undefined,
              },
            ],
            activeTabId: initialTabId,
            backupRestoreLogs: [],
          };
        });
      },

      update: async (name, data) =>
        set((state) => {
          state.databases[name].description = data.description;

          state.databases[name].createdAt = new Date().toLocaleString();
        }),

      import: async (data) => {
        const sql = await getSampleDatabaseQuery(data.key);

        /**
         * name with random 5 digit string
         */
        const name = `${data.key}-${Math.floor(Math.random() * 90000) + 10000}`;

        const postgres = new PGlite(postgreIDBConnection(name));

        /**
         * import data
         */
        await postgres.exec(sql);

        const schema = await getDatabaseSchema(postgres);

        const erd = await generateMermaidErd(postgres);

        const initialTabId = `tab-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

        set((state) => {
          state.active = {
            name: name,
            postgres: postgres,
          };

          state.databases[name] = {
            name: name,
            description: data.description,
            createdAt: new Date().toLocaleString(),
            query: "SELECT * FROM information_schema.tables",
            history: [],
            erd: erd,
            schema: schema,
            tabs: [
              {
                id: initialTabId,
                name: "Query 1",
                query: "SELECT * FROM information_schema.tables",
                datagrid: undefined,
                history: [],
                isExecuting: false,
                lastError: undefined,
              },
            ],
            activeTabId: initialTabId,
            backupRestoreLogs: [],
          };
        });
      },

      remove: async (name) => {
        set((state) => {
          state.active = undefined;

          delete state.databases[name];
        });

        removeIDBItem(postgreIDBName(name));
      },

      connect: async (name) => {
        const postgres = new PGlite(postgreIDBConnection(name));

        const schema = await getDatabaseSchema(postgres);

        const erd = await generateMermaidErd(postgres);

        return set((state) => {
          state.active = {
            name: name,
            postgres: postgres,
          };

          state.databases[name].erd = erd;
          state.databases[name].schema = schema;

          if (!state.databases[name].tabs || state.databases[name].tabs.length === 0) {
            const initialTabId = `tab-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
            state.databases[name].tabs = [
              {
                id: initialTabId,
                name: "Query 1",
                query: state.databases[name].query || "SELECT * FROM information_schema.tables",
                datagrid: state.databases[name].datagrid,
                history: state.databases[name].history,
                isExecuting: false,
                lastError: undefined,
              },
            ];
            state.databases[name].activeTabId = initialTabId;
          }
        });
      },

      execute: async (query, tabId) => {
        const connection = get().active!;
        const db = get().databases[connection.name];
        const targetTabId = tabId || db.activeTabId;

        const startTime = performance.now();
        const createdAt = new Date().toLocaleString();

        set((state) => {
          const tab = state.databases[connection.name].tabs.find((t) => t.id === targetTabId);
          if (tab) {
            tab.isExecuting = true;
            tab.lastError = undefined;
          }
        });

        try {
          if (!query || !query.trim()) throw new Error(`no query to run`);

          const result = await connection.postgres.exec(query);

          set((state) => {
            const tab = state.databases[connection.name].tabs.find((t) => t.id === targetTabId);
            if (tab) {
              tab.query = query;
              tab.datagrid = postgresTransformer(result);
              tab.isExecuting = false;
              tab.history.push({
                statement: query,
                createdAt: createdAt,
                executionTime: performance.now() - startTime,
                results: result.map((r) => ({
                  affectedRows: r.affectedRows || 0,
                  totalRecords: r.rows.length || 0,
                })),
              });
            }

            state.databases[connection.name].query = query;
            state.databases[connection.name].datagrid = postgresTransformer(result);

            state.databases[connection.name].history.push({
              statement: query,
              createdAt: createdAt,
              executionTime: performance.now() - startTime,
              results: result.map((r) => ({
                affectedRows: r.affectedRows || 0,
                totalRecords: r.rows.length || 0,
              })),
            });
          });

          return result;
        } catch (error) {
          set((state) => {
            const tab = state.databases[connection.name].tabs.find((t) => t.id === targetTabId);
            if (tab) {
              tab.query = query;
              tab.datagrid = [];
              tab.isExecuting = false;
              tab.lastError = (error as Error).message;
              tab.history.push({
                statement: query,
                createdAt: createdAt,
                error: (error as Error).message,
                executionTime: performance.now() - startTime,
              });
            }

            state.databases[connection.name].query = query;
            state.databases[connection.name].datagrid = [];

            state.databases[connection.name].history.push({
              statement: query,
              createdAt: createdAt,
              error: (error as Error).message,
              executionTime: performance.now() - startTime,
            });
          });

          throw error;
        }
      },

      reload: async () => {
        const connection = get().active!;

        const schema = await getDatabaseSchema(connection.postgres);

        const erd = await generateMermaidErd(connection.postgres);

        set((state) => {
          state.databases[connection.name].erd = erd;
          state.databases[connection.name].schema = schema;
        });
      },
    })),
    {
      name: "zustand-store",
      storage: createJSONStorage(() => zustandIDBStorage),
      partialize: (state) => ({ databases: state.databases }),
    }
  )
);
