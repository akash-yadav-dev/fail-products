#!/usr/bin/env bash
# Regression tests for scripts/verify-changes.sh.
#
# The gate is the only thing standing between a credential and a permanent public
# commit, and its guards fail silently when they break — a grep that crashes inside
# a pipeline returns nothing, which reads exactly like "clean". This suite exists so
# that failure mode is loud.
#
#   bash scripts/test-verify-changes.sh
#
# Builds a throwaway git repository in a temp directory, runs the gate against
# crafted changes, and asserts on its output. Touches nothing outside that directory.
#
# Exit codes: 0 = all passed, 1 = one or more failed.
set -uo pipefail

GATE_SRC="$(cd "$(dirname "$0")" && pwd)/verify-changes.sh"
ALLOWED_EMAIL="180740493+akash-yadav-dev@users.noreply.github.com"

[ -f "$GATE_SRC" ] || { echo "test: cannot find $GATE_SRC" >&2; exit 1; }

TMP="$(mktemp -d 2>/dev/null || mktemp -d -t fpgate)"
trap 'rm -rf "$TMP"' EXIT
cd "$TMP" || exit 1

mkdir -p scripts
cp "$GATE_SRC" scripts/verify-changes.sh
chmod +x scripts/verify-changes.sh

git init -q -b main . 2>/dev/null
git config user.name "Akash Yadav"
git config user.email "$ALLOWED_EMAIL"
git config commit.gpgsign false

# A small application tree, so the contract and radius rules have something real
# to classify. Mirrors docs/CODE-STRUCTURE.md.
mkdir -p src/domain/product src/domain/user src/lib/auth src/lib/urls src/db/schema \
         src/components/ui "src/app/products/[slug]" src/app/api/products \
         drizzle/migrations docs tests
cat > src/domain/product/slug.ts <<'EOF'
export function generateSlug(name: string): string { return name.toLowerCase(); }
EOF
echo 'export function isSafeUrl(u: string) { return u.startsWith("https://"); }' > src/lib/urls/external.ts
echo 'export const products = {};'        > src/db/schema/products.ts
echo 'export function Button() {}'        > src/components/ui/button.tsx
echo 'export default function Page() {}'  > "src/app/products/[slug]/page.tsx"
echo 'export async function GET() {}'     > src/app/api/products/route.ts
echo 'import { generateSlug } from "@/domain/product/slug";' > tests/slug.test.ts
echo '# Docs'                             > docs/README.md
echo 'DATABASE_URL='                      > .env.example
mkdir -p public
touch drizzle/migrations/.gitkeep src/lib/auth/.gitkeep src/domain/user/.gitkeep public/.gitkeep

git add -A >/dev/null 2>&1
git commit -q -s -m "chore: baseline" --no-verify >/dev/null 2>&1
git branch -f baseline

PASS=0; FAIL=0

# on <label> <change-script> <expected substring> [expected exit code]
on() {
  local label="$1" change="$2" expect="$3" want_code="${4:-}"
  git checkout -q -B work baseline 2>/dev/null
  git clean -qfd 2>/dev/null
  ( eval "$change" ) >/dev/null 2>&1
  git add -A >/dev/null 2>&1
  git commit -q -s -m "test: $label" --no-verify >/dev/null 2>&1

  local out code
  out="$(bash scripts/verify-changes.sh --range baseline..HEAD 2>&1)"; code=$?

  local ok=1
  printf '%s' "$out" | grep -qF "$expect" || ok=0
  [ -n "$want_code" ] && [ "$code" != "$want_code" ] && ok=0

  if [ "$ok" -eq 1 ]; then
    printf '  PASS  %s\n' "$label"; PASS=$((PASS+1))
  else
    printf '  FAIL  %s\n' "$label"
    printf '        expected: %s%s\n' "$expect" "${want_code:+ (exit $want_code, got $code)}"
    printf '%s\n' "$out" | sed 's/^/        | /' | head -25
    FAIL=$((FAIL+1))
  fi
}

echo "IMPACT RADIUS"
on "docs only -> LOCAL"                 'echo x >> docs/README.md'                      "Impact radius: LOCAL"
on "one domain -> FEATURE"              'echo "//x" >> src/domain/product/slug.ts'      "Impact radius: FEATURE"
on "src/lib -> CROSS-FEATURE"           'echo "//x" >> src/lib/urls/external.ts'        "Impact radius: CROSS-FEATURE"
on "shared ui -> CROSS-FEATURE"         'echo "//x" >> src/components/ui/button.tsx'    "Impact radius: CROSS-FEATURE"
on "two domains -> CROSS-FEATURE"       'echo "//x" >> src/domain/product/slug.ts; mkdir -p src/domain/user; echo "export const a=1;" > src/domain/user/p.ts' "Impact radius: CROSS-FEATURE"
on "src/db -> SYSTEM"                   'echo "//x" >> src/db/schema/products.ts'       "Impact radius: SYSTEM"
on "package.json -> SYSTEM"             'echo "{}" > package.json'                      "Impact radius: SYSTEM"
on "gate itself -> SYSTEM"              'echo "#x" >> scripts/verify-changes.sh'        "Impact radius: SYSTEM"
on "migration -> PRODUCTION-CRITICAL"   'mkdir -p drizzle/migrations; echo "ALTER TABLE p ADD COLUMN x text;" > drizzle/migrations/0001_x.sql' "Impact radius: PRODUCTION-CRITICAL"
on "auth -> PRODUCTION-CRITICAL"        'mkdir -p src/lib/auth; echo "export const s=1;" > src/lib/auth/session.ts' "Impact radius: PRODUCTION-CRITICAL"
on "wrangler -> PRODUCTION-CRITICAL"    'echo "name = \"fp\"" > wrangler.toml'          "Impact radius: PRODUCTION-CRITICAL"

