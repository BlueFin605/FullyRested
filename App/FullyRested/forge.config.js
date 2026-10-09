const path = require('node:path');
const fs = require('node:fs');
const { execSync } = require('node:child_process');

module.exports = {
  packagerConfig: {
    asar: true,
    // The renderer ships as the ng build output in dist/fullyrested; its sources, caches and
    // other build output stay out of the package
    ignore: [
      /^\/\.angular($|\/)/,
      /^\/\.vscode($|\/)/,
      /^\/src($|\/)/,
      /^\/dist\/(?!fullyrested($|\/))/,
      /^\/tsconfig.*\.json$/,
      /^\/karma\.conf\.js$/,
    ],
  },
  rebuildConfig: {},
  hooks: {
    // @fullyrested/core is a file:../core symlink, so the packager copies the whole folder,
    // dev dependencies and all. Swap it for core's build output plus its production dependencies.
    packageAfterPrune: async (forgeConfig, buildPath) => {
      const source = path.resolve(__dirname, '../core');
      const target = path.join(buildPath, 'node_modules', '@fullyrested', 'core');
      fs.rmSync(target, { recursive: true, force: true });
      fs.mkdirSync(target, { recursive: true });
      fs.copyFileSync(path.join(source, 'package.json'), path.join(target, 'package.json'));
      fs.cpSync(path.join(source, 'dist'), path.join(target, 'dist'), { recursive: true });
      execSync('npm install --omit=dev --no-package-lock --ignore-scripts --no-audit --no-fund', { cwd: target, stdio: 'inherit' });
    },
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {},
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
  ],
};
