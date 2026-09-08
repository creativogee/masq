<h1 align="center">
  @crudmates/masq
</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/@crudmates/masq"><img alt="NPM version" src="https://img.shields.io/npm/v/@crudmates/masq.svg"></a>
  <a href="https://www.npmjs.com/package/@crudmates/masq"><img alt="NPM downloads" src="https://img.shields.io/npm/dw/@crudmates/masq.svg"></a>
  <img alt="Test Coverage" src="https://img.shields.io/badge/coverage-99%25-brightgreen">
  <a href="https://www.paypal.com/donate?hosted_button_id=Z9NGDEGSC3LPY" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg"></a>
</p>

Flexible field masking and relation selection for REST APIs and data filtering. Transform and filter complex nested objects with intuitive string-based field specifications.

## Features

- 🎯 **Field Selection**: Select specific fields with simple syntax: `id,name,email`
- 🌟 **Nested Objects**: Handle deep nesting: `user(profile(avatar,settings))`
- 🔄 **Aliasing**: Rename fields during selection: `model<models>(make<makes>)`
- ⭐ **Wildcards**: Include all fields with exclusions: `*,-password,-secret`
- 🔗 **Relation Joins**: Generate join descriptors for ORM/query builders
- 🗄️ **Repository Helpers**: Allow-listed `SELECT` columns and join paths from raw query params
- 🔒 **Hardened**: Prototype-pollution safe, fail-closed, depth-limited, allow-list validated
- 📦 **Zero Dependencies**: Lightweight and self-contained
- 🛡️ **Type Safe**: Full TypeScript support with strict mode compliance
- ✅ **Well Tested**: 99%+ test coverage with comprehensive edge case handling

## Installation

```bash
npm install @crudmates/masq
```

## Quick Start

```typescript
import { applyMask, parseRelationsSpec } from '@crudmates/masq';

const user = {
  id: 1,
  name: 'John Doe',
  email: 'john@example.com',
  password: 'secret123',
  profile: {
    avatar: 'avatar.jpg',
    bio: 'Software developer',
    settings: {
      theme: 'dark',
      notifications: true,
    },
  },
};

// Simple field selection
const basic = applyMask(user, 'id,name,email');
// Result: { id: 1, name: 'John Doe', email: 'john@example.com' }

// Nested field selection
const nested = applyMask(user, 'id,name,profile(avatar,settings(theme))');
// Result: { id: 1, name: 'John Doe', profile: { avatar: 'avatar.jpg', settings: { theme: 'dark' } } }

// Wildcard with exclusions
const filtered = applyMask(user, '*,-password');
// Result: All fields except password

// Field aliasing
const aliased = applyMask(user, 'id,profile<userProfile>(avatar)');
// Result: { id: 1, userProfile: { avatar: 'avatar.jpg' } }
```

### Validating untrusted masks

`applyMask` returns whatever the mask asks for. When the mask comes from a client, validate it
against an allow-list first:

```typescript
import { applyMask, isValidMask, parseFieldsSpec } from '@crudmates/masq';

const allowed = { id: true, name: true, profile: { avatar: true, bio: true } };

app.get('/api/users/:id', (req, res) => {
  const mask = parseFieldsSpec(String(req.query.fields ?? '*'));
  if (!isValidMask(mask, allowed)) return res.status(400).json({ error: 'Invalid fields' });
  res.json(applyMask(user, mask));
});
```

## API Reference

### `applyMask<T>(data: T, maskValue?: string | object | null): T`

Apply a field mask to data, supporting both string specifications and pre-parsed objects.

**Parameters:**

- `data`: The object or array to filter
- `maskValue`: Field mask as string or parsed object (optional). Falsy values return `data` unchanged.

**Returns:** Filtered data. Typed as `T` for convenience; the runtime shape is a subset of `T`
with aliased keys renamed.

Fails **closed**: if a string mask cannot be parsed (for example it exceeds `MAX_SPEC_DEPTH`),
an empty mask is applied and no fields are returned.

```typescript
// String mask
applyMask(user, 'id,name,profile(avatar)');

// Pre-parsed object mask
applyMask(user, {
  id: true,
  name: true,
  profile: { avatar: true },
});

// Works with arrays
applyMask([user1, user2], 'id,name');

// Type-safe generics
const result: User = applyMask<User>(user, 'id,name');
```

### `parseFieldsSpec(fieldsSpec: string): FieldMask`

Parse a field specification string into an object structure.

**Parameters:**

- `fieldsSpec`: Field specification string

**Returns:** Parsed mask object (`true` include, `false` exclude, nested object, `__alias` rename)

