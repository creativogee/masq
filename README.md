<h1 align="center">
  @crudmates/masq
</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/@crudmates/masq"><img alt="NPM version" src="https://img.shields.io/npm/v/@crudmates/masq.svg"></a>
  <a href="https://www.npmjs.com/package/@crudmates/masq"><img alt="NPM downloads" src="https://img.shields.io/npm/dw/@crudmates/masq.svg"></a>
  <a href="https://github.com/creativogee/masq/actions/workflows/ci.yml"><img alt="CI Status" src="https://github.com/creativogee/masq/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Test Coverage" src="https://img.shields.io/badge/coverage-87%25-brightgreen">
  <a href="https://www.paypal.com/donate?hosted_button_id=Z9NGDEGSC3LPY" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg"></a>
</p>

Flexible field masking and relation selection for REST APIs and data filtering. Transform and filter complex nested objects with intuitive string-based field specifications.

## Features

- 🎯 **Field Selection**: Select specific fields with simple syntax: `id,name,email`
- 🌟 **Nested Objects**: Handle deep nesting: `user(profile(avatar,settings))`
- 🔄 **Aliasing**: Rename fields during selection: `model<models>(make<makes>)`
- ⭐ **Wildcards**: Include all fields with exclusions: `*,-password,-secret`
- 🔗 **Relation Joins**: Generate join descriptors for ORM/query builders
- 📦 **Zero Dependencies**: Lightweight and self-contained
- 🛡️ **Type Safe**: Full TypeScript support with strict mode compliance
- ✅ **Well Tested**: 98%+ test coverage with comprehensive edge case handling

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

## API Reference

### `applyMask<T>(data: T, maskValue?: string | object): T`

Apply a field mask to data, supporting both string specifications and pre-parsed objects.

**Parameters:**

- `data`: The object or array to filter
- `maskValue`: Field mask as string or parsed object (optional)

**Returns:** Filtered data with the same type

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

### `parseFieldsSpec(fieldsSpec: string): object`

Parse a field specification string into an object structure.

**Parameters:**

- `fieldsSpec`: Field specification string

**Returns:** Parsed mask object

```typescript
parseFieldsSpec('id,name,profile(avatar)');
// Result: { id: true, name: true, profile: { avatar: true } }

parseFieldsSpec('model<models>(make<makes>)');
// Result: { model: { __alias: 'models', make: { __alias: 'makes' } } }

parseFieldsSpec('*,-password');
// Result: { '*': true, password: false }
```

### `applyFieldMask(obj: any, mask: any): any`

Apply a pre-parsed field mask to an object or array.

**Parameters:**

- `obj`: The object or array to filter
- `mask`: Pre-parsed mask object

**Returns:** Filtered object/array

```typescript
const mask = { id: true, name: true, profile: { avatar: true } };
applyFieldMask(user, mask);
```

### `isValidMask(maskObj: any, allowed: any): boolean`

Validate a mask object against a set of allowed fields. Useful for ensuring that a user-provided mask only includes permitted fields and structure.

**Parameters:**

- `maskObj`: The mask object to validate (as parsed by `parseFieldsSpec` or similar)
- `allowed`: The allowed fields structure (object with allowed keys and nested objects)

**Returns:** `true` if the mask is valid, `false` otherwise

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
```

### `parseRelationsSpec(relationsStr: string, baseAlias: string): RelationJoin[]`

Parse relation strings into join descriptors for ORM/query builders.

**Parameters:**

- `relationsStr`: Relation specification string
- `baseAlias`: Base table alias (defaults to 'car')

**Returns:** Array of `RelationJoin` objects with `path` and `alias` properties

```typescript
parseRelationsSpec('model(make,category)', 'car');
// Result: [
//   { path: 'car.model', alias: 'model' },
//   { path: 'model.make', alias: 'make' },
//   { path: 'model.category', alias: 'category' }
// ]

// Use with SQL query builders
const joins = parseRelationsSpec('user(profile,posts(comments))');
joins.forEach(({ path, alias }) => {
  query.leftJoin(path, alias);
});
```

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
// Sequelize example
const joins = parseRelationsSpec('user(profile,posts(comments))');
joins.forEach(({ path, alias }) => {
  query.include.push({
    model: getModelFromPath(path),
    as: alias,
  });
});

// TypeORM example
const joins = parseRelationsSpec('order(customer,items(product))');
joins.forEach(({ path, alias }) => {
  queryBuilder.leftJoinAndSelect(path, alias);
});
```

### Database Query Optimization

```typescript
// Use with query builders to optimize database queries
const fields = req.query.fields; // e.g., "user(profile(avatar),posts(id,title))"
const relations = parseRelationsSpec(fields);

// Optimize joins based on requested fields
relations.forEach(({ path, alias }) => {
  queryBuilder.leftJoinAndSelect(path, alias);
});

const result = applyMask(await queryBuilder.getMany(), fields);
```

### REST API Query Parameters

```typescript
// Express.js middleware example
app.get('/api/users', (req, res) => {
  const fields = req.query.fields; // e.g., "id,name,profile(avatar)"
  const users = await User.findAll();
  const filtered = applyMask(users, fields);
  res.json(filtered);
});
```

## Error Handling

The library gracefully handles malformed input:

```typescript
// Invalid syntax returns original data
applyMask(user, 'invalid(((syntax'); // Returns user unchanged

// Empty or undefined masks
applyMask(user, ''); // Returns user unchanged
applyMask(user, undefined); // Returns user unchanged
applyMask(user, null); // Returns user unchanged

// Non-existent fields are ignored
applyMask(user, 'id,nonExistent'); // Returns { id: 1 }
```

## Performance

- **Lightweight**: Zero dependencies, ~3KB minified
- **Fast**: Optimized parsing and filtering algorithms
- **Memory efficient**: No unnecessary object cloning
- **Tree-shakable**: Import only what you need

## License

This project is licensed under the [MIT License](LICENSE).
