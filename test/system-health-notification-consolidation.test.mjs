import assert from 'node:assert';

// ── Module under test: notificationGroupKey ──
const {
  normalizeFailureMechanism,
  computeNotificationGroupKey,
} = await import('../base44/shared/systemHealth/notificationGroupKey.js');

// ── Module under test: notificationRules ──
const {
  NOTIFICATION_ACTION,
  determineNotificationAction,
} = await import('../base44/shared/systemHealth/notificationRules.js');

// ── Module under test: incidentEmailBuilder ──
const {
  buildEmailSubject,
  buildEmailDescription,
} = await import('../base44/shared/systemHealth/incidentEmailBuilder.js');

// ═══════════════════════════════════════════════════════════════════
// 1. Failure mechanism normalization
// ═══════════════════════════════════════════════════════════════════

function testMechanismNormalization() {
  // HTTP 429 maps to ENTITY_RATE_LIMIT_429 regardless of error code
  assert.strictEqual(
    normalizeFailureMechanism({ error_code: 'DATA_REQUEST_FAILED', http_status: 429 }),
    'ENTITY_RATE_LIMIT_429',
    '429 with DATA_REQUEST_FAILED → ENTITY_RATE_LIMIT_429',
  );
  assert.strictEqual(
    normalizeFailureMechanism({ error_code: 'PROJECT_LOAD_FAILED', http_status: 429 }),
    'ENTITY_RATE_LIMIT_429',
    '429 with PROJECT_LOAD_FAILED → ENTITY_RATE_LIMIT_429 (consequential grouping)',
  );
  assert.strictEqual(
    normalizeFailureMechanism({ error_code: 'UNHANDLED_ERROR', http_status: 429 }),
    'ENTITY_RATE_LIMIT_429',
    '429 with any error code → ENTITY_RATE_LIMIT_429',
  );

  // Non-429: error code is the mechanism
  assert.strictEqual(
    normalizeFailureMechanism({ error_code: 'AUTHENTICATION_CONTEXT_FAILED', http_status: 500 }),
    'AUTHENTICATION_CONTEXT_FAILED',
    'Auth failure with 500 → AUTHENTICATION_CONTEXT_FAILED',
  );
  assert.strictEqual(
    normalizeFailureMechanism({ error_code: 'DATA_REQUEST_FAILED', http_status: 500 }),
    'DATA_REQUEST_FAILED',
    '500 → DATA_REQUEST_FAILED (not a rate limit)',
  );
  assert.strictEqual(
    normalizeFailureMechanism({ error_code: 'PROJECT_LOAD_FAILED' }),
    'PROJECT_LOAD_FAILED',
    'No http_status → error code is the mechanism',
  );

  // Ambiguous: no http_status, no error code
  assert.strictEqual(
    normalizeFailureMechanism({}),
    'UNKNOWN',
    'No evidence → UNKNOWN',
  );

  console.log('  ✓ Mechanism normalization (7 assertions)');
}

// ═══════════════════════════════════════════════════════════════════
// 2. Notification group key computation
// ═══════════════════════════════════════════════════════════════════

