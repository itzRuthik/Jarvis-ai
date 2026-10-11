/**
 * docs.js — attachment ingestion.
 * images  → data URL (for vision-capable providers)
 * text    → inlined, truncated
 * pdf     → best-effort text extraction (PDF streams inflated with DecompressionStream)
 *
 * Nothing is uploaded anywhere by this module; it only prepares local content
 * for the provider the operator configured.
 */

const TEXT_EXT = /\.(txt|md|markdown|json|csv|tsv|log|js|mjs|ts|tsx|jsx|py|rb|go|rs|java|kt|c|h|cpp|cs|php|sh|yml|yaml|toml|ini|env|html|htm|css|scss|sql|xml)$/i;
const MAX_TEXT = 120000;
const MAX_PDF_TEXT = 20000;

const readAsText = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Could not read the file'));
  reader.readAsText(file);
});

const readAsDataURL = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Could not read the file'));
  reader.readAsDataURL(file);
});

const readAsArrayBuffer = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('Could not read the file'));
  reader.readAsArrayBuffer(file);
});

async function inflate(bytes) {
  if (typeof DecompressionStream !== 'function') return null;
  for (const format of ['deflate', 'deflate-raw']) {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
      return new TextDecoder('latin1').decode(new Uint8Array(await new Response(stream).arrayBuffer()));
    } catch { /* try the next format */ }
  }
  return null;
}

/** Very small, forgiving PDF text extractor — good enough for summaries. */
async function extractPdfText(file) {
  const buffer = await readAsArrayBuffer(file);
  const raw = new TextDecoder('latin1').decode(new Uint8Array(buffer));
  const pieces = [];

  const streamRe = /stream\r?\n?([\s\S]*?)endstream/g;
  let match;
  while ((match = streamRe.exec(raw)) !== null) {
    const chunk = match[1];
    let content = null;
    if (/^\s*(?:[\x00-\x1f]|\w)/.test(chunk) && /FlateDecode/.test(raw.slice(Math.max(0, match.index - 400), match.index))) {
      content = await inflate(new TextEncoder().encode(chunk));
    }
    if (!content) content = chunk;
    const text = content
      .replace(/\r/g, '')
      .replace(/\\n/g, '\n')
      .replace(/\\([()\\])/g, '$1')
      .split('\n')
      .map((line) => {
        const brackets = line.match(/\((?:[^()\\]|\\.)*\)/g);
        if (brackets && /(Tj|TJ)/.test(line)) return brackets.map((b) => b.slice(1, -1)).join('');
        return '';
      })
      .filter(Boolean)
      .join(' ');
    if (text.trim().length > 20) pieces.push(text.trim());
    if (pieces.join(' ').length > MAX_PDF_TEXT) break;
  }

  const joined = pieces.join('\n').replace(/\s{3,}/g, ' ').trim();
  if (joined.length > 20) return joined.slice(0, MAX_PDF_TEXT);
  throw new Error('This PDF has no extractable text layer (scanned image?). Try pasting the text instead.');
}

/**
 * @param {File} file
 * @returns {Promise<{kind:'image'|'text', name:string, size:number, mime:string, dataUrl?:string, text?:string, preview?:string}>}
 */
export async function ingestFile(file) {
  const base = { name: file.name, size: file.size, mime: file.type || 'application/octet-stream' };

  if (/^image\//.test(file.type)) {
    if (file.size > 6 * 1024 * 1024) throw new Error(`${file.name} is larger than 6 MB`);
    const dataUrl = await readAsDataURL(file);
    return { ...base, kind: 'image', dataUrl, preview: dataUrl };
  }

  if (/pdf$/i.test(file.name) || file.type === 'application/pdf') {
    const text = await extractPdfText(file);
    return { ...base, kind: 'text', text, preview: `PDF · ${text.length} chars extracted` };
  }

  if (TEXT_EXT.test(file.name) || /^text\//.test(file.type) || file.type === 'application/json') {
    const text = (await readAsText(file)).slice(0, MAX_TEXT);
    return { ...base, kind: 'text', text, preview: `${text.length} chars` };
  }

  throw new Error(`Unsupported file type: ${file.name}. Try an image, PDF or a text-based file.`);
}

/** Render ingested attachments as prompt text. */
export function attachmentsToPrompt(items = []) {
  const docs = items.filter((i) => i.kind === 'text');
  if (!docs.length) return '';
  return docs.map((d) => `--- ATTACHED DOCUMENT: ${d.name} ---\n${d.text}`).join('\n\n');
}
