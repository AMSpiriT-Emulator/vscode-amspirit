import * as vscode from "vscode"
import { findLineNumberIssues } from "./line-numbers.js"

const LANGUAGE_ID = "amstrad-basic"

/**
 * Wires `findLineNumberIssues` to a `DiagnosticCollection` and refreshes it
 * for every open Amstrad BASIC document on open/change/close.
 */
export function registerBasicDiagnostics(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection(LANGUAGE_ID)
  context.subscriptions.push(collection)

  function refresh(document: vscode.TextDocument): void {
    if (document.languageId !== LANGUAGE_ID) return
    const diagnostics = findLineNumberIssues(document.getText()).map((issue) => {
      const range = new vscode.Range(
        new vscode.Position(issue.line, issue.startColumn),
        new vscode.Position(issue.line, issue.endColumn),
      )
      const d = new vscode.Diagnostic(range, issue.message, vscode.DiagnosticSeverity.Warning)
      d.source = "AMSpiriT"
      d.code = "missing-line-number"
      return d
    })
    collection.set(document.uri, diagnostics)
  }

  for (const doc of vscode.workspace.textDocuments) refresh(doc)

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument((e) => refresh(e.document)),
    vscode.workspace.onDidCloseTextDocument((doc) => collection.delete(doc.uri)),
  )
}
