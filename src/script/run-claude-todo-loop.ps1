param(
  [int]$MaxIterations = 20,
  [string]$ClaudeCommand = "claude.cmd",
  [string]$TodoPath = "TODO.md",
  [string]$ProgressPath = "progress.md",
  [string]$PlanPath = "plan.md",
  [string]$LogDir = "artifacts/claude-todo-loop"
)

$ErrorActionPreference = "Stop"

function Get-UnfinishedTodoItems {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "TODO file not found: $Path"
  }

  $lines = Get-Content -LiteralPath $Path -Encoding utf8
  return @($lines | Where-Object { $_ -match '^\s*-\s*\[\s\]' })
}

function Invoke-ClaudeIteration {
  param(
    [int]$Iteration,
    [string]$Prompt,
    [string]$LogPath
  )

  $Prompt | & $ClaudeCommand `
    --print `
    --permission-mode acceptEdits `
    --effort high `
    --output-format text `
    --input-format text *>&1 |
    Tee-Object -FilePath $LogPath |
    Out-Host

  return $LASTEXITCODE
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$initialOpenItems = Get-UnfinishedTodoItems -Path $TodoPath
if ($initialOpenItems.Count -eq 0) {
  Write-Host "TODO.md has no unfinished checklist items. Nothing to run."
  exit 0
}

Write-Host "Initial unfinished TODO items: $($initialOpenItems.Count)"
Write-Host "Review TODO/progress/plan before each iteration, implement real fixes, and update TODO only after verification."

for ($iteration = 1; $iteration -le $MaxIterations; $iteration++) {
  $openItems = Get-UnfinishedTodoItems -Path $TodoPath
  if ($openItems.Count -eq 0) {
    Write-Host "All TODO.md checklist items are complete. Stopping before iteration $iteration."
    exit 0
  }

  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $logPath = Join-Path $LogDir ("iteration-{0:D2}-{1}.log" -f $iteration, $stamp)
  $openList = ($openItems | Select-Object -First 20) -join "`n"

  $prompt = @"
You are working in the vanilla-closedcode repository.

Before changing files, read TODO.md, progress.md, and plan.md. Continue the highest-priority unfinished TODO work. Prefer one coherent slice per iteration. Do not mark a TODO item as complete unless the implementation is real, integrated, and verified.

Hard rules:
- No fake completion, placeholder implementation, cosmetic-only workaround, or disabling tests/checks to pass.
- Preserve the build-less direction described in progress.md and plan.md.
- Keep existing user changes. Do not revert unrelated edits.
- Update progress.md with what changed and what was verified.
- Update TODO.md by checking off only items that are genuinely done. Add new unchecked TODO items for discovered defects, shortcuts, or follow-up work.
- Run the most relevant validation you can for the files you touch and record the result in progress.md.

Current unfinished TODO sample:
$openList
"@

  Write-Host "Starting Claude iteration $iteration. Open TODO items: $($openItems.Count). Log: $logPath"
  $exitCode = Invoke-ClaudeIteration -Iteration $iteration -Prompt $prompt -LogPath $logPath

  if ($exitCode -ne 0) {
    Write-Error "Claude iteration $iteration failed with exit code $exitCode. See $logPath"
    exit $exitCode
  }

  $remaining = Get-UnfinishedTodoItems -Path $TodoPath
  Write-Host "Finished Claude iteration $iteration. Remaining TODO items: $($remaining.Count)"

  if ($remaining.Count -eq 0) {
    Write-Host "All TODO.md checklist items are complete. Stopping after iteration $iteration."
    exit 0
  }
}

$stillOpen = Get-UnfinishedTodoItems -Path $TodoPath
Write-Host "Reached MaxIterations=$MaxIterations with $($stillOpen.Count) unfinished TODO items remaining."
exit 2
