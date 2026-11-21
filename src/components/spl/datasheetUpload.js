// datasheetUpload.js
// ---------------------------------------------------------------------------
// Helpers for the "Upload manufacturer datasheet (PDF)" path of the Read Source
// workflow. Uploads an admin-selected PDF to the app's private file storage
// (UploadPrivateFile), persists the resulting file_uri against the correct
// SpeakerProduct, and mints short-lived signed URLs so the admin can view the
// attached datasheet. The manufacturer website URL (official_product_url) is
// kept separately and is never touched here.
//
// Nothing here re-implements source reading or specification extraction — that
// stays in extractModelSpecification. These are the storage/permission helpers
// the source-management UI needs.
// ---------------------------------------------------------------------------

import { base44 } from "@/api/base44Client";

/**
 * Read the currently attached datasheet for a product, if any.
 * @param {string} productId - SpeakerProduct id
 * @returns {Promise<{fileUri: string|null, fileName: string|null} | null>}
 */
export async function fetchProductDatasheet(productId) {
  if (!productId) return null;
  try {
    const product = await base44.entities.SpeakerProduct.get(productId);
    return {
      fileUri: product?.datasheet_file_uri || null,
      fileName: product?.datasheet_file_name || null,
    };
  } catch {
    return null;
  }
}

/**
 * Upload a manufacturer PDF datasheet to private storage and persist it against
 * the product. The file_uri (a short string) is stored, never the PDF bytes.
 * @param {string} productId
 * @param {File} file - the admin-selected PDF
 * @returns {Promise<{fileUri: string, fileName: string}>}
 */
export async function uploadDatasheet(productId, file) {
  if (!productId) throw new Error("The speaker must be saved before a datasheet can be attached.");
  if (!file) throw new Error("No file was selected.");
  const name = String(file?.name || "datasheet.pdf");
  if (!/\.pdf$/i.test(name)) throw new Error("Only PDF datasheets are supported.");
  const result = await base44.integrations.Core.UploadPrivateFile({ file });
  const fileUri = result?.file_uri;
  if (!fileUri) throw new Error("The datasheet could not be uploaded.");
  await base44.entities.SpeakerProduct.update(productId, {
    datasheet_file_uri: fileUri,
    datasheet_file_name: name,
  });
  return { fileUri, fileName: name };
}

/**
 * Remove the attached datasheet from a product. The website URL is untouched.
 * @param {string} productId
 */
export async function clearDatasheet(productId) {
  if (!productId) return;
  await base44.entities.SpeakerProduct.update(productId, {
    datasheet_file_uri: null,
    datasheet_file_name: null,
  });
}

/**
 * Mint a short-lived signed URL so the admin can open the attached datasheet
 * in a new tab. The file_uri itself is private and not publicly fetchable.
 * @param {string} fileUri
 * @returns {Promise<string>} signed_url
 */
export async function mintDatasheetSignedUrl(fileUri) {
  const result = await base44.integrations.Core.CreateFileSignedUrl({
    file_uri: fileUri,
    expires_in: 600,
  });
  return result?.signed_url || "";
}