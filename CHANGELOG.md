# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-09-08

Security-hardening release. Several defaults changed from fail-open to fail-closed; review the
**Breaking changes** section before upgrading.

### Added

- `parseFlatFieldsSpec(spec, allowedFields, base)` — flatten a field spec into allow-listed
  dot-notation paths (`user.id`, `company.branch.name`). Supports `*`, `-exclusions`
  (exclusion-only implies `*`), aliases, and array or nested-object allow-lists.
- `projectColumn(input)` — turn a raw `fields` query value into allow-listed SQL column
  fragments. Supports `alias` prefixing, `always` columns (default `['id']`), `*` and `-exclusions`.
- `projectRelation(input)` — turn a raw `relations` query value into allow-listed join paths,
  merging `always` fragments (requested wins on conflict).
- `project(input)` — runs `projectColumn` and/or `projectRelation` and merges their errors.
- Exported types: `FieldMask`, `FieldMaskValue`, `AllowedFields`, `ProjectColumnInput`,
  `ProjectRelationInput`, `ProjectInput`.
- `MAX_SPEC_DEPTH` (32) — maximum nesting accepted by every parser.
- `applyFieldMask` now accepts a spec string as `mask` (parsed with `parseFieldsSpec`), as its
  docstring always claimed.
- README: "Validating untrusted masks", "Security" and "Query injection" sections; API docs for
  every export.

### Security

- **`isValidMask` is now a real authorization gate.**
  - Wildcards are opt-in: `*` is only valid where `allowed['*'] === true`. Previously `?fields=*`
    passed validation against any allow-list and returned every field.
  - Empty nested masks (`profile()`, alias-only `profile<p>`) pass the whole sub-object through, so
    they are now treated like `*` and require `allowed.profile['*'] === true`.
  - Uses own-property checks instead of the `in` operator; prototype-chain names (`constructor`,
    `toString`, `hasOwnProperty`, …) no longer pass.
  - Allowed values must be `true` or a nested object; `false`/strings/`null` no longer count as allowed.
- **`applyMask` fails closed.** A mask string that cannot be parsed now yields `{}` (or `[{}, …]`)
  instead of returning the unmasked input.
- **Prototype-pollution hardening.** `__proto__`, `constructor` and `prototype` are dropped as
  field names and aliases by all parsers, rejected by `isValidMask`, and never read from the source
  or written to the result by `applyFieldMask`. Masks are iterated by own keys only.
- **Resource limits.** Nesting deeper than `MAX_SPEC_DEPTH` throws `RangeError` in
  `parseFieldsSpec`, `parseFlatFieldsSpec` and `parseRelationsSpec`; `applyMask`, `projectColumn`
  and `projectRelation` catch it and fail closed. Non-string input (e.g. a repeated query param
  arriving as an array) returns an empty result or an error instead of throwing.
- **Trusted-config injection guard.** Manifest keys, table aliases and relation-path segments passed
  to `projectColumn`/`projectRelation` must match `^[A-Za-z_][A-Za-z0-9_]*$`; otherwise an
  `Invalid column identifier` / `Invalid table alias` / `Invalid relation alias` /
  `Invalid relation identifier` error is returned rather than emitting the value verbatim.
- Client input echoed in error messages is truncated to 64 characters.

### Changed

- **Breaking — `isValidMask`:** see Security above (wildcard opt-in, empty-nested-mask rule,
  own-key check, strict allowed values). Sub-selecting a leaf (`id(x)` against `{ id: true }`)
  now returns `false` instead of throwing `TypeError`.
- **Breaking — `applyMask`:** fails closed on unparsable masks (see Security).
- **Breaking — `applyFieldMask`:** a `null`/`undefined`/non-object mask yields `{}` instead of
  throwing; a string mask is parsed instead of being iterated character-by-character.
- **Breaking — `parseFieldsSpec`:** return type is `FieldMask` instead of `Record<string, any>`.
  `model<m>(id` (unmatched paren after an alias) now parses to `{ model: { __alias: 'm', id: true } }`
  instead of `{ model: { __alias: 'm', '': {} } }`.
- **Breaking — `applyFieldMask` types:** `<T>(obj: T, mask: unknown): T` instead of
  `(obj: any, mask: any): any`.
- **Breaking — `parseRelationsSpec`:** a group with an empty parent (`(a)`) no longer emits a join
  with an empty alias; non-string input returns `[]` instead of throwing.
- `applyMask` accepts `null` as `maskValue` (returns data unchanged).
- `applyFieldMask` in wildcard mode no longer deletes a field that is aliased to its own name.
- `ProjectColumnInput.requested` / `ProjectRelationInput.requested` accept `undefined` explicitly
  (works with `req.query.x` under `exactOptionalPropertyTypes`).

### Tooling

- TypeScript 7 (native compiler). `tsconfig.json` now covers `src/` **and** `tests/` for
  type-checking; `tsconfig.build.json` emits the library.
- `ts-jest` replaced by `@swc/jest` (TypeScript 7 does not ship the JS compiler API ts-jest requires).
- `prepublishOnly` runs `typecheck`, `test` and `build`.

### Fixed

- README: `baseAlias` is required (was documented as defaulting to `'car'`); `applyMask` on
  malformed syntax returns `{}` (was documented as "returns data unchanged"); removed "tree-shakable"
  claim (output is CommonJS); corrected coverage figure; ORM examples now pass the required alias
  and route untrusted relation strings through `projectRelation`.

## [0.0.1] - 2025-07-22

### Added

- Initial release: `parseFieldsSpec`, `applyFieldMask`, `applyMask`, `parseRelationsSpec`,
  `isValidMask`, `RelationJoin`.

[0.1.0]: https://github.com/creativogee/masq/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/creativogee/masq/releases/tag/v0.0.1
