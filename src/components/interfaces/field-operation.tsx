import { FC, useState, useEffect } from "react";
import { useDBStore, TableColumn } from "@/stores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FormField,
  FormLabel,
  FormError,
  FormDescription,
} from "@/components/ui/form";
import { IconLoader } from "@tabler/icons-react";
import { toast } from "@/components/ui/sonner";

const POSTGRES_DATA_TYPES = [
  "bigint",
  "bigserial",
  "bit",
  "bit varying",
  "boolean",
  "box",
  "bytea",
  "character",
  "character varying",
  "cidr",
  "circle",
  "date",
  "double precision",
  "inet",
  "integer",
  "interval",
  "json",
  "jsonb",
  "line",
  "lseg",
  "macaddr",
  "macaddr8",
  "money",
  "numeric",
  "path",
  "pg_lsn",
  "pg_snapshot",
  "point",
  "polygon",
  "real",
  "smallint",
  "smallserial",
  "serial",
  "text",
  "time",
  "time with time zone",
  "timestamp",
  "timestamp with time zone",
  "tsquery",
  "tsvector",
  "txid_snapshot",
  "uuid",
  "xml",
];

const TYPES_WITH_LENGTH = [
  "bit",
  "bit varying",
  "character",
  "character varying",
  "numeric",
];

export interface FieldOperationProps {
  schemaName: string;
  tableName: string;
  operation: "add" | "edit" | "delete";
  existingColumn?: TableColumn;
  onSuccess: () => void;
  onCancel: () => void;
}

