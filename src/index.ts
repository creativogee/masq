/**
 * masq: Flexible field masking and relation selection for REST, GraphQL, and data APIs.
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A parsed field mask node: `true` include, `false` exclude, nested mask, or `__alias` string. */
export type FieldMaskValue = boolean | string | FieldMask;

/** A parsed field mask as produced by {@link parseFieldsSpec}. */
export interface FieldMask {
  [key: string]: FieldMaskValue;
}

/** Allow-list structure accepted by {@link isValidMask} and {@link parseFlatFieldsSpec}. */
export interface AllowedFields {
  [key: string]: true | AllowedFields | unknown;
}

type Dict = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Internal hardening helpers
// ---------------------------------------------------------------------------

/**
 * Maximum nesting depth accepted by the spec parsers (`a(b(c(...)))`).
 * Deeper input throws a `RangeError` instead of exhausting the call stack.
 */
export const MAX_SPEC_DEPTH = 32;

/** Keys that must never be read from or written to a mask/result object. */
const DANGEROUS_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

const ALIAS_KEY = '__alias';
const WILDCARD = '*';

function isDangerousKey(key: string): boolean {
  return DANGEROUS_KEYS.has(key);
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNonBlankString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Dict {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertDepth(depth: number, what: string): void {
  if (depth > MAX_SPEC_DEPTH) {
    throw new RangeError(`masq: ${what} nesting exceeds maximum depth of ${MAX_SPEC_DEPTH}`);
  }
}

/** Split on top-level commas only (commas inside parentheses are preserved). */
function splitTopLevel(spec: string): string[] {
  const fields: string[] = [];
  let current = '';
  let depth = 0;
  for (const char of spec) {
    if (char === ',' && depth === 0) {
      if (current.trim()) fields.push(current.trim());
      current = '';
      continue;
    }
    if (char === '(') depth++;
    else if (char === ')') depth--;
    current += char;
  }
  if (current.trim()) fields.push(current.trim());
  return fields;
}

/**
 * Extract the inner content of a parenthesised tail such as `(a,b)`.
 * Tolerates a missing closing parenthesis (`(a,b` → `a,b`).
 */
function innerOfParens(rest: string): string {
  const close = rest.lastIndexOf(')');
  return close > 0 ? rest.substring(1, close) : rest.substring(1);
}

const ALIAS_RE = /^(\w+)<(\w+)>(.*)$/;

/** A single comma-separated field entry, e.g. `-secret`, `model<m>(id)`, `branch(id,name)`. */
interface FieldToken {
  name: string;
  alias?: string;
  exclude: boolean;
  /** Inner spec of a parenthesised group; `undefined` when no group is present. */
  nested?: string | undefined;
}

function tokenizeField(field: string): FieldToken {
  const aliasMatch = ALIAS_RE.exec(field);
  if (aliasMatch) {
    const [, name = '', alias = '', rest = ''] = aliasMatch;
    return {
      name,
      alias,
      exclude: false,
      nested: rest.startsWith('(') ? innerOfParens(rest) : undefined,
    };
  }
  const openParen = field.indexOf('(');
  if (openParen !== -1) {
    return {
      name: field.substring(0, openParen),
      exclude: false,
      nested: innerOfParens(field.substring(openParen)),
    };
  }
  if (field.startsWith('-')) {
    return { name: field.substring(1), exclude: true };
  }
  return { name: field, exclude: false };
}

function isSafeToken(token: FieldToken): boolean {
  if (isDangerousKey(token.name)) return false;
  return token.alias === undefined || !isDangerousKey(token.alias);
}

// ---------------------------------------------------------------------------
// parseFieldsSpec
// ---------------------------------------------------------------------------

/**
 * Parse a field mask string into an object structure, supporting aliasing with <alias>.
 * Examples:
 *   id,name => { id: true, name: true }
 *   model<models>(make<makes>) => { model: { __alias: 'models', make: { __alias: 'makes' } } }
 *   * => { '*': true }
 *   id,name,branch(*) => { id: true, name: true, branch: { '*': true } }
 *   *,-password => { '*': true, password: false }
 *   id,name,-secret,branch(id,name,-internal) => { id: true, name: true, secret: false, branch: { id: true, name: true, internal: false } }
 *
 * Security:
 * - Non-string input yields `{}`.
 * - `__proto__`, `constructor` and `prototype` are silently dropped as field names and aliases.
 * - Nesting deeper than {@link MAX_SPEC_DEPTH} throws a `RangeError`.
 */
export function parseFieldsSpec(fieldsSpec: string): FieldMask {
  return parseFieldsSpecAt(fieldsSpec, 0);
}

function parseFieldsSpecAt(fieldsSpec: unknown, depth: number): FieldMask {
  const result: FieldMask = {};
  if (!isString(fieldsSpec)) return result;
  assertDepth(depth, 'field spec');
  if (fieldsSpec.trim() === WILDCARD) return { [WILDCARD]: true };

  for (const field of splitTopLevel(fieldsSpec)) {
    const token = tokenizeField(field);
    if (isSafeToken(token)) result[token.name] = maskValueFor(token, depth);
  }
  return result;
}

function maskValueFor(token: FieldToken, depth: number): FieldMaskValue {
  if (token.exclude) return false;
  if (token.nested === undefined) {
    return token.alias === undefined ? true : { [ALIAS_KEY]: token.alias };
  }
  const nested = parseFieldsSpecAt(token.nested, depth + 1);
  return token.alias === undefined ? nested : { [ALIAS_KEY]: token.alias, ...nested };
}

/** Parse a spec, returning `undefined` instead of throwing on malformed/too-deep input. */
function tryParseFieldsSpec(fieldsSpec: string): FieldMask | undefined {
  try {
    return parseFieldsSpec(fieldsSpec);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// parseFlatFieldsSpec
// ---------------------------------------------------------------------------

/**
 * Flattens a field specification string into an array of dot-notation field paths.
 * This function takes a field specification similar to parseFieldsSpec but outputs flattened paths
 * instead of a tree structure, validated against `allowedFields`.
 *
 * Fields (top-level or nested) that are not present in `allowedFields` are dropped.
 * Sub-selection of a leaf (`allowedFields.x === true`) is dropped.
 *
 * @param fieldsSpec - The field specification string to parse (e.g., "id,name,branch(id,name)")
 * @param allowedFields - Allowed fields structure (nested object of `true` leaves) or a flat array of names
 * @param base - Base prefix to prepend to all field paths (e.g., "user" results in "user.id", "user.name")
 * @returns Array of unique dot-notation field paths
 * @throws RangeError when nesting exceeds {@link MAX_SPEC_DEPTH}
 *
 * @example
 * parseFlatFieldsSpec("id,name", { id: true, name: true }, "user")
 * // Returns: ["user.id", "user.name"]
 *
 * @example
 * parseFlatFieldsSpec("branch(id,name)", { branch: { id: true, name: true } }, "company")
 * // Returns: ["company.branch.id", "company.branch.name"]
 *
 * @example
 * parseFlatFieldsSpec("*,-password", { id: true, name: true, password: true }, "user")
 * // Returns: ["user.id", "user.name"]
 *
 * @example
 * parseFlatFieldsSpec("model<models>(make<makes>(id))", { model: { make: { id: true } } }, "car")
 * // Returns: ["car.model.make.id"]
 */
export function parseFlatFieldsSpec(
  fieldsSpec: string,
  allowedFields: AllowedFields | readonly string[],
  base: string,
): string[] {
  return parseFlatFieldsSpecAt(fieldsSpec, allowedFields, base, 0);
}

/** Is `name` an allowed field in `allowed` (object map or array of names)? */
function isAllowedField(allowed: unknown, name: string): boolean {
  if (isDangerousKey(name)) return false;
  if (Array.isArray(allowed)) return allowed.includes(name);
  if (!isPlainObject(allowed) || !hasOwn(allowed, name)) return false;
  const value = allowed[name];
  return value === true || isPlainObject(value);
}

/** Nested allow-list for `name`, or `undefined` when `name` is not an allowed object field. */
function nestedAllowed(allowed: unknown, name: string): Dict | undefined {
  if (!isAllowedField(allowed, name) || !isPlainObject(allowed)) return undefined;
  const value = allowed[name];
  return isPlainObject(value) ? value : undefined;
}

function allowedFieldPaths(allowed: unknown, base: string): string[] {
  if (Array.isArray(allowed)) {
    return allowed.filter(isString).map((f) => `${base}.${f}`);
  }
  if (!isPlainObject(allowed)) return [];
  return Object.keys(allowed)
    .filter((key) => isAllowedField(allowed, key))
    .map((key) => `${base}.${key}`);
}

function flatPathsFor(token: FieldToken, allowed: unknown, base: string, depth: number): string[] {
  if (!isAllowedField(allowed, token.name)) return [];
  const path = `${base}.${token.name}`;
  if (token.nested === undefined) return [path];
  const sub = nestedAllowed(allowed, token.name);
  if (!sub || !token.nested.trim()) return [];
  return parseFlatFieldsSpecAt(token.nested, sub, path, depth + 1);
}

function parseFlatFieldsSpecAt(
  fieldsSpec: unknown,
  allowedFields: unknown,
  base: string,
  depth: number,
): string[] {
  if (!isNonBlankString(fieldsSpec)) return [];
  assertDepth(depth, 'field spec');

  const tokens = splitTopLevel(fieldsSpec).map(tokenizeField);
  const excluded = new Set(tokens.filter((t) => t.exclude).map((t) => `${base}.${t.name}`));
  const selected = tokens.filter((t) => !t.exclude && t.name !== WILDCARD);
  const wildcard = selected.length === 0 || tokens.some((t) => t.name === WILDCARD);

  // Wildcard (explicit or implied by an exclusion-only spec) expands to every allowed field.
  const allowedPaths = allowedFieldPaths(allowedFields, base);
  if (wildcard && allowedPaths.length > 0) {
    return allowedPaths.filter((p) => !excluded.has(p));
  }

  const paths = selected.flatMap((t) => flatPathsFor(t, allowedFields, base, depth));
  return Array.from(new Set(paths.filter((p) => !excluded.has(p))));
}

// ---------------------------------------------------------------------------
// applyFieldMask / applyMask
// ---------------------------------------------------------------------------

/** Resolve the alias for a nested mask node, ignoring unsafe or non-string aliases. */
function aliasOf(node: Dict): string | undefined {
  const alias = node[ALIAS_KEY];
  if (!isNonBlankString(alias) || isDangerousKey(alias)) return undefined;
  return alias;
}

function maskNode(value: unknown, node: Dict): unknown {
  const subKeys = Object.keys(node).filter((k) => k !== ALIAS_KEY);
  if (subKeys.length === 0) return value; // empty nested mask = pass value through
  return applyFieldMask(value, node);
}

function resolveMask(mask: unknown): Dict {
  if (isString(mask)) return parseFieldsSpec(mask);
  return isPlainObject(mask) ? mask : {};
}

function applyWildcardMask(obj: Dict, mask: Dict): Dict {
  const result: Dict = { ...obj };
  for (const key of Object.keys(mask)) {
    if (key === WILDCARD || isDangerousKey(key)) continue;
    const node = mask[key];
    if (node === false) {
      delete result[key];
      continue;
    }
    if (!isPlainObject(node) || !hasOwn(obj, key)) continue;
    const alias = aliasOf(node);
    if (alias !== undefined && alias !== key) delete result[key];
    result[alias ?? key] = maskNode(obj[key], node);
  }
  return result;
}

function applyWhitelistMask(obj: Dict, mask: Dict): Dict {
  const result: Dict = {};
  for (const key of Object.keys(mask)) {
    if (isDangerousKey(key) || !hasOwn(obj, key)) continue;
    const node = mask[key];
    if (node === true) {
      result[key] = obj[key];
    } else if (isPlainObject(node)) {
      result[aliasOf(node) ?? key] = maskNode(obj[key], node);
    }
  }
  return result;
}

/**
 * Apply a field mask to an object or array, supporting aliasing with __alias.
 * If mask is a string, it is parsed first.
 *
 * Security:
 * - Only own, enumerable keys of the mask are honoured (inherited keys are ignored).
 * - `__proto__`, `constructor` and `prototype` are never read from the source or written to the result,
 *   whether they appear as mask keys or as aliases.
 * - A non-object mask (after optional parsing) yields an empty result rather than the unmasked input.
 *
 * @param obj - The object or array to filter
 * @param mask - The field mask (object structure or string)
 * @returns Filtered object/array with possible key renaming. Typed as `T` for convenience;
 *          the runtime shape is a subset of `T` with aliased keys renamed.
 */
export function applyFieldMask<T = unknown>(obj: T, mask: unknown): T {
  if (!obj || typeof obj !== 'object') return obj;
  const resolved = resolveMask(mask);
  if (Array.isArray(obj)) {
    return obj.map((item: unknown) => applyFieldMask(item, resolved)) as unknown as T;
  }
  const source = obj as Dict;
  const masked =
    resolved[WILDCARD] === true
      ? applyWildcardMask(source, resolved)
      : applyWhitelistMask(source, resolved);
  return masked as T;
}

/**
 * Apply a field mask to an object or array, parsing the mask if needed.
 *
 * Fails **closed**: if the mask string cannot be parsed (e.g. nesting deeper than
 * {@link MAX_SPEC_DEPTH}) an empty mask is applied and no fields are returned,
 * rather than returning the unmasked input.
 */
export function applyMask<T = unknown>(data: T, maskValue?: string | object | null): T {
  if (!maskValue) return data;
  const mask = isString(maskValue) ? (tryParseFieldsSpec(maskValue) ?? {}) : maskValue;
  return applyFieldMask(data, mask);
}

// ---------------------------------------------------------------------------
// parseRelationsSpec
// ---------------------------------------------------------------------------

/**
 * Relation join descriptor for dynamic joins.
 */
export interface RelationJoin {
  path: string; // e.g. 'car.model', 'model.make'
  alias: string; // e.g. 'model', 'make'
}

/**
 * Parse a relation string like model(make),bodyType,category into join descriptors.
 * Returns an array of { path, alias } objects for use in dynamic joins.
 *
 * The output is **not** validated against an allow-list; use {@link projectRelation}
 * before handing paths/aliases to a query builder.
 *
 * @throws RangeError when nesting exceeds {@link MAX_SPEC_DEPTH}
 */
export function parseRelationsSpec(
  relationsStr: string | undefined,
  baseAlias: string,
): RelationJoin[] {
  if (!isNonBlankString(relationsStr)) return [];
  return new RelationsParser(relationsStr, baseAlias).parse();
}

class RelationsParser {
  private index = 0;

  constructor(
    private readonly input: string,
    private readonly baseAlias: string,
  ) {}

  parse(): RelationJoin[] {
    return this.parseLevel('', 0);
  }

  private join(parentPath: string, field: string): RelationJoin {
    const prefix = parentPath || this.baseAlias;
    return { path: `${prefix}.${field}`, alias: field };
  }

  private parseLevel(parentPath: string, depth: number): RelationJoin[] {
    assertDepth(depth, 'relation spec');
    const joins: RelationJoin[] = [];
    let buffer = '';

    const flush = (): string => {
      const field = buffer.trim();
      buffer = '';
      if (field) joins.push(this.join(parentPath, field));
      return field;
    };

    while (this.index < this.input.length) {
      const char = this.input[this.index];
      this.index++;
      if (char === '(') {
        const parent = flush();
        joins.push(...this.parseLevel(parent, depth + 1));
      } else if (char === ')') {
        flush();
        return joins;
      } else if (char === ',') {
        flush();
      } else {
        buffer += char;
      }
    }
    flush();
    return joins;
  }
}

// ---------------------------------------------------------------------------
// isValidMask
// ---------------------------------------------------------------------------

function isWildcardAllowed(allowed: Dict): boolean {
  return hasOwn(allowed, WILDCARD) && allowed[WILDCARD] === true;
}

function isValidNestedMask(maskValue: Dict, allowedValue: true | Dict): boolean {
  const subKeys = Object.keys(maskValue).filter((k) => k !== ALIAS_KEY);
  // Leaf field: only an alias-only mask (`id<identifier>`) is meaningful.
  if (allowedValue === true) return subKeys.length === 0;
  // Empty nested mask passes the entire sub-object through: equivalent to '*'.
  if (subKeys.length === 0) return isWildcardAllowed(allowedValue);
  return isValidMask(maskValue, allowedValue);
}

function isValidMaskEntry(key: string, maskValue: unknown, allowed: Dict): boolean {
  if (key === WILDCARD) return isWildcardAllowed(allowed);
  if (isDangerousKey(key) || !hasOwn(allowed, key)) return false;
  const allowedValue = allowed[key];
  if (allowedValue !== true && !isPlainObject(allowedValue)) return false;
  if (typeof maskValue === 'boolean') return true;
  if (!isPlainObject(maskValue)) return false;
  return isValidNestedMask(maskValue, allowedValue);
}

/**
 * Validate a mask object against an allowed-fields structure.
 *
 * Rules:
 * - Every mask key must be an **own** property of `allowed` whose value is `true` (leaf)
 *   or a nested allow-list object. Inherited keys (`constructor`, `toString`, ...) never match.
 * - `*` is only accepted when `allowed['*'] === true` at that level.
 * - An empty nested mask (`profile()` / alias-only `profile<p>`) passes the whole sub-object
 *   through, so against a nested allow-list it is treated like `*` and requires `allowed.profile['*'] === true`.
 *   Against a leaf (`allowed.id === true`) an alias-only mask (`id<identifier>`) is valid.
 * - Sub-selecting a leaf (`id(x)`) is invalid.
 * - `__proto__`, `constructor` and `prototype` are always invalid.
 */
export function isValidMask(maskObj: unknown, allowed: unknown): boolean {
  if (!isPlainObject(maskObj) || !isPlainObject(allowed)) return false;
  return Object.keys(maskObj).every(
    (key) => key === ALIAS_KEY || isValidMaskEntry(key, maskObj[key], allowed),
  );
}

// ---------------------------------------------------------------------------
// Repository-style projection helpers
// ---------------------------------------------------------------------------

type ToSqlOptions = {
  /**
   * Keys always included after validation (default `['id']`).
   * Set to `[]` to disable.
   */
  always?: readonly string[] | undefined;
  /**
   * When set, each column becomes `${alias}.${defaultSqlFragment(key)}`.
   */
  tableAlias?: string | undefined;
};

type SqlOk = { ok: true; columns: string[] };
type SqlErr = { ok: false; error?: string };

const DEFAULT_ALWAYS: readonly string[] = ['id'];

/**
 * Identifiers that may be interpolated into SQL/ORM fragments: manifest keys, table
 * aliases and relation path segments. Anything else is rejected so that a manifest or
 * alias accidentally built from request data cannot inject into a query.
 */
const SQL_IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isSqlIdentifier(value: unknown): value is string {
  return isString(value) && SQL_IDENTIFIER_RE.test(value) && !isDangerousKey(value);
}

/** Truncate untrusted text before echoing it in an error message. */
function describeInput(value: string, max = 64): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/** Default SQL identifier for an API field when the manifest uses `true`. */
function defaultSqlFragment(field: string): string {
  return /[A-Z]/.test(field) ? `"${field}"` : field;
}

type ColumnMap = { ok: true; columns: Map<string, string> } | SqlErr;

/** Map every allowed API key to its SQL column fragment, rejecting unsafe identifiers. */
function buildColumnMap(spec: Record<string, true>, tableAlias: string | undefined): ColumnMap {
  if (tableAlias !== undefined && !isSqlIdentifier(tableAlias)) {
    return { ok: false, error: `Invalid table alias: ${describeInput(tableAlias)}` };
  }
  const columns = new Map<string, string>();
  for (const key of Object.keys(spec)) {
    if (spec[key] !== true) continue;
    if (!isSqlIdentifier(key)) {
      return { ok: false, error: `Invalid column identifier: ${describeInput(key)}` };
    }
    const col = defaultSqlFragment(key);
    columns.set(key, tableAlias ? `${tableAlias}.${col}` : col);
  }
  return { ok: true, columns };
}

/** Resolve which allowed keys a validated mask selects (handles `*`, `-x` and `always`). */
function selectRequestedKeys(
  parsed: FieldMask,
  allKeys: readonly string[],
  always: readonly string[],
): string[] {
  const excluded = new Set<string>();
  const included: string[] = [];
  for (const key of Object.keys(parsed)) {
    if (key === WILDCARD) continue;
    if (parsed[key] === false) excluded.add(key);
    else included.push(key);
  }
  const wildcard = parsed[WILDCARD] === true || included.length === 0;
  const requested = new Set(wildcard ? allKeys.filter((k) => !excluded.has(k)) : included);
  for (const key of always) {
    if (key) requested.add(key);
  }
  return Array.from(requested);
}

/**
 * Turn a `fields` query param into SQL column fragments. Uses **top-level** keys from the parsed mask only.
 *
 * - Empty/undefined `fields` → all columns.
 * - `*` or an exclusion-only spec (`-secret`) → all columns minus exclusions.
 * - Any key not in `spec`, sub-selection of a column, unparsable or non-string input → `{ ok: false }`.
 * - Only user-requested keys that exist in `spec` ever become SQL fragments.
 */
function toSql(
  fields: string | null | undefined,
  spec: Record<string, true>,
  options?: ToSqlOptions,
): SqlOk | SqlErr {
  const built = buildColumnMap(spec, options?.tableAlias);
  if (!built.ok) return built;
  const { columns } = built;
  const all = Array.from(columns.values());

  const text: unknown = fields ?? '';
  if (!isString(text)) return { ok: false };
  if (!text.trim()) return { ok: true, columns: all };

  const parsed = tryParseFieldsSpec(text);
  if (!parsed || Object.keys(parsed).length === 0) return { ok: false };

  const allow: Dict = { [WILDCARD]: true };
  for (const key of columns.keys()) allow[key] = true;
  if (!isValidMask(parsed, allow)) return { ok: false };

  const keys = selectRequestedKeys(parsed, Array.from(columns.keys()), options?.always ?? DEFAULT_ALWAYS);
  const selected = keys.map((k) => columns.get(k)).filter(isString);
  return selected.length ? { ok: true, columns: selected } : { ok: false };
}

type ManifestPaths = { root: string; paths: string[]; error?: string };

/** Build join path allow-list from allowed-relation keys (see {@link projectRelation}). */
function relationPathsFromManifest(allowed: Record<string, true>, alias: unknown): ManifestPaths {
  const root = isString(alias) ? alias.trim() : '';
  if (!root) {
    return { root: '', paths: [], error: 'Relation alias is required' };
  }
  if (!isSqlIdentifier(root)) {
    return { root: '', paths: [], error: `Invalid relation alias: ${describeInput(root)}` };
  }
  const paths: string[] = [];
  for (const [key, val] of Object.entries(allowed)) {
    if (val !== true) continue;
    const suffix = key.trim();
    if (!suffix) {
      return { root: '', paths: [], error: 'Relation allow-list has an empty key' };
    }
    if (!suffix.split('.').every(isSqlIdentifier)) {
      return { root: '', paths: [], error: `Invalid relation identifier: ${describeInput(suffix)}` };
    }
    // Matches {@link parseRelationsSpec} paths: top-level under alias is
    // `alias.segment`; nested edges use `parent.child` (e.g. `model.make`).
    paths.push(suffix.includes('.') ? suffix : `${root}.${suffix}`);
  }
  return paths.length === 0 ? { root: '', paths: [] } : { root, paths };
}

export type ProjectColumnInput = {
  /** Raw `fields` query value. Non-string input (e.g. a repeated query param) is rejected. */
  requested?: string | null | undefined;
  /** Allowed API field names; each maps to a column fragment (`"quoted"` when it contains uppercase letters). */
  allowed: Record<string, true>;
  /** When set, prefixes each column (`alias.column`). */
  alias?: string | undefined;
  /** Keys always included after validation (default `['id']`). Set to `[]` to disable. */
  always?: readonly string[] | undefined;
};

/**
 * Validate `requested` fields string against an allowed field map.
 * @returns `selects` as a Set of SQL fragments; on failure `errors` is non-empty and `selects` is empty.
 */
export function projectColumn(input: ProjectColumnInput): {
  errors: string[];
  selects: Set<string>;
} {
  const r = toSql(input.requested, input.allowed, {
    tableAlias: input.alias,
    always: input.always,
  });
  if (!r.ok) {
    return { errors: [r.error ?? 'Invalid or empty columns'], selects: new Set() };
  }
  return { errors: [], selects: new Set(r.columns) };
}

export type ProjectRelationInput = {
  /** Raw `relations` query value. Non-string input (e.g. a repeated query param) is rejected. */
  requested?: string | null | undefined;
  /**
   * Relation root for {@link parseRelationsSpec} (e.g. `a`). Keys in {@link ProjectRelationInput.allowed}
   * are suffixed after this (`car` → `a.car`).
   */
  alias: string;
  /**
   * Relation fragments always merged after `requested`, deduped by path (`requested` wins on conflict).
   * Same segment syntax as the relations query string (e.g. `car`, `model(make)`).
   */
  always?: readonly string[] | undefined;
  /**
   * Allowed join paths: each key is either one segment under `alias` (e.g. `car` → `a.car`)
   * or a dotted path exactly as {@link parseRelationsSpec} emits for nested steps (e.g. `model.make`).
   */
  allowed: Record<string, true>;
};

const INVALID_RELATIONS = 'Invalid relations specification';

/** Parse `requested` then `always` fragments into a path-keyed map; `undefined` on bad input. */
function collectRequestedJoins(
  requested: unknown,
  always: readonly string[] | undefined,
  root: string,
): Map<string, RelationJoin> | undefined {
  if (!isString(requested)) return undefined;
  const fragments = [requested, ...(always ?? [])].filter(isNonBlankString);
  const byPath = new Map<string, RelationJoin>();
  try {
    for (const fragment of fragments) {
      for (const join of parseRelationsSpec(fragment, root)) {
        if (!byPath.has(join.path)) byPath.set(join.path, join);
      }
    }
  } catch {
    return undefined;
  }
  return byPath;
}

/**
 * Validate merged `requested` + `always` relations against an allowed relation map.
 * @returns `joins` as join path strings from {@link parseRelationsSpec}; on failure `errors` lists bad paths and `joins` is empty.
 */
export function projectRelation(input: ProjectRelationInput): {
  errors: string[];
  joins: Set<string>;
} {
  const resolved = relationPathsFromManifest(input.allowed, input.alias);
  if (resolved.error !== undefined) {
    return { errors: [resolved.error], joins: new Set() };
  }
  const { root, paths } = resolved;
  if (!root) {
    return { errors: ['Relation allow-list must be non-empty'], joins: new Set() };
  }

  const byPath = collectRequestedJoins(input.requested ?? '', input.always, root);
  if (!byPath) {
    return { errors: [INVALID_RELATIONS], joins: new Set() };
  }

  const joinPaths = Array.from(byPath.keys());
  const invalid = joinPaths.filter((p) => !paths.includes(p));
  if (invalid.length) {
    return {
      errors: invalid.map((p) => `Invalid relation path: ${describeInput(p)}`),
      joins: new Set(),
    };
  }
  return { errors: [], joins: new Set(joinPaths) };
}

export type ProjectInput = {
  column?: ProjectColumnInput | undefined;
  relation?: ProjectRelationInput | undefined;
};

/**
 * Runs {@link projectColumn} and/or {@link projectRelation}; merges `errors` from both sides.
 */
export function project(input: ProjectInput): {
  errors: string[];
  selects: Set<string>;
  joins: Set<string>;
} {
  const column = input.column ? projectColumn(input.column) : undefined;
  const relation = input.relation ? projectRelation(input.relation) : undefined;
  return {
    errors: [...(column?.errors ?? []), ...(relation?.errors ?? [])],
    selects: column?.selects ?? new Set(),
    joins: relation?.joins ?? new Set(),
  };
}
