# Browser Tester

## Coding Standards

- MUST: Use TypeScript interfaces over types.
- MUST: Use arrow functions over function declarations.
- MUST: Never comment unless absolutely necessary.
  - If the code is a hack, prefix with `// HACK: reason`
- MUST: Use kebab-case for files.
- MUST: Use descriptive names for variables (avoid shorthands or 1-2 character names).
- MUST: Do not type cast (`as`) unless absolutely necessary.
- MUST: Remove unused code and don't repeat yourself.
- MUST: Put all magic numbers in `constants.ts` using `SCREAMING_SNAKE_CASE` with unit suffixes (`_MS`, `_PX`).
- MUST: Put small, focused utility functions in `utils/` with one utility per file.
- MUST: Use `Boolean` over `!!`.

## Testing

```bash
pnpm lint
pnpm format:check
```