export const FieldOperation: FC<FieldOperationProps> = ({
  schemaName,
  tableName,
  operation,
  existingColumn,
  onSuccess,
  onCancel,
}) => {
  const [columnName, setColumnName] = useState(existingColumn?.column || "");
  const [dataType, setDataType] = useState(existingColumn?.type || "integer");
  const [length, setLength] = useState(existingColumn?.length || "");
  const [nullable, setNullable] = useState(existingColumn?.nullable ?? true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ columnName?: string; length?: string }>({});

  const needsLength = TYPES_WITH_LENGTH.includes(dataType);

  useEffect(() => {
    if (existingColumn) {
      setColumnName(existingColumn.column);
      setDataType(existingColumn.type);
      setLength(existingColumn.length || "");
      setNullable(existingColumn.nullable);
    }
  }, [existingColumn]);

  const validate = () => {
    const newErrors: { columnName?: string; length?: string } = {};

    if (!columnName.trim()) {
      newErrors.columnName = "字段名不能为空";
    }

    if (needsLength && !length.trim()) {
      newErrors.length = "该类型需要指定长度";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const buildAddColumnSQL = () => {
    let typeDefinition = dataType;
    if (needsLength && length) {
      typeDefinition += `(${length})`;
    }

    const notNullClause = nullable ? "" : " NOT NULL";

    return `ALTER TABLE "${schemaName}"."${tableName}" ADD COLUMN "${columnName}" ${typeDefinition}${notNullClause};`;
  };

  const buildEditColumnSQL = () => {
    if (!existingColumn) return "";

    const statements: string[] = [];

    if (columnName !== existingColumn.column) {
      statements.push(
        `ALTER TABLE "${schemaName}"."${tableName}" RENAME COLUMN "${existingColumn.column}" TO "${columnName}";`
      );
    }

    if (dataType !== existingColumn.type || length !== existingColumn.length) {
      let typeDefinition = dataType;
      if (needsLength && length) {
        typeDefinition += `(${length})`;
      }
      statements.push(
        `ALTER TABLE "${schemaName}"."${tableName}" ALTER COLUMN "${columnName}" TYPE ${typeDefinition};`
      );
    }

    if (nullable !== existingColumn.nullable) {
      if (nullable) {
        statements.push(
          `ALTER TABLE "${schemaName}"."${tableName}" ALTER COLUMN "${columnName}" DROP NOT NULL;`
        );
      } else {
        statements.push(
          `ALTER TABLE "${schemaName}"."${tableName}" ALTER COLUMN "${columnName}" SET NOT NULL;`
        );
      }
    }

    return statements.join("\n");
  };

  const buildDeleteColumnSQL = () => {
    if (!existingColumn) return "";
    return `ALTER TABLE "${schemaName}"."${tableName}" DROP COLUMN "${existingColumn.column}";`;
  };

  const isSystemSchema = (name: string) => {
    return (
      name.startsWith("pg_") ||
      name === "information_schema"
    );
  };

  const handleSubmit = async () => {
    if (isSystemSchema(schemaName)) {
      toast.error("无法对系统表进行字段操作");
      return;
    }

    if (operation !== "delete" && !validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      let sql: string;

      switch (operation) {
        case "add":
          sql = buildAddColumnSQL();
          break;
        case "edit":
          sql = buildEditColumnSQL();
          break;
        case "delete":
          sql = buildDeleteColumnSQL();
          break;
        default:
          return;
      }

      if (!sql) {
        toast.error("无法生成 SQL 语句");
        return;
      }

      await useDBStore.getState().execute(sql);
      await useDBStore.getState().reload();

      toast.success(
        operation === "add"
          ? "字段添加成功"
          : operation === "edit"
          ? "字段修改成功"
          : "字段删除成功"
      );

      onSuccess();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getOperationTitle = () => {
    switch (operation) {
      case "add":
        return "新增字段";
      case "edit":
        return "修改字段";
      case "delete":
        return "删除字段";
      default:
        return "字段操作";
    }
  };

  const getOperationDescription = () => {
    switch (operation) {
      case "add":
        return `为表 "${tableName}" 添加新字段`;
      case "edit":
        return `修改表 "${tableName}" 中的字段 "${existingColumn?.column}"`;
      case "delete":
        return `确定要删除表 "${tableName}" 中的字段 "${existingColumn?.column}" 吗？此操作不可撤销。`;
      default:
        return "";
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">{getOperationTitle()}</h3>
        <p className="text-sm text-muted-foreground">{getOperationDescription()}</p>
      </div>

      {operation !== "delete" ? (
        <div className="space-y-4">
          <FormField>
            <FormLabel error={!!errors.columnName}>字段名</FormLabel>
            <Input
              value={columnName}
              onChange={(e) => setColumnName(e.target.value)}
              placeholder="例如: user_name"
              disabled={isSubmitting}
            />
            {errors.columnName && <FormError>{errors.columnName}</FormError>}
            <FormDescription>字段名必须符合 PostgreSQL 标识符规范</FormDescription>
          </FormField>

          <FormField>
            <FormLabel>数据类型</FormLabel>
            <Select value={dataType} onValueChange={setDataType} disabled={isSubmitting}>
              <SelectTrigger>
                <SelectValue placeholder="选择数据类型" />
              </SelectTrigger>
              <SelectContent>
                {POSTGRES_DATA_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {needsLength && (
            <FormField>
              <FormLabel error={!!errors.length}>长度/精度</FormLabel>
              <Input
                value={length}
                onChange={(e) => setLength(e.target.value)}
                placeholder="例如: 255"
                disabled={isSubmitting}
              />
              {errors.length && <FormError>{errors.length}</FormError>}
              <FormDescription>指定该数据类型的长度或精度</FormDescription>
            </FormField>
          )}

          <FormField>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="nullable"
                checked={nullable}
                onChange={(e) => setNullable(e.target.checked)}
                disabled={isSubmitting}
                className="size-4 rounded border-gray-300"
              />
              <Label htmlFor="nullable" className="font-normal">
                允许空值 (NULL)
              </Label>
            </div>
            <FormDescription>如果取消勾选，该字段不允许为空值</FormDescription>
          </FormField>
        </div>
      ) : (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">
            警告：删除字段将永久丢失该字段中的所有数据。此操作不可撤销。
          </p>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          取消
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting}
          variant={operation === "delete" ? "destructive" : "default"}
          className="gap-2"
        >
          {isSubmitting && <IconLoader className="size-4 animate-spin" />}
          <span>
            {operation === "add"
              ? "添加"
              : operation === "edit"
              ? "修改"
              : "删除"}
          </span>
        </Button>
      </div>
    </div>
  );
};
