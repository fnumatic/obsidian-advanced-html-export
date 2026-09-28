import { gzipSync } from 'zlib';
import { escapeHtml } from './htmlUtils';

/**
 * Compression applied to an exported HTML file before it is delivered.
 *
 * - `none`: plain, uncompressed HTML
 * - `gzipb64`: self-extracting gzip container, payload encoded as base64
 * - `gzipb85`: self-extracting gzip container, payload encoded as base85
 *   (5 chars per 4 bytes instead of 4 per 3, ~6% smaller)
 *
 * Both gzip variants are inflated by the native `DecompressionStream`.
 */
export type CompressionMode = 'none' | 'gzipb64' | 'gzipb85';

/** Encoding of the gzip payload inside a self-extracting container. */
export type PayloadEncoding = 'base64' | 'base85';

/**
 * Size metadata describing how a document was wrapped for export. Populated by
 * the same builders that produce the output, so the numbers cannot drift from
 * the actual file.
 */
export interface CompressionMeta {
  /** Compression mode that was applied. */
  mode: CompressionMode;
  /** Bytes of the uncompressed input document. */
  rawBytes: number;
  /** Bytes of the gzip payload (equals `rawBytes` for mode `none`). */
  compressedBytes: number;
  /** Bytes of the encoded payload (equals `rawBytes` for mode `none`). */
  encodedBytes: number;
  /** Bytes of the final document written to disk. */
  outputBytes: number;
  /** Bytes added by the text encoding (base64/base85) over the gzip payload. */
  encodingOverheadBytes: number;
}

/**
 * 85 printable ASCII characters (33..118) excluding `<` (60), so the base85
 * payload can never terminate the enclosing `<script>` element. Built
 * programmatically to avoid escaping issues with backslash and quotes.
 */
const ALPHABET: string = (() => {
    let alphabet = '';
    for (let code = 33; code <= 118; code++) {
        if (code !== 60) alphabet += String.fromCharCode(code);
    }
    return alphabet;
})();

const textEncoder = new TextEncoder();

/**
 * Encodes bytes as base64. Uses Node's `Buffer` when available (plugin runtime)
 * and falls back to `btoa` otherwise (tests/browser).
 */
function encodeBase64(bytes: Uint8Array): string {
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
    }
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

/** Encodes bytes as base85 (padded to a multiple of 4 bytes with zeros). */
function encodeBase85(bytes: Uint8Array): string {
    const paddedLength = Math.ceil(bytes.length / 4) * 4;
    let output = '';
    const group: string[] = new Array(5);
    for (let i = 0; i < paddedLength; i += 4) {
        const b0 = bytes[i] ?? 0;
        const b1 = bytes[i + 1] ?? 0;
        const b2 = bytes[i + 2] ?? 0;
        const b3 = bytes[i + 3] ?? 0;
        let value = ((b0 * 256 + b1) * 256 + b2) * 256 + b3;
        for (let j = 4; j >= 0; j--) {
            group[j] = ALPHABET[value % 85];
            value = Math.floor(value / 85);
        }
        output += group.join('');
    }
    return output;
}

const CONTAINER_STYLE = 'html,body{margin:0;height:100%}'
    + '#zz-loader{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;'
    + 'font:14px/1.5 system-ui,sans-serif;color:#444;background:#fff}';

