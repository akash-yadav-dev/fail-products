# Configures repo-local commit identity and attribution hooks for FailProducts.
# Safe to re-run. Never touches global git config.
$ErrorActionPreference = 'Stop'

$Name  = 'Akash Yadav'
$Email = '180740493+akash-yadav-dev@users.noreply.github.com'

git rev-parse --is-inside-work-tree | Out-Null
if (-not $?) { throw "Not inside a git repository. Run 'git init' first." }

git config --local user.name  $Name
git config --local user.email $Email
git config --local core.hooksPath .githooks
git config --local push.default simple

Write-Output "Repo-local identity configured:"
Write-Output ("  user.name       " + (git config --local user.name))
Write-Output ("  user.email      " + (git config --local user.email))
Write-Output ("  core.hooksPath  " + (git config --local core.hooksPath))
Write-Output ""
Write-Output 'Commit with sign-off:  git commit -s -m "feat: ..."'
