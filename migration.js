import { getSupabaseClient } from './realtime.js';
import { clearAllCache } from './idb-cache.js';

export const MIGRATION_APP_NAME = 'eROM@AG';
export const MIGRATION_SCHEMA_VERSION = '2.0';

export const MIGRATION_TABLE_ORDER = Object.freeze([
  'erom_users',
  'erom_pic',
  'erom_bookings'
]);

export const MIGRATION_TABLE_SCHEMAS = Object.freeze({
  erom_users: Object.freeze({
    table_name: 'erom_users',
    primary_key: 'id',
    headers: Object.freeze(['id', 'nama', 'sektor', 'email', 'role'])
  }),
  erom_pic: Object.freeze({
    table_name: 'erom_pic',
    primary_key: 'bilik',
    headers: Object.freeze(['bilik', 'telegram_id', 'telegram_username', 'is_pic'])
  }),
  erom_bookings: Object.freeze({
    table_name: 'erom_bookings',
    primary_key: 'id',
    headers: Object.freeze([
      'id',
      'bilik',
      'tarikh',
      'masa_mula',
      'masa_tamat',
      'kategori',
      'tujuan',
      'sektor',
      'nama_penempah',
      'status',
      'updated_at'
    ])
  })
});

const UPSERT_BATCH_SIZE = 100;

let isExportInProgress = false;
let isImportInProgress = false;
let activeAbortController = null;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeRowByHeaders(row, headers) {
  const normalized = {};
  for (let i = 0; i < headers.length; i++) {
    const col = headers[i];
    normalized[col] = Object.prototype.hasOwnProperty.call(row, col) ? row[col] : null;
  }
  return normalized;
}

function createAbortError() {
  const err = new Error('Operasi migrasi telah dibatalkan.');
  err.name = 'AbortError';
  return err;
}

function throwIfAborted(signal) {
  if (signal && signal.aborted) {
    throw createAbortError();
  }
}

export function isMigrationBusy() {
  return isExportInProgress || isImportInProgress;
}

export function abortMigrationOperations() {
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
}

export function renderMigrationStatus(container, statusData) {
  if (!container) return;

  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  if (!statusData) return;

  const fragment = document.createDocumentFragment();
  const wrapper = document.createElement('div');
  const type = statusData.type || 'info';

  const colorMap = {
    info: '#1e40af',
    success: '#065f46',
    error: '#991b1b',
    warning: '#92400e'
  };
  const bgMap = {
    info: '#eff6ff',
    success: '#ecfdf5',
    error: '#fef2f2',
    warning: '#fffbeb'
  };
  const borderMap = {
    info: '#bfdbfe',
    success: '#a7f3d0',
    error: '#fecaca',
    warning: '#fde68a'
  };

  wrapper.style.padding = '12px 14px';
  wrapper.style.borderRadius = '10px';
  wrapper.style.fontSize = '0.9rem';
  wrapper.style.color = colorMap[type] || colorMap.info;
  wrapper.style.background = bgMap[type] || bgMap.info;
  wrapper.style.border = `1px solid ${borderMap[type] || borderMap.info}`;

  const titleEl = document.createElement('div');
  titleEl.style.fontWeight = '600';
  titleEl.textContent = statusData.title || '';
  wrapper.appendChild(titleEl);

  if (statusData.message) {
    const msgEl = document.createElement('div');
    msgEl.style.marginTop = '4px';
    msgEl.textContent = statusData.message;
    wrapper.appendChild(msgEl);
  }

  if (Array.isArray(statusData.details) && statusData.details.length > 0) {
    const listEl = document.createElement('ul');
    listEl.style.margin = '8px 0 0 18px';
    listEl.style.padding = '0';

    for (let i = 0; i < statusData.details.length; i++) {
      const li = document.createElement('li');
      li.textContent = String(statusData.details[i]);
      listEl.appendChild(li);
    }
    wrapper.appendChild(listEl);
  }

  fragment.appendChild(wrapper);
  container.appendChild(fragment);
}

