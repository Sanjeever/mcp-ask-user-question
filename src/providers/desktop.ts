import { spawn } from "node:child_process";
import type { AskUserProvider, AskUserQuestion, SingleQuestionResult } from "../types.js";
import {
  buildQuestionMessage,
  optionLabels,
  optionalNotes,
  resultFromSelectedLabels
} from "./shared.js";

export class DesktopProvider implements AskUserProvider {
  async ask(question: AskUserQuestion, index: number, total: number): Promise<SingleQuestionResult> {
    if (process.platform !== "win32") {
      throw new Error("Desktop provider currently supports Windows only. Use ASK_USER_PROVIDER=web on this platform.");
    }

    const result = await runWindowsDialog({
      header: question.header,
      message: buildQuestionMessage(question, index, total),
      labels: optionLabels(question),
      multiSelect: question.multiSelect
    });

    if (result.action === "accept") {
      return resultFromSelectedLabels(
        question,
        result.selectedLabels,
        result.other,
        optionalNotes(result.notes)
      );
    }

    return result;
  }
}

type WindowsDialogInput = {
  header: string;
  message: string;
  labels: string[];
  multiSelect: boolean;
};

type WindowsDialogResult =
  | {
      action: "accept";
      selectedLabels: string[];
      other?: string;
      notes?: string;
    }
  | {
      action: "cancel" | "decline";
    };

async function runWindowsDialog(input: WindowsDialogInput): Promise<WindowsDialogResult> {
  const output = await runPowerShell(WINDOWS_DIALOG_SCRIPT, input);
  const parsed = JSON.parse(output) as {
    action?: string;
    selectedLabels?: unknown;
    other?: unknown;
    notes?: unknown;
  };

  if (parsed.action === "cancel" || parsed.action === "decline") {
    return { action: parsed.action };
  }

  if (parsed.action !== "accept") {
    throw new Error("Desktop dialog returned an invalid action.");
  }

  const selectedLabels = Array.isArray(parsed.selectedLabels)
    ? parsed.selectedLabels.map((label) => String(label))
    : [String(parsed.selectedLabels)];

  if (selectedLabels.length === 0 || selectedLabels.some((label) => !input.labels.includes(label))) {
    throw new Error("Desktop dialog returned an invalid selection.");
  }

  return {
    action: "accept",
    selectedLabels,
    ...(typeof parsed.other === "string" ? { other: parsed.other } : {}),
    ...(typeof parsed.notes === "string" ? { notes: parsed.notes } : {})
  };
}

function runPowerShell(script: string, input: WindowsDialogInput): Promise<string> {
  const encodedScript = Buffer.from(script, "utf16le").toString("base64");

  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodedScript], {
      stdio: ["pipe", "pipe", "pipe"]
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      const errorText = Buffer.concat(stderr).toString("utf8").trim();
      const outputText = Buffer.concat(stdout).toString("utf8").trim();

      if (code !== 0) {
        reject(new Error(errorText || `Desktop dialog exited with code ${code}.`));
        return;
      }

      resolve(outputText);
    });

    child.stdin.end(JSON.stringify(input), "utf8");
  });
}

const WINDOWS_DIALOG_SCRIPT = String.raw`
$ErrorActionPreference = "Stop"
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$raw = [Console]::In.ReadToEnd()
$data = $raw | ConvertFrom-Json

[System.Windows.Forms.Application]::EnableVisualStyles()

$form = New-Object System.Windows.Forms.Form
$form.Text = [string]$data.header
$form.StartPosition = "CenterScreen"
$form.Size = New-Object System.Drawing.Size(640, 560)
$form.MinimumSize = New-Object System.Drawing.Size(520, 460)

$message = New-Object System.Windows.Forms.TextBox
$message.Multiline = $true
$message.ReadOnly = $true
$message.ScrollBars = "Vertical"
$message.Text = [string]$data.message
$message.SetBounds(12, 12, 600, 180)
$form.Controls.Add($message)

if ([bool]$data.multiSelect) {
  $list = New-Object System.Windows.Forms.CheckedListBox
  $list.CheckOnClick = $true
} else {
  $list = New-Object System.Windows.Forms.ListBox
}
$list.SetBounds(12, 204, 600, 110)
foreach ($label in @($data.labels)) {
  [void]$list.Items.Add([string]$label)
}
$form.Controls.Add($list)

$otherLabel = New-Object System.Windows.Forms.Label
$otherLabel.Text = "Other answer"
$otherLabel.SetBounds(12, 326, 120, 20)
$form.Controls.Add($otherLabel)

$other = New-Object System.Windows.Forms.TextBox
$other.SetBounds(12, 350, 600, 24)
$form.Controls.Add($other)

$notesLabel = New-Object System.Windows.Forms.Label
$notesLabel.Text = "Notes"
$notesLabel.SetBounds(12, 386, 120, 20)
$form.Controls.Add($notesLabel)

$notes = New-Object System.Windows.Forms.TextBox
$notes.SetBounds(12, 410, 600, 24)
$form.Controls.Add($notes)

$ok = New-Object System.Windows.Forms.Button
$ok.Text = "Answer"
$ok.SetBounds(336, 456, 86, 32)
$form.Controls.Add($ok)

$cancel = New-Object System.Windows.Forms.Button
$cancel.Text = "Cancel"
$cancel.SetBounds(432, 456, 86, 32)
$form.Controls.Add($cancel)

$decline = New-Object System.Windows.Forms.Button
$decline.Text = "Decline"
$decline.SetBounds(528, 456, 86, 32)
$form.Controls.Add($decline)

$script:action = "cancel"
$script:selectedLabels = @()

$ok.Add_Click({
  if ([bool]$data.multiSelect) {
    $selected = @($list.CheckedItems | ForEach-Object { [string]$_ })
  } else {
    $selected = @()
    if ($null -ne $list.SelectedItem) {
      $selected = @([string]$list.SelectedItem)
    }
  }

  if ($selected.Count -eq 0) {
    [void][System.Windows.Forms.MessageBox]::Show("Select at least one option.", "Ask User Question")
    return
  }

  if ($selected -contains "Other" -and [string]::IsNullOrWhiteSpace($other.Text)) {
    [void][System.Windows.Forms.MessageBox]::Show("Other was selected, but no custom answer was provided.", "Ask User Question")
    return
  }

  $script:action = "accept"
  $script:selectedLabels = $selected
  $form.Close()
})

$cancel.Add_Click({
  $script:action = "cancel"
  $form.Close()
})

$decline.Add_Click({
  $script:action = "decline"
  $form.Close()
})

[void]$form.ShowDialog()

if ($script:action -eq "accept") {
  [pscustomobject]@{
    action = "accept"
    selectedLabels = @($script:selectedLabels)
    other = [string]$other.Text
    notes = [string]$notes.Text
  } | ConvertTo-Json -Compress
} else {
  [pscustomobject]@{
    action = $script:action
  } | ConvertTo-Json -Compress
}
`;
