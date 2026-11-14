var groupedData = window.groupedData || {};
var globalPegawaiFlat = window.globalPegawaiFlat || [];
var allRecords = window.allRecords || [];
var currentFilteredRecords = window.currentFilteredRecords || [];
var globalSelected = new Map();
var isSubmittingForm = false;

document.addEventListener('DOMContentLoaded', () => {
  if (window.__appPublicInitialized) {
    return;
  }
  window.__appPublicInitialized = true;

  const yearElem = document.getElementById('currentYear');
  if (yearElem) yearElem.textContent = new Date().getFullYear();

  loadPublicPegawaiData();
  setupEventListeners();
  switchTab('utama');
});

function loadPublicPegawaiData() {
  if (!window.CacheService) {
    return;
  }

  window.CacheService.fetchSWR('memo_pegawai', 'sektor', true, (data) => {
    if (!data || data.length === 0) return;

    processPegawai(data);
    populateSektor();
  });
}

function setupEventListeners() {
  document.getElementById('tabBtnAdminPanel')?.addEventListener('click', () => switchTab('admin'));
  document.getElementById('tabBtnTppdPanel')?.addEventListener('click', () => switchTab('tppd'));

  document.getElementById('sektor')?.addEventListener('change', populateUnit);
  document.getElementById('unit')?.addEventListener('change', populateNama);

  document.getElementById('carianPegawaiUtama')?.addEventListener('input', window.handleCarianDaftar);

  document.getElementById('salinanSurat')?.addEventListener('change', function() { handleEarlyUpload(this); });
  document.getElementById('resetFileBtn')?.addEventListener('click', resetFileUpload);

  document.getElementById('mainForm')?.addEventListener('submit', handleFormSubmit);

  document.getElementById('searchInput')?.addEventListener('keyup', filterTable);
  document.getElementById('filterStatus')?.addEventListener('change', filterTable);
  document.getElementById('filterSektor')?.addEventListener('change', filterTable);
  document.getElementById('filterUnit')?.addEventListener('change', filterTable);
  document.getElementById('filterBulan')?.addEventListener('change', filterTable);
  document.getElementById('filterTarikh')?.addEventListener('change', filterTable);
  document.getElementById('btnResetFilter')?.addEventListener('click', resetAnalisisFilters);

  document.addEventListener('click', (e) => {
    const inputUtama = document.getElementById('carianPegawaiUtama');
    const dropUtama = document.getElementById('dropdownCarianUtama');
    if (dropUtama && inputUtama && !dropUtama.contains(e.target) && e.target !== inputUtama) {
      dropUtama.classList.add('hidden');
    }
  });
}

window.isManagerRole = function(unitName) {
  if (!unitName) return false;
  const u = unitName.toUpperCase();
  return u === 'TPPD' || u === 'KETUA SEKTOR' || u.startsWith('KETUA UNIT');
};

