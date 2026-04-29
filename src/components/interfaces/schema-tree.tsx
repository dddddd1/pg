import { FC } from "react";
import { DatabaseSchema, useDBStore, TableColumn } from "@/stores";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  IconTable,
  IconTableAlias,
  IconTableColumn,
  IconPlus,
  IconEdit,
  IconTrash,
  IconDotsVertical,
} from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { modal } from "@/components/ui/modals";
import { FieldOperation } from "@/components/interfaces/field-operation";

const SchemaTree: FC<{ schemas?: DatabaseSchema[] }> = ({ schemas }) => {
  const isSystemSchema = (schemaName: string) => {
    return (
      schemaName.startsWith("pg_") ||
      schemaName === "information_schema"
    );
  };

  const openFieldModal = (
    schemaName: string,
    tableName: string,
    operation: "add" | "edit" | "delete",
    column?: TableColumn
  ) => {
    modal.open({
      title:
        operation === "add"
          ? "新增字段"
          : operation === "edit"
          ? "修改字段"
          : "删除字段",
      children: (
        <FieldOperation
          schemaName={schemaName}
          tableName={tableName}
          operation={operation}
          existingColumn={column}
          onSuccess={() => modal.close()}
          onCancel={() => modal.close()}
        />
      ),
      size: "lg",
    });
  };

  return (
    <Accordion type="multiple" className="w-full" defaultValue={["public"]}>
      {schemas?.map((schema) => (
        <AccordionItem
          key={schema.schema}
          value={schema.schema}
          className="border-none"
        >
          <AccordionTrigger className="py-2">
            <div className="flex flex-row items-center gap-x-2">
              <IconTableAlias className="size-4" />
              <div className="font-medium text-sm">{schema.schema}</div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-0">
            <Accordion
              type="multiple"
              className="w-full"
              defaultValue={
                schema.schema === "public"
                  ? schema.tables.map((t) => t.table)
                  : []
              }
            >
              {schema.tables?.map((t) => (
                <AccordionItem
                  key={t.table}
                  value={t.table}
                  className="ml-7 border-none"
                >
                  <AccordionTrigger className="py-1">
                    <div className="flex flex-row items-center justify-between gap-2 w-full">
                      <div className="flex flex-row items-center gap-2">
                        {t.type === "BASE TABLE" ? (
                          <IconTableColumn className="size-4" />
                        ) : (
                          <IconTable className="size-4" />
                        )}
                        <div className="text-sm">{t.table}</div>
                      </div>
                      {t.type === "BASE TABLE" && !isSystemSchema(schema.schema) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-6"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <IconDotsVertical className="size-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                openFieldModal(
                                  schema.schema,
                                  t.table,
                                  "add"
                                );
                              }}
                              className="gap-2"
                            >
                              <IconPlus className="size-3" />
                              <span>新增字段</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-2">
                    {t.columns.map((c) => (
                      <div
                        key={c.column}
                        className="ml-6 flex flex-row items-center justify-between gap-2 group"
                      >
                        <div className="flex-1 flex items-center gap-2">
                          <div className="font-medium">{c.column}</div>
                          <div className="line-clamp-1 font-light font-mono text-xs text-muted-foreground">
                            {c.type} {c.length && `(${c.length})`}
                            {!c.nullable && " NOT NULL"}
                          </div>
                        </div>
                        {t.type === "BASE TABLE" && !isSystemSchema(schema.schema) && (
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-6"
                              onClick={(e) => {
                                e.stopPropagation();
                                openFieldModal(
                                  schema.schema,
                                  t.table,
                                  "edit",
                                  c
                                );
                              }}
                            >
                              <IconEdit className="size-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-6 text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                openFieldModal(
                                  schema.schema,
                                  t.table,
                                  "delete",
                                  c
                                );
                              }}
                            >
                              <IconTrash className="size-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
};

export const AllDatabaseSchemaTree = () => {
  const schema = useDBStore((s) => s.databases[s.active!.name].schema);

  return <SchemaTree schemas={schema} />;
};

export const PublicSchemaTree = () => {
  const schema = useDBStore((s) => s.databases[s.active!.name].schema);

  /**
   * we only show schema except from postgre internal database
   */
  const erdSchema = schema?.filter((s) => {
    return !s.schema.startsWith("pg_") && s.schema !== "information_schema";
  });

  return <SchemaTree schemas={erdSchema} />;
};
