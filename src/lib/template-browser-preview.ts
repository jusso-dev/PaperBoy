const EMPTY_PREVIEW = `
  <div class="empty-preview">
    <strong>Your email preview will appear here.</strong>
    <span>Paste HTML into the editor to begin.</span>
  </div>
`;

export function templateBrowserPreviewDocument(
  html: string,
  options: { showEmptyState?: boolean } = {},
): string {
  const content = html.trim() || (options.showEmptyState ? EMPTY_PREVIEW : "");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob: https: http:; style-src 'unsafe-inline'">
    <meta name="referrer" content="no-referrer">
    <style>
      html { color-scheme: light; }
      body { margin: 0; min-height: 100vh; }
      .empty-preview {
        align-items: center;
        box-sizing: border-box;
        color: #66706b;
        display: flex;
        flex-direction: column;
        font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
        justify-content: center;
        min-height: 260px;
        padding: 32px;
        text-align: center;
      }
      .empty-preview strong { color: #1d2928; }
    </style>
  </head>
  <body>${content}</body>
</html>`;
}