window.switchTab = function(tabName) {
  if (['daftar', 'admin', 'tppd'].includes(tabName)) {
    const sessionStr = sessionStorage.getItem('memo_admin_session');
    const adminData = sessionStr ? JSON.parse(sessionStr) : null;

    if (tabName === 'daftar') {
      if (!adminData || (!adminData.isPerakam && !adminData.isSystemAdmin)) {
        if (window.showMessage) window.showMessage("Akses Ditolak: Modul ini terhad kepada profil PERAKAM dan PENTADBIR sahaja.", "error");
        return;
      }
    }

    if (tabName === 'admin') {
      if (!adminData || !adminData.isSystemAdmin) {
        if (window.showMessage) window.showMessage("Akses Ditolak: Modul ini terhad kepada profil PENTADBIR (System Admin) sahaja.", "error");
        return;
      }
    }

    if (tabName === 'tppd') {
      if (!adminData || (!adminData.isManager && !adminData.isSystemAdmin)) {
        if (window.showMessage) window.showMessage("Akses Ditolak: Modul ini terhad kepada hierarki PENGURUSAN atau PENTADBIR SISTEM sahaja.", "error");
        return;
      }
    }
  }

  const tabs = ['utama', 'daftar', 'analisis', 'kalendar', 'admin', 'about', 'tppd'];

  tabs.forEach(t => {
    const divId = t === 'admin' ? 'tabAdmin' : (t === 'tppd' ? 'tabTppd' : 'tab' + t.charAt(0).toUpperCase() + t.slice(1));
    const tabDiv = document.getElementById(divId);

    if (!tabDiv) return;

    if (t === tabName) {
      tabDiv.classList.remove('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      tabDiv.classList.add('hidden');
    }
  });

  const tabBtnAdmin = document.getElementById('tabBtnAdminPanel');
  if (tabBtnAdmin) {
    if (tabName === 'admin') {
      tabBtnAdmin.classList.add('border-red-600', 'text-red-700');
      tabBtnAdmin.classList.remove('border-transparent', 'text-red-500');
    } else {
      tabBtnAdmin.classList.remove('border-red-600', 'text-red-700');
      tabBtnAdmin.classList.add('border-transparent', 'text-red-500');
    }
  }

  const tabBtnTppd = document.getElementById('tabBtnTppdPanel');
  if (tabBtnTppd) {
    if (tabName === 'tppd') {
      tabBtnTppd.classList.add('border-indigo-600', 'text-indigo-800');
      tabBtnTppd.classList.remove('border-transparent', 'text-indigo-600');
    } else {
      tabBtnTppd.classList.remove('border-indigo-600', 'text-indigo-800');
      tabBtnTppd.classList.add('border-transparent', 'text-indigo-600');
    }
  }

  if (tabName === 'analisis') {
    if (typeof loadDashboardData === 'function') {
      loadDashboardData();
    }
  }
};

function processPegawai(data) {
  groupedData = {};
  globalPegawaiFlat = Array.isArray(data) ? data : [];
  globalPegawaiFlat.forEach(p => {
    if (!p || !p.sektor || !p.unit) return;
    if (!groupedData[p.sektor]) groupedData[p.sektor] = {};
    if (!groupedData[p.sektor][p.unit]) groupedData[p.sektor][p.unit] = [];
    groupedData[p.sektor][p.unit].push({ nama: p.nama, emel: p.emel_rasmi });
  });
  window.groupedData = groupedData;
  window.globalPegawaiFlat = globalPegawaiFlat;
}

window.populateSektor = function() {
  const s = document.getElementById('sektor');
  if (!s) return;

  const currentVal = s.value;

  s.textContent = '';
  const defOpt = document.createElement('option');
  defOpt.value = '';
  defOpt.textContent = '-- PILIH SEKTOR --';
  s.appendChild(defOpt);

  Object.keys(groupedData).sort().forEach(sk => {
    const opt = document.createElement('option');
    opt.value = sk;
    opt.textContent = sk;
    s.appendChild(opt);
  });

  if (currentVal && groupedData[currentVal]) {
    s.value = currentVal;
  }
};

window.populateUnit = function() {
  const sk = document.getElementById('sektor').value;
  const u = document.getElementById('unit');
  const nc = document.getElementById('namaContainer');

  const currentVal = u.value;
  u.textContent = '';
  const defOpt = document.createElement('option');
  defOpt.value = '';
  defOpt.textContent = '-- PILIH UNIT --';
  u.appendChild(defOpt);

  if (sk && groupedData[sk]) {
    Object.keys(groupedData[sk]).sort().forEach(un => {
      const opt = document.createElement('option');
      opt.value = un;
      opt.textContent = un;
      u.appendChild(opt);
    });
    u.disabled = false;

    if (currentVal && groupedData[sk][currentVal]) {
      u.value = currentVal;
    } else {
      nc.textContent = '';
      const msgDiv = document.createElement('div');
      msgDiv.className = 'text-slate-400 italic text-sm mt-1';
      msgDiv.textContent = 'Sila Pilih Unit Dahulu';
      nc.appendChild(msgDiv);
    }
  } else {
    u.disabled = true;
    nc.textContent = '';
    const msgDiv = document.createElement('div');
    msgDiv.className = 'text-slate-400 italic text-sm mt-1';
    msgDiv.textContent = 'Sila Pilih Sektor & Unit Dahulu';
    nc.appendChild(msgDiv);
  }
};

window.populateNama = function() {
  const sk = document.getElementById('sektor').value;
  const un = document.getElementById('unit').value;
  const nc = document.getElementById('namaContainer');
  nc.textContent = '';

  if (sk && un && groupedData[sk] && groupedData[sk][un]) {
    const headerDiv = document.createElement('div');
    headerDiv.className = 'flex items-center justify-between pb-2 mb-2 border-b border-slate-200 sticky top-0 bg-slate-50 z-10';

    const spanTitle = document.createElement('span');
    spanTitle.className = 'text-xs font-bold text-slate-500 uppercase';
    spanTitle.textContent = `Senarai Pegawai (${un})`;

    const btnSelectAll = document.createElement('button');
    btnSelectAll.type = 'button';
    btnSelectAll.className = 'text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-100 hover:bg-indigo-200 px-3 py-1.5 rounded transition-colors shadow-sm focus:outline-none';
    btnSelectAll.textContent = 'Pilih Semua / Batal';
    btnSelectAll.addEventListener('click', selectAllInUnit);

    headerDiv.appendChild(spanTitle);
    headerDiv.appendChild(btnSelectAll);
    nc.appendChild(headerDiv);

    const fragment = document.createDocumentFragment();

    groupedData[sk][un].sort((a, b) => a.nama.localeCompare(b.nama)).forEach((p, i) => {
      const isChecked = globalSelected.has(p.emel);

      const rowDiv = document.createElement('div');
      rowDiv.className = 'flex items-center mb-2 hover:bg-indigo-50/70 p-2 rounded transition-colors border border-transparent hover:border-indigo-100';

      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.id = `c_${i}`;
      chk.value = p.nama;
      chk.setAttribute('data-email', p.emel);
      chk.checked = isChecked;
      chk.className = 'w-4 h-4 text-indigo-600 rounded unit-checkbox focus:ring-indigo-500 cursor-pointer';
      chk.addEventListener('change', function() {
        togglePenerima(this.value, this.getAttribute('data-email'), this.checked);
      });

      const lbl = document.createElement('label');
      lbl.htmlFor = `c_${i}`;
      lbl.className = 'ml-3 text-sm font-medium text-slate-700 cursor-pointer flex-1 select-none';
      lbl.textContent = p.nama;

      rowDiv.appendChild(chk);
      rowDiv.appendChild(lbl);
      fragment.appendChild(rowDiv);
    });

    nc.appendChild(fragment);
  } else {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'text-slate-400 italic text-sm mt-1';
    msgDiv.textContent = 'Sila Pilih Unit Dahulu';
    nc.appendChild(msgDiv);
  }
};

window.handleCarianDaftar = function(e) {
  const query = e.target.value.toLowerCase();
  const dropdown = document.getElementById('dropdownCarianUtama');
  dropdown.textContent = '';

  if (query.length < 2) {
    dropdown.classList.add('hidden');
    return;
  }

  const results = globalPegawaiFlat.filter(p =>
    (p.nama && p.nama.toLowerCase().includes(query)) ||
    (p.sektor && p.sektor.toLowerCase().includes(query)) ||
    (p.unit && p.unit.toLowerCase().includes(query))
  ).slice(0, 15);

  if (results.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'p-3 text-sm text-slate-500 italic text-center font-medium';
    emptyDiv.textContent = 'Tiada padanan rekod dijumpai...';
    dropdown.appendChild(emptyDiv);
  } else {
    results.forEach(p => {
      const div = document.createElement('div');
      div.className = "p-3 hover:bg-indigo-50 border-b border-slate-100 cursor-pointer transition-colors group";

      const nameDiv = document.createElement('div');
      nameDiv.className = "text-sm font-bold text-slate-700 group-hover:text-indigo-700";
      nameDiv.textContent = p.nama;

      const unitDiv = document.createElement('div');
      unitDiv.className = "text-xs text-slate-500 mt-0.5 group-hover:text-indigo-500 font-medium";
      unitDiv.textContent = `${p.sektor.replace(/^\d{2}\s/, '')} - ${p.unit}`;

      div.appendChild(nameDiv);
      div.appendChild(unitDiv);

      div.addEventListener('click', () => {
        selectPegawaiCarian(p.emel_rasmi, p.nama, p.sektor, p.unit);
      });

      dropdown.appendChild(div);
    });
  }
  dropdown.classList.remove('hidden');
};

window.selectPegawaiCarian = function(emel, nama, sektor, unit) {
  const input = document.getElementById('carianPegawaiUtama');
  const dropdown = document.getElementById('dropdownCarianUtama');
  const elSektor = document.getElementById('sektor');
  const elUnit = document.getElementById('unit');

  elSektor.value = sektor;
  populateUnit();
  elUnit.value = unit;

  globalSelected.set(emel, nama);
  populateNama();
  renderTags();

  input.value = '';
  dropdown.classList.add('hidden');
};

window.togglePenerima = function(nama, emel, isChecked) {
  if (isChecked) {
    globalSelected.set(emel, nama);
  } else {
    globalSelected.delete(emel);
  }
  renderTags();
};

window.selectAllInUnit = function() {
  const checkboxes = document.querySelectorAll('.unit-checkbox');
  if (checkboxes.length === 0) return;

  const allChecked = Array.from(checkboxes).every(c => c.checked);

  checkboxes.forEach(c => {
    c.checked = !allChecked;
    togglePenerima(c.value, c.getAttribute('data-email'), !allChecked);
  });
};

window.removeTag = function(emel) {
  globalSelected.delete(emel);
  const cb = document.querySelector(`.unit-checkbox[data-email="${emel}"]`);
  if (cb) cb.checked = false;
  renderTags();
};

function createCloseIconSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'w-4 h-4');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('viewBox', '0 0 24 24');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('d', 'M6 18L18 6M6 6l12 12');

  svg.appendChild(path);
  return svg;
}

