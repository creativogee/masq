import { applyMask } from '../src/index';

describe('applyMask', () => {
  const sampleData = {
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
        private: true,
      },
    },
    posts: [
      { id: 1, title: 'First Post', content: 'Content 1', draft: false },
      { id: 2, title: 'Second Post', content: 'Content 2', draft: true },
    ],
  };

  describe('string mask parsing and application', () => {
    test('should parse and apply simple field mask', () => {
      const result = applyMask(sampleData, 'id,name,email');
      
      expect(result).toEqual({
        id: 1,
        name: 'John Doe',
        email: 'john@example.com',
      });
    });

    test('should parse and apply nested field mask', () => {
      const result = applyMask(sampleData, 'id,name,profile(avatar,bio)');
      
      expect(result).toEqual({
        id: 1,
        name: 'John Doe',
        profile: {
          avatar: 'avatar.jpg',
          bio: 'Software developer',
        },
      });
    });

    test('should parse and apply wildcard mask', () => {
      const result = applyMask(sampleData, '*,-password');
      
      const expected = { ...sampleData };
      delete expected.password;
      expect(result).toEqual(expected);
    });

    test('should parse and apply nested wildcard mask', () => {
      const result = applyMask(sampleData, 'profile(*)');
      
      expect(result).toEqual({
        profile: sampleData.profile,
      });
    });

    test('should parse and apply aliased fields', () => {
      const result = applyMask(sampleData, 'id,profile<userProfile>(avatar)');
      
      expect(result).toEqual({
        id: 1,
        userProfile: {
          avatar: 'avatar.jpg',
        },
      });
    });

    test('should handle deeply nested fields with aliases', () => {
      const result = applyMask(sampleData, 'profile<userProfile>(settings<prefs>(theme))');
      
      expect(result).toEqual({
        userProfile: {
          prefs: {
            theme: 'dark',
          },
        },
      });
    });

    test('should handle array fields', () => {
      const result = applyMask(sampleData, 'posts(id,title)');
      
      expect(result).toEqual({
        posts: [
          { id: 1, title: 'First Post' },
          { id: 2, title: 'Second Post' },
        ],
      });
    });

    test('should handle complex real-world mask string', () => {
      const mask = 'id,name,email,profile<userProfile>(avatar,settings<prefs>(theme)),posts<articles>(id,title)';
      const result = applyMask(sampleData, mask);
      
      expect(result).toEqual({
        id: 1,
        name: 'John Doe',
        email: 'john@example.com',
        userProfile: {
          avatar: 'avatar.jpg',
          prefs: {
            theme: 'dark',
          },
        },
        articles: [
          { id: 1, title: 'First Post' },
          { id: 2, title: 'Second Post' },
        ],
      });
    });
  });

  describe('object mask application', () => {
    test('should apply pre-parsed object mask', () => {
      const mask = {
        id: true,
        name: true,
        profile: {
          avatar: true,
        },
      };
      const result = applyMask(sampleData, mask);
      
      expect(result).toEqual({
        id: 1,
        name: 'John Doe',
        profile: {
          avatar: 'avatar.jpg',
        },
      });
    });

    test('should apply object mask with aliases', () => {
      const mask = {
        id: true,
        profile: {
          __alias: 'userProfile',
          avatar: true,
          settings: {
            __alias: 'preferences',
            theme: true,
          },
        },
      };
      const result = applyMask(sampleData, mask);
      
      expect(result).toEqual({
        id: 1,
        userProfile: {
          avatar: 'avatar.jpg',
          preferences: {
            theme: 'dark',
          },
        },
      });
    });

    test('should apply object mask with wildcard', () => {
      const mask = {
        '*': true,
        password: false,
        profile: {
          avatar: true,
          bio: true,
        },
      };
      const result = applyMask(sampleData, mask);
      
      expect(result).toEqual({
        id: 1,
        name: 'John Doe',
        email: 'john@example.com',
        profile: {
          avatar: 'avatar.jpg',
          bio: 'Software developer',
        },
        posts: sampleData.posts,
      });
    });
  });

  describe('edge cases and error handling', () => {
    test('should return original data when mask is undefined', () => {
      const result = applyMask(sampleData, undefined);
      expect(result).toBe(sampleData);
    });

    test('should return original data when mask is null', () => {
      const result = applyMask(sampleData, null);
      expect(result).toBe(sampleData);
    });

    test('should return original data when mask is empty string', () => {
      const result = applyMask(sampleData, '');
      expect(result).toBe(sampleData);
    });

    test('should handle invalid mask string gracefully', () => {
      const result = applyMask(sampleData, 'invalid(((mask');
      expect(result).toEqual({});
    });

    test('should handle malformed nested structure', () => {
      const result = applyMask(sampleData, 'profile(settings(');
      expect(result).toEqual({
        profile: {
          settings: sampleData.profile.settings,
        },
      });
    });

    test('should handle empty object mask', () => {
      const result = applyMask(sampleData, {});
      expect(result).toEqual({});
    });
  });

  describe('array data handling', () => {
    const arrayData = [
      { id: 1, name: 'John', password: 'secret1' },
      { id: 2, name: 'Jane', password: 'secret2' },
      { id: 3, name: 'Bob', password: 'secret3' },
    ];

    test('should apply mask to array data with string mask', () => {
      const result = applyMask(arrayData, 'id,name');
      
      expect(result).toEqual([
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' },
        { id: 3, name: 'Bob' },
      ]);
    });

    test('should apply mask to array data with object mask', () => {
      const mask = {
        id: true,
        name: true,
      };
      const result = applyMask(arrayData, mask);
      
      expect(result).toEqual([
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' },
        { id: 3, name: 'Bob' },
      ]);
    });

    test('should handle wildcard with array data', () => {
      const result = applyMask(arrayData, '*,-password');
      
      expect(result).toEqual([
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' },
        { id: 3, name: 'Bob' },
      ]);
    });
  });

  describe('primitive data handling', () => {
    test('should return primitive values unchanged', () => {
      expect(applyMask(42, 'id,name')).toBe(42);
      expect(applyMask('string', 'id,name')).toBe('string');
      expect(applyMask(true, 'id,name')).toBe(true);
      expect(applyMask(null, 'id,name')).toBe(null);
      expect(applyMask(undefined, 'id,name')).toBe(undefined);
    });
  });

  describe('generic type preservation', () => {
    interface User {
      id: number;
      name: string;
      email: string;
    }

    test('should preserve TypeScript generic types', () => {
      const user: User = {
        id: 1,
        name: 'John',
        email: 'john@example.com',
      };

      const result = applyMask<User>(user, 'id,name');
      
      expect(result).toEqual({
        id: 1,
        name: 'John',
      });
    });

    test('should work with array of generic types', () => {
      const users: User[] = [
        { id: 1, name: 'John', email: 'john@example.com' },
        { id: 2, name: 'Jane', email: 'jane@example.com' },
      ];

      const result = applyMask<User[]>(users, 'id,name');
      
      expect(result).toEqual([
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' },
      ]);
    });
  });
});