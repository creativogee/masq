/**
 * masq: Flexible field masking and relation selection for REST, GraphQL, and data APIs.
 * @packageDocumentation
 */

/**
 * Parse a field mask string into an object structure, supporting aliasing with <alias>.
 * Examples:
 *   id,name => { id: true, name: true }
 *   model<models>(make<makes>) => { model: { __alias: 'models', make: { __alias: 'makes' } } }
 *   * => { '*': true }
 *   id,name,branch(*) => { id: true, name: true, branch: { '*': true } }
 *   *,-password => { '*': true, password: false }
 *   id,name,-secret,branch(id,name,-internal) => { id: true, name: true, secret: false, branch: { id: true, name: true, internal: false } }
 */
export function parseFieldsSpec(fieldsSpec: string): Record<string, any> {
  const result: Record<string, any> = {};
  if (fieldsSpec.trim() === '*') return { '*': true };
  const fields: string[] = [];
  let currentField = '';
  let parenthesesDepth = 0;
  for (let i = 0; i < fieldsSpec.length; i++) {
    const char = fieldsSpec[i];
    if (char === ',' && parenthesesDepth === 0) {
      if (currentField.trim()) fields.push(currentField.trim());
      currentField = '';
    } else {
      if (char === '(') parenthesesDepth++;
      else if (char === ')') parenthesesDepth--;
      currentField += char;
    }
  }
  if (currentField.trim()) fields.push(currentField.trim());
  for (const field of fields) {
    const aliasMatch = field.match(/^([\w]+)<([\w]+)>(.*)$/);
    if (aliasMatch) {
      const key = aliasMatch[1];
      const alias = aliasMatch[2];
      const rest = aliasMatch[3];
      if (key && alias) {
        if (rest && rest.startsWith('(')) {
          const nestedFields = rest.substring(1, rest.lastIndexOf(')'));
          result[key] = { __alias: alias, ...parseFieldsSpec(nestedFields) };
        } else {
          result[key] = { __alias: alias };
        }
      }
      continue;
    }
    const openParen = field.indexOf('(');
    if (openParen === -1) {
      if (field.startsWith('-')) {
        const fieldName = field.substring(1);
        result[fieldName] = false;
      } else {
        result[field] = true;
      }
    } else {
      const fieldName = field.substring(0, openParen);
      const closeParen = field.lastIndexOf(')');
      if (closeParen > openParen) {
        const nestedFields = field.substring(openParen + 1, closeParen);
        result[fieldName] = parseFieldsSpec(nestedFields);
      } else {
        result[fieldName] = parseFieldsSpec(field.substring(openParen + 1));
      }
    }
  }
  return result;
}

/**
 * Apply a field mask to an object or array, supporting aliasing with __alias.
 * If mask is a string, it is parsed first.
 * @param obj - The object or array to filter
 * @param mask - The field mask (object structure or string)
 * @returns Filtered object/array with possible key renaming
 */
export function applyFieldMask(obj: any, mask: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((item) => applyFieldMask(item, mask));
  let result: Record<string, any> = {};
  if (mask['*'] === true) {
    result = { ...obj };
    for (const key in mask) {
      if (key !== '*' && mask[key] === false) {
        delete result[key];
      } else if (key !== '*' && typeof mask[key] === 'object' && mask[key] !== null) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const value = obj[key];
          const alias = mask[key].__alias;
          const maskKeys = Object.keys(mask[key]).filter((k) => k !== '__alias');
          let masked: any;
          if (maskKeys.length === 0) {
            masked = value;
          } else {
            masked = Array.isArray(value)
              ? value.map((item: any) => applyFieldMask(item, mask[key]))
              : applyFieldMask(value, mask[key]);
          }
          if (alias) {
            result[alias] = masked;
            delete result[key];
          } else {
            result[key] = masked;
          }
        }
      }
    }
  } else {
    for (const key in mask) {
      if (mask[key] === false) continue;
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        const maskValue = mask[key];
        if (maskValue === true) {
          result[key] = value;
        } else if (typeof maskValue === 'object' && maskValue !== null) {
          const alias = maskValue.__alias;
          const maskKeys = Object.keys(maskValue).filter((k) => k !== '__alias');
          let masked: any;
          if (maskKeys.length === 0) {
            masked = value;
          } else {
            masked = Array.isArray(value)
              ? value.map((item: any) => applyFieldMask(item, maskValue))
              : applyFieldMask(value, maskValue);
          }
          if (alias) {
            result[alias] = masked;
          } else {
            result[key] = masked;
          }
        }
      }
    }
  }
  return result;
}

/**
 * Apply a field mask to an object or array, parsing the mask if needed.
 */
export function applyMask<T = any>(data: T, maskValue?: string | object): T {
  if (!maskValue) return data;
  let parsedMask: any = maskValue;
  if (typeof maskValue === 'string') {
    try {
      parsedMask = parseFieldsSpec(maskValue);
    } catch {
      return data;
    }
  }
  return applyFieldMask(data, parsedMask) as T;
}

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
 */
export function parseRelationsSpec(
  relationsStr: string | undefined,
  baseAlias: string,
): RelationJoin[] {
  if (!relationsStr) return [];
  const str = relationsStr || '';
  const result: RelationJoin[] = [];
  let i = 0;
  function parseLevel(parentPath: string): RelationJoin[] {
    const joins: RelationJoin[] = [];
    let buffer = '';
    while (i < str.length) {
      const char = str[i];
      if (char === '(') {
        i++;
        const parent = buffer.trim();
        const parentPathFull = parentPath ? `${parentPath}.${parent}` : `${baseAlias}.${parent}`;
        joins.push({ path: parentPathFull, alias: parent });
        joins.push(...parseLevel(parent));
        buffer = '';
      } else if (char === ')') {
        if (buffer.trim()) {
          const field = buffer.trim();
          const path = parentPath ? `${parentPath}.${field}` : `${baseAlias}.${field}`;
          joins.push({ path, alias: field });
        }
        buffer = '';
        i++;
        break;
      } else if (char === ',') {
        if (buffer.trim()) {
          const field = buffer.trim();
          const path = parentPath ? `${parentPath}.${field}` : `${baseAlias}.${field}`;
          joins.push({ path, alias: field });
        }
        buffer = '';
        i++;
      } else {
        buffer += char;
        i++;
      }
    }
    if (buffer.trim()) {
      const field = buffer.trim();
      const path = parentPath ? `${parentPath}.${field}` : `${baseAlias}.${field}`;
      joins.push({ path, alias: field });
    }
    return joins;
  }
  result.push(...parseLevel(''));
  return result;
}

/**
 * Validate a mask object against allowed fields structure.
 */
export function isValidMask(maskObj: any, allowed: any): boolean {
  if (typeof maskObj !== 'object' || maskObj === null) return false;

  for (const key of Object.keys(maskObj)) {
    // Allow wildcard
    if (key === '*' || key === '__alias') {
      continue;
    }

    // Check if key exists in allowed fields
    if (!(key in allowed)) return false;

    // Handle nested objects
    if (typeof maskObj[key] === 'object' && maskObj[key] !== null) {
      if (!isValidMask(maskObj[key], allowed[key])) return false;
    }

    // Handle boolean values (true for inclusion, false for omission)
    if (typeof maskObj[key] === 'boolean') {
      continue;
    }
  }

  return true;
}
