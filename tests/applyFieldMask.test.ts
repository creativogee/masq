import { applyFieldMask, isValidMask } from '../src/index';

describe('applyFieldMask', () => {
  const sampleObject = {
    id: 1,
    name: 'John',
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
    posts: [
      { id: 1, title: 'Post 1', content: 'Content 1' },
      { id: 2, title: 'Post 2', content: 'Content 2' },
    ],
  };

  describe('primitive value handling', () => {
    test('should return primitive values as-is', () => {
      expect(applyFieldMask(null, { id: true })).toBe(null);
      expect(applyFieldMask(undefined, { id: true })).toBe(undefined);
      expect(applyFieldMask(42, { id: true })).toBe(42);
      expect(applyFieldMask('string', { id: true })).toBe('string');
      expect(applyFieldMask(true, { id: true })).toBe(true);
    });
  });

  describe('basic field selection', () => {
    test('should select specific fields', () => {
      const mask = { id: true, name: true };
      const result = applyFieldMask(sampleObject, mask);

      expect(result).toEqual({
        id: 1,
        name: 'John',
      });
    });

    test('should return empty object for empty mask', () => {
      const result = applyFieldMask(sampleObject, {});
      expect(result).toEqual({});
    });

    test('should handle non-existent fields', () => {
      const mask = { id: true, nonExistent: true };
      const result = applyFieldMask(sampleObject, mask);

      expect(result).toEqual({
        id: 1,
      });
    });
  });

  describe('field exclusions', () => {
    test('should exclude fields marked as false', () => {
      const mask = { id: true, name: true, password: false };
      const result = applyFieldMask(sampleObject, mask);

      expect(result).toEqual({
        id: 1,
        name: 'John',
      });
    });
  });

  describe('wildcard support', () => {
    test('should include all fields with wildcard', () => {
      const mask = { '*': true };
      const result = applyFieldMask(sampleObject, mask);

      expect(result).toEqual(sampleObject);
    });

    test('should exclude specific fields with wildcard', () => {
      const mask = { '*': true, password: false };
      const result = applyFieldMask(sampleObject, mask);

      const expected = { ...sampleObject };
      delete (expected as any).password;
      expect(result).toEqual(expected);
    });

    test('should handle wildcard with nested field processing', () => {
      const mask = {
        '*': true,
        password: false,
        profile: {
          avatar: true,
          bio: true,
        },
      };
      const result = applyFieldMask(sampleObject, mask);

      expect(result).toEqual({
        id: 1,
        name: 'John',
        email: 'john@example.com',
        profile: {
          avatar: 'avatar.jpg',
          bio: 'Software developer',
        },
        posts: sampleObject.posts,
      });
    });
  });

  describe('nested object handling', () => {
    test('should apply mask to nested objects', () => {
      const mask = {
        id: true,
        profile: {
          avatar: true,
        },
      };
      const result = applyFieldMask(sampleObject, mask);

      expect(result).toEqual({
        id: 1,
        profile: {
          avatar: 'avatar.jpg',
        },
      });
    });

    test('should handle deeply nested objects', () => {
      const mask = {
        profile: {
          settings: {
            theme: true,
          },
        },
      };
      const result = applyFieldMask(sampleObject, mask);

      expect(result).toEqual({
        profile: {
          settings: {
            theme: 'dark',
          },
        },
      });
    });

    test('should handle empty nested mask', () => {
      const mask = {
        id: true,
        profile: {},
      };
      const result = applyFieldMask(sampleObject, mask);

      expect(result).toEqual({
        id: 1,
        profile: sampleObject.profile,
      });
    });
  });

  describe('array handling', () => {
    test('should apply mask to arrays', () => {
      const arrayData = [
        { id: 1, name: 'John', password: 'secret' },
        { id: 2, name: 'Jane', password: 'secret2' },
      ];
      const mask = { id: true, name: true };
      const result = applyFieldMask(arrayData, mask);

      expect(result).toEqual([
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' },
      ]);
    });

    test('should handle nested arrays', () => {
      const mask = {
        posts: {
          id: true,
          title: true,
        },
      };
      const result = applyFieldMask(sampleObject, mask);

      expect(result).toEqual({
        posts: [
          { id: 1, title: 'Post 1' },
          { id: 2, title: 'Post 2' },
        ],
      });
    });

    test('should handle arrays with wildcard', () => {
      const mask = {
        posts: {
          '*': true,
          content: false,
        },
      };
      const result = applyFieldMask(sampleObject, mask);

      expect(result).toEqual({
        posts: [
          { id: 1, title: 'Post 1' },
          { id: 2, title: 'Post 2' },
        ],
      });
    });
  });

  describe('aliasing support', () => {
    test('should apply simple alias', () => {
      const mask = {
        id: true,
        profile: {
          __alias: 'userProfile',
          avatar: true,
        },
      };
      const result = applyFieldMask(sampleObject, mask);

      expect(result).toEqual({
        id: 1,
        userProfile: {
          avatar: 'avatar.jpg',
        },
      });
    });

    test('should handle alias with empty nested mask', () => {
      const mask = {
        profile: {
          __alias: 'userProfile',
        },
      };
      const result = applyFieldMask(sampleObject, mask);

      expect(result).toEqual({
        userProfile: sampleObject.profile,
      });
    });

    test('should handle wildcard with alias', () => {
      const mask = {
        '*': true,
        profile: {
          __alias: 'userProfile',
          avatar: true,
        },
      };
      const result = applyFieldMask(sampleObject, mask);

      expect(result).toEqual({
        id: 1,
        name: 'John',
        email: 'john@example.com',
        password: 'secret123',
        posts: sampleObject.posts,
        userProfile: {
          avatar: 'avatar.jpg',
        },
      });
    });

    test('should handle nested aliases', () => {
      const mask = {
        profile: {
          __alias: 'userProfile',
          settings: {
            __alias: 'userSettings',
            theme: true,
          },
        },
      };
      const result = applyFieldMask(sampleObject, mask);

      expect(result).toEqual({
        userProfile: {
          userSettings: {
            theme: 'dark',
          },
        },
      });
    });

    test('should handle arrays with alias', () => {
      const mask = {
        posts: {
          __alias: 'articles',
          id: true,
          title: true,
        },
      };
      const result = applyFieldMask(sampleObject, mask);

      expect(result).toEqual({
        articles: [
          { id: 1, title: 'Post 1' },
          { id: 2, title: 'Post 2' },
        ],
      });
    });
  });

  describe('complex scenarios', () => {
    test('should handle complex real-world mask', () => {
      const mask = {
        '*': true,
        password: false,
        profile: {
          __alias: 'userProfile',
          avatar: true,
          settings: {
            __alias: 'preferences',
            theme: true,
          },
        },
        posts: {
          __alias: 'articles',
          id: true,
          title: true,
        },
      };
      const result = applyFieldMask(sampleObject, mask);

      expect(result).toEqual({
        id: 1,
        name: 'John',
        email: 'john@example.com',
        userProfile: {
          avatar: 'avatar.jpg',
          preferences: {
            theme: 'dark',
          },
        },
        articles: [
          { id: 1, title: 'Post 1' },
          { id: 2, title: 'Post 2' },
        ],
      });
    });

    test('should handle mixed inclusion and exclusion', () => {
      const mask = {
        id: true,
        name: true,
        profile: {
          '*': true,
          settings: false,
        },
      };
      const result = applyFieldMask(sampleObject, mask);

      expect(result).toEqual({
        id: 1,
        name: 'John',
        profile: {
          avatar: 'avatar.jpg',
          bio: 'Software developer',
        },
      });
    });
  });

  describe('edge cases', () => {
    test('should handle circular references gracefully', () => {
      const circularObj: any = { id: 1, name: 'test' };
      circularObj.self = circularObj;

      const mask = { id: true, name: true };
      const result = applyFieldMask(circularObj, mask);

      expect(result).toEqual({
        id: 1,
        name: 'test',
      });
    });

    test('should handle null nested objects', () => {
      const objWithNull = {
        id: 1,
        profile: null,
      };
      const mask = {
        id: true,
        profile: {
          name: true,
        },
      };
      const result = applyFieldMask(objWithNull, mask);

      expect(result).toEqual({
        id: 1,
        profile: null,
      });
    });

    test('should handle undefined nested objects', () => {
      const objWithUndefined = {
        id: 1,
        profile: undefined,
      };
      const mask = {
        id: true,
        profile: {
          name: true,
        },
      };
      const result = applyFieldMask(objWithUndefined, mask);

      expect(result).toEqual({
        id: 1,
      });
    });
  });
});

