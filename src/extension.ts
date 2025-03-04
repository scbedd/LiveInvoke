import * as vscode from 'vscode';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
import * as os from 'os';

// PowerShell function analysis type
interface PowerShellFunction {
    name: string;
    startLine: number;
    endLine: number;
    isAdvancedFunction: boolean;
}

// Track which functions have argument overlays displayed
const activeOverlays = new Map<string, vscode.WebviewPanel>();

const extensionConfig: any = {
    "name": "LiveInvoke",
    "type": "PowerShell",
    "request": "launch",
    "script": "{dynamic}"
};

// Store argument values for each function
// Key: <filePath>:<functionName>:<startLine>, Value: Map of argument name to value
const functionArguments = new Map<string, Map<string, string>>();

// Reference to the CodeLens provider for triggering refreshes
let codeLensProvider: PowerShellCodeLensProvider | null = null;

function createPowerShellFile(functionName: string, originFile: string): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder found.');
        return '';
    }

    const tempFolder = os.tmpdir();

    const scriptName = crypto.createHash('sha256')
    .update(functionName + originFile, 'utf8')
    .digest('hex') + '.ps1';

    const filePath = path.join(tempFolder, scriptName);

    // Basic file contents (you can adjust this as needed)
    const fileContents = `. "${originFile}"
${functionName}
`;

    fs.writeFileSync(filePath, fileContents);
    vscode.window.showInformationMessage(`Profile generated successfully: ${filePath}`);

    return filePath;
}

function generateLaunchConfig(functionName: string, originFile: string): any {
    const scriptPath: string = createPowerShellFile(functionName, originFile);
    const launchConfig = {
        ...extensionConfig,
        "script": scriptPath
    };

    return launchConfig;
}


// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "liveinvoke" is now active!');

    // Setup PowerShell file handling
    setupPowerShellFileHandling(context);

    // Register existing commands
    const disposable = vscode.commands.registerCommand('liveinvoke.helloWorld', () => {
        vscode.window.showInformationMessage('Hello VS Code!');
    });

    context.subscriptions.push(disposable);

    // Process any already open PowerShell documents
    vscode.window.visibleTextEditors.forEach(editor => {
        if (isPowerShellFile(editor.document)) {
            console.log('Analyzing already open PowerShell file:', editor.document.fileName);
            analyzePowerShellDocument(editor.document);
        }
    });

    // Instead of immediately calling triggerCodeLensRefresh, let the regular registration handle it
}

function setupPowerShellFileHandling(context: vscode.ExtensionContext) {
    // Register command to run PowerShell code
    const runCodeCommand = vscode.commands.registerCommand('liveinvoke.runPowerShellCode',
        (functionName: string, startLine: number, endLine: number, filePath: string) => {
        runPowerShellCode(functionName, startLine, endLine, filePath);
    });
    context.subscriptions.push(runCodeCommand);

    // Register command to show function arguments overlay
    const showArgsCommand = vscode.commands.registerCommand('liveinvoke.showFunctionArguments',
        (functionName: string, startLine: number, endLine: number, filePath: string) => {
        showFunctionArgumentsOverlay(functionName, startLine, endLine, filePath);
    });
    context.subscriptions.push(showArgsCommand);

    // Watch for PowerShell file opening
    const powerShellFileWatcher = vscode.workspace.onDidOpenTextDocument((document) => {
        if (isPowerShellFile(document)) {
            console.log('PowerShell file opened:', document.fileName);
            analyzePowerShellDocument(document);

            // Refresh code lenses
            triggerCodeLensRefresh();
        }
    });
    context.subscriptions.push(powerShellFileWatcher);

    // Also watch for active editor changes
    const activeEditorWatcher = vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && isPowerShellFile(editor.document)) {
            console.log('Active editor changed to PowerShell file:', editor.document.fileName);
            analyzePowerShellDocument(editor.document);

            // Refresh code lenses
            triggerCodeLensRefresh();
        }
    });
    context.subscriptions.push(activeEditorWatcher);

    // Register for document content changes to refresh analysis
    const docChangeWatcher = vscode.workspace.onDidChangeTextDocument((e) => {
        if (isPowerShellFile(e.document)) {
            // Using a debounced version would be better in a real implementation
            analyzePowerShellDocument(e.document);
        }
    });
    context.subscriptions.push(docChangeWatcher);

    // IMPORTANT: Register code lens provider ONLY ONCE
    const provider = new PowerShellCodeLensProvider();
    codeLensProvider = provider; // Store reference for refreshes

    const decorationProvider = vscode.languages.registerCodeLensProvider(
        { language: 'powershell', scheme: 'file' },
        provider
    );
    context.subscriptions.push(decorationProvider);
}

