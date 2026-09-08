import { project, projectColumn, projectRelation } from '../src/index';

describe('repo helpers', () => {
  const sqlSpec: Record<string, true> = {
    id: true,
    title: true,
    body: true,
  };

  describe('projectColumn', () => {
    const allowed: Record<string, true> = { id: true, name: true };

    it('returns all column fragments when requested is empty', () => {
      const a = projectColumn({ requested: undefined, allowed: sqlSpec });
      const b = projectColumn({ requested: '  ', allowed: sqlSpec });
      expect(a.errors).toEqual([]);
      expect(b.errors).toEqual([]);
      expect(a.selects).toEqual(new Set(['id', 'title', 'body']));
      expect(b.selects).toEqual(new Set(['id', 'title', 'body']));
    });

    it('maps requested top-level keys and always-includes id', () => {
      const r = projectColumn({ requested: 'title', allowed: sqlSpec });
      expect(r.errors).toEqual([]);
      expect(r.selects.has('title')).toBe(true);
      expect(r.selects.has('id')).toBe(true);
    });

    it('prefixes columns with alias', () => {
      const all = projectColumn({ requested: undefined, allowed: sqlSpec, alias: 'b' });
      const one = projectColumn({ requested: 'title', allowed: sqlSpec, alias: 'b' });
      expect(all.errors).toEqual([]);
      expect(all.selects).toEqual(new Set(['b.id', 'b.title', 'b.body']));
      expect(one.errors).toEqual([]);
      expect(one.selects.has('b.title')).toBe(true);
      expect(one.selects.has('b.id')).toBe(true);
    });

    it('returns errors when mask not in allow', () => {
      const r = projectColumn({ requested: 'nope', allowed: sqlSpec });
      expect(r.errors).toEqual(['Invalid or empty columns']);
      expect(r.selects.size).toBe(0);
    });

    it('expands wildcard to all allowed columns', () => {
      const r = projectColumn({ requested: '*', allowed: sqlSpec });
      expect(r.errors).toEqual([]);
      expect(r.selects).toEqual(new Set(['id', 'title', 'body']));
    });

    it('applies exclusions with wildcard', () => {
      const r = projectColumn({ requested: '*,-body', allowed: sqlSpec });
      expect(r.errors).toEqual([]);
      expect(r.selects).toEqual(new Set(['id', 'title']));
    });

    it('treats exclusion-only spec as implicit wildcard', () => {
      const r = projectColumn({ requested: '-body', allowed: sqlSpec });
      expect(r.errors).toEqual([]);
      expect(r.selects).toEqual(new Set(['id', 'title']));
    });

    it('does not select explicitly excluded columns', () => {
      const r = projectColumn({ requested: 'title,-body', allowed: sqlSpec });
      expect(r.errors).toEqual([]);
      expect(r.selects.has('body')).toBe(false);
      expect(r.selects).toEqual(new Set(['title', 'id']));
    });

    it('always re-adds id even when excluded', () => {
      const r = projectColumn({ requested: '*,-id', allowed: sqlSpec });
      expect(r.errors).toEqual([]);
      expect(r.selects.has('id')).toBe(true);
    });

    it('errors when every column is excluded and always is disabled', () => {
      const r = projectColumn({
        requested: '*,-id,-title,-body',
        allowed: sqlSpec,
        always: [],
      });
      expect(r.errors).toEqual(['Invalid or empty columns']);
      expect(r.selects.size).toBe(0);
    });

    it('accepts alias-only selection of a column', () => {
      const r = projectColumn({ requested: 'title<heading>', allowed: sqlSpec, always: [] });
      expect(r.errors).toEqual([]);
      expect(r.selects).toEqual(new Set(['title']));
    });

    it('rejects sub-selection of a column instead of throwing', () => {
      const r = projectColumn({ requested: 'title(x)', allowed: sqlSpec });
      expect(r.errors).toEqual(['Invalid or empty columns']);
      expect(r.selects.size).toBe(0);
    });

    it('rejects prototype-chain keys', () => {
      for (const bad of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
        const r = projectColumn({ requested: bad, allowed: sqlSpec });
        expect(r.errors).toEqual(['Invalid or empty columns']);
        expect(r.selects.size).toBe(0);
      }
    });

    it('rejects non-string requested (e.g. repeated query param) instead of throwing', () => {
      const r = projectColumn({ requested: ['title', 'body'] as any, allowed: sqlSpec });
      expect(r.errors).toEqual(['Invalid or empty columns']);
      expect(r.selects.size).toBe(0);
    });

    it('rejects excessively nested specs instead of throwing', () => {
      const deep = 'a('.repeat(100) + 'b' + ')'.repeat(100);
      const r = projectColumn({ requested: deep, allowed: sqlSpec });
      expect(r.errors).toEqual(['Invalid or empty columns']);
    });

    it('quotes identifiers containing uppercase letters', () => {
      const r = projectColumn({
        requested: 'createdAt',
        allowed: { id: true, createdAt: true },
        alias: 't',
      });
      expect(r.errors).toEqual([]);
      expect(r.selects).toEqual(new Set(['t."createdAt"', 't.id']));
    });

    it('ignores always keys not present in allowed', () => {
      const r = projectColumn({ requested: 'title', allowed: sqlSpec, always: ['ghost'] });
      expect(r.errors).toEqual([]);
      expect(r.selects).toEqual(new Set(['title']));
    });

    it('ignores manifest entries that are not exactly true', () => {
      const r = projectColumn({
        requested: undefined,
        allowed: { id: true, title: true, body: false as any },
      });
      expect(r.selects).toEqual(new Set(['id', 'title']));
    });

    describe('trusted-config injection guard', () => {
      it('rejects manifest keys that are not plain identifiers', () => {
        for (const bad of ['id"; DROP TABLE users; --', 'a.b', 'a b', '1abc', 'x`y', '', ' id']) {
          const allowed: Record<string, true> = { id: true, [bad]: true };
          const r = projectColumn({ requested: undefined, allowed });
          expect(r.errors).toHaveLength(1);
          expect(r.errors[0]).toMatch(/^Invalid column identifier: /);
          expect(r.selects.size).toBe(0);
        }
      });

      it('rejects manifest keys that are prototype names', () => {
        const allowed = JSON.parse('{"id":true,"__proto__":true}');
        const r = projectColumn({ requested: undefined, allowed });
        expect(r.errors).toEqual(['Invalid column identifier: __proto__']);
        const withCtor: Record<string, true> = JSON.parse('{"id":true,"constructor":true}');
        const r2 = projectColumn({ requested: undefined, allowed: withCtor });
        expect(r2.errors).toEqual(['Invalid column identifier: constructor']);
      });

      it('rejects table aliases that are not plain identifiers', () => {
        for (const bad of ['u; --', 'u"', 'a.b', '']) {
          const r = projectColumn({ requested: 'title', allowed: sqlSpec, alias: bad });
          expect(r.errors).toEqual([`Invalid table alias: ${bad}`]);
          expect(r.selects.size).toBe(0);
        }
      });

      it('truncates long untrusted text in error messages', () => {
        const long = 'x'.repeat(200);
        const r = projectColumn({ requested: undefined, allowed: { [`${long}"`]: true } });
        expect(r.errors[0]?.length).toBeLessThan(120);
        expect(r.errors[0]?.endsWith('…')).toBe(true);
      });

      it('accepts underscore and camelCase identifiers', () => {
        const r = projectColumn({
          requested: undefined,
          allowed: { _id: true, created_at: true, createdAt: true },
          alias: 't_1',
        });
        expect(r.errors).toEqual([]);
        expect(r.selects).toEqual(new Set(['t_1._id', 't_1.created_at', 't_1."createdAt"']));
      });
    });

    it('respects always: []', () => {
      const r = projectColumn({
        requested: 'title',
        allowed: sqlSpec,
        always: [],
      });
      expect(r.errors).toEqual([]);
      expect(r.selects).toEqual(new Set(['title']));
    });

    it('returns selects Set when mask is valid (relation-style allowed map)', () => {
      const r = projectColumn({
        requested: 'name',
        allowed,
        alias: 'root',
      });
      expect(r.errors).toEqual([]);
      expect(r.selects.has('root.name')).toBe(true);
      expect(r.selects.has('root.id')).toBe(true);
    });
  });

  describe('projectRelation', () => {
    const allowCarSeller = { car: true, seller: true } as const;

    it('builds allow paths from manifest keys and alias', () => {
      const r = projectRelation({
        requested: 'car',
        alias: 'a',
        allowed: allowCarSeller,
      });
      expect(r.errors).toEqual([]);
      expect([...r.joins]).toEqual(['a.car']);
    });

    it('allows nested suffix keys without repeating alias', () => {
      const r = projectRelation({
        requested: 'model(make)',
        alias: 'car',
        allowed: { model: true, 'model.make': true },
      });
      expect(r.errors).toEqual([]);
      expect([...r.joins].sort()).toEqual(['car.model', 'model.make'].sort());
    });

    it('returns error when alias is empty', () => {
      const r = projectRelation({
        requested: 'car',
        alias: '   ',
        allowed: allowCarSeller,
      });
      expect(r.errors).toEqual(['Relation alias is required']);
      expect(r.joins.size).toBe(0);
    });

    it('merges always fragments with requested', () => {
      const r = projectRelation({
        requested: 'car',
        always: ['seller'],
        alias: 'root',
        allowed: allowCarSeller,
      });
      expect(r.errors).toEqual([]);
      expect([...r.joins].sort()).toEqual(['root.car', 'root.seller']);
    });

    it('requested wins when always duplicates a path', () => {
      const r = projectRelation({
        requested: 'car',
        always: ['car'],
        alias: 'root',
        allowed: allowCarSeller,
      });
      expect(r.errors).toEqual([]);
      expect([...r.joins]).toEqual(['root.car']);
    });

    it('applies only always when requested is empty', () => {
      const r = projectRelation({
        requested: '',
        always: ['car'],
        alias: 'root',
        allowed: allowCarSeller,
      });
      expect(r.errors).toEqual([]);
      expect([...r.joins]).toEqual(['root.car']);
    });

    it('returns error when always adds a disallowed path', () => {
      const r = projectRelation({
        requested: 'car',
        always: ['nope'],
        alias: 'root',
        allowed: allowCarSeller,
      });
      expect(r.errors.some((e) => e.startsWith('Invalid relation path:'))).toBe(true);
      expect(r.joins.size).toBe(0);
    });

    it('returns error when allow-list empty', () => {
      const r = projectRelation({ requested: 'car', alias: 'a', allowed: {} });
      expect(r.errors).toEqual(['Relation allow-list must be non-empty']);
      expect(r.joins.size).toBe(0);
    });

    it('returns error strings for disallowed paths', () => {
      const r = projectRelation({
        requested: 'car,unknown',
        alias: 'root',
        allowed: allowCarSeller,
      });
      expect(r.errors.length).toBeGreaterThan(0);
      expect(r.errors[0]?.startsWith('Invalid relation path:')).toBe(true);
      expect(r.joins.size).toBe(0);
    });

    it('returns error on empty manifest key', () => {
      const r = projectRelation({
        requested: 'car',
        alias: 'a',
        allowed: { '': true, car: true },
      });
      expect(r.errors).toEqual(['Relation allow-list has an empty key']);
      expect(r.joins.size).toBe(0);
    });

    it('returns empty joins when nothing requested and no always', () => {
      const r = projectRelation({ requested: undefined, alias: 'a', allowed: allowCarSeller });
      expect(r.errors).toEqual([]);
      expect(r.joins.size).toBe(0);
    });

    it('rejects non-string requested instead of throwing', () => {
      const r = projectRelation({
        requested: ['car'] as any,
        alias: 'a',
        allowed: allowCarSeller,
      });
      expect(r.errors).toEqual(['Invalid relations specification']);
      expect(r.joins.size).toBe(0);
    });

    it('rejects excessively nested specs instead of throwing', () => {
      const deep = 'car('.repeat(100) + 'x' + ')'.repeat(100);
      const r = projectRelation({ requested: deep, alias: 'a', allowed: allowCarSeller });
      expect(r.errors).toEqual(['Invalid relations specification']);
      expect(r.joins.size).toBe(0);
    });

    it('skips blank and non-string always fragments', () => {
      const r = projectRelation({
        requested: 'car',
        always: ['', '  ', undefined as any, 'seller'],
        alias: 'root',
        allowed: allowCarSeller,
      });
      expect(r.errors).toEqual([]);
      expect([...r.joins].sort()).toEqual(['root.car', 'root.seller']);
    });

    it('rejects injection-style relation segments not in allow-list', () => {
      const r = projectRelation({
        requested: 'car; DROP TABLE users',
        alias: 'a',
        allowed: allowCarSeller,
      });
      expect(r.errors).toEqual(['Invalid relation path: a.car; DROP TABLE users']);
      expect(r.joins.size).toBe(0);
    });

    it('ignores manifest entries that are not exactly true', () => {
      const r = projectRelation({
        requested: 'seller',
        alias: 'a',
        allowed: { car: true, seller: false as any },
      });
      expect(r.errors).toEqual(['Invalid relation path: a.seller']);
    });

    describe('trusted-config injection guard', () => {
      it('rejects relation aliases that are not plain identifiers', () => {
        for (const bad of ['a; --', 'a"b', 'a.b', '1a']) {
          const r = projectRelation({ requested: 'car', alias: bad, allowed: allowCarSeller });
          expect(r.errors).toEqual([`Invalid relation alias: ${bad}`]);
          expect(r.joins.size).toBe(0);
        }
      });

      it('rejects manifest keys whose segments are not plain identifiers', () => {
        for (const bad of ['car"', 'model.ma ke', 'model..make', '.car', 'car.', 'x;y']) {
          const r = projectRelation({ requested: 'car', alias: 'a', allowed: { car: true, [bad]: true } });
          expect(r.errors).toEqual([`Invalid relation identifier: ${bad}`]);
          expect(r.joins.size).toBe(0);
        }
      });

      it('truncates long untrusted paths in error messages', () => {
        const r = projectRelation({
          requested: 'car,' + 'z'.repeat(300),
          alias: 'a',
          allowed: allowCarSeller,
        });
        expect(r.errors).toHaveLength(1);
        expect(r.errors[0]?.length).toBeLessThan(120);
        expect(r.errors[0]?.endsWith('…')).toBe(true);
      });
    });
  });

  describe('project', () => {
    const allowed: Record<string, true> = { id: true, name: true };
    const relAllowed = { car: true, seller: true } as const;

    it('merges field and relation results', () => {
      const r = project({
        column: { requested: 'name', allowed, alias: 'root' },
        relation: {
          requested: 'car',
          alias: 'root',
          allowed: relAllowed,
        },
      });
      expect(r.errors).toEqual([]);
      expect(r.selects.has('root.name')).toBe(true);
      expect([...r.joins]).toEqual(['root.car']);
    });

    it('collects errors from both sides', () => {
      const r = project({
        column: { requested: 'bad', allowed, alias: 'root' },
        relation: {
          requested: 'car,badrel',
          alias: 'root',
          allowed: { car: true },
        },
      });
      expect(r.errors.length).toBeGreaterThan(1);
      expect(r.selects.size).toBe(0);
      expect(r.joins.size).toBe(0);
    });

    it('handles column-only and relation-only input', () => {
      const c = project({ column: { requested: 'name', allowed, always: [] } });
      expect(c.errors).toEqual([]);
      expect(c.selects).toEqual(new Set(['name']));
      expect(c.joins.size).toBe(0);

      const rel = project({ relation: { requested: 'car', alias: 'root', allowed: relAllowed } });
      expect(rel.errors).toEqual([]);
      expect(rel.selects.size).toBe(0);
      expect([...rel.joins]).toEqual(['root.car']);
    });

    it('returns empty result for empty input', () => {
      const r = project({});
      expect(r).toEqual({ errors: [], selects: new Set(), joins: new Set() });
    });
  });
});
