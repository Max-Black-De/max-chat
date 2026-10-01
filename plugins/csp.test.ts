// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { CSP_POLICY, cspMetaPlugin } from './csp.ts';

const META_RE = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/g;

/** Vite экранирует `'` в атрибутах как `&#39;` — браузер раскодирует это обратно. */
function decodeAttr(value: string): string {
  return value.replaceAll('&#39;', "'").replaceAll('&quot;', '"').replaceAll('&amp;', '&');
}

let root: string | undefined;

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});

async function buildIndexHtml(): Promise<string> {
  root = await mkdtemp(join(tmpdir(), 'csp-plugin-'));
  await writeFile(
    join(root, 'index.html'),
    '<!doctype html><html><head><meta charset="UTF-8" /><title>t</title></head><body></body></html>',
  );
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    root,
    plugins: [cspMetaPlugin()],
    build: { write: false },
  });
  const files = (Array.isArray(result) ? result : [result]).flatMap((o) =>
    'output' in o ? o.output : [],
  );
  const file = files.find((f) => f.fileName === 'index.html');
  if (file?.type !== 'asset') throw new Error('index.html not found in build output');
  return String(file.source);
}

describe('cspMetaPlugin', () => {
  it('содержит политику EC-X3 дословно', () => {
    expect(CSP_POLICY).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
        "connect-src https:; object-src 'none'; base-uri 'none'; form-action 'none'",
    );
  });

  it('применяется только при сборке, не в dev (HMR вставляет инлайн-скрипты)', () => {
    expect(cspMetaPlugin().apply).toBe('build');
  });

  it('вставляет meta в начало <head> собранного index.html', async () => {
    const html = await buildIndexHtml();
    const metas = [...html.matchAll(META_RE)];
    expect(metas).toHaveLength(1);
    expect(decodeAttr(metas[0]?.[1] ?? '')).toBe(CSP_POLICY);
    expect(metas[0]?.index).toBeLessThan(html.indexOf('<meta charset'));
  });
});
