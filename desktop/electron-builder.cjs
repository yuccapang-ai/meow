module.exports = {
  appId: 'com.ttddp.catroom',
  productName: '猫猫对对碰',
  artifactName: 'CatRoom-Setup-${version}-${arch}.${ext}',
  directories: { output: '../output/installer' },
  extraMetadata: { main: 'desktop/main.cjs' },
  asar: true,
  npmRebuild: false,
  files: [
    'package.json',
    { from: '.', to: 'desktop', filter: ['main.cjs', 'preload.cjs', 'game-preload.cjs', 'pet.html', 'pet.css', 'pet.js'] },
    { from: '../app', to: 'app', filter: ['**/*'] },
    { from: '../myasset', to: 'myasset', filter: ['logo_cat.png'] }
  ],
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    executableName: 'CatRoom',
    icon: '../myasset/logo_cat.png'
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: '猫猫对对碰',
    uninstallDisplayName: '猫猫对对碰 ${version}',
    installerLanguages: ['zh_CN', 'en_US'],
    language: '2052',
    runAfterFinish: true,
    deleteAppDataOnUninstall: false
  }
};
