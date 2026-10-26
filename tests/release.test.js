// Konsistens før publisering: samme versjon overalt, og app-skallet finnes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { VERSION } from '../js/version.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

test('versjonsnummer er likt i version.js, package.json, sw.js og CHANGELOG', () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(JSON.parse(read('package.json')).version, VERSION);
  assert.match(read('sw.js'), new RegExp(`const VERSION = '${VERSION.replace(/\./g, '\\.')}'`));
  assert.match(read('CHANGELOG.md'), new RegExp(`## \\[${VERSION.replace(/\./g, '\\.')}\\]`));
});

test('alle lokale filer i service worker-skallet finnes', () => {
  const m = read('sw.js').match(/SHELL_FILES = \[([\s\S]*?)\];/);
  const files = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).filter((f) => !f.startsWith('http') && f !== './');
  for (const f of files) assert.ok(existsSync(new URL(f, root)), `mangler ${f}`);
});

test('manifestet peker på eksisterende ikoner', () => {
  const man = JSON.parse(read('manifest.webmanifest'));
  for (const i of man.icons) assert.ok(existsSync(new URL(i.src, root)), `mangler ${i.src}`);
});

test('PNG-ikonene har størrelsen manifestet oppgir', () => {
  const man = JSON.parse(read('manifest.webmanifest'));
  for (const i of man.icons.filter((x) => x.type === 'image/png')) {
    const buf = readFileSync(new URL(i.src, root));
    assert.equal(buf.toString('ascii', 1, 4), 'PNG', `${i.src} er ikke PNG`);
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    assert.equal(`${w}x${h}`, i.sizes, i.src);
  }
});

test('SVG-ikonet viser kamera og sol', () => {
  const svg = read('icons/icon.svg');
  assert.match(svg, /id="kamera"/);
  assert.match(svg, /id="sol"/);
});
