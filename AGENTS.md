# Repository guidance

## Commits

Use Conventional Commits for every commit message.

## Validation

Run these commands before committing:

- `pnpm run check`
- `pnpm test`
- `pnpm run build`

## Releases

Run `pnpm run release` before pushing a release tag.

## Project structure

- `src/`: plugin source
- `tests/`: unit tests
- `scripts/`: build, deployment, and release utilities
- `.github/workflows/`: CI and release automation