function renderTags() {
  const container = document.getElementById('selectedTagsContainer');
  const emailInput = document.getElementById('email');

  container.textContent = '';

  if (globalSelected.size === 0) {
    const emptySpan = document.createElement('span');
    emptySpan.className = 'text-sm text-slate-400 italic mt-1 ml-1';
    emptySpan.textContent = 'Belum ada penerima dipilih...';
    container.appendChild(emptySpan);
    emailInput.value = '';
    return;
  }

  const emails = [];
  const fragment = document.createDocumentFragment();

  globalSelected.forEach((nama, emel) => {
    emails.push(emel);

    const tagDiv = document.createElement('div');
    tagDiv.className = 'inline-flex items-center bg-indigo-50 text-indigo-700 text-xs font-bold px-3 py-1.5 rounded-full border border-indigo-200 shadow-sm transition-transform hover:-translate-y-0.5';

    const spanNama = document.createElement('span');
    spanNama.textContent = nama;

    const btnRemove = document.createElement('button');
    btnRemove.type = 'button';
    btnRemove.setAttribute('data-email', emel);
    btnRemove.className = 'ml-2 text-indigo-400 hover:text-red-500 focus:outline-none transition-colors';
    btnRemove.appendChild(createCloseIconSvg());
    btnRemove.addEventListener('click', function() {
      removeTag(this.getAttribute('data-email'));
    });

    tagDiv.appendChild(spanNama);
    tagDiv.appendChild(btnRemove);
    fragment.appendChild(tagDiv);
  });

  container.appendChild(fragment);
  emailInput.value = emails.join(', ');
}

