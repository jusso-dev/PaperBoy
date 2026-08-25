"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";
import {
  moveWindowRect,
  resizeWindowRect,
  type ResizeEdge,
  type WindowBounds,
  type WindowRect,
} from "@/lib/broadcast-workspace-windows";

type WorkspaceWindowProps = {
  actions?: ReactNode;
  bounds: WindowBounds;
  children: ReactNode;
  label: string;
  minHeight?: number;
  minWidth?: number;
  onChange: (rect: WindowRect) => void;
  onFocus: () => void;
  rect: WindowRect;
  title: string;
  tone: "envelope" | "preview" | "source";
  zIndex: number;
};

export function WorkspaceWindow({
  actions,
  bounds,
  children,
  label,
  minHeight = 180,
  minWidth = 280,
  onChange,
  onFocus,
  rect,
  title,
  tone,
  zIndex,
}: WorkspaceWindowProps) {
  const drag = useRef<{
    edge: ResizeEdge | "move";
    pointerId: number;
    rect: WindowRect;
    x: number;
    y: number;
  } | null>(null);

  function start(
    edge: ResizeEdge | "move",
    event: PointerEvent<HTMLElement>,
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      edge,
      pointerId: event.pointerId,
      rect,
      x: event.clientX,
      y: event.clientY,
    };
    onFocus();
  }

  function move(event: PointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - current.x;
    const deltaY = event.clientY - current.y;
    onChange(
      current.edge === "move"
        ? moveWindowRect(current.rect, deltaX, deltaY, bounds)
        : resizeWindowRect(
            current.rect,
            current.edge,
            deltaX,
            deltaY,
            bounds,
            minWidth,
            minHeight,
          ),
    );
  }

  function stop(event: PointerEvent<HTMLElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
  }

  return (
    <section
      aria-label={label}
      className={`broadcast-window broadcast-window-${tone}`}
      onPointerDown={onFocus}
      style={{
        height: rect.height,
        left: rect.x,
        top: rect.y,
        width: rect.width,
        zIndex,
      }}
    >
      <header
        className="broadcast-window-title"
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest("button")) return;
          start("move", event);
        }}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerCancel={stop}
      >
        <div>
          <span>{title}</span>
          <strong>{label}</strong>
        </div>
        {actions}
      </header>
      <div className="broadcast-window-body">{children}</div>
      <button
        aria-label={`Resize ${label} from the right edge`}
        className="broadcast-window-resize broadcast-window-resize-e"
        onPointerCancel={stop}
        onPointerDown={(event) => start("e", event)}
        onPointerMove={move}
        onPointerUp={stop}
        type="button"
      />
      <button
        aria-label={`Resize ${label} from the bottom edge`}
        className="broadcast-window-resize broadcast-window-resize-s"
        onPointerCancel={stop}
        onPointerDown={(event) => start("s", event)}
        onPointerMove={move}
        onPointerUp={stop}
        type="button"
      />
      <button
        aria-label={`Resize ${label} from the corner`}
        className="broadcast-window-resize broadcast-window-resize-se"
        onPointerCancel={stop}
        onPointerDown={(event) => start("se", event)}
        onPointerMove={move}
        onPointerUp={stop}
        type="button"
      />
    </section>
  );
}
