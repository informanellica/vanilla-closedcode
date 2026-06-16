/** @file Simplified Chinese (zh) translation strings for desktop-specific renderer UI (menus, dialogs, updater, CLI install). */

/**
 * Simplified Chinese translation table mapping desktop renderer message keys to their localized strings.
 * Some values contain `{{...}}` placeholders that are interpolated at lookup time.
 * @type {Object}
 */
export const dict = {
  "desktop.menu.checkForUpdates": "检查更新...",
  "desktop.menu.installCli": "安装 CLI...",
  "desktop.menu.reloadWebview": "重新加载 Webview",
  "desktop.menu.restart": "重启",
  "desktop.dialog.chooseFolder": "选择文件夹",
  "desktop.dialog.chooseFile": "选择文件",
  "desktop.dialog.saveFile": "保存文件",
  "desktop.updater.checkFailed.title": "检查更新失败",
  "desktop.updater.checkFailed.message": "无法检查更新",
  "desktop.updater.none.title": "没有可用更新",
  "desktop.updater.none.message": "你已经在使用最新版本的 ClosedCode",
  "desktop.updater.downloadFailed.title": "更新失败",
  "desktop.updater.downloadFailed.message": "无法下载更新",
  "desktop.updater.downloaded.title": "更新已下载",
  "desktop.updater.downloaded.prompt": "已下载 ClosedCode {{version}} 版本，是否安装并重启？",
  "desktop.updater.installFailed.title": "更新失败",
  "desktop.updater.installFailed.message": "无法安装更新",
  "desktop.cli.installed.title": "CLI 已安装",
  "desktop.cli.installed.message": "CLI 已安装到 {{path}}\n\n重启终端以使用 'closedcode' 命令。",
  "desktop.cli.failed.title": "安装失败",
  "desktop.cli.failed.message": "无法安装 CLI: {{error}}"
};