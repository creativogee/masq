import {
  MAX_SPEC_DEPTH,
  applyFieldMask,
  applyMask,
  isValidMask,
  parseFieldsSpec,
  parseRelationsSpec,
} from '../src/index';

const user = {
  id: 1,
  name: 'John',
  password: 'hunter2',
  profile: { avatar: 'a.jpg', ssn: '123-45-6789' },
};

describe('security hardening', () => {
  describe('parseFieldsSpec', () => {
    test('drops __proto__, constructor and prototype as field names', () => {
      const parsed = parseFieldsSpec('id,__proto__,constructor,prototype,-__proto__');
      expect(Object.keys(parsed)).toEqual(['id']);
      expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    });

    test('drops dangerous nested field names and does not replace the prototype', () => {
      const parsed = parseFieldsSpec('id,__proto__(polluted),constructor(prototype(polluted))');
      expect(parsed).toEqual({ id: true });
      expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
      expect(({} as any).polluted).toBeUndefined();
    });

    test('drops dangerous alias names', () => {
      expect(parseFieldsSpec('id<__proto__>,name<constructor>(x),email')).toEqual({ email: true });
      expect(parseFieldsSpec('__proto__<safe>,id')).toEqual({ id: true });
    });

    test('returns empty object for non-string input', () => {
      expect(parseFieldsSpec(undefined as any)).toEqual({});
      expect(parseFieldsSpec(null as any)).toEqual({});
      expect(parseFieldsSpec(['id', 'name'] as any)).toEqual({});
      expect(parseFieldsSpec(42 as any)).toEqual({});
    });

    test('accepts nesting up to MAX_SPEC_DEPTH', () => {
      const spec = 'a('.repeat(MAX_SPEC_DEPTH) + 'b' + ')'.repeat(MAX_SPEC_DEPTH);
      expect(() => parseFieldsSpec(spec)).not.toThrow();
    });

    test('throws RangeError beyond MAX_SPEC_DEPTH instead of overflowing the stack', () => {
      const spec = 'a('.repeat(MAX_SPEC_DEPTH + 1) + 'b' + ')'.repeat(MAX_SPEC_DEPTH + 1);
      expect(() => parseFieldsSpec(spec)).toThrow(RangeError);
      expect(() => parseFieldsSpec('a('.repeat(20000))).toThrow(RangeError);
    });

    test('handles unmatched parenthesis after alias', () => {
      expect(parseFieldsSpec('model<m>(id')).toEqual({ model: { __alias: 'm', id: true } });
    });
  });

  describe('applyFieldMask', () => {
    test('ignores inherited mask keys', () => {
      const proto = { password: true };
      const mask = Object.create(proto);
      mask.id = true;
      expect(applyFieldMask(user, mask)).toEqual({ id: 1 });
    });

    test('never writes dangerous keys to the result (whitelist branch)', () => {
      const mask = JSON.parse('{"id":true,"__proto__":{"polluted":true},"constructor":true}');
      const data = JSON.parse('{"id":1,"__proto__":{"x":1},"constructor":"c"}');
      const result = applyFieldMask(data, mask);
      expect(result).toEqual({ id: 1 });
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
      expect(({} as any).polluted).toBeUndefined();
    });

    test('never writes dangerous keys to the result (wildcard branch)', () => {
      const mask = JSON.parse('{"*":true,"__proto__":{"a":true}}');
      const data = JSON.parse('{"id":1,"__proto__":{"a":1,"b":2}}');
      const result = applyFieldMask(data, mask);
      expect(result.id).toBe(1);
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    });

    test('ignores dangerous aliases', () => {
      const result = applyFieldMask(user, { profile: { __alias: '__proto__', avatar: true } });
      expect(result).toEqual({ profile: { avatar: 'a.jpg' } });
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);

      const wild = applyFieldMask(user, { '*': true, profile: { __alias: 'constructor', avatar: true } });
      expect(wild.profile).toEqual({ avatar: 'a.jpg' });
      expect(Object.getPrototypeOf(wild)).toBe(Object.prototype);
    });

    test('ignores non-string aliases', () => {
      const result = applyFieldMask(user, { profile: { __alias: 42, avatar: true } });
      expect(result).toEqual({ profile: { avatar: 'a.jpg' } });
    });

    test('parses string masks as documented', () => {
      expect(applyFieldMask(user, 'id,name')).toEqual({ id: 1, name: 'John' });
    });

    test('yields empty result for non-object masks rather than leaking data', () => {
      expect(applyFieldMask(user, null)).toEqual({});
      expect(applyFieldMask(user, undefined)).toEqual({});
      expect(applyFieldMask(user, 42)).toEqual({});
      expect(applyFieldMask(user, ['id'])).toEqual({});
      expect(applyFieldMask([user], null)).toEqual([{}]);
    });

    test('does not drop a field aliased to its own name in wildcard mode', () => {
      expect(applyFieldMask(user, { '*': true, profile: { __alias: 'profile', avatar: true } })).toEqual({
        id: 1,
        name: 'John',
        password: 'hunter2',
        profile: { avatar: 'a.jpg' },
      });
    });
  });

  describe('applyMask', () => {
    test('fails closed when the mask string cannot be parsed', () => {
      const result = applyMask(user, 'a('.repeat(MAX_SPEC_DEPTH + 5));
      expect(result).toEqual({});
      expect((result as any).password).toBeUndefined();
    });

    test('fails closed for arrays too', () => {
      expect(applyMask([user, user], 'a('.repeat(MAX_SPEC_DEPTH + 5))).toEqual([{}, {}]);
    });

    test('accepts null mask and returns data unchanged', () => {
      expect(applyMask(user, null)).toBe(user);
    });
  });

  describe('isValidMask', () => {
    const allowed = {
      id: true,
      name: true,
      profile: { avatar: true, bio: true },
      open: { '*': true, a: true },
      denied: false,
    };

    test('rejects wildcard unless explicitly allowed', () => {
      expect(isValidMask({ '*': true }, allowed)).toBe(false);
      expect(isValidMask({ '*': true, password: false }, allowed)).toBe(false);
      expect(isValidMask({ '*': true }, { ...allowed, '*': true })).toBe(true);
    });

    test('rejects nested wildcard unless explicitly allowed at that level', () => {
      expect(isValidMask({ profile: { '*': true } }, allowed)).toBe(false);
      expect(isValidMask({ open: { '*': true } }, allowed)).toBe(true);
      expect(isValidMask({ open: { '*': true, a: false } }, allowed)).toBe(true);
    });

    test('rejects empty nested mask (pass-through) unless wildcard is allowed there', () => {
      // `profile()` would return the entire profile including fields not in the allow-list.
      expect(isValidMask({ profile: {} }, allowed)).toBe(false);
      expect(isValidMask({ profile: { __alias: 'p' } }, allowed)).toBe(false);
      expect(isValidMask({ open: {} }, allowed)).toBe(true);
      expect(isValidMask({ open: { __alias: 'o' } }, allowed)).toBe(true);
    });

    test('accepts alias-only mask on a leaf field', () => {
      expect(isValidMask({ id: { __alias: 'identifier' } }, allowed)).toBe(true);
    });

    test('rejects sub-selection of a leaf field instead of throwing', () => {
      expect(() => isValidMask({ id: { x: true } }, allowed)).not.toThrow();
      expect(isValidMask({ id: { x: true } }, allowed)).toBe(false);
      expect(isValidMask({ id: { '*': true } }, allowed)).toBe(false);
    });

    test('rejects prototype-chain keys', () => {
      for (const key of ['constructor', 'toString', 'hasOwnProperty', 'valueOf', '__proto__']) {
        expect(isValidMask({ [key]: true }, allowed)).toBe(false);
        expect(isValidMask({ [key]: { x: true } }, allowed)).toBe(false);
      }
    });

    test('rejects dangerous keys even when present as own properties of allowed', () => {
      const evilAllowed = JSON.parse('{"id":true,"__proto__":true,"constructor":true}');
      expect(isValidMask({ id: true }, evilAllowed)).toBe(true);
      expect(isValidMask(JSON.parse('{"__proto__":true}'), evilAllowed)).toBe(false);
      expect(isValidMask({ constructor: true }, evilAllowed)).toBe(false);
    });

    test('rejects keys whose allowed value is not true or an object', () => {
      expect(isValidMask({ denied: true }, allowed)).toBe(false);
      expect(isValidMask({ id: true }, { id: 'yes' })).toBe(false);
      expect(isValidMask({ id: true }, { id: null })).toBe(false);
    });

    test('rejects mask values that are neither boolean nor object', () => {
      expect(isValidMask({ id: 'yes' }, allowed)).toBe(false);
      expect(isValidMask({ id: null }, allowed)).toBe(false);
      expect(isValidMask({ id: [true] }, allowed)).toBe(false);
    });

    test('accepts false (exclusion) values', () => {
      expect(isValidMask({ id: false, name: true }, allowed)).toBe(true);
    });

    test('rejects non-object allowed', () => {
      expect(isValidMask({ id: true }, null)).toBe(false);
      expect(isValidMask({ id: true }, true)).toBe(false);
      expect(isValidMask({ id: true }, [])).toBe(false);
    });

    test('rejects array masks', () => {
      expect(isValidMask(['id'], allowed)).toBe(false);
    });

    test('validation + application does not leak disallowed fields', () => {
      const allow = { id: true, profile: { avatar: true } };
      for (const spec of ['*', 'profile()', 'profile<p>', 'profile(*)', 'password', 'profile(ssn)']) {
        const mask = parseFieldsSpec(spec);
        expect(isValidMask(mask, allow)).toBe(false);
      }
      // Dangerous keys are stripped at parse time; the surviving mask must not leak anything.
      expect(applyFieldMask(user, parseFieldsSpec('constructor,__proto__'))).toEqual({});
      const ok = parseFieldsSpec('id,profile(avatar)');
      expect(isValidMask(ok, allow)).toBe(true);
      expect(applyFieldMask(user, ok)).toEqual({ id: 1, profile: { avatar: 'a.jpg' } });
    });
  });

  describe('parseRelationsSpec', () => {
    test('returns empty for non-string input', () => {
      expect(parseRelationsSpec(['a'] as any, 'car')).toEqual([]);
      expect(parseRelationsSpec(42 as any, 'car')).toEqual([]);
    });

    test('accepts nesting up to MAX_SPEC_DEPTH', () => {
      const spec = 'a('.repeat(MAX_SPEC_DEPTH) + 'b' + ')'.repeat(MAX_SPEC_DEPTH);
      expect(() => parseRelationsSpec(spec, 'car')).not.toThrow();
    });

    test('throws RangeError beyond MAX_SPEC_DEPTH', () => {
      const spec = 'a('.repeat(MAX_SPEC_DEPTH + 1) + 'b' + ')'.repeat(MAX_SPEC_DEPTH + 1);
      expect(() => parseRelationsSpec(spec, 'car')).toThrow(RangeError);
      expect(() => parseRelationsSpec('a('.repeat(20000), 'car')).toThrow(RangeError);
    });
  });
});