export function validateMigrationPayload(payload) {
  if (!isPlainObject(payload)) {
    return { ok: false, error: 'Struktur akar fail JSON tidak sah.' };
  }

  const { metadata, tables } = payload;

  if (!isPlainObject(metadata)) {
    return { ok: false, error: 'Objek metadata tiada atau tidak sah dalam fail JSON.' };
  }

  if (metadata.app !== MIGRATION_APP_NAME) {
    return {
      ok: false,
      error: `Aplikasi tidak sepadan: dijangka "${MIGRATION_APP_NAME}", diterima "${String(metadata.app || '')}".`
    };
  }

  if (typeof metadata.schema_version !== 'string' || !metadata.schema_version.trim()) {
    return { ok: false, error: 'Versi skema metadata tidak sah.' };
  }

  if (!Array.isArray(metadata.table_order)) {
    return { ok: false, error: 'Susunan jadual (metadata.table_order) mesti berbentuk tatasusunan.' };
  }

  if (metadata.table_order.length !== MIGRATION_TABLE_ORDER.length) {
    return {
      ok: false,
      error: `Bilangan jadual tidak sepadan: dijangka ${MIGRATION_TABLE_ORDER.length}, diterima ${metadata.table_order.length}.`
    };
  }

  for (let i = 0; i < MIGRATION_TABLE_ORDER.length; i++) {
    if (metadata.table_order[i] !== MIGRATION_TABLE_ORDER[i]) {
      return {
        ok: false,
        error: `Urutan kebergantungan jadual tidak sah pada indeks ${i}: dijangka "${MIGRATION_TABLE_ORDER[i]}".`
      };
    }
  }

  if (!isPlainObject(tables)) {
    return { ok: false, error: 'Objek jadual (tables) tiada atau tidak sah.' };
  }

  const normalizedTables = {};

  for (let i = 0; i < MIGRATION_TABLE_ORDER.length; i++) {
    const tableName = MIGRATION_TABLE_ORDER[i];
    const expectedSchema = MIGRATION_TABLE_SCHEMAS[tableName];
    const tableBlock = tables[tableName];

    if (!isPlainObject(tableBlock)) {
      return { ok: false, error: `Definisi jadual "${tableName}" tiada dalam fail JSON.` };
    }

    if (tableBlock.table_name !== expectedSchema.table_name) {
      return {
        ok: false,
        error: `Nama jadual tidak sepadan bagi "${tableName}".`
      };
    }

    if (tableBlock.primary_key !== expectedSchema.primary_key) {
      return {
        ok: false,
        error: `Kunci utama (primary_key) tidak sepadan bagi "${tableName}": dijangka "${expectedSchema.primary_key}".`
      };
    }

    if (!Array.isArray(tableBlock.headers) || tableBlock.headers.length !== expectedSchema.headers.length) {
      return {
        ok: false,
        error: `Senarai lajur (headers) bagi "${tableName}" tidak sepadan dengan skema sasaran.`
      };
    }

    const allowedHeadersSet = new Set(expectedSchema.headers);
    for (let h = 0; h < expectedSchema.headers.length; h++) {
      if (tableBlock.headers[h] !== expectedSchema.headers[h]) {
        return {
          ok: false,
          error: `Lajur "${String(tableBlock.headers[h])}" pada jadual "${tableName}" tidak sepadan dengan "${expectedSchema.headers[h]}".`
        };
      }
    }

    if (!Array.isArray(tableBlock.rows)) {
      return { ok: false, error: `Rekod baris (rows) bagi "${tableName}" mesti berbentuk tatasusunan.` };
    }

    const normalizedRows = [];
    for (let r = 0; r < tableBlock.rows.length; r++) {
      const rawRow = tableBlock.rows[r];
      if (!isPlainObject(rawRow)) {
        return { ok: false, error: `Baris ke-${r + 1} dalam jadual "${tableName}" bukan objek sah.` };
      }

      const rowKeys = Object.keys(rawRow);
      for (let k = 0; k < rowKeys.length; k++) {
        if (!allowedHeadersSet.has(rowKeys[k])) {
          return {
            ok: false,
            error: `Medan tidak dikenali "${rowKeys[k]}" ditemui pada baris ke-${r + 1} jadual "${tableName}".`
          };
        }
      }

      const pkValue = rawRow[expectedSchema.primary_key];
      if (pkValue === undefined || pkValue === null || String(pkValue).trim() === '') {
        return {
          ok: false,
          error: `Nilai kunci utama "${expectedSchema.primary_key}" kosong pada baris ke-${r + 1} jadual "${tableName}".`
        };
      }

      normalizedRows.push(normalizeRowByHeaders(rawRow, expectedSchema.headers));
    }

    normalizedTables[tableName] = {
      table_name: expectedSchema.table_name,
      primary_key: expectedSchema.primary_key,
      headers: [...expectedSchema.headers],
      rows: normalizedRows
    };
  }

  return {
    ok: true,
    data: {
      metadata: {
        app: MIGRATION_APP_NAME,
        schema_version: metadata.schema_version.trim(),
        exported_at: typeof metadata.exported_at === 'string' ? metadata.exported_at : new Date().toISOString(),
        table_order: [...MIGRATION_TABLE_ORDER]
      },
      tables: normalizedTables
    }
  };
}

