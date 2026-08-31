# Migration recovery

Migrations are append-only. Never edit an applied SQL file.

For the initial migration, recovery before any shared data exists is to discard
the isolated Neon development branch and recreate it. Once a migration has run
on a shared preview or production database, redeploying does not undo it: use a
new forward migration, preserve data, and follow the expand → migrate → contract
sequence in `docs/DEPLOYMENT.md` §9. A destructive rollback requires an explicit
maintainer-approved recovery procedure and a verified backup or branch restore.
