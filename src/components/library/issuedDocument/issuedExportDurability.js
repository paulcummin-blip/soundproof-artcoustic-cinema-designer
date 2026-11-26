import { buildIssuedDocumentRow } from './issuedDocumentRowPayload.js';

// A deadline ends the UI wait, not the request. Retain the original promise:
// retry must observe/reconcile it, never issue a second uncertain write.
export async function awaitExportOperation(entry, key, start, timeoutMs = 45000) {
  const previous = entry[key];
  const rejectedStatus = previous?.error?.response?.status || previous?.error?.status || previous?.error?.cause?.response?.status || previous?.error?.cause?.status;
  if (previous?.state === 'rejected' && [400, 401, 403, 404, 422].includes(rejectedStatus)) entry[key] = null;
  if (!entry[key]) {
    const operation = { state: 'pending' };
    entry[key] = operation;
    operation.promise = Promise.resolve().then(start).then(
      value => { operation.state = 'fulfilled'; operation.value = value; return value; },
      error => { operation.state = 'rejected'; operation.error = error; throw error; },
    );
  }
  let timer;
  try {
    return await Promise.race([
      entry[key].promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(
        key === 'uploadOperation'
          ? 'PDF upload acknowledgement is still pending. Retry checks this same upload; do not start another export.'
          : 'Asset save acknowledgement is still pending. Retry checks the existing save before continuing.'
      )), timeoutMs); }),
    ]);
  } catch (error) {
    const status = Number(error?.response?.status || error?.status || error?.cause?.response?.status || error?.cause?.status || 0);
    if (key === 'uploadOperation' && entry[key]?.state === 'rejected' && ![400, 401, 403, 404, 422].includes(status)) {
      const uncertain = new Error(entry.uploadReceiptRecovery ? 'The upload response was interrupted. The completed PDF is retained. Retry storage to check the original upload receipt before continuing.' : 'The upload failed without a confirmed file path. A second upload cannot safely be started until its storage outcome is reconciled. Return to the project to use your previous completed documents; administrator recovery is required.');
      uncertain.cause = error;
      throw uncertain;
    }
    throw error;
  } finally { clearTimeout(timer); }
}

export async function boundedExportRead(start, label, timeoutMs = 45000) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(start),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(
        label + ' could not be verified. Retry to check again; no duplicate was created.'
      )), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}

function stable(value) {
  if (Array.isArray(value)) return JSON.stringify(value.map(v => JSON.parse(stable(v))));
  if (value && typeof value === 'object') return JSON.stringify(Object.fromEntries(
    Object.keys(value).sort().map(k => [k, JSON.parse(stable(value[k]))])
  ));
  return JSON.stringify(value ?? null);
}

export function matchesIssuedRow(row, expected) {
  return !!row?.id && ['project_id', 'document_type', 'version_id', 'filename',
    'file_uri', 'source_record_id', 'page_count', 'selected_version_ids', 'source_fingerprints']
    .every(key => stable(row[key]) === stable(expected[key]));
}

/** Uses only the existing private-file and ProjectAssetExport authorities. */
export async function saveIssuedArtifact({ entry, api, verifyFile, onProgress = () => {}, update = () => {}, timeoutMs = 45000, telemetry = null }) {
  const progress = (stage, message) => { try { onProgress({ stage, message }); } catch { /* UI cannot change durability */ } };
  entry.uploadReceiptRecovery = Boolean(api.reconcileUpload);
  if (!entry.fileUri && api.reconcileUpload) {
    progress('reconcile_upload', 'Checking the previous PDF upload…');
    const receipt = await boundedExportRead(() => api.reconcileUpload(), 'Upload receipt', timeoutMs);
    if (receipt.state === 'stored') {
      entry.fileUri = receipt.file_uri;
      update({ fileUri: entry.fileUri });
    } else if (['ready', 'refused'].includes(receipt.state)) {
      // A fresh request is safe only behind the server's atomic claim. Even a
      // delayed earlier request cannot claim this same operation a second time.
      entry.uploadOperation = null;
    } else throw new Error('Upload outcome remains uncertain. No second upload was started.');
  }
  if (!entry.fileUri) {
    if (!api.reconcileUpload && entry.uploadStarted && !entry.uploadOperation) throw new Error('The previous upload has no confirmed file path after reload. Its outcome must be reconciled before another upload.');
    if (!entry.blob) throw new Error('The captured PDF is unavailable. No new export was started.');
    progress('upload', 'Uploading PDF to private storage…');
    entry.uploadStarted = true;
    update({ uploadStarted: true });
    telemetry?.beginUpload();
    const uploaded = await awaitExportOperation(entry, 'uploadOperation', async () => {
      const result = await api.upload(entry.blob, entry.filename);
      if (!result?.file_uri) throw new Error('Storage returned no file path. The upload outcome is uncertain; no automatic duplicate upload will be attempted.');
      entry.fileUri = result.file_uri;
      update({ fileUri: entry.fileUri });
      return result;
    }, timeoutMs * 2);
    entry.fileUri = uploaded.file_uri;
    telemetry?.endUpload();
  }
  const expected = buildIssuedDocumentRow({
    issued: entry.issued, filename: entry.filename, pageCount: entry.pageCount,
    fileUri: entry.fileUri, previewStatus: entry.previewStatus, rendering: entry.rendering,
    exportedAt: entry.attemptStartedAt,
  });
  const read = async () => {
    progress('reconcile', 'Checking the saved asset record…');
    const result = await boundedExportRead(() => api.find({
      project_id: expected.project_id, document_type: expected.document_type,
      version_id: expected.version_id, file_uri: entry.fileUri,
    }), 'Asset record readback', timeoutMs);
    const rows = Array.isArray(result) ? result : result?.items || [];
    if (rows.length > 1) throw new Error('Multiple records reference this PDF. Storage was stopped for reconciliation.');
    if (rows.length && !matchesIssuedRow(rows[0], expected)) throw new Error('The saved PDF record does not match this report/version. No replacement was created.');
    return rows[0] || null;
  };
  const existing = await read(); // A failed read is NEVER permission to write.
  progress('verify_file', 'Verifying the stored PDF…');
  telemetry?.beginVerify();
  await boundedExportRead(() => verifyFile(entry.fileUri, entry.blob), 'Stored PDF', timeoutMs);
  telemetry?.endVerify();
  if (existing) {
    progress('complete', 'PDF and asset record verified.');
    return existing;
  }
  if (entry.recordStarted && !entry.recordOperation) throw new Error('The previous asset save is not visible yet after reload. Retry checks for that record without creating another.');
  entry.recordStarted = true;
  update({ recordStarted: true });
  progress('record', 'Saving the Documents & Assets record…');
  try {
    await awaitExportOperation(entry, 'recordOperation', () => api.create(expected), timeoutMs);
  } catch (error) {
    // Create can commit even when its acknowledgement is lost.
    const reconciled = await read();
    if (reconciled) { progress('complete', 'Saved PDF recovered and verified.'); return reconciled; }
    const status = error?.response?.status || error?.status;
    // Explicit validation/permission rejection proves the write was refused.
    if ([400, 401, 403, 404, 422].includes(status)) {
      entry.recordOperation = null; entry.recordStarted = false; update({ recordStarted: false });
    }
    throw error;
  }
  const record = await read();
  if (!record) throw new Error('Asset save was acknowledged but durable readback is not available yet. Retry checks the same save.');
  progress('complete', 'PDF and asset record verified.');
  return record;
}