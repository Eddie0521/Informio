import { useRef, useState } from "react";
import * as Switch from "@radix-ui/react-switch";
import * as YAML from "yaml";
import { X } from "lucide-react";
import type { FrontmatterParseResult } from "../types";
import { cn } from "../lib/utils";

const isFrontmatterPrimitive = (value: unknown) =>
  value === null || ["string", "number", "boolean"].includes(typeof value) || value instanceof Date;

const editableFrontmatterEntries = (values: Record<string, unknown>) =>
  Object.entries(values).filter(([, value]) => isFrontmatterPrimitive(value) || (Array.isArray(value) && value.every(isFrontmatterPrimitive)));

const hasRawOnlyFrontmatter = (values: Record<string, unknown>) =>
  Object.entries(values).some(([, value]) => !isFrontmatterPrimitive(value) && !(Array.isArray(value) && value.every(isFrontmatterPrimitive)));

export function PropertiesPanel({
  frontmatter,
  onChange
}: {
  frontmatter: FrontmatterParseResult;
  onChange: (nextRaw: string) => void;
}) {
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const newValueInputRef = useRef<HTMLInputElement | null>(null);
  const entries = editableFrontmatterEntries(frontmatter.values);
  const rawOnly = Boolean(frontmatter.error) || hasRawOnlyFrontmatter(frontmatter.values);
  const hasProperties = entries.length > 0;

  const updateValues = (nextValues: Record<string, unknown>) => onChange(YAML.stringify(nextValues, { lineWidth: 0 }).trimEnd());
  const updateField = (key: string, value: unknown) => updateValues({ ...frontmatter.values, [key]: value });
  const commitNewProperty = () => {
    const key = newKey.trim();
    if (!key) return;
    updateField(key, newValue);
    setNewKey("");
    setNewValue("");
  };
  const removeField = (key: string) => {
    const nextValues = { ...frontmatter.values };
    delete nextValues[key];
    updateValues(nextValues);
  };

  return (
    <section className="informio-properties">
      {frontmatter.error ? <div className="informio-properties-error">{frontmatter.error}</div> : null}
      {rawOnly ? (
        <textarea
          className="informio-properties-raw"
          value={frontmatter.raw}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <>
          {hasProperties ? (
            <div className="informio-property-list">
              {entries.map(([key, value]) => (
                <div key={key} className="informio-property-row">
                  <label>{key}</label>
                  {typeof value === "boolean" ? (
                    <Switch.Root className="switch-root" checked={value} onCheckedChange={(checked) => updateField(key, checked)}>
                      <Switch.Thumb className="switch-thumb" />
                    </Switch.Root>
                  ) : (
                    <input
                      value={Array.isArray(value) ? value.join(", ") : String(value ?? "")}
                      onChange={(event) => updateField(key, Array.isArray(value) ? event.target.value.split(",").map((item) => item.trim()).filter(Boolean) : event.target.value)}
                    />
                  )}
                  <button type="button" aria-label={`Remove ${key}`} onClick={() => removeField(key)}>
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <form
            className={cn("informio-property-new", !hasProperties && "is-standalone")}
            onSubmit={(event) => {
              event.preventDefault();
              if (document.activeElement === newValueInputRef.current) {
                commitNewProperty();
                return;
              }
              newValueInputRef.current?.focus();
            }}
          >
            <input
              value={newKey}
              placeholder="Tag"
              onChange={(event) => setNewKey(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== "Tab") return;
                if (!newKey.trim()) return;
                event.preventDefault();
                newValueInputRef.current?.focus();
              }}
            />
            <input
              ref={newValueInputRef}
              value={newValue}
              placeholder="Content"
              onChange={(event) => setNewValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                commitNewProperty();
              }}
            />
            <button type="submit">Save</button>
          </form>
        </>
      )}
    </section>
  );
}