const toBase64 = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result);
  reader.onerror = error => reject(error);
});

async function handleEarlyUpload(input) {
  if (!input.files || input.files.length === 0) return;

  const file = input.files[0];
  const MAX_SIZE_MB = 5;
  const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

  if (file.size > MAX_SIZE_BYTES) {
    resetFileUpload();
    return showMessage(`Saiz fail melebihi had dibenarkan (${MAX_SIZE_MB}MB). Sila mampatkan fail anda sebelum muat naik.`, "error");
  }

  let resolvedMimeType = file.type;
  if (!resolvedMimeType) {
    const ext = file.name.split('.').pop().toLowerCase();
    const mimeMap = {
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'pdf': 'application/pdf',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg'
    };
    resolvedMimeType = mimeMap[ext] || 'application/octet-stream';
  }

  const statusDiv = document.getElementById('uploadStatus');
  const loader = document.getElementById('uploadLoader');
  const text = document.getElementById('uploadText');
  const link = document.getElementById('fileLink');
  const resetBtn = document.getElementById('resetFileBtn');
  const formUtamaDiv = document.getElementById('borangUtama');
  const masaRekodInput = document.getElementById('masaRekod');
  const hiddenUrlInput = document.getElementById('uploadedFileUrl');
  const hiddenTxnInput = document.getElementById('transactionId');

  statusDiv.classList.remove('hidden');
  loader.classList.remove('hidden');
  text.textContent = "Sedang memuat naik fail ke Drive pelayan...";
  text.classList.replace('text-emerald-600', 'text-slate-600');
  link.classList.add('hidden');
  resetBtn.classList.add('hidden');
  input.disabled = true;

  try {
    const readyPromise = window.ENV_READY || window.appConfigReady;
    if (readyPromise && typeof readyPromise.then === 'function') {
      await readyPromise;
    }

    const gasUrl = window.GAS_URL || window.GAS_ENDPOINT_URL;
    if (!gasUrl) throw new Error("Endpoint Google Apps Script belum sedia.");

    const base64Full = await toBase64(file);

    const res = await fetch(gasUrl, {
      method: 'POST',
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: 'upload',
        fileBase64: base64Full.split(',')[1],
        fileName: file.name,
        fileMimeType: resolvedMimeType
      })
    });

    const data = JSON.parse(await res.text());
    if (data.status !== 'success') throw new Error(data.message);

    const txnId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'TXN_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);

    if (hiddenUrlInput) hiddenUrlInput.value = data.fileUrl;
    if (hiddenTxnInput) hiddenTxnInput.value = txnId;

    text.textContent = "Fail Sedia: ";
    text.classList.replace('text-slate-600', 'text-emerald-600');
    loader.classList.add('hidden');
    link.href = data.fileUrl;
    link.classList.remove('hidden');
    resetBtn.classList.remove('hidden');

    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    if (masaRekodInput) masaRekodInput.value = `${hours}:${minutes}`;

    formUtamaDiv.classList.remove('hidden');
    setTimeout(() => { formUtamaDiv.classList.remove('opacity-0'); }, 50);

    showMessage("Muat naik fail disahkan. Masa rekod telah ditetapkan, sila lengkapkan maklumat borang.", "success");
  } catch (err) {
    text.textContent = "Ralat pelayan: Sila cuba lagi.";
    text.classList.replace('text-slate-600', 'text-red-500');
    loader.classList.add('hidden');
    input.disabled = false;
    resetBtn.classList.remove('hidden');
    if (hiddenUrlInput) hiddenUrlInput.value = '';
    if (hiddenTxnInput) hiddenTxnInput.value = '';
    showMessage("Gagal muat naik fail: " + err.message, "error");
  }
}

