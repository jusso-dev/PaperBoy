const EMPTY_PREVIEW = `
  <div class="empty-preview">
    <strong>Your email preview will appear here.</strong>
    <span>Paste HTML into the editor to begin.</span>
  </div>
`;

const PREVIEW_CSP =
  "default-src 'none'; img-src data: blob: https: http:; style-src 'unsafe-inline' https: http:; font-src data: https: http:";

const PREVIEW_HEAD = `<meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">
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
    </style>`;

function isCompleteHtmlDocument(html: string): boolean {
  return /^\s*<(!doctype\s+html\b|html[\s>])/i.test(html);
}

function wrapFragment(content: string): string {
  return `<!doctype html>
<html>
  <head>
    ${PREVIEW_HEAD}
  </head>
  <body>${content}</body>
</html>`;
}

function injectPreviewGuards(documentHtml: string): string {
  const guards = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}"><meta name="referrer" content="no-referrer">`;
  if (/<head[\s>]/i.test(documentHtml)) {
    return documentHtml.replace(/<head([^>]*)>/i, `<head$1>${guards}`);
  }
  if (/<html[\s>]/i.test(documentHtml)) {
    return documentHtml.replace(
      /<html([^>]*)>/i,
      `<html$1><head>${guards}</head>`,
    );
  }
  return wrapFragment(documentHtml);
}

export function templateBrowserPreviewDocument(
  html: string,
  options: { showEmptyState?: boolean } = {},
): string {
  const content = html.trim() || (options.showEmptyState ? EMPTY_PREVIEW : "");
  if (!content) {
    return wrapFragment("");
  }
  if (isCompleteHtmlDocument(content)) {
    return injectPreviewGuards(content);
  }
  return wrapFragment(content);
}
