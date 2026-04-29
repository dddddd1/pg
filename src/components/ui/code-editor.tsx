import { FC, useEffect, useRef } from "react";
import { cn } from "@/utils/classnames";
import { Editor, EditorProps, loader } from "@monaco-editor/react";
import { useDarkMode } from "../hooks/use-dark-mode";
import { SyntaxError } from "@/utils/sql-validator";

loader.init().then((m) => {
  m.editor.defineTheme("tr-light", {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#ffffff00",
    },
  });

  m.editor.defineTheme("tr-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#00000000",
    },
  });
});

interface CodeEditorProps extends EditorProps {
  validationErrors?: SyntaxError[];
}

export const CodeEditor: FC<CodeEditorProps> = ({
  options,
  className,
  validationErrors = [],
  ...props
}) => {
  const { isDarkMode } = useDarkMode();
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;

    const model = editorRef.current.getModel();
    if (!model) return;

    const markers: any[] = validationErrors.map((error) => ({
      startLineNumber: error.line,
      startColumn: error.column + 1,
      endLineNumber: error.endLine || error.line,
      endColumn: error.endColumn || error.column + 10,
      message: error.message,
      severity: monacoRef.current.MarkerSeverity.Error,
    }));

    monacoRef.current.editor.setModelMarkers(model, "sql-validator", markers);

    return () => {
      monacoRef.current?.editor.setModelMarkers(model, "sql-validator", []);
    };
  }, [validationErrors]);

  return (
    <Editor
      className={cn(className)}
      theme={isDarkMode ? "tr-dark" : "tr-light"}
      options={{
        fontLigatures: true,
        fontFamily: "JetBrains Mono",
        minimap: {
          enabled: false,
        },
        ...options,
      }}
      onMount={(editor, monacoInstance) => {
        editorRef.current = editor;
        monacoRef.current = monacoInstance;
        props.onMount?.(editor, monacoInstance);
      }}
      {...props}
    />
  );
};