function resetFileUpload() {
  const hiddenUrlInput = document.getElementById('uploadedFileUrl');
  const hiddenTxnInput = document.getElementById('transactionId');
  if (hiddenUrlInput) hiddenUrlInput.value = "";
  if (hiddenTxnInput) hiddenTxnInput.value = "";

  const input = document.getElementById('salinanSurat');
  if (input) {
    input.value = "";
    input.disabled = false;
  }
  const statusEl = document.getElementById('uploadStatus');
  if (statusEl) statusEl.classList.add('hidden');

  const masaRekodInput = document.getElementById('masaRekod');
  if (masaRekodInput) masaRekodInput.value = "";

  const formUtamaDiv = document.getElementById('borangUtama');
  if (formUtamaDiv) {
    formUtamaDiv.classList.add('opacity-0');
    setTimeout(() => { formUtamaDiv.classList.add('hidden'); }, 500);
  }
}

async function resolveManagerList(client) {
  let adminList = [];

  try {
    const { data, error } = await client.rpc('get_manager_roles');
    if (!error && Array.isArray(data) && data.length > 0) {
      adminList = data;
    }
  } catch (rpcErr) {}

  if (adminList.length === 0 && window.CacheService && typeof window.CacheService.getAll === 'function') {
    try {
      const cachedAdmins = await window.CacheService.getAll('memo_admin', 'id', true);
      if (Array.isArray(cachedAdmins) && cachedAdmins.length > 0) {
        adminList = cachedAdmins;
      }
    } catch (cacheErr) {}
  }

  if (adminList.length === 0) {
    adminList = (Array.isArray(globalPegawaiFlat) ? globalPegawaiFlat : [])
      .filter(p => p && p.emel_rasmi && window.isManagerRole && window.isManagerRole(p.unit))
      .map(p => {
        const unitUpper = String(p.unit || '').trim().toUpperCase();
        return {
          email: p.emel_rasmi,
          role: unitUpper.startsWith('KETUA UNIT') ? 'KETUA UNIT' : unitUpper
        };
      });
  }

  return adminList;
}

