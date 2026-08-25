"use client";

import { useMemo, useState } from "react";
import type { OpenApiDocumentView } from "@/lib/openapi-document";

export function OpenApiReference({ document }: { document: OpenApiDocumentView }) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = document.operations.filter((operation) => {
      if (!needle) return true;
      return [
        operation.method,
        operation.path,
        operation.summary,
        operation.tag,
        operation.operationId,
        operation.mcp ?? "",
        operation.description,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });

    const byTag = new Map<string, typeof filtered>();
    for (const operation of filtered) {
      const current = byTag.get(operation.tag) ?? [];
      current.push(operation);
      byTag.set(operation.tag, current);
    }
    return [...byTag.entries()];
  }, [document.operations, query]);

  return (
    <div className="openapi-reference">
      <div className="field">
        <label htmlFor="openapi-filter">Filter routes</label>
        <input
          id="openapi-filter"
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Search path, method, or operation"
          type="search"
          value={query}
        />
      </div>

      {groups.length === 0 ? (
        <p className="empty-state">No routes match that filter.</p>
      ) : (
        groups.map(([tag, operations]) => (
          <section className="card" key={tag}>
            <h2>{tag}</h2>
            <ul className="openapi-operation-list">
              {operations.map((operation) => (
                <li key={`${operation.method}-${operation.path}-${operation.operationId}`}>
                  <details>
                    <summary>
                      <span className="openapi-method" data-method={operation.method}>
                        {operation.method}
                      </span>
                      <code>{operation.path}</code>
                      <strong>{operation.summary}</strong>
                    </summary>
                    {operation.description ? <p>{operation.description}</p> : null}
                    <dl>
                      <div>
                        <dt>Operation</dt>
                        <dd>
                          <code>{operation.operationId}</code>
                        </dd>
                      </div>
                      {operation.mcp ? (
                        <div>
                          <dt>MCP</dt>
                          <dd>
                            <code>{operation.mcp}</code>
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  </details>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
