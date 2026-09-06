Migration scripts
=================

scripts/migrate-encryption.js
- dry-run (default): reports which files would be re-encrypted
- apply: performs backup (.bak) and replaces files with new encrypted content

Examples:

```bash
# Dry run (safe):
ENCRYPTION_KEY=your_new_key node scripts/migrate-encryption.js

# Apply changes:
ENCRYPTION_KEY=your_new_key node scripts/migrate-encryption.js --apply
```

Notes:
- The script operates on local JSON files in the repository root by default.
- Remote (GitHub) support is not implemented in this script; use CI/server utility for remote migration.

GitHub Actions
---------------
There is a workflow `.github/workflows/migrate-encryption.yml` that can run the migration
in CI and push results to a new branch named `migration/encryption-<timestamp>`.

Required repository secrets:
- `ENCRYPTION_KEY` — new passphrase used to encrypt files
- `LEGACY_PASSPHRASES` — optional comma-separated legacy passphrases to try when decrypting

Trigger the workflow manually from the Actions tab. The workflow creates a branch with changes
so you can review before merging.
