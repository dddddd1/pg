import { PGlite } from "@electric-sql/pglite";

export interface SyntaxError {
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: SyntaxError[];
}

const parsePostgresError = (errorMessage: string): SyntaxError | null => {
  let line = 1;
  let column = 0;
  let message = errorMessage;

  const lineMatch = errorMessage.match(/LINE (\d+):/);
  if (lineMatch) {
    line = parseInt(lineMatch[1], 10);
  }

  const charMatch = errorMessage.match(/at character (\d+)/);
  if (charMatch) {
    column = parseInt(charMatch[1], 10);
  }

  const syntaxMatch = errorMessage.match(/syntax error at or near "(.+?)"/);
  if (syntaxMatch) {
    message = `Syntax error at or near "${syntaxMatch[1]}"`;
  }

  return {
    message,
    line,
    column,
  };
};

export const validateSQL = async (
  sql: string,
  pg: PGlite | undefined
): Promise<ValidationResult> => {
  if (!sql || !sql.trim()) {
    return { valid: true, errors: [] };
  }

  if (!pg) {
    return { valid: true, errors: [] };
  }

  try {
    const validationSQL = `EXPLAIN (FORMAT JSON) ${sql}`;
    await pg.exec(validationSQL);
    return { valid: true, errors: [] };
  } catch (error) {
    const errorMessage = (error as Error).message;
    const parsedError = parsePostgresError(errorMessage);

    if (parsedError) {
      return {
        valid: false,
        errors: [parsedError],
      };
    }

    return {
      valid: false,
      errors: [
        {
          message: errorMessage,
          line: 1,
          column: 0,
        },
      ],
    };
  }
};

export const validateSQLStatements = async (
  sql: string,
  pg: PGlite | undefined
): Promise<ValidationResult> => {
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (statements.length === 0) {
    return { valid: true, errors: [] };
  }

  const allErrors: SyntaxError[] = [];

  for (let i = 0; i < statements.length; i++) {
    const result = await validateSQL(statements[i], pg);
    if (!result.valid) {
      allErrors.push(...result.errors);
    }
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
  };
};
