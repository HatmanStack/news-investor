// Metro configuration for a monorepo workspace.
//
// Required, not optional. This package lives in an npm workspace and its
// dependencies hoist to the repo root, so Metro's defaults — which assume
// node_modules sits beside the project — cannot find the transformer and the
// bundler dies before reading a single app module:
//
//   TypeError: Cannot read properties of undefined (reading 'transformFile')
//
// See https://docs.expo.dev/guides/monorepo/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Watch the whole workspace so changes in sibling packages invalidate.
config.watchFolders = [workspaceRoot];

// Resolve from the local package first, then the hoisted root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Only consult the paths above. Without this Metro also walks every parent
// directory, which in a workspace can resolve two copies of React and produce
// hook errors that look like application bugs.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
