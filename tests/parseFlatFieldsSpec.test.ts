import { parseFlatFieldsSpec } from '../src/index';

describe('parseFlatFieldsSpec', () => {
  describe('basic field flattening', () => {
    test('should flatten simple comma-separated fields', () => {
      expect(parseFlatFieldsSpec('id,name', { id: true, name: true }, 'user')).toEqual([
        'user.id',
        'user.name',
      ]);
    });

    test('should handle single field', () => {
      expect(parseFlatFieldsSpec('id', { id: true }, 'user')).toEqual(['user.id']);
    });

    test('should handle empty string', () => {
      expect(parseFlatFieldsSpec('', { id: true }, 'user')).toEqual([]);
    });

    test('should handle whitespace', () => {
      expect(parseFlatFieldsSpec(' id , name ', { id: true, name: true }, 'user')).toEqual([
        'user.id',
        'user.name',
      ]);
    });
  });

  describe('wildcard and exclusion handling', () => {
    const allowedFields = {
      id: true,
      name: true,
      email: true,
      password: true,
    };

    test('should handle wildcard selection', () => {
      expect(parseFlatFieldsSpec('*', allowedFields, 'user')).toEqual([
        'user.id',
        'user.name',
        'user.email',
        'user.password',
      ]);
    });

    test('should handle wildcard with exclusions', () => {
      expect(parseFlatFieldsSpec('*,-password', allowedFields, 'user')).toEqual([
        'user.id',
        'user.name',
        'user.email',
      ]);
    });

    test('should handle multiple exclusions', () => {
      expect(parseFlatFieldsSpec('*,-password,-email', allowedFields, 'user')).toEqual([
        'user.id',
        'user.name',
      ]);
    });

    test('should handle only exclusions', () => {
      expect(parseFlatFieldsSpec('-password,-email', allowedFields, 'user')).toEqual([
        'user.id',
        'user.name',
      ]);
    });
  });

  describe('nested field handling', () => {
    const allowedFields = {
      id: true,
      name: true,
      branch: {
        id: true,
        name: true,
        address: {
          street: true,
          city: true,
        },
      },
    };

    test('should flatten nested fields with parentheses', () => {
      expect(parseFlatFieldsSpec('id,name,branch(id,name)', allowedFields, 'company')).toEqual([
        'company.id',
        'company.name',
        'company.branch.id',
        'company.branch.name',
      ]);
    });

    test('should handle deeply nested fields', () => {
      expect(
        parseFlatFieldsSpec('branch(id,name,address(street,city))', allowedFields, 'company'),
      ).toEqual([
        'company.branch.id',
        'company.branch.name',
        'company.branch.address.street',
        'company.branch.address.city',
      ]);
    });

    test('should handle empty nested parentheses', () => {
      expect(parseFlatFieldsSpec('branch()', allowedFields, 'company')).toEqual([]);
    });
  });

  describe('alias handling', () => {
    const allowedFields = {
      model: {
        id: true,
        name: true,
        make: {
          id: true,
          name: true,
        },
      },
    };

    test('should handle simple alias', () => {
      expect(parseFlatFieldsSpec('model<models>', allowedFields, 'car')).toEqual(['car.model']);
    });

    test('should handle alias with nested fields', () => {
      expect(parseFlatFieldsSpec('model<models>(id,name)', allowedFields, 'car')).toEqual([
        'car.model.id',
        'car.model.name',
      ]);
    });

    test('should handle nested aliases', () => {
      expect(
        parseFlatFieldsSpec('model<models>(make<makes>(id,name))', allowedFields, 'car'),
      ).toEqual(['car.model.make.id', 'car.model.make.name']);
    });
  });

  describe('edge cases', () => {
    const allowedFields = { id: true, name: true, branch: { id: true } };

    test('should handle trailing comma', () => {
      expect(parseFlatFieldsSpec('id,name,', allowedFields, 'user')).toEqual([
        'user.id',
        'user.name',
      ]);
    });

    test('should handle multiple consecutive commas', () => {
      expect(parseFlatFieldsSpec('id,,name', allowedFields, 'user')).toEqual([
        'user.id',
        'user.name',
      ]);
    });

    test('should handle unmatched parentheses gracefully', () => {
      expect(parseFlatFieldsSpec('id,name,branch(id', allowedFields, 'user')).toEqual([
        'user.id',
        'user.name',
        'user.branch.id',
      ]);
    });

    test('should handle unmatched parentheses after an alias', () => {
      expect(parseFlatFieldsSpec('branch<b>(id', allowedFields, 'user')).toEqual([
        'user.branch.id',
      ]);
    });

    test('should de-duplicate repeated paths', () => {
      expect(parseFlatFieldsSpec('id,id,branch(id,id)', allowedFields, 'user')).toEqual([
        'user.id',
        'user.branch.id',
      ]);
    });

    test('should apply exclusions alongside explicit selections', () => {
      expect(parseFlatFieldsSpec('id,name,-name', allowedFields, 'user')).toEqual(['user.id']);
    });

    test('should return empty for non-string input', () => {
      expect(parseFlatFieldsSpec(undefined as any, allowedFields, 'user')).toEqual([]);
      expect(parseFlatFieldsSpec(['id'] as any, allowedFields, 'user')).toEqual([]);
    });

    test('should accept an array allow-list', () => {
      expect(parseFlatFieldsSpec('id,nope', ['id', 'name'], 'user')).toEqual(['user.id']);
      expect(parseFlatFieldsSpec('*', ['id', 'name'], 'user')).toEqual(['user.id', 'user.name']);
    });

    test('should return requested fields when allow-list is empty and no wildcard', () => {
      // Nothing is allowed, so nothing is emitted.
      expect(parseFlatFieldsSpec('id', {}, 'user')).toEqual([]);
      expect(parseFlatFieldsSpec('*', {}, 'user')).toEqual([]);
    });
  });

  describe('allow-list enforcement', () => {
    const allowedFields = {
      id: true,
      name: true,
      profile: { avatar: true, bio: true },
      password: false,
    };

    test('should drop top-level fields not in allow-list', () => {
      expect(parseFlatFieldsSpec('id,secret,name', allowedFields, 'user')).toEqual([
        'user.id',
        'user.name',
      ]);
    });

    test('should drop fields whose allow-list value is not true or an object', () => {
      expect(parseFlatFieldsSpec('id,password', allowedFields, 'user')).toEqual(['user.id']);
      expect(parseFlatFieldsSpec('*', allowedFields, 'user')).toEqual([
        'user.id',
        'user.name',
        'user.profile',
      ]);
    });

    test('should drop nested fields not in nested allow-list', () => {
      expect(parseFlatFieldsSpec('profile(avatar,ssn)', allowedFields, 'user')).toEqual([
        'user.profile.avatar',
      ]);
    });

    test('should drop sub-selection of a leaf field', () => {
      expect(parseFlatFieldsSpec('id(x),name', allowedFields, 'user')).toEqual(['user.name']);
      expect(parseFlatFieldsSpec('id<i>(x),name', allowedFields, 'user')).toEqual(['user.name']);
    });

    test('should drop aliased fields not in allow-list', () => {
      expect(parseFlatFieldsSpec('secret<s>,id', allowedFields, 'user')).toEqual(['user.id']);
    });

    test('should not throw for aliased nested field not in allow-list', () => {
      expect(() => parseFlatFieldsSpec('ghost<g>(inner(x))', allowedFields, 'user')).not.toThrow();
      expect(parseFlatFieldsSpec('ghost<g>(inner(x))', allowedFields, 'user')).toEqual([]);
    });

    test('should ignore prototype-chain names', () => {
      expect(
        parseFlatFieldsSpec('constructor,toString,__proto__,hasOwnProperty,id', allowedFields, 'user'),
      ).toEqual(['user.id']);
      expect(parseFlatFieldsSpec('constructor(x),__proto__(y)', allowedFields, 'user')).toEqual([]);
    });

    test('should prune deep specs not backed by the allow-list without throwing', () => {
      const deep = 'profile('.repeat(50) + 'avatar' + ')'.repeat(50);
      expect(parseFlatFieldsSpec(deep, allowedFields, 'user')).toEqual([]);
    });

    test('should throw RangeError when nesting is too deep', () => {
      let recursive: Record<string, any> = { x: true };
      for (let i = 0; i < 50; i++) recursive = { a: recursive };
      const deep = 'a('.repeat(50) + 'x' + ')'.repeat(50);
      expect(() => parseFlatFieldsSpec(deep, recursive, 'user')).toThrow(RangeError);
    });
  });
});
