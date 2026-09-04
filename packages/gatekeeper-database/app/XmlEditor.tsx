import { useEffect, useRef } from "react";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { xml as xmlLanguage } from "@codemirror/lang-xml";
import { setDiagnostics } from "@codemirror/lint";
import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import type { DatabaseSchemaDiagnostic } from "../src/management-types";
import { getThemeMode, subscribeThemeMode } from "./theme";

const theme = (dark: boolean) =>
  EditorView.theme(
    {
      "&": {
        height: "100%",
        backgroundColor: dark ? "#171717" : "#fff",
        color: dark ? "#f4f4f5" : "#18181b",
      },
      ".cm-scroller": {
        overflow: "auto",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      },
      ".cm-gutters": {
        backgroundColor: dark ? "#202020" : "#f7f7f7",
        color: dark ? "#a1a1aa" : "#71717a",
        border: "none",
      },
    },
    { dark },
  );

export function XmlEditor({
  value,
  onChange,
  disabled,
  diagnostics,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  diagnostics: DatabaseSchemaDiagnostic[];
}) {
  const parent = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const themeSlot = useRef(new Compartment());
  const editableSlot = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    if (!parent.current) return;
    const editor = new EditorView({
      parent: parent.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          xmlLanguage(),
          themeSlot.current.of(theme(getThemeMode() === "dark")),
          editableSlot.current.of(EditorView.editable.of(!disabled)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged)
              onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editor;
    const unsubscribe = subscribeThemeMode((mode) =>
      editor.dispatch({
        effects: themeSlot.current.reconfigure(theme(mode === "dark")),
      }),
    );
    return () => {
      unsubscribe();
      editor.destroy();
      view.current = null;
    };
  }, []);
  useEffect(() => {
    view.current?.dispatch({
      effects: editableSlot.current.reconfigure(
        EditorView.editable.of(!disabled),
      ),
    });
  }, [disabled]);
  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() === value) return;
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: value },
    });
  }, [value]);
  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const mapped = diagnostics.map((item) => {
      let line =
        item.line && item.line <= editor.state.doc.lines
          ? editor.state.doc.line(item.line)
          : editor.state.doc.line(1);
      let from = Math.min(
        line.to,
        line.from + Math.max(0, (item.column ?? 1) - 1),
      );
      return {
        from,
        to: Math.min(line.to, from + 1),
        severity: "error" as const,
        message: item.message,
      };
    });
    editor.dispatch(setDiagnostics(editor.state, mapped));
  }, [diagnostics]);
  return <div className="xml-editor" ref={parent} />;
}