**Throws:** `RangeError` when nesting exceeds `MAX_SPEC_DEPTH` (32)

```typescript
parseFieldsSpec('id,name,profile(avatar)');
// Result: { id: true, name: true, profile: { avatar: true } }

parseFieldsSpec('model<models>(make<makes>)');
// Result: { model: { __alias: 'models', make: { __alias: 'makes' } } }

parseFieldsSpec('*,-password');
// Result: { '*': true, password: false }
```

Non-string input yields `{}`. The names `__proto__`, `constructor` and `prototype` are dropped
whether used as fields or aliases.

### `applyFieldMask<T>(obj: T, mask: unknown): T`

Apply a pre-parsed (or string) field mask to an object or array.

**Parameters:**

- `obj`: The object or array to filter
- `mask`: Pre-parsed mask object, or a spec string (parsed with `parseFieldsSpec`)

**Returns:** Filtered object/array. A non-object mask yields an empty result, never the unmasked input.

```typescript
const mask = { id: true, name: true, profile: { avatar: true } };
applyFieldMask(user, mask);
```

Only own enumerable keys of the mask are honoured, and `__proto__`/`constructor`/`prototype`
are never read from the source or written to the result.

### `isValidMask(maskObj: unknown, allowed: unknown): boolean`

Validate a mask object against a set of allowed fields. This is the authorization gate for
user-provided masks — call it before `applyMask`.

**Parameters:**

- `maskObj`: The mask object to validate (as parsed by `parseFieldsSpec` or similar)
- `allowed`: The allowed fields structure (`true` leaves and nested objects)

**Returns:** `true` if the mask is valid, `false` otherwise

**Rules:**

- Every mask key must be an **own** property of `allowed` (inherited names such as `constructor` never match).
- `*` is only valid when `allowed['*'] === true` at that level — wildcards are opt-in.
- An empty nested mask (`profile()` or alias-only `profile<p>`) passes the entire sub-object through,
  so it is treated like `*` and requires `allowed.profile['*'] === true`.
- Alias-only masks on leaves (`id<identifier>`) are valid; sub-selecting a leaf (`id(x)`) is not.

```typescript
const allowed = {
  id: true,
  name: true,
  profile: {
    avatar: true,
    bio: true,
  },
};

isValidMask({ id: true, profile: { avatar: true } }, allowed); // true
isValidMask({ id: true, secret: true }, allowed); // false
isValidMask({ profile: { avatar: true, extra: true } }, allowed); // false
isValidMask({ '*': true }, allowed); // false — add '*': true to allowed to opt in
isValidMask({ profile: {} }, allowed); // false — would leak all of profile
isValidMask({ constructor: true }, allowed); // false
```

### `parseFlatFieldsSpec(fieldsSpec: string, allowedFields: AllowedFields | readonly string[], base: string): string[]`

Parse a field specification into flat dot-notation paths, validated against `allowedFields`.
Useful for building `SELECT` lists or projection arrays.

**Parameters:**

- `fieldsSpec`: Field specification string (same syntax as `parseFieldsSpec`)
- `allowedFields`: Nested allow-list (`true` leaves) or a flat array of names
- `base`: Prefix for every emitted path

**Returns:** Unique paths. Fields not in the allow-list (top-level or nested) are dropped.

**Throws:** `RangeError` when nesting exceeds `MAX_SPEC_DEPTH`

```typescript
const allowed = { id: true, name: true, branch: { id: true, name: true } };

parseFlatFieldsSpec('id,name', allowed, 'user');
// ['user.id', 'user.name']

parseFlatFieldsSpec('branch(id,name)', allowed, 'company');
// ['company.branch.id', 'company.branch.name']

parseFlatFieldsSpec('*,-name', allowed, 'user');
// ['user.id', 'user.branch']

parseFlatFieldsSpec('-name', allowed, 'user'); // exclusion-only implies '*'
// ['user.id', 'user.branch']

parseFlatFieldsSpec('id,secret,branch(ssn)', allowed, 'user');
// ['user.id'] — disallowed fields are dropped
```

### `parseRelationsSpec(relationsStr: string | undefined, baseAlias: string): RelationJoin[]`

Parse relation strings into join descriptors for ORM/query builders.

**Parameters:**

- `relationsStr`: Relation specification string
- `baseAlias`: Base table alias (required)

**Returns:** Array of `RelationJoin` objects with `path` and `alias` properties

**Throws:** `RangeError` when nesting exceeds `MAX_SPEC_DEPTH`

