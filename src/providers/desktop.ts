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
    if (process.platform !== "win32" && process.platform !== "darwin") {
      throw new Error("Desktop provider currently supports Windows and macOS only. Use ASK_USER_PROVIDER=web on this platform.");
    }

    const input = {
      header: question.header,
      message: buildQuestionMessage(question, index, total),
      labels: optionLabels(question),
      multiSelect: question.multiSelect
    };
    const result = process.platform === "win32"
      ? await runWindowsDialog(input)
      : await runMacOSDialog(input);

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

type DesktopDialogInput = {
  header: string;
  message: string;
  labels: string[];
  multiSelect: boolean;
};

type DesktopDialogResult =
  | {
      action: "accept";
      selectedLabels: string[];
      other?: string;
      notes?: string;
    }
  | {
      action: "cancel" | "decline";
    };

async function runWindowsDialog(input: DesktopDialogInput): Promise<DesktopDialogResult> {
  const output = await runPowerShell(WINDOWS_DIALOG_SCRIPT, input);
  return parseDesktopDialogOutput(output, input);
}

async function runMacOSDialog(input: DesktopDialogInput): Promise<DesktopDialogResult> {
  const output = await runProcess("osascript", ["-l", "JavaScript", "-e", MACOS_DIALOG_SCRIPT], input);
  return parseDesktopDialogOutput(output, input);
}

function parseDesktopDialogOutput(output: string, input: DesktopDialogInput): DesktopDialogResult {
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

function runPowerShell(script: string, input: DesktopDialogInput): Promise<string> {
  const encodedScript = Buffer.from(script, "utf16le").toString("base64");
  return runProcess("powershell.exe", ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodedScript], input);
}

function runProcess(command: string, args: string[], input: DesktopDialogInput): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
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

const MACOS_DIALOG_SCRIPT = String.raw`
ObjC.import("Foundation");

function readStdin() {
  var data = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile();
  return ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
}

function chooseAction(app, data) {
  try {
    var result = app.displayDialog(data.message, {
      withTitle: data.header,
      buttons: ["Cancel", "Decline", "Choose"],
      defaultButton: "Choose",
      cancelButton: "Cancel"
    });

    if (result.buttonReturned === "Decline") {
      return "decline";
    }

    return "choose";
  } catch (error) {
    if (error.errorNumber === -128) {
      return "cancel";
    }

    throw error;
  }
}

function chooseLabels(app, data) {
  try {
    var selection = app.chooseFromList(data.labels, {
      withPrompt: data.multiSelect ? "Select one or more options." : "Select one option.",
      multipleSelectionsAllowed: data.multiSelect,
      emptySelectionAllowed: false,
      okButtonName: "Answer",
      cancelButtonName: "Cancel"
    });

    if (selection === false) {
      return false;
    }

    return selection.map(function(label) {
      return String(label);
    });
  } catch (error) {
    if (error.errorNumber === -128) {
      return false;
    }

    throw error;
  }
}

function askOther(app) {
  while (true) {
    try {
      var result = app.displayDialog("Provide a custom answer for Other.", {
        withTitle: "Other",
        defaultAnswer: "",
        buttons: ["Cancel", "OK"],
        defaultButton: "OK",
        cancelButton: "Cancel"
      });
      var value = String(result.textReturned).trim();

      if (value.length > 0) {
        return value;
      }

      app.displayDialog("Other was selected, but no custom answer was provided.", {
        withTitle: "Ask User Question",
        buttons: ["OK"],
        defaultButton: "OK"
      });
    } catch (error) {
      if (error.errorNumber === -128) {
        return false;
      }

      throw error;
    }
  }
}

function askNotes(app) {
  try {
    var result = app.displayDialog("Optional notes.", {
      withTitle: "Notes",
      defaultAnswer: "",
      buttons: ["Skip", "OK"],
      defaultButton: "OK"
    });

    if (result.buttonReturned === "OK") {
      return String(result.textReturned);
    }
  } catch (error) {
    if (error.errorNumber !== -128) {
      throw error;
    }
  }

  return "";
}

function main() {
  var data = JSON.parse(readStdin());
  var app = Application.currentApplication();
  app.includeStandardAdditions = true;

  var action = chooseAction(app, data);
  if (action === "cancel" || action === "decline") {
    return { action: action };
  }

  var selectedLabels = chooseLabels(app, data);
  if (selectedLabels === false) {
    return { action: "cancel" };
  }

  var other = "";
  if (selectedLabels.indexOf("Other") !== -1) {
    other = askOther(app);
    if (other === false) {
      return { action: "cancel" };
    }
  }

  return {
    action: "accept",
    selectedLabels: selectedLabels,
    other: other,
    notes: askNotes(app)
  };
}

JSON.stringify(main());
`;

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
