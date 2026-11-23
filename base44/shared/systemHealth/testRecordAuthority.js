/**
 * testRecordAuthority.js (shared)
 * --------------------------------
 * Test-data isolation authority for Sound Proof System Health diagnostics.
 *
 * PROBLEM: Diagnostic tests previously created SystemHealthIncident and
 * MonitoredOperation records in Production, then cleaned up using broad
 * matching (by incident_reference, component, operation_type, or timestamps).
 * This deleted a real Production incident (INC-261123-F1LGAQ) because its
 * reference was targeted by test cleanup code.
 *
 * SOLUTION: Every test-created record carries an explicit `test_run_id`
 * marker — a unique non-null string generated for that specific test run.
 * Production code never sets `test_run_id` (it is always null on production
 * records). Cleanup functions in this module delete ONLY records whose
 * `test_run_id` exactly matches the supplied test-run identifier, and they
 * reject any attempt to clean up without a valid test-run ID.
 *
 * SAFETY GUARANTEES:
 *   1. Production records (test_run_id = null) can NEVER be deleted by
 *      test cleanup, regardless of what query the test uses.
 *   2. Each test run can only delete its own records — a different test
 *      run's records are preserved even if both ran in the same session.
 *   3. No broad matching by incident_reference, component, operation_type,
 *      error_code, project name, timestamps, or shared prefixes is used.
 *   4. A test_run_id that is null, empty, or does not start with the required
 *      prefix is rejected before any deletion occurs.
 *
 * Backend-only: receives the service-role SDK client from the calling test
 * or diagnostic function. No React, no browser APIs.
 */

/**
 * Prefix that all valid test-run IDs must start with. This makes test-run IDs
 * visually distinct from production identifiers and provides a quick assertion
 * check before any deletion.
 */
export const TEST_RUN_ID_PREFIX = 'test-run-';

/**
 * Create a unique test-run identifier for a diagnostic test session.
 * The caller should generate one ID per test run and reuse it for every
 * record created during that run, then pass it to the cleanup function.
 *
 * @param {string} [label] — optional short label for the test run
 * @returns {string} a unique test-run identifier starting with TEST_RUN_ID_PREFIX
 */
export function createTestRunId(label = '') {
  const safeLabel = String(label || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 20);
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${TEST_RUN_ID_PREFIX}${safeLabel ? safeLabel + '-' : ''}${timestamp}-${random}`;
}

/**
 * Assert that a test-run ID is valid for cleanup. Throws if it is null,
 * empty, or does not start with the required prefix. This is the gate
 * that prevents accidental deletion of production records.
 *
 * @param {string} testRunId
 * @throws {Error} if the test-run ID is invalid
 */
export function assertValidTestRunId(testRunId) {
  if (typeof testRunId !== 'string' || testRunId.length === 0) {
    throw new Error('test_run_id is required for test cleanup. Production records cannot be deleted.');
  }
  if (!testRunId.startsWith(TEST_RUN_ID_PREFIX)) {
    throw new Error(`test_run_id must start with "${TEST_RUN_ID_PREFIX}". Received: "${testRunId}".`);
  }
}

/**
 * Delete all SystemHealthIncident records belonging to a specific test run.
 * Only records with an exact `test_run_id` match are deleted. Production
 * records (test_run_id = null) are never touched.
 *
 * @param {Object} serviceClient — base44 SDK client with asServiceRole
 * @param {string} testRunId — the test-run identifier from createTestRunId
 * @returns {Promise<{ deleted: number, checked: number }>}
 */
export async function deleteTestIncidents(serviceClient, testRunId) {
  assertValidTestRunId(testRunId);

  const result = await serviceClient.asServiceRole.entities.SystemHealthIncident.filter(
    { test_run_id: testRunId },
    { limit: 200 },
  );
  const records = result?.items || (Array.isArray(result) ? result : []);
  let deleted = 0;
  for (const record of records) {
    // Double-check: never delete a record without a matching test_run_id.
    if (record.test_run_id === testRunId) {
      await serviceClient.asServiceRole.entities.SystemHealthIncident.delete(record.id);
      deleted++;
    }
  }
  return { deleted, checked: records.length };
}

/**
 * Delete all MonitoredOperation records belonging to a specific test run.
 * Only records with an exact `test_run_id` match are deleted. Production
 * records (test_run_id = null) are never touched.
 *
 * @param {Object} serviceClient — base44 SDK client with asServiceRole
 * @param {string} testRunId — the test-run identifier from createTestRunId
 * @returns {Promise<{ deleted: number, checked: number }>}
 */
export async function deleteTestOperations(serviceClient, testRunId) {
  assertValidTestRunId(testRunId);

  const result = await serviceClient.asServiceRole.entities.MonitoredOperation.filter(
    { test_run_id: testRunId },
    { limit: 200 },
  );
  const records = result?.items || (Array.isArray(result) ? result : []);
  let deleted = 0;
  for (const record of records) {
    if (record.test_run_id === testRunId) {
      await serviceClient.asServiceRole.entities.MonitoredOperation.delete(record.id);
      deleted++;
    }
  }
  return { deleted, checked: records.length };
}

/**
 * Convenience: delete both incidents and operations for a test run.
 *
 * @param {Object} serviceClient — base44 SDK client with asServiceRole
 * @param {string} testRunId — the test-run identifier from createTestRunId
 * @returns {Promise<{ incidents: { deleted: number, checked: number }, operations: { deleted: number, checked: number } }>}
 */
export async function deleteAllTestRecords(serviceClient, testRunId) {
  const [incidents, operations] = await Promise.all([
    deleteTestIncidents(serviceClient, testRunId),
    deleteTestOperations(serviceClient, testRunId),
  ]);
  return { incidents, operations };
}

export default {
  TEST_RUN_ID_PREFIX,
  createTestRunId,
  assertValidTestRunId,
  deleteTestIncidents,
  deleteTestOperations,
  deleteAllTestRecords,
};