echo
echo "CONTRACT DETECTION"
on "removed export found"               'echo "export function makeSlug(n: string) { return n; }" > src/domain/product/slug.ts' "exported symbol 'generateSlug' removed"
on "public route change found"          'mkdir -p src/app/products/new && echo "export default function P(){}" > src/app/products/new/page.tsx' "public route(s) changed"
on "env contract change found"          'printf "DATABASE_URL=\nAUTH_SECRET=\n" > .env.example' "environment variable contract changed"
on "api contract change found"          'echo "//x" >> src/app/api/products/route.ts'   "API route(s) changed"
on "db contract change found"           'mkdir -p drizzle/migrations; echo "ALTER TABLE p ADD COLUMN y text;" > drizzle/migrations/0002_y.sql' "database contract changed"

echo
echo "SAFETY GUARDS"
on "credential blocked"                 'echo "const d=\"postgresql://u:p@h/db\";" > src/lib/leak.ts' "credential pattern in added lines" 1
on "api key blocked"                    'echo "const k=\"sk_live_abcdefghijklmnopqr\";" > src/lib/k.ts' "credential pattern in added lines" 1
on "private key blocked"                'printf -- "-----BEGIN RSA PRIVATE KEY-----\n" > src/lib/key.pem' "credential pattern in added lines" 1
on "foreign email blocked"              'echo "contact someone@corp.example.net" > docs/contact.md' "non-allowlisted email address" 1
on ".env file blocked"                  'echo "SECRET=1" > .env'                        "environment file(s) in the change" 1
on ".env.example values blocked"        'echo "DATABASE_URL=postgres://real" > .env.example' ".env.example contains values" 1
on "large file warned"                  'mkdir -p public; head -c 600000 /dev/urandom > public/big.bin 2>/dev/null || head -c 600000 /dev/zero > public/big.bin' "git history is permanent"

echo
echo "CHANGE GATES"
on "config change warned"               'echo "compatibility_flags = [\"nodejs_compat\"]" > wrangler.toml' "configuration changed"
on "nodejs_compat flagged"              'echo "compatibility_flags = [\"nodejs_compat\"]" > wrangler.toml' "Node compatibility flag touched"
on "schema without migration warned"    'echo "//col" >> src/db/schema/products.ts'     "schema changed but no migration added"
on "dependency change warned"           'echo "{\"name\":\"fp\"}" > package.json'       "run the dependency-gate skill"
on "src without docs warned"            'echo "//x" >> src/domain/product/slug.ts'      "source changed with no documentation change"

echo
echo "ROUTING AND VERDICT"
on "db change routes security review"   'echo "//col" >> src/db/schema/products.ts'     "security-reviewer"
on "docs change routes no reviewer"     'echo x >> docs/README.md'                      "No reviewer required"
on "contract change routes analyzer"    'echo "export function makeSlug(n: string){return n;}" > src/domain/product/slug.ts' "impact-analyzer"
on "clean change reports PASS"          'echo x >> docs/README.md'                      "PASS" 0
on "warned change reports warnings"     'echo "//x" >> src/domain/product/slug.ts'      "PASS_WITH_WARNINGS" 0
on "unsafe change reports BLOCK"        'echo "const k=\"sk_live_abcdefghijklmnopqr\";" > src/lib/k.ts' "BLOCK" 1
on "gate states its own limits"         'echo x >> docs/README.md'                      "does not prove it is correct"

echo
echo "IMMUTABLE MIGRATIONS"
git checkout -q -B mig baseline 2>/dev/null; git clean -qfd 2>/dev/null
mkdir -p drizzle/migrations
echo 'ALTER TABLE p ADD COLUMN x text;' > drizzle/migrations/0001_x.sql
git add -A >/dev/null 2>&1; git commit -q -s -m "feat: migration" --no-verify >/dev/null 2>&1
git branch -f migbase
echo 'DROP COLUMN x;' >> drizzle/migrations/0001_x.sql
git commit -qas -m "test: edit applied migration" --no-verify >/dev/null 2>&1
out="$(bash scripts/verify-changes.sh --range migbase..HEAD 2>&1)"; code=$?
if printf '%s' "$out" | grep -qF "existing migration file(s) modified" && [ "$code" -eq 1 ]; then
  echo "  PASS  modified applied migration is blocked"; PASS=$((PASS+1))
else
  echo "  FAIL  modified applied migration not blocked (exit $code)"; FAIL=$((FAIL+1))
fi

echo
echo "BRANCH PROTECTION"
git checkout -q main 2>/dev/null; git clean -qfd 2>/dev/null
echo x >> docs/README.md
out="$(bash scripts/verify-changes.sh 2>&1)"; code=$?
if printf '%s' "$out" | grep -qF "main is protected" && [ "$code" -eq 1 ]; then
  echo "  PASS  working on main is blocked"; PASS=$((PASS+1))
else
  echo "  FAIL  working on main not blocked (exit $code)"; FAIL=$((FAIL+1))
fi

echo
echo "======================================"
printf '  PASS: %d   FAIL: %d\n' "$PASS" "$FAIL"
echo "======================================"
[ "$FAIL" -eq 0 ]
