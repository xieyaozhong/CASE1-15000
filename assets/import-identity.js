(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ImportIdentity = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function normalizedName(value) {
    return String(value ?? '').trim().toLocaleLowerCase('zh-TW');
  }

  function normalizeSource(source) {
    if (!source || typeof source !== 'object') return null;
    const fileSha256 = String(source.file_sha256 || '').trim().toLowerCase();
    const sheetName = String(source.sheet_name || '').trim().normalize('NFC');
    const sourceRef = String(source.source_ref || '').trim().toUpperCase().normalize('NFC');
    if (!fileSha256 || !sheetName || !sourceRef) return null;
    const sourceRow = Number(source.source_row);
    const provider = String(source.provider || '').trim().toLowerCase();
    const documentId = String(source.document_id || '').trim();
    return {
      file_sha256: fileSha256,
      filename: String(source.filename || '').trim(),
      provider,
      document_id: documentId,
      sheet_name: sheetName,
      source_ref: sourceRef,
      source_row: Number.isInteger(sourceRow) && sourceRow > 0 ? sourceRow : null,
      source_column: String(source.source_column || '').trim().toUpperCase()
    };
  }

  function sourceKey(source) {
    const value = normalizeSource(source);
    if (!value) return '';
    const documentScope = value.provider === 'google_drive' && value.document_id
      ? ['google_drive', value.document_id]
      : ['file_content'];
    return JSON.stringify([...documentScope, value.file_sha256, value.sheet_name, value.source_ref]);
  }

  function locatorKey(source) {
    const value = normalizeSource(source);
    if (!value) return '';
    const document = value.provider === 'google_drive' && value.document_id
      ? `google_drive:${value.document_id}`
      : `local_file:${value.filename.toLocaleLowerCase('zh-TW').normalize('NFC')}`;
    return JSON.stringify([document, value.sheet_name, value.source_ref]);
  }

  async function fingerprintArrayBuffer(buffer) {
    if (!globalThis.crypto?.subtle) throw new Error('SHA-256 is not available in this environment.');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  }

  function sameInvestment(existing, value) {
    return normalizedName(existing?.investor_name) === normalizedName(value?.investor_name) &&
      normalizedName(existing?.project_name) === normalizedName(value?.project_name) &&
      String(existing?.start_date || '') === String(value?.start_date || '') &&
      Number(existing?.amount) === Number(value?.amount) &&
      Number(existing?.duration_value) === Number(value?.duration_value) &&
      String(existing?.duration_unit || '') === String(value?.duration_unit || '') &&
      Number(existing?.interest_rate) === Number(value?.interest_rate) &&
      Number(existing?.net_profit) === Number(value?.net_profit);
  }

  function classify(existingRecords, value, source) {
    const records = Array.isArray(existingRecords) ? existingRecords : [];
    const key = sourceKey(source);
    if (key) {
      const sameSource = records.find(record => sourceKey(record.import_source) === key);
      if (sameSource) return sameInvestment(sameSource, value)
        ? { status: 'duplicate', reason: 'exact_source', record: sameSource }
        : { status: 'conflict', reason: 'source_changed', record: sameSource };
      const locator = locatorKey(source);
      const sameLocator = locator && records.find(record => locatorKey(record.import_source) === locator);
      if (sameLocator) {
        if (normalizeSource(source)?.provider !== 'google_drive') return { status: 'conflict', reason: 'ambiguous_local_file', record: sameLocator };
        return sameInvestment(sameLocator, value)
          ? { status: 'duplicate', reason: 'stable_drive_file', record: sameLocator }
          : { status: 'conflict', reason: 'source_changed', record: sameLocator };
      }
      const legacyMatch = records.find(record => !sourceKey(record.import_source) && sameInvestment(record, value));
      if (legacyMatch) return { status: 'conflict', reason: 'legacy_record_match', record: legacyMatch };
      return { status: 'new', record: null };
    }
    const duplicate = records.find(record => sameInvestment(record, value));
    return duplicate ? { status: 'duplicate', record: duplicate } : { status: 'new', record: null };
  }

  return { normalizedName, normalizeSource, sourceKey, locatorKey, fingerprintArrayBuffer, sameInvestment, classify };
});