// Replace with a proper CodeLens refresh function
function triggerCodeLensRefresh(): void {
    if (codeLensProvider) {
        codeLensProvider.refresh();
    }
}

function isPowerShellFile(document: vscode.TextDocument): boolean {
    return document.languageId === 'powershell' ||
           document.fileName.endsWith('.ps1') ||
           document.fileName.endsWith('.psm1');
}

function analyzePowerShellDocument(document: vscode.TextDocument): PowerShellFunction[] {
    const functions: PowerShellFunction[] = [];

    // Updated regex to find function declarations with both lowercase and uppercase F
    const functionRegex = /[fF]unction\s+([a-zA-Z0-9\-_]+)\s*(?:\(.*\))?\s*{/g;
    const advancedFunctionRegex = /(?:[fF]unction)\s+([a-zA-Z0-9\-_]+)\s*{[\s\S]*?\[CmdletBinding/g;

    const text = document.getText();
    let match;

    // Find regular functions
    while ((match = functionRegex.exec(text)) !== null) {
        const functionName = match[1];
        const startPos = document.positionAt(match.index);
        const startLine = startPos.line;

        // This is a simplified approach - in reality we would need to match braces
        // to find the end of the function
        let endLine = startLine;
        let braceCount = 1;
        for (let i = startLine + 1; i < document.lineCount; i++) {
            const line = document.lineAt(i).text;
            for (const char of line) {
                if (char === '{') { braceCount++; }
                if (char === '}') { braceCount--; }
            }
            if (braceCount === 0) {
                endLine = i;
                break;
            }
        }

        // Check if this is an advanced function (has CmdletBinding)
        const isAdvanced = text.slice(match.index, document.offsetAt(new vscode.Position(endLine, 0))).includes("[CmdletBinding");

        functions.push({
            name: functionName,
            startLine,
            endLine,
            isAdvancedFunction: isAdvanced
        });
    }

    return functions;
}

class PowerShellCodeLensProvider implements vscode.CodeLensProvider {
    // Add an event emitter to notify when code lenses change
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    // Track the functions we've already added lenses for to avoid duplicates
    private processedFunctions = new Map<string, number>();

    async provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.CodeLens[]> {
        if (!isPowerShellFile(document)) {
            return [];
        }

        const functions = analyzePowerShellDocument(document);
        const lenses: vscode.CodeLens[] = [];

        // Clear the map for this document
        this.processedFunctions.clear();

        for (const func of functions) {
            // Create a unique key for this function based on name and location
            const functionKey = `${document.uri.toString()}:${func.name}:${func.startLine}`;

            // Only add a code lens if we haven't processed this function yet
            if (!this.processedFunctions.has(functionKey)) {
                // Create a code lens for each function
                const range = new vscode.Range(
                    new vscode.Position(func.startLine, 0),
                    new vscode.Position(func.startLine, 0)
                );

                // Debug lens
                const runLens = new vscode.CodeLens(range, {
                    title: '▶️ Debug',
                    command: 'liveinvoke.runPowerShellCode',
                    arguments: [func.name, func.startLine, func.endLine, document.uri.fsPath]
                });

                // Arguments lens (with down arrow)
                const argsLens = new vscode.CodeLens(range, {
                    title: 'Arguments ▼',
                    command: 'liveinvoke.showFunctionArguments',
                    arguments: [func.name, func.startLine, func.endLine, document.uri.fsPath]
                });

                lenses.push(runLens, argsLens);

                // Mark this function as processed
                this.processedFunctions.set(functionKey, 1);
            }
        }

        return lenses;
    }

    // Method to signal that code lenses need to be refreshed
    refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }
}

// New function to show the arguments overlay
function showFunctionArgumentsOverlay(functionName: string, startLine: number, endLine: number, filePath: string) {
    try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }

        // Create a unique identifier for this function
        const functionKey = `${filePath}:${functionName}:${startLine}`;

        // Check if we already have an overlay for this function
        if (activeOverlays.has(functionKey)) {
            // Focus the existing overlay
            activeOverlays.get(functionKey)?.reveal();
            return;
        }

        // Create a webview panel for our overlay
        const panel = vscode.window.createWebviewPanel(
            'argumentsOverlay',
            `Arguments for ${functionName}`,
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                localResourceRoots: [],
                retainContextWhenHidden: true
            }
        );

        // Track this overlay
        activeOverlays.set(functionKey, panel);

        // When the panel is closed, remove it from our tracking map
        panel.onDidDispose(() => {
            activeOverlays.delete(functionKey);
        });

        // Create the UI content
        const content = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 10px;
                }
                .argument-row {
                    display: flex;
                    margin-bottom: 10px;
                    align-items: center;
                }
                .argument-label {
                    width: 150px;
                }
                .argument-value {
                    flex-grow: 1;
                    height: 24px;
                    border: 1px solid var(--vscode-input-border);
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    padding: 0 5px;
                }
                .close-button {
                    position: absolute;
                    top: 5px;
                    right: 5px;
                    cursor: pointer;
                    font-weight: bold;
                    padding: 5px;
                    border: none;
                    background: transparent;
                    font-size: 16px;
                    color: var(--vscode-editor-foreground);
                }
                h3 {
                    margin-top: 0;
                }
            </style>
        </head>
        <body>
            <button class="close-button" id="closeBtn">✖</button>
            <h3>Arguments for ${functionName}</h3>

            <div class="argument-row">
                <span class="argument-label">Argument:</span>
                <input type="text" class="argument-value" />
            </div>
            <div class="argument-row">
                <span class="argument-label">Value:</span>
                <input type="text" class="argument-value" />
            </div>

            <script>
                const closeBtn = document.getElementById('closeBtn');
                closeBtn.addEventListener('click', () => {
                    // Tell VS Code to close the panel
                    const vscode = acquireVsCodeApi();
                    vscode.postMessage({ command: 'close' });
                });
            </script>
        </body>
        </html>
        `;

        // Set the webview's HTML content
        panel.webview.html = content;

        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(message => {
            if (message.command === 'close') {
                panel.dispose();
            }
        });

    } catch (error) {
        vscode.window.showErrorMessage(`Error showing function arguments: ${error}`);
    }
}

async function runPowerShellCode(functionName: string, startLine: number, endLine: number, filePath: string) {
    try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }

        // Show a status message
        vscode.window.showInformationMessage(`Running function: ${functionName}`);
        const config = generateLaunchConfig(functionName, filePath);

        // // Start debugging with the modified configuration
        vscode.debug.startDebugging(undefined, config);
    } catch (error) {
        vscode.window.showErrorMessage(`Error running PowerShell code: ${error}`);
    }
}

async function getLaunchConfiguration(): Promise<any | undefined> {
    // Try to get the launch configuration from launch.json
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return undefined;
    }

    try {
        const launchConfigs = vscode.workspace.getConfiguration('launch', workspaceFolder.uri);
        const configs = launchConfigs.get<any[]>('configurations') || [];

        // Look for a PowerShell configuration
        return configs.find(config =>
            config.type === 'PowerShell' ||
            config.name?.toLowerCase().includes('powershell')
        );
    } catch (error) {
        console.error('Error getting launch configuration:', error);
        return undefined;
    }
}

// This method is called when your extension is deactivated
export function deactivate() {}
