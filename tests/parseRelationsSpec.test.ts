import { parseRelationsSpec, RelationJoin } from '../src/index';

describe('parseRelationsSpec', () => {
  describe('basic relation parsing', () => {
    test('should parse simple relations', () => {
      const result = parseRelationsSpec('model,make', 'car');

      expect(result).toEqual([
        { path: 'car.model', alias: 'model' },
        { path: 'car.make', alias: 'make' },
      ]);
    });

    test('should handle single relation', () => {
      const result = parseRelationsSpec('model', 'car');

      expect(result).toEqual([{ path: 'car.model', alias: 'model' }]);
    });

    test('should handle empty or undefined relation string', () => {
      expect(parseRelationsSpec('', 'car')).toEqual([]);
      expect(parseRelationsSpec(undefined, 'car')).toEqual([]);
    });
  });

  describe('nested relation parsing', () => {
    test('should parse nested relations', () => {
      const result = parseRelationsSpec('model(make)', 'car');

      expect(result).toEqual([
        { path: 'car.model', alias: 'model' },
        { path: 'model.make', alias: 'make' },
      ]);
    });

    test('should parse multiple nested relations', () => {
      const result = parseRelationsSpec('model(make,category)', 'car');

      expect(result).toEqual([
        { path: 'car.model', alias: 'model' },
        { path: 'model.make', alias: 'make' },
        { path: 'model.category', alias: 'category' },
      ]);
    });

    test('should parse deeply nested relations', () => {
      const result = parseRelationsSpec('model(make(country))', 'car');

      expect(result).toEqual([
        { path: 'car.model', alias: 'model' },
        { path: 'model.make', alias: 'make' },
        { path: 'make.country', alias: 'country' },
      ]);
    });

    test('should parse complex nested structure', () => {
      const result = parseRelationsSpec('model(make(country),category),bodyType', 'car');

      expect(result).toEqual([
        { path: 'car.model', alias: 'model' },
        { path: 'model.make', alias: 'make' },
        { path: 'make.country', alias: 'country' },
        { path: 'model.category', alias: 'category' },
        { path: 'car.bodyType', alias: 'bodyType' },
      ]);
    });
  });

  describe('mixed flat and nested relations', () => {
    test('should parse mixed flat and nested relations', () => {
      const result = parseRelationsSpec('model(make),bodyType,category', 'car');

      expect(result).toEqual([
        { path: 'car.model', alias: 'model' },
        { path: 'model.make', alias: 'make' },
        { path: 'car.bodyType', alias: 'bodyType' },
        { path: 'car.category', alias: 'category' },
      ]);
    });

    test('should handle multiple nested relations with flat relations', () => {
      const result = parseRelationsSpec('owner,model(make,category),color', 'car');

      expect(result).toEqual([
        { path: 'car.owner', alias: 'owner' },
        { path: 'car.model', alias: 'model' },
        { path: 'model.make', alias: 'make' },
        { path: 'model.category', alias: 'category' },
        { path: 'car.color', alias: 'color' },
      ]);
    });
  });

  describe('different base aliases', () => {
    test('should use custom base alias', () => {
      const result = parseRelationsSpec('profile,posts', 'user');

      expect(result).toEqual([
        { path: 'user.profile', alias: 'profile' },
        { path: 'user.posts', alias: 'posts' },
      ]);
    });

    test('should use custom base alias with nested relations', () => {
      const result = parseRelationsSpec('profile(settings),posts(comments)', 'user');

      expect(result).toEqual([
        { path: 'user.profile', alias: 'profile' },
        { path: 'profile.settings', alias: 'settings' },
        { path: 'user.posts', alias: 'posts' },
        { path: 'posts.comments', alias: 'comments' },
      ]);
    });
  });

  describe('whitespace handling', () => {
    test('should handle whitespace around relations', () => {
      const result = parseRelationsSpec(' model , make ', 'car');

      expect(result).toEqual([
        { path: 'car.model', alias: 'model' },
        { path: 'car.make', alias: 'make' },
      ]);
    });

    test('should handle whitespace in nested relations', () => {
      const result = parseRelationsSpec('model( make , category )', 'car');

      expect(result).toEqual([
        { path: 'car.model', alias: 'model' },
        { path: 'model.make', alias: 'make' },
        { path: 'model.category', alias: 'category' },
      ]);
    });

    test('should handle whitespace in complex nested structure', () => {
      const result = parseRelationsSpec(
        ' model ( make ( country ) , category ) , bodyType ',
        'car',
      );

      expect(result).toEqual([
        { path: 'car.model', alias: 'model' },
        { path: 'model.make', alias: 'make' },
        { path: 'make.country', alias: 'country' },
        { path: 'model.category', alias: 'category' },
        { path: 'car.bodyType', alias: 'bodyType' },
      ]);
    });
  });

  describe('edge cases', () => {
    test('should handle empty nested parentheses', () => {
      const result = parseRelationsSpec('model(),bodyType', 'car');

      expect(result).toEqual([
        { path: 'car.model', alias: 'model' },
        { path: 'car.bodyType', alias: 'bodyType' },
      ]);
    });

    test('should handle trailing comma', () => {
      const result = parseRelationsSpec('model,make,', 'car');

      expect(result).toEqual([
        { path: 'car.model', alias: 'model' },
        { path: 'car.make', alias: 'make' },
      ]);
    });

    test('should handle multiple consecutive commas', () => {
      const result = parseRelationsSpec('model,,make', 'car');

      expect(result).toEqual([
        { path: 'car.model', alias: 'model' },
        { path: 'car.make', alias: 'make' },
      ]);
    });

    test('should handle unmatched opening parenthesis', () => {
      const result = parseRelationsSpec('model(make,bodyType', 'car');

      expect(result).toEqual([
        { path: 'car.model', alias: 'model' },
        { path: 'model.make', alias: 'make' },
        { path: 'model.bodyType', alias: 'bodyType' },
      ]);
    });

    test('should handle nested parentheses edge case', () => {
      const result = parseRelationsSpec('model(make(country,region),category)', 'car');

      expect(result).toEqual([
        { path: 'car.model', alias: 'model' },
        { path: 'model.make', alias: 'make' },
        { path: 'make.country', alias: 'country' },
        { path: 'make.region', alias: 'region' },
        { path: 'model.category', alias: 'category' },
      ]);
    });
  });

  describe('real-world examples', () => {
    test('should parse car-related relations', () => {
      const result = parseRelationsSpec(
        'model(make(country),category),bodyType,color,owner(profile)',
        'car',
      );

      expect(result).toEqual([
        { path: 'car.model', alias: 'model' },
        { path: 'model.make', alias: 'make' },
        { path: 'make.country', alias: 'country' },
        { path: 'model.category', alias: 'category' },
        { path: 'car.bodyType', alias: 'bodyType' },
        { path: 'car.color', alias: 'color' },
        { path: 'car.owner', alias: 'owner' },
        { path: 'owner.profile', alias: 'profile' },
      ]);
    });

    test('should parse user-related relations', () => {
      const result = parseRelationsSpec(
        'profile(avatar,settings(preferences)),posts(comments(author)),role',
        'user',
      );

      expect(result).toEqual([
        { path: 'user.profile', alias: 'profile' },
        { path: 'profile.avatar', alias: 'avatar' },
        { path: 'profile.settings', alias: 'settings' },
        { path: 'settings.preferences', alias: 'preferences' },
        { path: 'user.posts', alias: 'posts' },
        { path: 'posts.comments', alias: 'comments' },
        { path: 'comments.author', alias: 'author' },
        { path: 'user.role', alias: 'role' },
      ]);
    });

    test('should parse e-commerce product relations', () => {
      const result = parseRelationsSpec(
        'category(parent),brand,reviews(author),variants(color,size)',
        'product',
      );

      expect(result).toEqual([
        { path: 'product.category', alias: 'category' },
        { path: 'category.parent', alias: 'parent' },
        { path: 'product.brand', alias: 'brand' },
        { path: 'product.reviews', alias: 'reviews' },
        { path: 'reviews.author', alias: 'author' },
        { path: 'product.variants', alias: 'variants' },
        { path: 'variants.color', alias: 'color' },
        { path: 'variants.size', alias: 'size' },
      ]);
    });
  });

  describe('type checking', () => {
    test('should return correct TypeScript interface', () => {
      const result = parseRelationsSpec('model,make', 'car');

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('path');
      expect(result[0]).toHaveProperty('alias');
      expect(typeof result[0].path).toBe('string');
      expect(typeof result[0].alias).toBe('string');
    });

    test('should satisfy RelationJoin interface', () => {
      const result = parseRelationsSpec('model(make)', 'car');

      const join: RelationJoin = result[0];
      expect(join.path).toBe('car.model');
      expect(join.alias).toBe('model');
    });
  });
});
