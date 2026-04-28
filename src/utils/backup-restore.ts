import { PGlite } from "@electric-sql/pglite";
import { DatabaseSchema, TableColumn, TableType } from "@/stores";

export interface TableInfo {
  schema: string;
  tableName: string;
  tableType: TableType;
  columns: TableColumn[];
}

const escapeSqlIdentifier = (name: string): string => {
  return `"${name.replace(/"/g, '""')}"`;
};

const escapeSqlValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }
  if (typeof value === "number") {
    return value.toString();
  }
  if (typeof value === "string") {
    return `'${value.replace(/'/g, "''")}'`;
  }
  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }
  return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
};

const getColumnType = (column: TableColumn): string => {
  let type = column.type.toUpperCase();
  if (column.length && column.length !== "-1") {
    type = `${type}(${column.length})`;
  }
  return type;
};

export const generateCreateTableSQL = (
  schema: string,
  tableName: string,
  columns: TableColumn[]
): string => {
  const schemaTable = `${escapeSqlIdentifier(schema)}.${escapeSqlIdentifier(tableName)}`;

  const columnDefinitions = columns.map((col) => {
    let def = `${escapeSqlIdentifier(col.column)} ${getColumnType(col)}`;
    if (!col.nullable) {
      def += " NOT NULL";
    }
    return def;
  });

  return `CREATE TABLE IF NOT EXISTS ${schemaTable} (\n  ${columnDefinitions.join(",\n  ")}\n);\n\n`;
};

export const generateInsertSQL = (
  schema: string,
  tableName: string,
  rows: Record<string, unknown>[]
): string => {
  if (rows.length === 0) return "";

  const schemaTable = `${escapeSqlIdentifier(schema)}.${escapeSqlIdentifier(tableName)}`;
  const columns = Object.keys(rows[0]);

  const valueRows = rows.map((row) => {
    const values = columns.map((col) => escapeSqlValue(row[col]));
    return `(${values.join(", ")})`;
  });

  return `INSERT INTO ${schemaTable} (${columns.map(escapeSqlIdentifier).join(", ")}) VALUES\n${valueRows.join(",\n")};\n\n`;
};

export const backupTable = async (
  pg: PGlite,
  schema: string,
  tableName: string
): Promise<{ sql: string; rowCount: number }> => {
  let sql = "";

  const schemaResult = await pg.query(`
    SELECT column_name, data_type, character_maximum_length, is_nullable
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2
    ORDER BY ordinal_position
  `, [schema, tableName]);

  if (schemaResult.rows.length === 0) {
    throw new Error(`Table ${schema}.${tableName} not found`);
  }

  const columns: TableColumn[] = schemaResult.rows.map((row: any) => ({
    column: row.column_name,
    type: row.data_type,
    length: row.character_maximum_length,
    nullable: row.is_nullable === "YES",
  }));

  sql += generateCreateTableSQL(schema, tableName, columns);

  const dataResult = await pg.query(`
    SELECT * FROM ${escapeSqlIdentifier(schema)}.${escapeSqlIdentifier(tableName)}
  `);

  const rowCount = dataResult.rows.length;

  if (rowCount > 0) {
    sql += generateInsertSQL(schema, tableName, dataResult.rows as Record<string, unknown>[]);
  }

  return { sql, rowCount };
};

export const backupDatabase = async (
  pg: PGlite,
  schemas: DatabaseSchema[]
): Promise<{ sql: string; tables: string[]; totalRows: number }> => {
  let sql = "";
  const tables: string[] = [];
  let totalRows = 0;

  const filteredSchemas = schemas.filter((s) => {
    return !s.schema.startsWith("pg_") && s.schema !== "information_schema";
  });

  sql += "-- ============================================\n";
  sql += "-- PostgreSQL Database Backup\n";
  sql += `-- Generated: ${new Date().toISOString()}\n`;
  sql += "-- ============================================\n\n";

  for (const schema of filteredSchemas) {
    for (const table of schema.tables) {
      if (table.type !== "BASE TABLE") continue;

      sql += `-- ============================================\n`;
      sql += `-- Table: ${schema.schema}.${table.table}\n`;
      sql += `-- ============================================\n\n`;

      const result = await backupTable(pg, schema.schema, table.table);
      sql += result.sql;
      tables.push(`${schema.schema}.${table.table}`);
      totalRows += result.rowCount;
    }
  }

  return { sql, tables, totalRows };
};

export const backupTables = async (
  pg: PGlite,
  tables: { schema: string; table: string }[]
): Promise<{ sql: string; tables: string[]; totalRows: number }> => {
  let sql = "";
  const backedUpTables: string[] = [];
  let totalRows = 0;

  sql += "-- ============================================\n";
  sql += "-- PostgreSQL Table Backup\n";
  sql += `-- Generated: ${new Date().toISOString()}\n`;
  sql += "-- ============================================\n\n";

  for (const table of tables) {
    sql += `-- ============================================\n`;
    sql += `-- Table: ${table.schema}.${table.table}\n`;
    sql += `-- ============================================\n\n`;

    try {
      const result = await backupTable(pg, table.schema, table.table);
      sql += result.sql;
      backedUpTables.push(`${table.schema}.${table.table}`);
      totalRows += result.rowCount;
    } catch (error) {
      sql += `-- Error backing up table ${table.schema}.${table.table}: ${(error as Error).message}\n\n`;
    }
  }

  return { sql, tables: backedUpTables, totalRows };
};