async function handleFormSubmit(e) {
  e.preventDefault();
  if (isSubmittingForm) return;

  const hiddenUrlInput = document.getElementById('uploadedFileUrl');
  const currentFileUrl = hiddenUrlInput ? hiddenUrlInput.value.trim() : "";

  if (!currentFileUrl) return showMessage("Pautan fail tidak dijumpai. Sila muat naik dokumen semula.", "error");
  if (globalSelected.size === 0) return showMessage("Sila pilih sekurang-kurangnya 1 penerima.", "error");

  isSubmittingForm = true;
  setLoading(true, "Mengesahkan Hierarki Sistem...");

  try {
    const readyPromise = window.ENV_READY || window.appConfigReady;
    if (readyPromise && typeof readyPromise.then === 'function') {
      await readyPromise;
    }

    const client = window._supabase;
    const gasUrl = window.GAS_URL || window.GAS_ENDPOINT_URL;
    if (!client || !gasUrl) throw new Error("Konfigurasi pelayan belum sedia.");

    const names = Array.from(globalSelected.values());
    const emels = Array.from(globalSelected.keys());
    const currentUnit = document.getElementById('unit').value;

    const adminList = await resolveManagerList(client);

    const managerRoles = ['TPPD', 'KETUA SEKTOR', 'KETUA UNIT'];
    const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
    const normalizeRole = (value) => String(value || '').trim().toUpperCase();

    const managerEmails = (adminList || [])
      .filter(a => managerRoles.includes(normalizeRole(a.role)))
      .map(a => normalizeEmail(a.email))
      .filter(email => email);

    const tppdEmails = (adminList || [])
      .filter(a => normalizeRole(a.role) === 'TPPD')
      .map(a => normalizeEmail(a.email))
      .filter(email => email);

    let currentSelectedEmails = emels.map(e => normalizeEmail(e)).filter(email => email);
    const isAnyTPPDSelected = currentSelectedEmails.some(email => tppdEmails.includes(email));
    const isPureManagement = currentSelectedEmails.length > 0 && currentSelectedEmails.every(email => managerEmails.includes(email));

    let isManagerDeferred = false;

    if (isPureManagement) {
      isManagerDeferred = true;

      if (isAnyTPPDSelected) {
        tppdEmails.forEach(tppdEmail => {
          if (!currentSelectedEmails.includes(tppdEmail)) {
            emels.push(tppdEmail);
            currentSelectedEmails.push(tppdEmail);
            const pegInfo = globalPegawaiFlat.find(p => normalizeEmail(p.emel_rasmi) === tppdEmail);
            names.push(pegInfo ? pegInfo.nama : 'PENGURUSAN TPPD (KOLABORATIF)');
          }
        });
      }
    } else {
      isManagerDeferred = false;
    }

    setLoading(true, "Menyimpan Data...");

    const sessionStr = sessionStorage.getItem('memo_admin_session');
    const adminData = sessionStr ? JSON.parse(sessionStr) : null;
    const perakamEmail = adminData ? adminData.email : '';

    const newRecordPayload = {
      sektor: document.getElementById('sektor').value,
      unit: currentUnit,
      nama_penerima: names.join(', '),
      emel_penerima: emels.join(', '),
      no_rujukan: document.getElementById('noRujukan').value.toUpperCase(),
      no_tambahan: document.getElementById('noTambahan').value.toUpperCase(),
      tarikh_surat: document.getElementById('tarikhSurat').value,
      dari: document.getElementById('dari').value.toUpperCase(),
      tajuk_program: document.getElementById('tajukProgram').value.toUpperCase(),
      tarikh_terima: document.getElementById('tarikhTerima').value,
      masa_rekod: document.getElementById('masaRekod').value,
      file_url: currentFileUrl
    };

    const { data: rec, error: subError } = await client.from('memo_rekod').insert([newRecordPayload]).select();

    if (subError) throw subError;

    if (window.CacheService) {
      await window.CacheService.clearStore('memo_rekod');
    }

    setLoading(true, isManagerDeferred ? "Menghantar Notifikasi Pengurusan..." : "Menghantar Notifikasi RSVP & Kalendar...");

    const gasAction = isManagerDeferred ? 'notifyManager' : 'notify';

    const res = await fetch(gasUrl, {
      method: 'POST',
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: gasAction,
        sektor: document.getElementById('sektor').value,
        unit: currentUnit,
        namaArray: names,
        emailArray: emels,
        noRujukan: document.getElementById('noRujukan').value.toUpperCase(),
        tajukProgram: document.getElementById('tajukProgram').value.toUpperCase(),
        tarikhTerima: document.getElementById('tarikhTerima').value,
        masaRekod: document.getElementById('masaRekod').value,
        fileUrl: currentFileUrl,
        perakamEmail: perakamEmail
      })
    });
    const notify = JSON.parse(await res.text());

    if (notify.status === 'error') {
      throw new Error("Pangkalan data dikemaskini, TETAPI pelayan emel Google memulangkan ralat: " + (notify.message || "Gagal menghantar notifikasi."));
    }

    if (notify.status === 'success' && notify.calendarEventId) {
      const finalEventId = isManagerDeferred ? 'PENDING_' + notify.calendarEventId : notify.calendarEventId;
      await client.from('memo_rekod').update({ calendar_event_id: finalEventId }).eq('id', rec[0].id);
    }

    if (isManagerDeferred) {
      showMessage("<strong>Penerimaan Pengurusan Dikesan.</strong><br><br>Rekod surat disimpan. Notifikasi emel telah dihantar kepada barisan Pengurusan (TPPD/KS/KU) untuk tujuan delegasi.", "success");
    } else {
      showMessage("<strong>Rekod & Agihan Berjaya!</strong><br><br>Surat disimpan dan jemputan kalendar (RSVP) telah dihantar secara automatik terus kepada semua pegawai penerima.", "success");
    }

    const calFrame = document.getElementById('calendarFrame');
    if (calFrame) calFrame.src = calFrame.src;

    resetForm();

  } catch (err) {
    showMessage("Ralat Transaksi: " + err.message, "error");
  } finally {
    isSubmittingForm = false;
    setLoading(false);
  }
}