async function fetchTableRowsForExport(client, tableName, schema, options, signal) {
  throwIfAborted(signal);

  const selectColumns = schema.headers.join(',');
  let query = client
    .from(tableName)
    .select(selectColumns)
    .order(schema.primary_key, { ascending: true });

  if (signal && typeof query.abortSignal === 'function') {
    query = query.abortSignal(signal);
  }

  const { data, error } = await query;
  throwIfAborted(signal);

  if (!error && Array.isArray(data)) {
    return data.map((row) => normalizeRowByHeaders(row, schema.headers));
  }

  if (tableName === 'erom_users' && options && options.adminEmail && options.sessionToken) {
    const rpcRes = await client.rpc('fn_get_all_users_secure_v2', {
      p_email: options.adminEmail,
      p_session_token: options.sessionToken
    });
    throwIfAborted(signal);

    if (!rpcRes.error && rpcRes.data && rpcRes.data.ok && Array.isArray(rpcRes.data.data)) {
      return rpcRes.data.data.map((u) =>
        normalizeRowByHeaders(
          {
            id: u.id,
            nama: u.nama,
            sektor: u.sektor,
            email: u.email,
            role: u.role || 'USER'
          },
          schema.headers
        )
      );
    }
  }

  throw new Error(error ? error.message : `Gagal mengekstrak data daripada jadual "${tableName}".`);
}

function triggerJsonDownload(jsonContent, filename) {
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}

export async function exportDatabaseJSON(options = {}) {
  if (isMigrationBusy()) {
    return { ok: false, error: 'Operasi sandaran atau pemulihan sedang berjalan. Sila tunggu sehingga selesai.' };
  }

  const statusEl = options.statusEl || null;
  const controller = new AbortController();
  activeAbortController = controller;
  isExportInProgress = true;

  try {
    renderMigrationStatus(statusEl, {
      type: 'info',
      title: 'Menjana Sandaran JSON 1-to-1...',
      message: 'Sedang mengekstrak semua jadual sistem daripada pangkalan data.'
    });

    if (typeof window !== 'undefined' && window.ENV_READY) {
      await window.ENV_READY;
    }
    throwIfAborted(controller.signal);

    const client = await getSupabaseClient();
    throwIfAborted(controller.signal);

    const exportedAt = new Date().toISOString();
    const tablesOutput = {};
    const summaryDetails = [];

    for (let i = 0; i < MIGRATION_TABLE_ORDER.length; i++) {
      const tableName = MIGRATION_TABLE_ORDER[i];
      const schema = MIGRATION_TABLE_SCHEMAS[tableName];
      const rows = await fetchTableRowsForExport(client, tableName, schema, options, controller.signal);

      tablesOutput[tableName] = {
        table_name: schema.table_name,
        primary_key: schema.primary_key,
        headers: [...schema.headers],
        rows
      };

      summaryDetails.push(`${tableName}: ${rows.length} rekod`);
    }

    const payload = {
      metadata: {
        app: MIGRATION_APP_NAME,
        schema_version: MIGRATION_SCHEMA_VERSION,
        exported_at: exportedAt,
        table_order: [...MIGRATION_TABLE_ORDER]
      },
      tables: tablesOutput
    };

    const safeTimestamp = exportedAt.replace(/[:.]/g, '-');
    const filename = `erom-ag-backup-${safeTimestamp}.json`;
    const serialized = JSON.stringify(payload, null, 2);

    triggerJsonDownload(serialized, filename);

    renderMigrationStatus(statusEl, {
      type: 'success',
      title: 'Eksport Sandaran JSON Berjaya',
      message: `Fail "${filename}" telah dimuat turun.`,
      details: summaryDetails
    });

    return { ok: true, filename, payload };
  } catch (err) {
    const errorMessage = err && err.message ? err.message : 'Ralat semasa menjana fail sandaran JSON.';
    renderMigrationStatus(statusEl, {
      type: err && err.name === 'AbortError' ? 'warning' : 'error',
      title: err && err.name === 'AbortError' ? 'Eksport Dibatalkan' : 'Eksport Sandaran Gagal',
      message: errorMessage
    });
    return { ok: false, error: errorMessage };
  } finally {
    isExportInProgress = false;
    if (activeAbortController === controller) {
      activeAbortController = null;
    }
  }
}

