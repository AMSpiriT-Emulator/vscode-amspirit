export interface WebviewHtmlOptions {
  scriptUri: string
  styleUri: string
  /** `webview.cspSource` — the origin allowed to load local resources. */
  cspSource: string
  nonce: string
  /** Which view the shared bundle should mount (`memory` | `disasm`). */
  view?: string
}

/**
 * Build the HTML shell for the React webview with a strict CSP. No HTML is
 * written by hand elsewhere; the React bundle mounts into `#root`, choosing the
 * view from its `data-view` attribute (the bundle hosts every panel).
 */
export function buildWebviewHtml(o: WebviewHtmlOptions): string {
  const view = o.view ?? "memory"
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${o.cspSource}; script-src 'nonce-${o.nonce}';"
    />
    <link rel="stylesheet" href="${o.styleUri}" />
  </head>
  <body>
    <div id="root" data-view="${view}"></div>
    <script type="module" nonce="${o.nonce}" src="${o.scriptUri}"></script>
  </body>
</html>`
}
