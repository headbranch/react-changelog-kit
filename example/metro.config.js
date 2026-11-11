// Resolves `react-changelog-kit` straight to the library's TypeScript source in ../src,
// so edits to the library hot-reload in the example without a build step.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const libRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Let Metro watch and transform files outside the example folder.
config.watchFolders = [...(config.watchFolders ?? []), libRoot];

const libEntryPoints = {
  'react-changelog-kit': 'src/index.ts',
};

// The library's own node_modules (dev deps like react for tests) must never be bundled:
// a second copy of React breaks hooks. Everything resolves from the example's node_modules.
const escape = (p) => p.replace(/[/\\]/g, '[/\\\\]').replace(/\./g, '\\.');
const libNodeModules = new RegExp(`^${escape(path.join(libRoot, 'node_modules'))}[/\\\\].*$`);
config.resolver.blockList = [].concat(config.resolver.blockList ?? [], libNodeModules);
config.resolver.nodeModulesPaths = [path.join(projectRoot, 'node_modules')];

const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const entry = libEntryPoints[moduleName];
  if (entry) return { type: 'sourceFile', filePath: path.join(libRoot, entry) };
  return (defaultResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