function testGroupKey() {
  // Same mechanism + same env + same account → same key
  const key1 = computeNotificationGroupKey({
    failure_mechanism: 'ENTITY_RATE_LIMIT_429',
    runtime_environment: 'preview',
    account_id: 'acc-123',
  });
  const key2 = computeNotificationGroupKey({
    failure_mechanism: 'ENTITY_RATE_LIMIT_429',
    runtime_environment: 'preview',
    account_id: 'acc-123',
  });
  assert.strictEqual(key1, key2, 'Same inputs → same key');
  assert.strictEqual(key1, 'ENTITY_RATE_LIMIT_429::preview::acc-123', 'Correct key format');

  // Preview vs production: different keys
  const prodKey = computeNotificationGroupKey({
    failure_mechanism: 'ENTITY_RATE_LIMIT_429',
    runtime_environment: 'production',
    account_id: 'acc-123',
  });
  assert.notStrictEqual(key1, prodKey, 'Preview and production never share a group');

  // Different accounts: different keys
  const otherAccountKey = computeNotificationGroupKey({
    failure_mechanism: 'ENTITY_RATE_LIMIT_429',
    runtime_environment: 'preview',
    account_id: 'acc-456',
  });
  assert.notStrictEqual(key1, otherAccountKey, 'Different accounts never share a group');

  // 'deployed' normalises to 'production'
  const deployedKey = computeNotificationGroupKey({
    failure_mechanism: 'ENTITY_RATE_LIMIT_429',
    runtime_environment: 'deployed',
    account_id: 'acc-123',
  });
  assert.strictEqual(deployedKey, prodKey, "'deployed' normalises to 'production'");

  // Null account → 'internal'
  const internalKey = computeNotificationGroupKey({
    failure_mechanism: 'AUTHENTICATION_CONTEXT_FAILED',
    runtime_environment: 'production',
    account_id: null,
  });
  assert.strictEqual(internalKey, 'AUTHENTICATION_CONTEXT_FAILED::production::internal', 'Null account → internal');

  // Different mechanisms → different keys (even same env + account)
  const authKey = computeNotificationGroupKey({
    failure_mechanism: 'AUTHENTICATION_CONTEXT_FAILED',
    runtime_environment: 'preview',
    account_id: 'acc-123',
  });
  assert.notStrictEqual(key1, authKey, 'Different mechanisms → different groups');

  // Cross-operation, cross-page, cross-project grouping:
  // A 429 on Project.filter and a 429 on AccountUserAudit.list share the same key
  const filterKey = computeNotificationGroupKey({
    failure_mechanism: normalizeFailureMechanism({ error_code: 'DATA_REQUEST_FAILED', http_status: 429 }),
    runtime_environment: 'preview',
    account_id: 'admin-acc',
  });
  const listKey = computeNotificationGroupKey({
    failure_mechanism: normalizeFailureMechanism({ error_code: 'DATA_REQUEST_FAILED', http_status: 429 }),
    runtime_environment: 'preview',
    account_id: 'admin-acc',
  });
  assert.strictEqual(filterKey, listKey, 'Same 429 mechanism across different operations → same group');

  console.log('  ✓ Group key computation (8 assertions)');
}

// ═══════════════════════════════════════════════════════════════════
// 3. Notification action determination
// ═══════════════════════════════════════════════════════════════════

