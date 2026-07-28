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
import { existsSync, readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// The bundle list is derived from the build:* scripts rather than hardcoded.
// A hardcoded list drifts the moment a Lambda is added, and it cannot be
// shared between editions: the community edition builds a subset of these
// entry points, so a pro-shaped list makes its `npm run check` fail on
// bundles it never builds. package.json is the same source of truth the build
// itself uses, so the list cannot disagree with what `npm run build` produces.
// The dist/ cross-check below still catches a bundle nothing declares.
const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));
const BUNDLES = Object.entries(pkg.scripts ?? {})
  .filter(([name]) => name.startsWith('build:'))
  .map(([, command]) => /--outfile=dist\/([^\s]+)\.js/.exec(command)?.[1])
  .filter((name) => name !== undefined)
  .sort();

if (BUNDLES.length === 0) {
  console.error('No build:* script declares an --outfile=dist/*.js target.');
  process.exit(1);
}

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

// Catch a bundle in dist/ that no build:* script declares — a stale artifact
// from a removed Lambda, or one produced outside the build. Either way it is
// unverified and would ship alongside the ones that are not.
const built = (await readdir(resolve(process.cwd(), 'dist')))
  .filter((f) => f.endsWith('.js'))
  .map((f) => f.replace(/\.js$/, ''))
  .sort();
const unlisted = built.filter((name) => !BUNDLES.includes(name));
if (unlisted.length > 0) {
  console.error(`\nBundles present in dist/ but not verified: ${unlisted.join(', ')}`);
  console.error(
    'No build:* script in package.json produces them. Declare one, or run npm run clean.',
  );
  process.exit(1);
}

console.log(`\nAll ${BUNDLES.length} bundles initialise cleanly.`);
