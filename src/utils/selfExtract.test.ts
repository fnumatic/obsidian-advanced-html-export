import { describe, it, expect } from 'vitest';
import { gunzipSync } from 'zlib';
import {
    buildGzipSelfExtract,
    buildGzipSelfExtractWithMeta,
    wrapHtmlForExport,
    wrapHtmlForExportWithMeta,
    resolveCompressionMode,
    type PayloadEncoding,
} from './selfExtract';

const SAMPLE = '<!DOCTYPE html><html><head><title>T</title></head>'
    + '<body><h1>Hällo &amp; &lt;world&gt;</h1><p>Some content to compress.</p></body></html>';

const ALPHABET: string = (() => {
    let alphabet = '';
    for (let code = 33; code <= 118; code++) {
        if (code !== 60) alphabet += String.fromCharCode(code);
    }
    return alphabet;
})();

const LOOKUP = new Int32Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i;

/** Mirrors the loader's base85 decoding. */
function decodeBase85(text: string, length: number): Uint8Array {
    const output = new Uint8Array(Math.ceil(length / 4) * 4);
    let offset = 0;
    let value = 0;
    let count = 0;
    for (let i = 0; i < text.length; i++) {
        const index = LOOKUP[text.charCodeAt(i)];
        if (index < 0) continue;
        value = value * 85 + index;
        count++;
        if (count === 5) {
            output[offset++] = (value / 16777216) & 255;
            output[offset++] = (value / 65536) & 255;
            output[offset++] = (value / 256) & 255;
            output[offset++] = value & 255;
            value = 0;
            count = 0;
        }
    }
    return output.subarray(0, length);
}

/** Pulls the inert payload out of a container and decodes it, as the loader does. */
function extractPayload(container: string): Buffer {
    const match = container.match(
        /<script id="zz-payload"[^>]*data-encoding="([^"]+)"[^>]*data-bytes="(\d+)"[^>]*>([\s\S]*?)<\/script>/
    );
    if (!match) throw new Error('payload not found');
    const encoding = match[1] as PayloadEncoding;
    const length = Number(match[2]);
    const text = match[3];
    if (encoding === 'base64') {
        return Buffer.from(text.replace(/\s+/g, ''), 'base64').subarray(0, length);
    }
    return Buffer.from(decodeBase85(text, length));
}

describe('buildGzipSelfExtract', () => {
    it.each<PayloadEncoding>(['base64', 'base85'])('round-trips through %s + gunzip', (encoding) => {
        const container = buildGzipSelfExtract(SAMPLE, 'Test title', encoding);
        expect(container).toContain('id="zz-payload"');
        expect(container).toContain(`data-encoding="${encoding}"`);
        expect(gunzipSync(extractPayload(container)).toString('utf-8')).toBe(SAMPLE);
    });

    it('never emits a sequence that could close the script element in base85 mode', () => {
        const container = buildGzipSelfExtract(SAMPLE + 'x'.repeat(100000), 'T', 'base85');
        const payload = container.match(/data-bytes="\d+"[^>]*>([\s\S]*?)<\/script>/)![1];
        expect(payload).not.toContain('<');
    });

    it('escapes the container title', () => {
        const container = buildGzipSelfExtract(SAMPLE, 'A<b>&"', 'base64');
        expect(container).toContain('<title>A&lt;b&gt;&amp;&quot;</title>');
    });

    it('produces a base85 container smaller than the base64 one', () => {
        const big = SAMPLE + '<p>Lorem ipsum dolor sit amet.</p>'.repeat(5000);
        const base64 = buildGzipSelfExtract(big, 'T', 'base64');
        const base85 = buildGzipSelfExtract(big, 'T', 'base85');
        expect(base85.length).toBeLessThan(base64.length);
    });

    it('is smaller than the input for larger, compressible documents', () => {
        const big = SAMPLE + '<p>Lorem ipsum dolor sit amet.</p>'.repeat(2000);
        expect(buildGzipSelfExtract(big, 'T', 'base85').length).toBeLessThan(big.length);
    });
});

describe('wrapHtmlForExport', () => {
    it('returns the input unchanged for mode "none"', () => {
        expect(wrapHtmlForExport(SAMPLE, 'none', 'T')).toBe(SAMPLE);
    });

    it('wraps for gzipb64 and gzipb85 modes', () => {
        expect(wrapHtmlForExport(SAMPLE, 'gzipb64', 'T')).toContain('data-encoding="base64"');
        expect(wrapHtmlForExport(SAMPLE, 'gzipb85', 'T')).toContain('data-encoding="base85"');
    });
});

describe('compression metadata', () => {
    it('reports consistent sizes for base64 and base85', () => {
        const big = SAMPLE + '<p>Lorem ipsum dolor sit amet.</p>'.repeat(5000);
        const rawBytes = new TextEncoder().encode(big).length;

        for (const encoding of ['base64', 'base85'] as PayloadEncoding[]) {
            const { html, meta } = buildGzipSelfExtractWithMeta(big, 'T', encoding);
            expect(html).toBe(buildGzipSelfExtract(big, 'T', encoding));
            expect(meta.mode).toBe(encoding === 'base64' ? 'gzipb64' : 'gzipb85');
            expect(meta.rawBytes).toBe(rawBytes);
            expect(meta.outputBytes).toBe(new TextEncoder().encode(html).length);
            expect(meta.compressedBytes).toBeGreaterThan(0);
            expect(meta.encodedBytes).toBeGreaterThan(0);
            expect(meta.encodingOverheadBytes).toBe(meta.encodedBytes - meta.compressedBytes);
            expect(meta.encodingOverheadBytes).toBeGreaterThan(0);
        }
    });

    it('has less encoding overhead in base85 than in base64', () => {
        const big = SAMPLE + '<p>Lorem ipsum dolor sit amet.</p>'.repeat(5000);
        const base64 = buildGzipSelfExtractWithMeta(big, 'T', 'base64').meta;
        const base85 = buildGzipSelfExtractWithMeta(big, 'T', 'base85').meta;
        expect(base85.encodingOverheadBytes).toBeLessThan(base64.encodingOverheadBytes);
        expect(base85.outputBytes).toBeLessThan(base64.outputBytes);
    });

    it('reports unchanged sizes and zero overhead for mode "none"', () => {
        const rawBytes = new TextEncoder().encode(SAMPLE).length;
        const { html, meta } = wrapHtmlForExportWithMeta(SAMPLE, 'none', 'T');
        expect(html).toBe(SAMPLE);
        expect(meta.mode).toBe('none');
        expect(meta.rawBytes).toBe(rawBytes);
        expect(meta.outputBytes).toBe(rawBytes);
        expect(meta.encodingOverheadBytes).toBe(0);
    });
});

describe('resolveCompressionMode', () => {
    it('accepts the three valid frontmatter values', () => {
        expect(resolveCompressionMode('none', 'gzipb85')).toBe('none');
        expect(resolveCompressionMode('gzipb64', 'none')).toBe('gzipb64');
        expect(resolveCompressionMode('gzipb85', 'none')).toBe('gzipb85');
    });

    it('falls back to the setting for missing or invalid values', () => {
        expect(resolveCompressionMode(undefined, 'gzipb85')).toBe('gzipb85');
        expect(resolveCompressionMode(null, 'none')).toBe('none');
        expect(resolveCompressionMode('gzip', 'none')).toBe('none');
        expect(resolveCompressionMode(true, 'gzipb64')).toBe('gzipb64');
    });
});
