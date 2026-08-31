# FailProducts pre-push verification gate — PowerShell entry point.
#
# Answers two questions before anything leaves the machine:
#   1. What did I actually change?
#   2. Is it safe to push?
#
#   pwsh scripts/verify-changes.ps1
#   pwsh scripts/verify-changes.ps1 -Staged
#   pwsh scripts/verify-changes.ps1 -Range "abc123..HEAD"
#
# This delegates to scripts/verify-changes.sh rather than reimplementing it.
# One implementation means one behaviour: the hook, CI, and both shells cannot
# drift apart and disagree about whether a push is safe. Git for Windows always
# ships bash, so this costs nothing.

param(
    [switch]$Staged,
    [string]$Range,
    [switch]$Quiet,
    [switch]$Ci
)

$ErrorActionPreference = 'Stop'

$repoRoot = (git rev-parse --show-toplevel 2>$null)
if (-not $repoRoot) {
    Write-Error "Not inside a git repository. Run 'git init', then scripts/setup-git-identity.ps1."
    exit 2
}

$gate = Join-Path $repoRoot 'scripts/verify-changes.sh'
if (-not (Test-Path $gate)) {
    Write-Error "scripts/verify-changes.sh is missing — cannot verify."
    exit 2
}

# Locate bash: PATH first, then the standard Git for Windows install locations.
$bash = (Get-Command bash -ErrorAction SilentlyContinue)
if ($bash) {
    $bashExe = $bash.Source
} else {
    $candidates = @(
        "$env:ProgramFiles\Git\bin\bash.exe",
        "${env:ProgramFiles(x86)}\Git\bin\bash.exe",
        "$env:LOCALAPPDATA\Programs\Git\bin\bash.exe"
    )
    $bashExe = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}

if (-not $bashExe) {
    Write-Error "bash was not found. Install Git for Windows, or run: bash scripts/verify-changes.sh"
    exit 2
}

$gateArgs = @($gate)
if ($Staged) { $gateArgs += '--staged' }
if ($Range)  { $gateArgs += @('--range', $Range) }
if ($Quiet)  { $gateArgs += '--quiet' }
if ($Ci)     { $gateArgs += '--ci' }

& $bashExe @gateArgs
exit $LASTEXITCODE
