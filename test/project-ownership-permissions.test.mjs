import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const schema = JSON.parse(readFileSync(new URL('../base44/entities/Project.jsonc', import.meta.url), 'utf8'));
const dealer = { id: 'dealer-1', role: 'user', data: { account_id: 'tenant-a', access_level: 'FULL_ACCESS' } };
const admin = { id: 'admin-1', role: 'admin', data: {} };

function valueAt(object, path) {
  return path.split('.').reduce((value, key) => value?.[key], object);
}
function matchesRule(rule, row, user) {
  if (typeof rule === 'boolean') return rule;
  if (rule.$or) return rule.$or.some(item => matchesRule(item, row, user));
  if (rule.$and) return rule.$and.every(item => matchesRule(item, row, user));
  if (rule.user_condition) {
    return Object.entries(rule.user_condition).every(([key, expected]) => valueAt(user, key) === expected);
  }
  return Object.entries(rule).every(([key, expected]) => {
    const actual = valueAt(row, key);
    if (expected && typeof expected === 'object' && expected.$nin) return !expected.$nin.includes(actual);
    if (typeof expected === 'string' && expected.startsWith('{{user.')) {
      return actual === valueAt(user, expected.slice(7, -2));
    }
    return actual === expected;
  });
}

test('generic Project creation is denied to a dealer in either tenant and retained for central admins', () => {
  for (const accountId of ['tenant-a', 'tenant-b']) {
    assert.equal(matchesRule(schema.rls.create, { data: { account_id: accountId } }, dealer), false);
  }
  assert.equal(matchesRule(schema.rls.create, { data: { account_id: 'tenant-b' } }, admin), true);
});

test('dealer can edit normal design fields in their tenant but not a foreign project', () => {
  assert.equal(matchesRule(schema.rls.update, { data: { account_id: 'tenant-a' } }, dealer), true);
  assert.equal(matchesRule(schema.rls.update, { data: { account_id: 'tenant-b' } }, dealer), false);
  assert.equal(matchesRule(schema.rls.read, { data: { account_id: 'tenant-b' } }, dealer), false);
});

test('dealer cannot transfer account ownership or edit canonical dealer ID/name even in their own tenant', () => {
  for (const field of ['account_id', 'dealer_account_id', 'dealer_name']) {
    assert.equal(matchesRule(schema.properties[field].rls.write, { data: { account_id: 'tenant-a' } }, dealer), false);
    assert.equal(matchesRule(schema.properties[field].rls.write, { data: { account_id: 'tenant-a' } }, admin), true);
  }
});

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    return entry.isDirectory() ? sourceFiles(path) : /\.(jsx?|tsx?)$/.test(entry.name) ? [path] : [];
  });
}

test('browser project workflows contain no generic SDK Project create calls', () => {
  for (const path of sourceFiles(new URL('../src/', import.meta.url))) {
    const source = readFileSync(path, 'utf8');
    assert.doesNotMatch(source, /\bProject\s*\.\s*(create|bulkCreate)\s*\(/, path.pathname);
  }
  const dialog = readFileSync(new URL('../src/components/projects/NewProjectDialog.jsx', import.meta.url), 'utf8');
  const projects = readFileSync(new URL('../src/pages/Projects.jsx', import.meta.url), 'utf8');
  assert.match(dialog, /invoke\('createProfessionalProject',/);
  assert.match(projects, /invoke\('createProfessionalProject',/);
});

test('retired legacy autosave cannot create a project on save or page hide', () => {
  const source = readFileSync(new URL('../src/components/hooks/useProjectAutosave.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /["']POST["']/);
  assert.match(source, /if \(isHydrating \|\| !projectId\) return/);
});

test('version duplication remains within the existing project and cannot create a new Project', () => {
  for (const file of ['useProjectVersions.js', 'useProjectVersionsBatched.js']) {
    const source = readFileSync(new URL('../src/components/versions/' + file, import.meta.url), 'utf8');
    assert.match(source, /entities\.ProjectVersion\.create\(/);
    assert.doesNotMatch(source, /entities\.Project\.create\(/);
    assert.match(source, /account_id: accountId/);
  }
});