function testNotificationAction() {
  const now = Date.now();

  // New group: no initial notification claimed → INITIAL
  assert.strictEqual(
    determineNotificationAction(
      { initial_notification_claimed: false, incident_status: 'open' },
      { severity: 'high', runtime_environment: 'preview' },
      now,
    ),
    NOTIFICATION_ACTION.INITIAL,
    'New group → INITIAL',
  );

  // Already claimed, same severity → SKIP
  assert.strictEqual(
    determineNotificationAction(
      { initial_notification_claimed: true, highest_severity: 'high', incident_status: 'open', last_alert_sent_at: new Date(now - 1000).toISOString() },
      { severity: 'high', runtime_environment: 'preview' },
      now,
    ),
    NOTIFICATION_ACTION.SKIP,
    'Already claimed, same severity → SKIP',
  );

  // Severity escalation to critical → ESCALATION
  assert.strictEqual(
    determineNotificationAction(
      { initial_notification_claimed: true, highest_severity: 'high', incident_status: 'open', last_alert_sent_at: new Date(now - 1000).toISOString() },
      { severity: 'critical', runtime_environment: 'preview' },
      now,
    ),
    NOTIFICATION_ACTION.ESCALATION,
    'High → critical → ESCALATION',
  );

  // Not an escalation: medium → high (still not critical)
  assert.strictEqual(
    determineNotificationAction(
      { initial_notification_claimed: true, highest_severity: 'medium', incident_status: 'open', last_alert_sent_at: new Date(now - 1000).toISOString() },
      { severity: 'high', runtime_environment: 'preview' },
      now,
    ),
    NOTIFICATION_ACTION.SKIP,
    'Medium → high is NOT an escalation (only critical triggers it)',
  );

  // New production account → NEW_ACCOUNT
  assert.strictEqual(
    determineNotificationAction(
      { initial_notification_claimed: true, highest_severity: 'high', incident_status: 'open', affected_production_accounts: ['acc-A'], last_alert_sent_at: new Date(now - 1000).toISOString() },
      { severity: 'high', runtime_environment: 'production', account_id: 'acc-B' },
      now,
    ),
    NOTIFICATION_ACTION.NEW_ACCOUNT,
    'New production account → NEW_ACCOUNT',
  );

  // Same production account → SKIP
  assert.strictEqual(
    determineNotificationAction(
      { initial_notification_claimed: true, highest_severity: 'high', incident_status: 'open', affected_production_accounts: ['acc-A'], last_alert_sent_at: new Date(now - 1000).toISOString() },
      { severity: 'high', runtime_environment: 'production', account_id: 'acc-A' },
      now,
    ),
    NOTIFICATION_ACTION.SKIP,
    'Same production account → SKIP',
  );

  // Recurrence after resolution → RECURRENCE (checked before initial)
  assert.strictEqual(
    determineNotificationAction(
      { initial_notification_claimed: false, incident_status: 'resolved', resolved_at: new Date(now - 86400000).toISOString() },
      { severity: 'high', runtime_environment: 'preview' },
      now,
    ),
    NOTIFICATION_ACTION.RECURRENCE,
    'Resolved group + new occurrence → RECURRENCE (not INITIAL)',
  );

  // 24-hour reminder → REMINDER
  assert.strictEqual(
    determineNotificationAction(
      { initial_notification_claimed: true, highest_severity: 'high', incident_status: 'open', last_alert_sent_at: new Date(now - 25 * 60 * 60 * 1000).toISOString() },
      { severity: 'high', runtime_environment: 'preview' },
      now,
    ),
    NOTIFICATION_ACTION.REMINDER,
    '25 hours since last alert → REMINDER',
  );

  // Less than 24 hours → SKIP (no reminder)
  assert.strictEqual(
    determineNotificationAction(
      { initial_notification_claimed: true, highest_severity: 'high', incident_status: 'open', last_alert_sent_at: new Date(now - 10 * 60 * 60 * 1000).toISOString() },
      { severity: 'high', runtime_environment: 'preview' },
      now,
    ),
    NOTIFICATION_ACTION.SKIP,
    '10 hours since last alert → SKIP (no reminder yet)',
  );

  console.log('  ✓ Notification action determination (9 assertions)');
}

// ═══════════════════════════════════════════════════════════════════
// 4. Email subject and description
// ═══════════════════════════════════════════════════════════════════

function testEmailSubject() {
  // Preview with account
  const subject1 = buildEmailSubject({
    environment: 'preview',
    severity: 'high',
    accountName: 'Custom Install 93',
    failure_mechanism: 'ENTITY_RATE_LIMIT_429',
    action: 'send_initial',
  });
  assert.strictEqual(
    subject1,
    'Sound Proof | PREVIEW | HIGH | Custom Install 93 | API rate limit exceeded',
    'Preview subject with account',
  );

  // Production without account
  const subject2 = buildEmailSubject({
    environment: 'production',
    severity: 'critical',
    failure_mechanism: 'AUTHENTICATION_CONTEXT_FAILED',
    action: 'send_initial',
  });
  assert.strictEqual(
    subject2,
    'Sound Proof | PRODUCTION | CRITICAL | Authentication failure',
    'Production subject without account',
  );

  // Reminder suffix
  const subject3 = buildEmailSubject({
    environment: 'preview',
    severity: 'high',
    accountName: 'Test Dealer',
    failure_mechanism: 'ENTITY_RATE_LIMIT_429',
    action: 'send_reminder',
  });
  assert.ok(subject3.includes('(reminder)'), 'Reminder action adds (reminder) suffix');

  // Escalation suffix
  const subject4 = buildEmailSubject({
    environment: 'production',
    severity: 'critical',
    accountName: 'Dealer X',
    failure_mechanism: 'ENTITY_RATE_LIMIT_429',
    action: 'send_escalation',
  });
  assert.ok(subject4.includes('(escalated to critical)'), 'Escalation action adds suffix');

  // Recurrence suffix
  const subject5 = buildEmailSubject({
    environment: 'preview',
    severity: 'high',
    failure_mechanism: 'DATA_REQUEST_FAILED',
    action: 'send_recurrence',
  });
  assert.ok(subject5.includes('(recurrence)'), 'Recurrence action adds suffix');

  // Description mapping
  assert.strictEqual(buildEmailDescription({ failure_mechanism: 'ENTITY_RATE_LIMIT_429' }), 'API rate limit exceeded');
  assert.strictEqual(buildEmailDescription({ failure_mechanism: 'AUTHENTICATION_CONTEXT_FAILED' }), 'Authentication failure');
  assert.strictEqual(buildEmailDescription({ error_code: 'DRAFT_REJECTED' }), 'Proposal draft rejected');
  assert.strictEqual(buildEmailDescription({ component: 'unknown_component' }), 'unknown_component failure');

  console.log('  ✓ Email subject and description (9 assertions)');
}

