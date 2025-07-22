import { parseFieldsSpec } from '../src/index';

describe('parseFieldsSpec', () => {
  describe('basic field parsing', () => {
    test('should parse simple comma-separated fields', () => {
      expect(parseFieldsSpec('id,name')).toEqual({
        id: true,
        name: true,
      });
    });

    test('should handle single field', () => {
      expect(parseFieldsSpec('id')).toEqual({
        id: true,
      });
    });

    test('should handle empty string', () => {
      expect(parseFieldsSpec('')).toEqual({});
    });

    test('should handle whitespace', () => {
      expect(parseFieldsSpec(' id , name ')).toEqual({
        id: true,
        name: true,
      });
    });
  });

  describe('wildcard support', () => {
    test('should handle wildcard selection', () => {
      expect(parseFieldsSpec('*')).toEqual({
        '*': true,
      });
    });

    test('should handle wildcard with exclusions', () => {
      expect(parseFieldsSpec('*,-password')).toEqual({
        '*': true,
        password: false,
      });
    });

    test('should handle wildcard with multiple exclusions', () => {
      expect(parseFieldsSpec('*,-password,-secret')).toEqual({
        '*': true,
        password: false,
        secret: false,
      });
    });
  });

  describe('field exclusions', () => {
    test('should handle field exclusions with minus prefix', () => {
      expect(parseFieldsSpec('id,name,-secret')).toEqual({
        id: true,
        name: true,
        secret: false,
      });
    });

    test('should handle only exclusions', () => {
      expect(parseFieldsSpec('-password,-secret')).toEqual({
        password: false,
        secret: false,
      });
    });
  });

  describe('nested field parsing', () => {
    test('should parse nested fields with parentheses', () => {
      expect(parseFieldsSpec('id,name,branch(id,name)')).toEqual({
        id: true,
        name: true,
        branch: {
          id: true,
          name: true,
        },
      });
    });

    test('should parse nested wildcard', () => {
      expect(parseFieldsSpec('id,name,branch(*)')).toEqual({
        id: true,
        name: true,
        branch: {
          '*': true,
        },
      });
    });

    test('should parse nested fields with exclusions', () => {
      expect(parseFieldsSpec('id,name,branch(id,name,-internal)')).toEqual({
        id: true,
        name: true,
        branch: {
          id: true,
          name: true,
          internal: false,
        },
      });
    });

    test('should handle deeply nested fields', () => {
      expect(parseFieldsSpec('user(profile(name,avatar),settings(theme))')).toEqual({
        user: {
          profile: {
            name: true,
            avatar: true,
          },
          settings: {
            theme: true,
          },
        },
      });
    });

    test('should handle empty nested parentheses', () => {
      expect(parseFieldsSpec('user()')).toEqual({
        user: {},
      });
    });
  });

  describe('aliasing support', () => {
    test('should parse simple alias', () => {
      expect(parseFieldsSpec('model<models>')).toEqual({
        model: {
          __alias: 'models',
        },
      });
    });

    test('should parse alias with nested fields', () => {
      expect(parseFieldsSpec('model<models>(make<makes>)')).toEqual({
        model: {
          __alias: 'models',
          make: {
            __alias: 'makes',
          },
        },
      });
    });

    test('should parse alias with nested fields and regular fields', () => {
      expect(parseFieldsSpec('model<models>(make<makes>,year)')).toEqual({
        model: {
          __alias: 'models',
          make: {
            __alias: 'makes',
          },
          year: true,
        },
      });
    });

    test('should handle mixed aliases and regular fields', () => {
      expect(parseFieldsSpec('id,model<models>,name')).toEqual({
        id: true,
        model: {
          __alias: 'models',
        },
        name: true,
      });
    });
  });

  describe('complex combinations', () => {
    test('should handle complex real-world example', () => {
      expect(parseFieldsSpec('id,name,*,-secret,user(id,profile(name,avatar),settings<userSettings>(theme,-internal))')).toEqual({
        id: true,
        name: true,
        '*': true,
        secret: false,
        user: {
          id: true,
          profile: {
            name: true,
            avatar: true,
          },
          settings: {
            __alias: 'userSettings',
            theme: true,
            internal: false,
          },
        },
      });
    });

    test('should handle multiple root-level aliases', () => {
      expect(parseFieldsSpec('car<cars>,model<models>,make<makes>')).toEqual({
        car: {
          __alias: 'cars',
        },
        model: {
          __alias: 'models',
        },
        make: {
          __alias: 'makes',
        },
      });
    });

    test('should handle nested aliases with wildcard', () => {
      expect(parseFieldsSpec('user<users>(profile<profiles>(*),settings(*))')).toEqual({
        user: {
          __alias: 'users',
          profile: {
            __alias: 'profiles',
            '*': true,
          },
          settings: {
            '*': true,
          },
        },
      });
    });
  });

  describe('edge cases', () => {
    test('should handle trailing comma', () => {
      expect(parseFieldsSpec('id,name,')).toEqual({
        id: true,
        name: true,
      });
    });

    test('should handle multiple consecutive commas', () => {
      expect(parseFieldsSpec('id,,name')).toEqual({
        id: true,
        name: true,
      });
    });

    test('should handle unmatched parentheses gracefully', () => {
      expect(parseFieldsSpec('id,name,branch(id')).toEqual({
        id: true,
        name: true,
        branch: {
          id: true,
        },
      });
    });

    test('should handle complex nested parentheses', () => {
      expect(parseFieldsSpec('a(b(c(d)))')).toEqual({
        a: {
          b: {
            c: {
              d: true,
            },
          },
        },
      });
    });
  });
});