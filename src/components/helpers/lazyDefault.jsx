// components/helpers/lazyDefault.js
export function lazyDefault(loader, key) {
  return loader().then(mod => ({ default: (mod).default ?? (mod)[key] }));
}