// ═══════════════════════════════════════════════════════════════════
// 5. Acceptance scenario: 8 related preview 429 failures
//    across different operations, pages and projects
// ═══════════════════════════════════════════════════════════════════

function testEightRelatedFailures() {
  const account = 'admin-acc-001';
  const operations = [
    'data:AccountUserAudit.list',
    'data:Project.filter',
    'data:BrandAsset.filter',
    'data:Project.filter',
    'data:ProjectVersion.filter',
    'data:SpeakerProduct.list',
    'data:CompetitorSpeaker.filter',
    'data:User.list',
  ];
  const pages = ['/Projects', '/RoomDesigner', '/Projects', '/RoomDesigner', '/RoomDesigner', '/SPLCalculator', '/admin', '/Projects'];
  const projects = ['proj-A', 'proj-B', null, 'proj-A', 'proj-B', null, null, 'proj-B'];

  const keys = new Set();
  const mechanisms = new Set();

  for (let i = 0; i < 8; i++) {
    const mechanism = normalizeFailureMechanism({
      error_code: 'DATA_REQUEST_FAILED',
      http_status: 429,
      operation: operations[i],
    });
    const key = computeNotificationGroupKey({
      failure_mechanism: mechanism,
      runtime_environment: 'preview',
      account_id: account,
    });
    keys.add(key);
    mechanisms.add(mechanism);
  }

  assert.strictEqual(keys.size, 1, '8 related failures across different operations/pages/projects → 1 group key');
  assert.strictEqual(mechanisms.size, 1, 'All 8 failures share the same mechanism');
  assert.strictEqual([...mechanisms][0], 'ENTITY_RATE_LIMIT_429', 'Mechanism is ENTITY_RATE_LIMIT_429');

  // Consequential project-opening failure also groups with the 429
  const projectLoadKey = computeNotificationGroupKey({
    failure_mechanism: normalizeFailureMechanism({ error_code: 'PROJECT_LOAD_FAILED', http_status: 429 }),
    runtime_environment: 'preview',
    account_id: account,
  });
  assert.strictEqual([...keys][0], projectLoadKey, 'Consequential PROJECT_LOAD_FAILED with 429 → same group');

  console.log('  ✓ Eight related failures scenario (5 assertions)');
}

// ═══════════════════════════════════════════════════════════════════
// 6. Acceptance scenario: preview and production remain separate
// ═══════════════════════════════════════════════════════════════════

function testPreviewProductionSeparation() {
  const account = 'acc-001';
  const previewKey = computeNotificationGroupKey({
    failure_mechanism: 'ENTITY_RATE_LIMIT_429',
    runtime_environment: 'preview',
    account_id: account,
  });
  const prodKey = computeNotificationGroupKey({
    failure_mechanism: 'ENTITY_RATE_LIMIT_429',
    runtime_environment: 'production',
    account_id: account,
  });
  assert.notStrictEqual(previewKey, prodKey, 'Preview and production never share a group');
  assert.ok(previewKey.includes('::preview::'), 'Preview key contains preview');
  assert.ok(prodKey.includes('::production::'), 'Production key contains production');

  console.log('  ✓ Preview/production separation (3 assertions)');
}