```typescript
parseRelationsSpec('model(make,category)', 'car');
// Result: [
//   { path: 'car.model', alias: 'model' },
//   { path: 'model.make', alias: 'make' },
//   { path: 'model.category', alias: 'category' }
// ]
```

The output is **not** validated. Never pass it straight to a query builder from user input —
use `projectRelation` below, which enforces an allow-list.

### `projectColumn(input: ProjectColumnInput): { errors: string[]; selects: Set<string> }`

Turn a raw `fields` query value into allow-listed SQL column fragments.

```typescript
type ProjectColumnInput = {
  requested?: string | null | undefined; // raw query value; non-strings are rejected
  allowed: Record<string, true>; // API field → column (quoted when it contains uppercase)
  alias?: string; // prefix: 'u' → 'u.id'
  always?: readonly string[]; // always selected (default ['id']); [] to disable
};

const allowed = { id: true, title: true, createdAt: true, secret: true };

projectColumn({ requested: 'title', allowed, alias: 'p' });
// { errors: [], selects: Set { 'p.title', 'p.id' } }

projectColumn({ requested: '*,-secret', allowed, alias: 'p' });
// { errors: [], selects: Set { 'p.id', 'p.title', 'p."createdAt"' } }

projectColumn({ requested: 'password', allowed });
// { errors: ['Invalid or empty columns'], selects: Set {} }
```

- Empty/undefined `requested` → all columns.
- `*` or an exclusion-only spec → all columns minus exclusions.
- Unknown keys, sub-selection of a column, non-string or too-deep input → error.
- Only keys present in `allowed` can ever become SQL fragments.

### `projectRelation(input: ProjectRelationInput): { errors: string[]; joins: Set<string> }`

Turn a raw `relations` query value into allow-listed join paths.

```typescript
type ProjectRelationInput = {
  requested?: string | null | undefined;
  alias: string; // relation root, e.g. 'car'
  always?: readonly string[]; // fragments always merged (requested wins on conflict)
  allowed: Record<string, true>; // 'model' → 'car.model'; nested edges as 'model.make'
};

projectRelation({
  requested: 'model(make)',
  alias: 'car',
  allowed: { model: true, 'model.make': true, seller: true },
});
// { errors: [], joins: Set { 'car.model', 'model.make' } }

projectRelation({ requested: 'owner', alias: 'car', allowed: { model: true } });
// { errors: ['Invalid relation path: car.owner'], joins: Set {} }
```

### `project(input: { column?: ProjectColumnInput; relation?: ProjectRelationInput })`

Runs `projectColumn` and/or `projectRelation` and merges their errors:

```typescript
const { errors, selects, joins } = project({
  column: { requested: req.query.fields, allowed: columns, alias: 'c' },
  relation: { requested: req.query.relations, alias: 'c', allowed: relations },
});
if (errors.length) return res.status(400).json({ errors });

const qb = repo.createQueryBuilder('c').select([...selects]);
for (const path of joins) qb.leftJoinAndSelect(path, path.split('.').pop()!);
```

### `MAX_SPEC_DEPTH`

The maximum nesting depth (32) accepted by every parser. Deeper specs throw a `RangeError`
(`applyMask`, `projectColumn` and `projectRelation` catch this and fail closed).

## Field Specification Syntax

### Basic Selection

```typescript
'id,name,email'; // Select specific fields
'id'; // Single field
```

### Nested Objects

```typescript
'user(profile(avatar,bio))'; // Nested field selection
'user(profile(settings(theme)))'; // Deep nesting
'user(profile(*),posts(id,title))'; // Mixed nested selection
```

### Wildcards

```typescript
'*'; // Select all fields
'*,-password'; // All fields except password
'*,-password,-secret'; // Multiple exclusions
'user(*,-internal)'; // Wildcard in nested objects
```

### Field Aliasing

```typescript
'model<models>'; // Rename field: models
'user<customer>(profile<info>)'; // Nested aliasing
'posts<articles>(author<writer>)'; // Multiple aliases
```

### Complex Examples

```typescript
// Real-world API response filtering
'id,name,*,-password,profile<userProfile>(avatar,settings<prefs>(theme))';

// E-commerce product selection
'id,name,price,category(name,parent),reviews<ratings>(score,comment)';

// User with posts and comments
'user(id,name,profile(avatar),posts(id,title,comments(id,content,author(name))))';
```

## Advanced Usage

### Working with Arrays

```typescript
const users = [
  { id: 1, name: 'John', password: 'secret1' },
  { id: 2, name: 'Jane', password: 'secret2' },
];

const filtered = applyMask(users, 'id,name');
// Result: [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]
```

### Type Safety with Generics

