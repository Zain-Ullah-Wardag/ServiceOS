#!/usr/bin/env node
/**
 * Frontend test harness (local dev only — temporary, adds no dependencies).
 *
 * The committed frontend tests are plain `node:test` files that import the
 * TypeScript sources with explicit '.ts' extensions:
 *
 *   import { ... } from '../src/lib/productionView.ts';
 *
 * Node 20 cannot execute '.ts' imports directly (no
 * --experimental-strip-types), and this project deliberately uses no test
 * framework (no Vitest/tsx/Jest, no Node 22 requirement). This script:
 *
 *   1. transpiles every src/lib/*.ts to ESM JavaScript in a temp directory
 *      (using the typescript package already in devDependencies),
 *   2. copies tests/*.test.mjs into the temp directory with the lib imports
 *      rewritten from '../src/lib/x.ts' to './lib/x.js',
 *   3. runs `node --test` on the copied files (Node >= 18).
 *
 * Usage:  node scripts/run-tests.mjs   (from the frontend/ directory)
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const libSourceDir = path.join(root, 'src', 'lib');
const testsSourceDir = path.join(root, 'tests');

const outDir = mkdtempSync(path.join(tmpdir(), 'serviceos-frontend-tests-'));
const libOutDir = path.join(outDir, 'lib');
mkdirSync(libOutDir, { recursive: true });

try {
  for (const file of readdirSync(libSourceDir).sort()) {
    if (!file.endsWith('.ts')) continue;
    const source = readFileSync(path.join(libSourceDir, file), 'utf8');
    const { outputText } = ts.transpileModule(source, {
      fileName: file,
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    });
    writeFileSync(path.join(libOutDir, `${file.replace(/\.ts$/, '')}.js`), outputText);
  }

  const testFiles = readdirSync(testsSourceDir).filter((file) => file.endsWith('.test.mjs')).sort();
  if (testFiles.length === 0) {
    console.error('No *.test.mjs files found in tests/');
    process.exit(1);
  }
  for (const file of testFiles) {
    const source = readFileSync(path.join(testsSourceDir, file), 'utf8');
    // '../src/lib/x.ts' -> './lib/x.js' (the only import shape used in tests/).
    const rewritten = source.replace(/(['"])\.\.\/src\/lib\/([A-Za-z0-9_-]+)\.ts\1/g, `$1./lib/$2.js$1`);
    writeFileSync(path.join(outDir, file), rewritten);
  }

  const result = spawnSync(process.execPath, ['--test', ...testFiles.map((file) => path.join(outDir, file))], {
    stdio: 'inherit',
  });
  process.exit(result.status ?? 1);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
