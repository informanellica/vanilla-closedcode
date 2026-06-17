/** @file VS Code extension entry point; registers commands to open a closedcode terminal in a split pane and push the active file (with selected line range) into the running TUI. */

/**
 * Extension deactivation hook; invoked by VS Code when the extension is shut down. No cleanup is required here.
 * @returns {void}
 */
// This method is called when your extension is deactivated
export function deactivate() {}
import * as vscode from "vscode";
const TERMINAL_NAME = "closedcode";
/**
 * Extension activation hook; registers the openNewTerminal, openTerminal, and addFilepathToTerminal commands and their disposables.
 * @param {Object} context - The VS Code ExtensionContext, used to track command disposables and resolve bundled asset paths.
 * @returns {void}
 */
export function activate(context) {
  const openNewTerminalDisposable = vscode.commands.registerCommand("closedcode.openNewTerminal", async () => {
    await openTerminal();
  });
  const openTerminalDisposable = vscode.commands.registerCommand("closedcode.openTerminal", async () => {
    // A closedcode terminal already exists => focus it
    const existingTerminal = vscode.window.terminals.find(t => t.name === TERMINAL_NAME);
    if (existingTerminal) {
      existingTerminal.show();
      return;
    }
    await openTerminal();
  });
  let addFilepathDisposable = vscode.commands.registerCommand("closedcode.addFilepathToTerminal", async () => {
    const fileRef = getActiveFile();
    if (!fileRef) {
      return;
    }
    const terminal = vscode.window.activeTerminal;
    if (!terminal) {
      return;
    }
    if (terminal.name === TERMINAL_NAME) {
      const port = terminal.creationOptions.env?.["_EXTENSION_CLOSEDCODE_PORT"];
      port ? await appendPrompt(parseInt(port), fileRef) : terminal.sendText(fileRef, false);
      terminal.show();
    }
  });
  context.subscriptions.push(openNewTerminalDisposable, openTerminalDisposable, addFilepathDisposable);
  /**
   * Creates a closedcode terminal beside the editor, launches the CLI on a random port, waits for the local server to come up, and seeds it with the active file reference.
   * @returns {Promise<void>} Resolves once the terminal is opened (and the prompt seeded, if a file is active and the server connects).
   */
  async function openTerminal() {
    // Create a new terminal in split screen
    const port = Math.floor(Math.random() * (65535 - 16384 + 1)) + 16384;
    const terminal = vscode.window.createTerminal({
      name: TERMINAL_NAME,
      iconPath: {
        light: vscode.Uri.file(context.asAbsolutePath("images/button-dark.svg")),
        dark: vscode.Uri.file(context.asAbsolutePath("images/button-light.svg"))
      },
      location: {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: false
      },
      env: {
        _EXTENSION_CLOSEDCODE_PORT: port.toString(),
        CLOSEDCODE_CALLER: "vscode"
      }
    });
    terminal.show();
    terminal.sendText(`closedcode --port ${port}`);
    const fileRef = getActiveFile();
    if (!fileRef) {
      return;
    }

    // Wait for the terminal to be ready
    let tries = 10;
    let connected = false;
    do {
      await new Promise(resolve => setTimeout(resolve, 200));
      try {
        await fetch(`http://localhost:${port}/app`);
        connected = true;
        break;
      } catch {}
      tries--;
    } while (tries > 0);

    // If connected, append the prompt to the terminal
    if (connected) {
      await appendPrompt(port, `In ${fileRef}`);
      terminal.show();
    }
  }
  /**
   * Appends text to the running TUI's prompt input via its local HTTP API.
   * @param {number} port - The localhost port the closedcode server is listening on.
   * @param {string} text - The text to append to the TUI prompt.
   * @returns {Promise<void>} Resolves once the POST request completes.
   */
  async function appendPrompt(port, text) {
    await fetch(`http://localhost:${port}/tui/append-prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text
      })
    });
  }
  /**
   * Builds a closedcode file reference for the active editor: an "@"-prefixed workspace-relative path, with a "#L" line or line-range suffix when text is selected.
   * @returns {string|undefined} The file reference string, or undefined when there is no active editor or the file is outside the workspace.
   */
  function getActiveFile() {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      return;
    }
    const document = activeEditor.document;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
      return;
    }

    // Get the relative path from workspace root
    const relativePath = vscode.workspace.asRelativePath(document.uri);
    let filepathWithAt = `@${relativePath}`;

    // Check if there's a selection and add line numbers
    const selection = activeEditor.selection;
    if (!selection.isEmpty) {
      // Convert to 1-based line numbers
      const startLine = selection.start.line + 1;
      const endLine = selection.end.line + 1;
      if (startLine === endLine) {
        // Single line selection
        filepathWithAt += `#L${startLine}`;
      } else {
        // Multi-line selection
        filepathWithAt += `#L${startLine}-${endLine}`;
      }
    }
    return filepathWithAt;
  }
}
