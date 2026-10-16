/**
 * readOnlyEntities.js (shared)
 * ----------------------------
 * A READ-ONLY VIEW of an entities client, so a preview can be PROVEN unable to write.
 *
 * The preview reads project evidence and image metadata. It must never create,
 * update, delete or publish anything. Rather than rely on the preview simply not
 * calling a write, this wraps the entities client so that every write method on every
 * entity THROWS before it reaches the platform, and records that it was attempted.
 * The wrapper never forwards a write, whatever is asked of it.
 *
 * Only reads pass through: get, list, filter, count, aggregate and subscribe-free
 * inspection. Any method not on the read list is treated as a write and refused, so a
 * write primitive added to the SDK later is blocked by default rather than allowed by
 * default.
 *
 * Pure: no SDK import. It wraps whatever client it is handed.
 */

/** The only entity methods a preview may call. Everything else is refused. */
export const READ_ONLY_METHODS = Object.freeze(['get', 'list', 'filter', 'count', 'aggregate']);

/** The error a refused write raises. */
export class ReadOnlyViolation extends Error {
  constructor(entity, method) {
    super(`READ-ONLY preview refused ${entity}.${method}: a comparison never writes.`);
    this.name = 'ReadOnlyViolation';
    this.entity = entity;
    this.method = method;
  }
}

/**
 * Wrap an entities client.
 *
 * @param {Object} entities — e.g. base44.entities
 * @returns {{ entities: Object, attempts: Array<{entity:string, method:string}>, reads: Array<{entity:string, method:string}> }}
 */
export function readOnlyEntities(entities) {
  const attempts = [];
  const reads = [];

  const wrapEntity = (name, entity) => new Proxy(entity ?? {}, {
    get(target, method) {
      const original = target[method];
      if (typeof method !== 'string') return original;
      if (READ_ONLY_METHODS.includes(method)) {
        if (typeof original !== 'function') return original;
        return (...args) => {
          reads.push({ entity: name, method });
          return original.apply(target, args);
        };
      }
      // Anything that is not a named read is a write: refused, and never forwarded.
      if (typeof original === 'function') {
        return () => {
          attempts.push({ entity: name, method });
          throw new ReadOnlyViolation(name, method);
        };
      }
      return original;
    },
  });

  const wrapped = new Proxy(entities ?? {}, {
    get(target, name) {
      if (typeof name !== 'string') return target[name];
      return wrapEntity(name, target[name]);
    },
  });

  return { entities: wrapped, attempts, reads };
}

export default readOnlyEntities;