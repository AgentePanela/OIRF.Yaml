// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
    console.log('OIRF YAML extension is now active!');
    const config = vscode.workspace.getConfiguration("oirf-yaml");
    let components: { name: string, path: string, description: string }[] = [];

    const status = vscode.window.setStatusBarMessage("Loading components...");
    try {
        components = await loadComponents();
    } finally {
        status.dispose();
    }

    let provider = vscode.languages.registerCompletionItemProvider(
        { language: "yaml" },
        {
            async provideCompletionItems(document, position) {
                const linePrefix = document.lineAt(position).text.substr(0, position.character);
                const currentLine = document.lineAt(position.line).text.trim();

                if (linePrefix.trim().startsWith("- type:") && isInComponents(document, position.line)) {
                    const status = vscode.window.setStatusBarMessage("Loading components...");
                    try {
                        return components.map(comp => {
                            const item = new vscode.CompletionItem(comp.name, vscode.CompletionItemKind.Class);
                            item.detail = "Component";
                            item.documentation = new vscode.MarkdownString(comp.description);  // Adicionando a descrição aqui
                            return item;
                        });
                    } finally {
                        status.dispose();
                    }
                }
                return undefined;
            }
        },
        ':', ' ' // autocomplete
    );

    context.subscriptions.push(provider);

    // Register Hover provider for descriptions
    const hoverProvider = vscode.languages.registerHoverProvider(
        { language: "yaml" },
        {
            async provideHover(document, position) {
                const currentLine = document.lineAt(position.line).text.trim();
                const match = currentLine.match(/- type:\s*(\w+)/);
                if (match) {
                    const componentName = match[1];
                    const component = components.find(comp => comp.name === componentName);
                    if (component) {
                        return new vscode.Hover(new vscode.MarkdownString(component.description));
                    }
                }
                return null;
            }
        }
    );

    context.subscriptions.push(hoverProvider);

    const compFilePath = path.resolve(vscode.workspace.rootPath || "", config.get<string>("loadClassesPath", "./src/rooms/schema/LoadClasses.ts"));
    fs.watch(compFilePath, async (eventType, filename) => {
        if (eventType === 'change' && filename) {
            console.log(`File ${filename} changed. Re-loading components...`);
            components = await loadComponents();
            vscode.window.showInformationMessage("Components reloaded due to file change.");
        }
    });

    let reloadCommand = vscode.commands.registerCommand("oirf-yaml.reload", async () => {
        vscode.window.showInformationMessage("Reloading components...");
        components = await loadComponents();
        vscode.window.showInformationMessage("Components reloaded!");
    });

    context.subscriptions.push(reloadCommand);

    // register a definition provider to navigate components
    const definitionProvider = vscode.languages.registerDefinitionProvider(
        { language: "yaml" },
        {
            provideDefinition(document, position) {
                const currentLine = document.lineAt(position.line).text.trim();
                const match = currentLine.match(/- type:\s*(\w+)/);
                if (match) {
                    const componentName = match[1];
                    const component = components.find(comp => comp.name === componentName);
                    if (component) {
                        return new vscode.Location(vscode.Uri.file(component.path), new vscode.Position(0, 0));
                    }
                }
                return null;
            }
        }
    );

    context.subscriptions.push(definitionProvider);
}

async function loadComponents(): Promise<{ name: string, path: string, description: string }[]> {
    console.log("Loading components...");
    return new Promise((resolve) => {
        setTimeout(() => {
            const config = vscode.workspace.getConfiguration("oirf-yaml");
            const loadClassesPath = config.get<string>("loadClassesPath", "./src/rooms/schema/LoadClasses.ts");
            const fullPath = path.resolve(vscode.workspace.rootPath || "", loadClassesPath);
            const directoryPath = loadClassesPath.replace(/\/[^/]+$/, '');

            if (!fs.existsSync(fullPath)) {
                vscode.window.showErrorMessage(`loadclasses.ts not found at ${fullPath}`);
                resolve([]);
                return;
            }

            const content = fs.readFileSync(fullPath, "utf8");
            const importRegex = /import (\w+) = require\("(.*\/components\/[\w\/]+)"\);/g;
            let match;
            const components: { name: string, path: string, description: string }[] = [];
            const componentPaths: string[] = [];

            while ((match = importRegex.exec(content)) !== null) {
                const cleanPath = directoryPath + match[2].replace(/^(\.)/, '');
                componentPaths.push(path.resolve(vscode.workspace.rootPath || "", `${cleanPath}.ts`));
            }

            for (const compPath of componentPaths) {
                if (fs.existsSync(compPath)) {
                    const compContent = fs.readFileSync(compPath, "utf8");
                    const registerMatch = /@Register\("(.*?)"\)/.exec(compContent);
                    const descriptionMatch = /\/\*\*([\s\S]*?)\*\//.exec(compContent); // get description

                    if (registerMatch) {
                        components.push({
                            name: registerMatch[1],
                            path: compPath,
                            description: descriptionMatch ? descriptionMatch[1].trim() : "No description available" // if dont have descrption
                        });
                    }
                }
            }

            console.log("Found components:", components);
            resolve(components);
        }, 1000); // loading time simulation
    });
}

function isInComponents(document: vscode.TextDocument, line: number): boolean {
    for (let i = line - 1; i >= 0; i--) {
        if (document.lineAt(i).text.trim() === 'components:') return true;
        if (document.lineAt(i).text.trim() === '') break;
    }
    return false;
}

// This method is called when your extension is deactivated
export function deactivate() {}
