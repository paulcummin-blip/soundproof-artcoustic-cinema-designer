const messageFor = state => state === 'uploading'
  ? 'The PDF upload is still running. Retry checks the same operation without generating or uploading another report.'
  : state === 'refused'
    ? 'Storage refused the PDF. The completed PDF is retained; restore access or connection, then Retry storage.'
    : 'The PDF upload outcome is not yet established. Retry checks its receipt; another upload is blocked to prevent duplicates.';

export function assertUploadReceipt(receipt, entry) {
  if (receipt?.state === 'stored' && receipt.file_uri && receipt.sha256 === entry.uploadSha256 && receipt.size === entry.uploadSize) return receipt;
  throw new Error(messageFor(receipt?.state));
}

/** Adapter to the existing operation endpoint, not a second document pipeline. */
export function reportUploadReceiptApi({ invoke, entry, update }) {
  const operation_id = entry.issued.uploadOperationId;
  const call = async body => {
    const response = await invoke(body);
    if (response?.data?.error) throw new Error('The report upload receipt could not be checked. The completed PDF is retained. Retry storage.');
    return response.data;
  };
  const rememberHash = async () => {
    if (!entry.uploadSha256) {
      if (!entry.blob) throw new Error('The PDF bytes are no longer available in this tab. No new report or upload was started.');
      const digest = await crypto.subtle.digest('SHA-256', await entry.blob.arrayBuffer());
      entry.uploadSha256 = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
      entry.uploadSize = entry.blob.size;
      update({ uploadSha256: entry.uploadSha256, uploadSize: entry.uploadSize });
    }
  };
  return {
    async reconcileUpload() {
      await rememberHash();
      let receipt = await call({ action: 'report_upload_status', operation_id });
      if (receipt?.state === 'unprepared') {
        receipt = await call({ action: 'report_upload_prepare', operation_id, sha256: entry.uploadSha256, size: entry.uploadSize });
      }
      if (receipt?.sha256 !== entry.uploadSha256 || receipt?.size !== entry.uploadSize) throw new Error('The upload receipt does not match this completed PDF. No upload was started.');
      if (receipt.state === 'stored') return assertUploadReceipt(receipt, entry);
      if (['ready', 'refused'].includes(receipt.state)) return receipt;
      throw new Error(messageFor(receipt.state));
    },
    async upload(blob) {
      // Pass a plain object containing File: SDK invoke serializes its keys.
      // A native FormData is enumerated as an empty object by SDK 0.8.54/63.
      const data = { action: 'report_upload_put', operation_id,
        sha256: entry.uploadSha256, size: entry.uploadSize,
        file: new File([blob], `SoundProofReport-${operation_id}.pdf`, { type: 'application/pdf' }),
      };
      return assertUploadReceipt(await call(data), entry);
    },
  };
}
