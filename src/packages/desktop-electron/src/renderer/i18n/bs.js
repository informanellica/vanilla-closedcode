/** @file Bosnian (bs) translation strings for the desktop Electron shell (menu, dialogs, updater, CLI installer). */

/**
 * Bosnian translation dictionary keyed by dotted message id; values may contain
 * `{{var}}` placeholders that are interpolated at render time.
 * @type {Object}
 */
export const dict = {
  "desktop.menu.checkForUpdates": "Provjeri ažuriranja...",
  "desktop.menu.installCli": "Instaliraj CLI...",
  "desktop.menu.reloadWebview": "Ponovo učitavanje webview-a",
  "desktop.menu.restart": "Restartuj",
  "desktop.dialog.chooseFolder": "Odaberi folder",
  "desktop.dialog.chooseFile": "Odaberi datoteku",
  "desktop.dialog.saveFile": "Sačuvaj datoteku",
  "desktop.updater.checkFailed.title": "Provjera ažuriranja nije uspjela",
  "desktop.updater.checkFailed.message": "Nije moguće provjeriti ažuriranja",
  "desktop.updater.none.title": "Nema dostupnog ažuriranja",
  "desktop.updater.none.message": "Već koristiš najnoviju verziju ClosedCode-a",
  "desktop.updater.downloadFailed.title": "Ažuriranje nije uspjelo",
  "desktop.updater.downloadFailed.message": "Neuspjelo preuzimanje ažuriranja",
  "desktop.updater.downloaded.title": "Ažuriranje preuzeto",
  "desktop.updater.downloaded.prompt": "Verzija {{version}} ClosedCode-a je preuzeta. Želiš li da je instaliraš i ponovo pokreneš aplikaciju?",
  "desktop.updater.installFailed.title": "Ažuriranje nije uspjelo",
  "desktop.updater.installFailed.message": "Neuspjela instalacija ažuriranja",
  "desktop.cli.installed.title": "CLI instaliran",
  "desktop.cli.installed.message": "CLI je instaliran u {{path}}\n\nRestartuj terminal da bi koristio komandu 'closedcode'.",
  "desktop.cli.failed.title": "Instalacija nije uspjela",
  "desktop.cli.failed.message": "Neuspjela instalacija CLI-a: {{error}}"
};