describe('isValidMask', () => {
  const allowed = {
    id: true,
    name: true,
    branch: {
      id: true,
      name: true,
      internal: true,
    },
    secret: true,
    '*': true,
    meta: {
      foo: true,
      bar: true,
    },
  };

  it('returns true for a valid flat mask', () => {
    expect(isValidMask({ id: true, name: true }, allowed)).toBe(true);
  });

  it('returns false for a mask with disallowed field', () => {
    expect(isValidMask({ id: true, nope: true }, allowed)).toBe(false);
  });

  it('returns true for a valid nested mask', () => {
    expect(isValidMask({ branch: { id: true, name: true } }, allowed)).toBe(true);
  });

  it('returns false for an invalid nested mask', () => {
    expect(isValidMask({ branch: { id: true, nope: true } }, allowed)).toBe(false);
  });

  it('returns true for wildcard mask', () => {
    expect(isValidMask({ '*': true }, allowed)).toBe(true);
  });

  it('returns true for mask with __alias', () => {
    expect(isValidMask({ branch: { __alias: 'b', id: true } }, allowed)).toBe(true);
  });

  it('returns false for non-object mask', () => {
    expect(isValidMask(null, allowed)).toBe(false);
    expect(isValidMask(42, allowed)).toBe(false);
    expect(isValidMask('string', allowed)).toBe(false);
  });

  it('returns true for mask with allowed nested objects', () => {
    expect(isValidMask({ meta: { foo: true } }, allowed)).toBe(true);
  });

  it('returns false for mask with disallowed nested objects', () => {
    expect(isValidMask({ meta: { baz: true } }, allowed)).toBe(false);
  });
});