export async function importDatabaseJSON(file, options = {}) {
  if (isMigrationBusy()) {
    return { ok: false, error: 'Operasi sandaran atau pemulihan sedang berjalan. Sila tunggu sehingga selesai.' };
  }

  const statusEl = options.statusEl || null;

  if (!file) {
    const msg = 'Sila pilih fail sandaran .json terlebih dahulu.';
    renderMigrationStatus(statusEl, { type: 'warning', title: 'Tiada Fail Dipilih', message: msg });
    return { ok: false, error: msg };
  }

  const fileName = String(file.name || '').toLowerCase();
  const fileType = String(file.type || '').toLowerCase();
  const isValidJsonFile =
    fileName.endsWith('.json') &&
    (!fileType || fileType === 'application/json' || fileType === 'text/json');

  if (!isValidJsonFile) {
    const msg = 'Format fail tidak sah. Hanya fail sambungan .json (application/json) dibenarkan.';
    renderMigrationStatus(statusEl, { type: 'error', title: 'Format Fail Ditolak', message: msg });
    return { ok: false, error: msg };
  }

  const controller = new AbortController();
  activeAbortController = controller;
  isImportInProgress = true;

  try {
    renderMigrationStatus(statusEl, {
      type: 'info',
      title: 'Mengesahkan Skema Fail JSON...',
      message: 'Menyemak sintaks JSON, susunan jadual, primary_key, dan headers.'
    });

    const rawText = await file.text();
    throwIfAborted(controller.signal);

    let parsedJson;
    try {
      parsedJson = JSON.parse(rawText);
    } catch {
      throw new Error('Sintaks JSON rosak atau tidak boleh dihuraikan.');
    }

    const validation = validateMigrationPayload(parsedJson);
    if (!validation.ok) {
      throw new Error(validation.error);
    }

    if (typeof window !== 'undefined' && window.ENV_READY) {
      await window.ENV_READY;
    }
    throwIfAborted(controller.signal);

    const client = await getSupabaseClient();
    throwIfAborted(controller.signal);

    const validatedData = validation.data;
    const summaryDetails = [];

    renderMigrationStatus(statusEl, {
      type: 'info',
      title: 'Memulihkan Data 1-to-1 ke Pangkalan Data...',
      message: 'Melaksanakan operasi upsert berkelompok mengikut kebergantungan kunci asing.'
    });

    for (let i = 0; i < validatedData.metadata.table_order.length; i++) {
      throwIfAborted(controller.signal);

      const tableName = validatedData.metadata.table_order[i];
      const tableEntry = validatedData.tables[tableName];
      const rows = tableEntry.rows;

      if (rows.length === 0) {
        summaryDetails.push(`${tableName}: 0 rekod (tiada baris untuk dipulihkan)`);
        continue;
      }

      for (let offset = 0; offset < rows.length; offset += UPSERT_BATCH_SIZE) {
        throwIfAborted(controller.signal);

        const batch = rows.slice(offset, offset + UPSERT_BATCH_SIZE);
        let upsertQuery = client
          .from(tableName)
          .upsert(batch, { onConflict: tableEntry.primary_key });

        if (controller.signal && typeof upsertQuery.abortSignal === 'function') {
          upsertQuery = upsertQuery.abortSignal(controller.signal);
        }

        const { error } = await upsertQuery;
        throwIfAborted(controller.signal);

        if (error) {
          throw new Error(`Ralat upsert pada jadual "${tableName}" (baris ${offset + 1}-${offset + batch.length}): ${error.message}`);
        }
      }

      summaryDetails.push(`${tableName}: ${rows.length} rekod berjaya dipulihkan`);
    }

    await clearAllCache();

    if (typeof options.onComplete === 'function') {
      await options.onComplete({
        metadata: validatedData.metadata,
        details: summaryDetails
      });
    }

    renderMigrationStatus(statusEl, {
      type: 'success',
      title: 'Pemulihan / Migrasi 1-to-1 Selesai',
      message: 'Semua rekod telah disegerakkan dan cache tempatan telah dikosongkan.',
      details: summaryDetails
    });

    return { ok: true, details: summaryDetails };
  } catch (err) {
    const errorMessage = err && err.message ? err.message : 'Ralat semasa mengimport fail JSON.';
    renderMigrationStatus(statusEl, {
      type: err && err.name === 'AbortError' ? 'warning' : 'error',
      title: err && err.name === 'AbortError' ? 'Import Dibatalkan' : 'Import / Pemulihan Gagal',
      message: errorMessage
    });
    return { ok: false, error: errorMessage };
  } finally {
    isImportInProgress = false;
    if (activeAbortController === controller) {
      activeAbortController = null;
    }
  }
}