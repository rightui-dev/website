/** Exact uses Clipboard.writeText. HTTP previews need the user-gesture fallback. */
export function installClipboardFallback(window: Window & typeof globalThis) {
  if (window.navigator.clipboard?.writeText) return;
  const document = window.document;
  const writeText = (text: string) => {
    const active = document.activeElement as HTMLElement | null;
    const input = active as HTMLInputElement | HTMLTextAreaElement | null;
    const caret = input && typeof input.selectionStart === 'number'
      ? [input.selectionStart, input.selectionEnd, input.selectionDirection] as const : null;
    const selection = document.getSelection();
    const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
    const field = document.createElement('textarea');
    field.value = String(text);
    field.readOnly = true;
    field.tabIndex = -1;
    field.style.cssText = 'position:fixed;left:-9999px;top:0;font-size:16px;opacity:0';
    // The copy event preserves exact whitespace instead of copying rendered lines.
    const onCopy = (event: ClipboardEvent) => {
      if (!event.clipboardData) return;
      event.clipboardData.setData('text/plain', field.value);
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    document.addEventListener('copy', onCopy, true);
    try {
      document.body.append(field);
      field.focus({ preventScroll: true });
      field.select();
      field.setSelectionRange(0, field.value.length);
      if (!document.execCommand('copy')) return Promise.reject(new Error('Clipboard copy was refused'));
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    } finally {
      document.removeEventListener('copy', onCopy, true);
      field.remove();
      if (active?.isConnected) active.focus({ preventScroll: true });
      if (caret && input?.isConnected) input.setSelectionRange(caret[0], caret[1], caret[2] ?? undefined);
      if (selection) {
        selection.removeAllRanges();
        for (const range of ranges) selection.addRange(range);
      }
    }
  };
  Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText } });
}

// Serialize the browser-only function; no SDK patch or application DOM dependency.
const transpiler = new Bun.Transpiler({ loader: 'ts', minifyWhitespace: true });
export const clipboardBootstrap = transpiler.transformSync(`(${installClipboardFallback.toString()})(window)`);
export function withClipboardFallback(html: string) {
  const clean = html.replace(/\n?<script data-rightui-clipboard>[\s\S]*?<\/script>/g, '');
  const boundary = /<meta\s+charset=["']utf-8["']\s*\/?>/i;
  if (!boundary.test(clean)) throw new Error('Clipboard bootstrap needs the HTML charset boundary.');
  return clean.replace(boundary, tag => `${tag}\n<script data-rightui-clipboard>${clipboardBootstrap}</script>`);
}
