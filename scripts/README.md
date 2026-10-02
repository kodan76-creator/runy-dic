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

cleanup-orphan-category-ids
---------------------------
One-time cleanup of orphaned category ids in dictionaries (`dictionary.json`,
`dictionary.json2`, `public/users/<folder>/dictionary.json`).

A category id is orphaned when it looks like an id (`<digits>` or `u<digits>`)
but is absent from every live catalog (main `categories.json` + personal
`public/users/<folder>/categories.json`). Such ids render as bare digits in the
«Категории:» chips row under the header. Legacy category *names* are never
touched; the `public/users/_deleted/` archive is skipped (same convention as
`removeCategoryFromAllWords`).

```bash
# Dry run (default): report files and orphan ids, write nothing
node scripts/cleanup-orphan-category-ids.cjs

# Apply changes (files are re-encrypted in place with the same key)
node scripts/cleanup-orphan-category-ids.cjs --apply
```

The encryption key is taken from `ENCRYPTION_KEY` env or from `.env`
(`VITE_ENCRYPTION_KEY` / `VITE_ENCRYPTION_KEY_B64`). The script aborts without
writes if any catalog cannot be decrypted. Re-running after `--apply` reports
no orphans (idempotent).