```typescript
interface User {
  id: number;
  name: string;
  email: string;
}

const user: User = { id: 1, name: 'John', email: 'john@example.com' };
const result = applyMask<User>(user, 'id,name');
// result is typed as User
```

### Integration with ORMs

```typescript
// Sequelize example (trusted relation string)
const joins = parseRelationsSpec('user(profile,posts(comments))', 'user');
joins.forEach(({ path, alias }) => {
  query.include.push({
    model: getModelFromPath(path),
    as: alias,
  });
});

// TypeORM example (untrusted relation string → allow-listed)
const { errors, joins } = projectRelation({
  requested: req.query.relations,
  alias: 'order',
  allowed: { customer: true, items: true, 'items.product': true },
});
if (errors.length) return res.status(400).json({ errors });
for (const path of joins) {
  queryBuilder.leftJoinAndSelect(path, path.split('.').pop()!);
}
```

### REST API Query Parameters

```typescript
// Express.js example — validate, then mask
const allowed = { id: true, name: true, profile: { avatar: true } };

app.get('/api/users', async (req, res) => {
  const fields = typeof req.query.fields === 'string' ? req.query.fields : 'id,name';
  const mask = parseFieldsSpec(fields);
  if (!isValidMask(mask, allowed)) {
    return res.status(400).json({ error: 'Invalid fields' });
  }
  const users = await User.findAll();
  res.json(applyMask(users, mask));
});
```

## Error Handling

```typescript
// Empty or undefined masks return data unchanged
applyMask(user, ''); // user
applyMask(user, undefined); // user
applyMask(user, null); // user

// Non-existent fields are ignored
applyMask(user, 'id,nonExistent'); // { id: 1 }

// Malformed syntax is parsed leniently; unknown keys simply match nothing
applyMask(user, 'invalid(((syntax'); // {}
applyMask(user, 'profile(settings('); // { profile: { settings: user.profile.settings } }

// Unparsable masks (e.g. nesting deeper than MAX_SPEC_DEPTH) fail closed
applyMask(user, 'a('.repeat(100)); // {}

// The low-level parsers throw so callers can report the problem
parseFieldsSpec('a('.repeat(100)); // throws RangeError
```

## Security

masq is designed to sit between untrusted query strings and your data. The following are enforced:

- **Fail closed**: an unparsable mask never returns the unmasked input.
- **Allow-list validation**: `isValidMask`, `parseFlatFieldsSpec`, `projectColumn` and `projectRelation`
  only ever emit fields/paths present in the allow-list you supply. Wildcards are opt-in.
- **Prototype pollution**: `__proto__`, `constructor` and `prototype` are rejected as field names and
  aliases; masks are iterated via own keys only; the source object is read via `hasOwnProperty`.
- **Resource limits**: nesting is capped at `MAX_SPEC_DEPTH` (32); non-string input
  (e.g. a repeated query param) is rejected rather than thrown on.
- **No dynamic code**: no `eval`, `Function`, or regex with catastrophic backtracking.

### Query injection

`projectColumn`, `projectRelation` and `parseFlatFieldsSpec` never interpolate client input into their
output. Requested keys are resolved through a lookup built solely from your `allowed` manifest, and
relation paths must match a manifest-derived path exactly — so a client can only ever select
*which* of your pre-declared fragments are emitted, never *what* they contain.

The manifest (`allowed` keys), `alias` and `base` are **trusted configuration** and are interpolated
verbatim. To protect against a manifest accidentally built from request data, every manifest key,
table alias and relation path segment must match `^[A-Za-z_][A-Za-z0-9_]*$`; anything else yields
an `Invalid column identifier` / `Invalid table alias` / `Invalid relation identifier` error.

Notes:

- Column fragments use ANSI double-quote quoting (`"createdAt"`), which matches PostgreSQL, SQLite
  and SQL Server. MySQL/MariaDB need backticks — map the fragments yourself if you target them.
- Error strings echo (truncated) client input, e.g. `Invalid relation path: a.owner`. Treat them as
  untrusted if you render them into HTML or structured logs.
- `parseRelationsSpec` and `applyFieldMask` are deliberately unvalidated building blocks — pair them
  with `isValidMask`/`projectRelation` when the input is user-controlled. Never hand raw
  `parseRelationsSpec` aliases to a query builder; ORMs such as TypeORM quote aliases without
  escaping embedded quotes.

## Performance

- **Lightweight**: Zero dependencies, ~4KB minified
- **Fast**: Single-pass tokenizer, linear-time regexes
- **Memory efficient**: Nested values are passed by reference, not cloned

## License

This project is licensed under the [MIT License](LICENSE).
