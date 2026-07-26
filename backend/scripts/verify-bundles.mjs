/**
 * Smoke-check that every esbuild bundle actually initialises under Node.
 *
 * Bundling to ESM while a dependency (stripe -> qs -> side-channel ->
 * object-inspect) calls require() at runtime produces a bundle that type-checks,
 * lints, passes every unit test, and then dies on Lambda cold start with
 * "Dynamic require of \"util\" is not supported". Nothing short of importing
 * the built artifact catches that.
 */
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Must list every bundle produced by `npm run build`. A bundle missing here is
// silently unverified, which is the failure mode this script exists to prevent —
// so the count is asserted against dist/ below rather than trusted.
const BUNDLES = [
  'index',
  'sentimentWorker',
  'reports',
  'alerts',
  'admin',
  'aggregation',
  'calibration',
  'sweep',
];

let failed = 0;
for (const name of BUNDLES) {
  const file = resolve(process.cwd(), 'dist', `${name}.js`);
  if (!existsSync(file)) {
    console.error(`FAIL ${name}: dist/${name}.js not found — run npm run build`);
    failed++;
    continue;
  }
  try {
    await import(pathToFileURL(file).href);
    console.log(`ok   ${name}`);
  } catch (error) {
    // A module is free to throw a non-Error — including null or undefined —
    // and `error.message` would then throw here, masking the very bundle
    // failure this script exists to surface.
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL ${name}: ${message}`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} bundle(s) failed to initialise.`);
  process.exit(1);
}

// Catch a new Lambda whose bundle was added to the build but not to BUNDLES.
// Without this the list silently drifts and the new entry point ships unchecked.
const built = (await readdir(resolve(process.cwd(), 'dist')))
  .filter((f) => f.endsWith('.js'))
  .map((f) => f.replace(/\.js$/, ''))
  .sort();
const unlisted = built.filter((name) => !BUNDLES.includes(name));
if (unlisted.length > 0) {
  console.error(`\nBundles present in dist/ but not verified: ${unlisted.join(', ')}`);
  console.error('Add them to BUNDLES in scripts/verify-bundles.mjs.');
  process.exit(1);
}

console.log(`\nAll ${BUNDLES.length} bundles initialise cleanly.`);