function setLoading(status, txt) {
  const btn = document.getElementById('submitBtn');
  const bt = document.getElementById('btnText');
  if (!btn || !bt) return;
  btn.disabled = status;
  bt.textContent = '';

  if (status) {
    const loader = document.createElement('div');
    loader.className = 'loader mr-2 border-white border-top-indigo-500';
    const span = document.createElement('span');
    span.textContent = txt;
    bt.appendChild(loader);
    bt.appendChild(span);
  } else {
    bt.textContent = 'Simpan & Hantar Rekod';
  }
}

window.showMessage = function(m, t) {
  let iconType = 'info';
  let titleText = 'Makluman';

  if (t === 'error') {
    iconType = 'error';
    titleText = 'Ralat Sistem';
  } else if (t === 'success') {
    iconType = 'success';
    titleText = 'Berjaya';
  }

  Swal.fire({
    title: titleText,
    html: m,
    icon: iconType,
    confirmButtonColor: '#4f46e5',
    confirmButtonText: 'Tutup',
    customClass: {
      confirmButton: 'text-sm font-bold',
      popup: 'rounded-2xl',
      title: 'text-slate-800'
    }
  });
};

function resetForm() {
  const mainForm = document.getElementById('mainForm');
  const inputCarian = document.getElementById('carianPegawaiUtama');

  if (mainForm) mainForm.reset();
  if (inputCarian) inputCarian.value = '';

  resetFileUpload();
  globalSelected.clear();
  renderTags();
  populateUnit();
}

window.loadPublicPegawaiData = loadPublicPegawaiData;
window.processPegawai = processPegawai;