const GZIP_LOADER = String.raw`(function () {
  "use strict";
  function decode(el) {
    var text = el.textContent;
    var length = Number(el.getAttribute("data-bytes"));
    if (el.getAttribute("data-encoding") === "base64") {
      var bin = atob(text.replace(/\s+/g, ""));
      var out = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    var alphabet = "";
    for (var code = 33; code <= 118; code++) {
      if (code !== 60) alphabet += String.fromCharCode(code);
    }
    var lookup = new Int32Array(128).fill(-1);
    for (var k = 0; k < alphabet.length; k++) lookup[alphabet.charCodeAt(k)] = k;
    var bytes = new Uint8Array(Math.ceil(length / 4) * 4);
    var offset = 0;
    var value = 0;
    var count = 0;
    for (var j = 0; j < text.length; j++) {
      var index = lookup[text.charCodeAt(j)];
      if (index < 0) continue;
      value = value * 85 + index;
      count++;
      if (count === 5) {
        bytes[offset++] = (value / 16777216) & 255;
        bytes[offset++] = (value / 65536) & 255;
        bytes[offset++] = (value / 256) & 255;
        bytes[offset++] = value & 255;
        value = 0;
        count = 0;
      }
    }
    return bytes.subarray(0, length);
  }
  function fail(msg) {
    var el = document.getElementById("zz-loader");
    if (el) el.textContent = "Self-extraction failed: " + msg;
  }
  async function unpack() {
    try {
      if (typeof DecompressionStream === "undefined") {
        throw new Error("DecompressionStream is not available");
      }
      var stream = new Blob([decode(document.getElementById("zz-payload"))]).stream()
        .pipeThrough(new DecompressionStream("gzip"));
      var html = await new Response(stream).text();
      document.open("text/html", "replace");
      document.write(html);
      document.close();
    } catch (err) {
      fail(err && err.message ? err.message : String(err));
    }
  }
  if (document.readyState === "complete") setTimeout(unpack, 0);
  else addEventListener("load", unpack, { once: true });
})();`;

/** Builds the surrounding HTML shell for a self-extracting export. */
function buildContainer(title: string, body: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${CONTAINER_STYLE}</style>
</head>
<body>
<div id="zz-loader">Unpacking\u2026</div>
${body}
</body>
</html>
`;
}

/**
 * Wraps an HTML document into a gzip self-extracting container and reports the
 * sizes involved.
 * No extra decoder is required: browsers inflate it natively.
 * @param html The full HTML document to wrap
 * @param title Title used for the container document
 * @param encoding Encoding of the compressed payload (base64 or base85)
 * @returns The self-extracting HTML document and its size metadata
 */
export function buildGzipSelfExtractWithMeta(
    html: string,
    title: string,
    encoding: PayloadEncoding,
): { html: string; meta: CompressionMeta } {
    const input = textEncoder.encode(html);
    const compressed = gzipSync(input, { level: 9 });
    const payload = encoding === 'base64' ? encodeBase64(compressed) : encodeBase85(compressed);
    const body = `<script id="zz-payload" type="application/octet-stream" data-encoding="${encoding}" data-bytes="${compressed.length}">${payload}</script>
<script>${GZIP_LOADER}</script>`;
    const container = buildContainer(title, body);
    const encodedBytes = textEncoder.encode(payload).length;
    return {
        html: container,
        meta: {
            mode: encoding === 'base64' ? 'gzipb64' : 'gzipb85',
            rawBytes: input.length,
            compressedBytes: compressed.length,
            encodedBytes,
            outputBytes: textEncoder.encode(container).length,
            encodingOverheadBytes: encodedBytes - compressed.length,
        },
    };
}

/**
 * Applies the configured compression to an exported HTML document and reports
 * the resulting sizes.
 * @param html The full HTML document
 * @param mode Compression mode from the plugin settings
 * @param title Title used for the self-extracting container
 * @returns The (possibly wrapped) HTML document and its size metadata
 */
export function wrapHtmlForExportWithMeta(
    html: string,
    mode: CompressionMode,
    title: string,
): { html: string; meta: CompressionMeta } {
    if (mode === 'gzipb64') {
        return buildGzipSelfExtractWithMeta(html, title, 'base64');
    }
    if (mode === 'gzipb85') {
        return buildGzipSelfExtractWithMeta(html, title, 'base85');
    }
    const rawBytes = textEncoder.encode(html).length;
    return {
        html,
        meta: {
            mode: 'none',
            rawBytes,
            compressedBytes: rawBytes,
            encodedBytes: rawBytes,
            outputBytes: rawBytes,
            encodingOverheadBytes: 0,
        },
    };
}

/**
 * Resolves a compression mode from a note's frontmatter, falling back to the
 * plugin setting when the value is missing or invalid.
 * @param value Raw `export.compression` frontmatter value
 * @param fallback Compression mode from the plugin settings
 * @returns A valid compression mode
 */
export function resolveCompressionMode(value: unknown, fallback: CompressionMode): CompressionMode {
    if (value === 'none' || value === 'gzipb64' || value === 'gzipb85') {
        return value;
    }
    return fallback;
}
