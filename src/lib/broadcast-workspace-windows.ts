export type WindowRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type WindowBounds = {
  height: number;
  width: number;
};

export type ResizeEdge = "e" | "s" | "se";

export type BroadcastWindowLayout = {
  envelope: WindowRect;
  preview: WindowRect;
  source: WindowRect;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function moveWindowRect(
  rect: WindowRect,
  deltaX: number,
  deltaY: number,
  bounds: WindowBounds,
): WindowRect {
  const width = clamp(rect.width, 1, Math.max(1, bounds.width));
  const height = clamp(rect.height, 1, Math.max(1, bounds.height));
  return {
    height,
    width,
    x: clamp(rect.x + deltaX, 0, Math.max(0, bounds.width - width)),
    y: clamp(rect.y + deltaY, 0, Math.max(0, bounds.height - height)),
  };
}

export function resizeWindowRect(
  rect: WindowRect,
  edge: ResizeEdge,
  deltaX: number,
  deltaY: number,
  bounds: WindowBounds,
  minWidth: number,
  minHeight: number,
): WindowRect {
  const maxWidth = Math.max(minWidth, bounds.width - rect.x);
  const maxHeight = Math.max(minHeight, bounds.height - rect.y);
  return {
    height:
      edge === "s" || edge === "se"
        ? clamp(rect.height + deltaY, minHeight, maxHeight)
        : rect.height,
    width:
      edge === "e" || edge === "se"
        ? clamp(rect.width + deltaX, minWidth, maxWidth)
        : rect.width,
    x: rect.x,
    y: rect.y,
  };
}

export function defaultBroadcastWindowLayout(
  bounds: WindowBounds,
): BroadcastWindowLayout {
  const pad = 10;
  const gap = 10;
  const width = Math.max(bounds.width, pad * 2 + 280);
  const height = Math.max(bounds.height, pad * 2 + 200);
  const availableWidth = width - pad * 2;
  const availableHeight = height - pad * 2;

  if (width < 720) {
    const stackHeight = Math.max(
      200,
      Math.floor((availableHeight - gap * 2) / 3),
    );
    return {
      envelope: {
        height: stackHeight,
        width: availableWidth,
        x: pad,
        y: pad,
      },
      source: {
        height: stackHeight,
        width: availableWidth,
        x: pad,
        y: pad + stackHeight + gap,
      },
      preview: {
        height: availableHeight - stackHeight * 2 - gap * 2,
        width: availableWidth,
        x: pad,
        y: pad + (stackHeight + gap) * 2,
      },
    };
  }

  const envelopeWidth = clamp(
    Math.round(availableWidth * 0.34),
    280,
    Math.max(280, availableWidth - 300 - gap),
  );
  const restWidth = availableWidth - envelopeWidth - gap;
  const sourceHeight = Math.max(180, Math.round((availableHeight - gap) * 0.46));

  return {
    envelope: {
      height: availableHeight,
      width: envelopeWidth,
      x: pad,
      y: pad,
    },
    source: {
      height: sourceHeight,
      width: restWidth,
      x: pad + envelopeWidth + gap,
      y: pad,
    },
    preview: {
      height: availableHeight - sourceHeight - gap,
      width: restWidth,
      x: pad + envelopeWidth + gap,
      y: pad + sourceHeight + gap,
    },
  };
}