// ═══════════════════════════════════════════════════════════════════
// 7. Acceptance scenario: different production dealer accounts
//    remain separate
// ═══════════════════════════════════════════════════════════════════

function testAccountSeparation() {
  const acc1Key = computeNotificationGroupKey({
    failure_mechanism: 'ENTITY_RATE_LIMIT_429',
    runtime_environment: 'production',
    account_id: 'dealer-A',
  });
  const acc2Key = computeNotificationGroupKey({
    failure_mechanism: 'ENTITY_RATE_LIMIT_429',
    runtime_environment: 'production',
    account_id: 'dealer-B',
  });
  assert.notStrictEqual(acc1Key, acc2Key, 'Different production dealers never share a group');

  console.log('  ✓ Account separation (1 assertion)');
}

// ═══════════════════════════════════════════════════════════════════
// 8. Acceptance scenario: unrelated errors are not grouped
// ═══════════════════════════════════════════════════════════════════

function testUnrelatedErrors() {
  const rateLimitKey = computeNotificationGroupKey({
    failure_mechanism: normalizeFailureMechanism({ error_code: 'DATA_REQUEST_FAILED', http_status: 429 }),
    runtime_environment: 'preview',
    account_id: 'acc-001',
  });
  const renderFailKey = computeNotificationGroupKey({
    failure_mechanism: normalizeFailureMechanism({ error_code: 'RENDER_FAILED' }),
    runtime_environment: 'preview',
    account_id: 'acc-001',
  });
  const authFailKey = computeNotificationGroupKey({
    failure_mechanism: normalizeFailureMechanism({ error_code: 'AUTHENTICATION_CONTEXT_FAILED' }),
    runtime_environment: 'preview',
    account_id: 'acc-001',
  });
  assert.notStrictEqual(rateLimitKey, renderFailKey, 'Rate limit and render failure are not grouped');
  assert.notStrictEqual(rateLimitKey, authFailKey, 'Rate limit and auth failure are not grouped');
  assert.notStrictEqual(renderFailKey, authFailKey, 'Render failure and auth failure are not grouped');

  console.log('  ✓ Unrelated errors not grouped (3 assertions)');
}

// ═══════════════════════════════════════════════════════════════════
// 9. Acceptance scenario: ambiguity — no http_status, no grouping
// ═══════════════════════════════════════════════════════════════════

function testAmbiguity() {
  // Without http_status, DATA_REQUEST_FAILED and PROJECT_LOAD_FAILED are
  // separate mechanisms — they are NOT grouped together.
  const dataReqKey = computeNotificationGroupKey({
    failure_mechanism: normalizeFailureMechanism({ error_code: 'DATA_REQUEST_FAILED' }),
    runtime_environment: 'preview',
    account_id: 'acc-001',
  });
  const projLoadKey = computeNotificationGroupKey({
    failure_mechanism: normalizeFailureMechanism({ error_code: 'PROJECT_LOAD_FAILED' }),
    runtime_environment: 'preview',
    account_id: 'acc-001',
  });
  assert.notStrictEqual(dataReqKey, projLoadKey, 'Ambiguous failures without http_status are NOT grouped');

  console.log('  ✓ Ambiguity handling (1 assertion)');
}

// ═══════════════════════════════════════════════════════════════════
// Run all tests
// ═══════════════════════════════════════════════════════════════════

console.log('\nSystem Health notification consolidation tests\n');

testMechanismNormalization();
testGroupKey();
testNotificationAction();
testEmailSubject();
testEightRelatedFailures();
testPreviewProductionSeparation();
testAccountSeparation();
testUnrelatedErrors();
testAmbiguity();

console.log('\n✅ All tests passed\n');