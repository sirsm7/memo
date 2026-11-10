window.openPegawaiModal = function(pegawai = null) {
  const form = document.getElementById('formPegawai');
  const sSelect = document.getElementById('pegawaiSektorSelect');
  const uSelect = document.getElementById('pegawaiUnitSelect');
  const sManual = document.getElementById('pegawaiSektorManual');
  const uManual = document.getElementById('pegawaiUnitManual');

  if (form) form.reset();
  if (sManual) sManual.classList.add('hidden');
  if (uManual) uManual.classList.add('hidden');

  const dataPegawai = typeof adminPegawaiData !== 'undefined' ? adminPegawaiData : [];
  const unikSektor = [...new Set(dataPegawai.map(p => p.sektor).filter(Boolean))].sort();
  const unikUnit = [...new Set(dataPegawai.map(p => p.unit).filter(Boolean))].sort();

  if (sSelect) {
    sSelect.textContent = '';
    const defOpt = document.createElement('option');
    defOpt.value = "";
    defOpt.textContent = "-- PILIH SEKTOR --";
    sSelect.appendChild(defOpt);

    unikSektor.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      sSelect.appendChild(opt);
    });

    const newOpt = document.createElement('option');
    newOpt.value = "MANUAL";
    newOpt.textContent = "++ TAMBAH SEKTOR BAHARU ++";
    sSelect.appendChild(newOpt);
  }

  if (uSelect) {
    uSelect.textContent = '';
    const defUOpt = document.createElement('option');
    defUOpt.value = "";
    defUOpt.textContent = "-- PILIH UNIT --";
    uSelect.appendChild(defUOpt);

    unikUnit.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u;
      opt.textContent = u;
      uSelect.appendChild(opt);
    });

    const newUOpt = document.createElement('option');
    newUOpt.value = "MANUAL";
    newUOpt.textContent = "++ TAMBAH UNIT BAHARU ++";
    uSelect.appendChild(newUOpt);
  }

  const titleEl = document.getElementById('modalPegawaiTitle');
  const idEl = document.getElementById('pegawaiId');
  const namaEl = document.getElementById('pegawaiNama');
  const emelEl = document.getElementById('pegawaiEmel');

  if (pegawai) {
    if (titleEl) titleEl.textContent = "Kemaskini Data Pegawai";
    if (idEl) idEl.value = pegawai.id || "";
    if (namaEl) namaEl.value = pegawai.nama || "";
    if (emelEl) emelEl.value = pegawai.emel_rasmi || "";
    if (sSelect) sSelect.value = pegawai.sektor || "";
    if (uSelect) uSelect.value = pegawai.unit || "";
  } else {
    if (titleEl) titleEl.textContent = "Tambah Pegawai Baharu";
    if (idEl) idEl.value = "";
  }

  if (typeof toggleModal === 'function') {
    toggleModal('modalPegawai', true);
  }
};

window.editPegawai = function(id) {
  const dataPegawai = typeof adminPegawaiData !== 'undefined' ? adminPegawaiData : [];
  const p = dataPegawai.find(x => x.id === id);
  if (p) window.openPegawaiModal(p);
};

async function handlePegawaiSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('pegawaiId')?.value || '';

  let finalSektor = document.getElementById('pegawaiSektorSelect')?.value || '';
  if (finalSektor === 'MANUAL') {
    finalSektor = document.getElementById('pegawaiSektorManual')?.value || '';
  }

  let finalUnit = document.getElementById('pegawaiUnitSelect')?.value || '';
  if (finalUnit === 'MANUAL') {
    finalUnit = document.getElementById('pegawaiUnitManual')?.value || '';
  }

  finalSektor = finalSektor.trim();
  finalUnit = finalUnit.trim();

  if (!finalSektor || !finalUnit) {
    return window.showMessage("Sila pilih atau masukkan Sektor dan Unit.", "error");
  }

  const payload = {
    nama: (document.getElementById('pegawaiNama')?.value || '').trim().toUpperCase(),
    sektor: finalSektor.toUpperCase(),
    unit: finalUnit.toUpperCase(),
    emel_rasmi: (document.getElementById('pegawaiEmel')?.value || '').trim().toLowerCase()
  };

  try {
    if (window.appConfigReady && typeof window.appConfigReady.then === 'function') {
      await window.appConfigReady;
    }
    const client = window._supabase;
    if (!client) throw new Error("Supabase tidak tersedia.");

    if (id) {
      await client.from('memo_pegawai').update(payload).eq('id', id);
      window.showMessage("Data pegawai berjaya dikemaskini.", "success");
    } else {
      await client.from('memo_pegawai').insert([payload]);
      window.showMessage("Pegawai baharu berjaya didaftarkan.", "success");
    }

    if (window.CacheService) await window.CacheService.clearStore('memo_pegawai');
    if (typeof toggleModal === 'function') toggleModal('modalPegawai', false);
    if (typeof loadAdminPegawai === 'function') loadAdminPegawai();
  } catch (err) {
    window.showMessage("Gagal menyimpan pegawai: " + err.message, "error");
  }
}

window.deletePegawai = function(id) {
  Swal.fire({
    title: 'Pengesahan Pemadaman',
    text: "Adakah anda pasti mahu memadam profil pegawai ini daripada sistem?",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#94a3b8',
    confirmButtonText: 'Ya, Padam',
    cancelButtonText: 'Batal',
    customClass: { popup: 'rounded-2xl', confirmButton: 'text-sm font-bold', cancelButton: 'text-sm font-bold' }
  }).then(async (result) => {
    if (result.isConfirmed) {
      try {
        if (window.appConfigReady && typeof window.appConfigReady.then === 'function') {
          await window.appConfigReady;
        }
        const client = window._supabase;
        if (!client) throw new Error("Supabase tidak tersedia.");

        await client.from('memo_pegawai').delete().eq('id', id);
        if (window.CacheService) await window.CacheService.clearStore('memo_pegawai');
        if (typeof loadAdminPegawai === 'function') loadAdminPegawai();

        window.showMessage("Pegawai telah dikeluarkan dari sistem.", "success");
      } catch (err) {
        window.showMessage("Ralat padam: " + err.message, "error");
      }
    }
  });
};

window.handleCarianAdminEdit = function(e) {
  const query = (e.target.value || '').toLowerCase().trim();
  const dropdown = document.getElementById('dropdownCarianEdit');
  if (!dropdown) return;
  dropdown.textContent = '';

  if (query.length < 2) {
    dropdown.classList.add('hidden');
    return;
  }

  const dataPegawai = typeof adminPegawaiData !== 'undefined' ? adminPegawaiData : [];
  const results = dataPegawai.filter(p => 
    (p.nama && p.nama.toLowerCase().includes(query)) || 
    (p.sektor && p.sektor.toLowerCase().includes(query)) || 
    (p.unit && p.unit.toLowerCase().includes(query))
  ).slice(0, 15);

  if (results.length === 0) {
    const div = document.createElement('div');
    div.className = 'p-3 text-sm text-slate-500 italic text-center font-medium';
    div.textContent = 'Tiada padanan rekod dijumpai...';
    dropdown.appendChild(div);
  } else {
    results.forEach(p => {
      const div = document.createElement('div');
      div.className = "p-3 hover:bg-indigo-50 border-b border-slate-100 cursor-pointer transition-colors group";

      const nDiv = document.createElement('div');
      nDiv.className = "text-sm font-bold text-slate-700 group-hover:text-indigo-700";
      nDiv.textContent = p.nama;

      const sDiv = document.createElement('div');
      sDiv.className = "text-xs text-slate-500 mt-0.5 group-hover:text-indigo-500 font-medium";
      sDiv.textContent = (p.sektor || '').replace(/^\d{2}\s/, '') + " - " + (p.unit || '');

      div.appendChild(nDiv);
      div.appendChild(sDiv);
      div.addEventListener('click', () => selectPegawaiCarianEdit(p.emel_rasmi, p.nama, p.sektor, p.unit));

      dropdown.appendChild(div);
    });
  }
  dropdown.classList.remove('hidden');
};

window.selectPegawaiCarianEdit = function(emel, nama, sektor, unit) {
  const input = document.getElementById('carianPegawaiEdit');
  const dropdown = document.getElementById('dropdownCarianEdit');
  const elSektor = document.getElementById('adminEditSektor');
  const elUnit = document.getElementById('adminEditUnit');

  if (elSektor) elSektor.value = sektor;
  populateAdminEditUnit();
  if (elUnit) elUnit.value = unit;

  if (typeof adminEditSelected !== 'undefined') {
    adminEditSelected.set(emel, nama);
  }
  populateAdminEditNama();
  renderAdminEditTags();

  if (input) input.value = '';
  if (dropdown) dropdown.classList.add('hidden');
};

function populateAdminEditSektor() {
  const sSelect = document.getElementById('adminEditSektor');
  if (!sSelect) return;
  const dataPegawai = typeof adminPegawaiData !== 'undefined' ? adminPegawaiData : [];
  const unikSektor = [...new Set(dataPegawai.map(p => p.sektor).filter(Boolean))].sort();

  sSelect.textContent = '';
  const defOpt = document.createElement('option');
  defOpt.value = "";
  defOpt.textContent = "-- Pilih Sektor --";
  sSelect.appendChild(defOpt);

  unikSektor.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    sSelect.appendChild(opt);
  });
}

function populateAdminEditUnit() {
  const sk = document.getElementById('adminEditSektor')?.value || '';
  const uSelect = document.getElementById('adminEditUnit');
  const nc = document.getElementById('adminEditNamaContainer');
  if (!uSelect || !nc) return;

  uSelect.textContent = '';
  const defOpt = document.createElement('option');
  defOpt.value = "";
  defOpt.textContent = "-- Pilih Unit --";
  uSelect.appendChild(defOpt);

  const dataPegawai = typeof adminPegawaiData !== 'undefined' ? adminPegawaiData : [];

  if (sk) {
    const unitSektor = dataPegawai.filter(p => p.sektor === sk).map(p => p.unit).filter(Boolean);
    const unikUnit = [...new Set(unitSektor)].sort();

    unikUnit.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u;
      opt.textContent = u;
      uSelect.appendChild(opt);
    });
    uSelect.disabled = false;

    nc.textContent = '';
    const warn = document.createElement('div');
    warn.className = 'text-slate-400 italic text-sm mt-1';
    warn.textContent = 'Sila Pilih Unit Dahulu';
    nc.appendChild(warn);
  } else {
    uSelect.disabled = true;
    nc.textContent = '';
    const warn = document.createElement('div');
    warn.className = 'text-slate-400 italic text-sm mt-1';
    warn.textContent = 'Sila Pilih Sektor & Unit Dahulu';
    nc.appendChild(warn);
  }
}

function populateAdminEditNama() {
  const sk = document.getElementById('adminEditSektor')?.value || '';
  const un = document.getElementById('adminEditUnit')?.value || '';
  const nc = document.getElementById('adminEditNamaContainer');
  if (!nc) return;
  nc.textContent = '';

  const dataPegawai = typeof adminPegawaiData !== 'undefined' ? adminPegawaiData : [];

  if (sk && un) {
    const header = document.createElement('div');
    header.className = 'flex items-center justify-between pb-2 mb-2 border-b border-slate-200 sticky top-0 bg-slate-50 z-10';

    const title = document.createElement('span');
    title.className = 'text-xs font-bold text-slate-500 uppercase';
    title.textContent = `Senarai Pegawai (${un})`;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-100 hover:bg-indigo-200 px-3 py-1.5 rounded transition-colors shadow-sm focus:outline-none';
    btn.textContent = 'Pilih Semua / Batal';
    btn.addEventListener('click', window.selectAllAdminEditInUnit);

    header.appendChild(title);
    header.appendChild(btn);
    nc.appendChild(header);

    const pegs = dataPegawai.filter(p => p.sektor === sk && p.unit === un).sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));

    pegs.forEach((p, i) => {
      const isChecked = typeof adminEditSelected !== 'undefined' && adminEditSelected.has(p.emel_rasmi);

      const div = document.createElement('div');
      div.className = 'flex items-center mb-2 hover:bg-indigo-50/70 p-2 rounded transition-colors border border-transparent hover:border-indigo-100';

      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.id = `ae_c_${i}`;
      chk.value = p.nama;
      chk.className = 'w-4 h-4 text-indigo-600 rounded ae-checkbox focus:ring-indigo-500';
      chk.checked = isChecked;
      chk.setAttribute('data-email', p.emel_rasmi);
      chk.addEventListener('change', function() {
        toggleAdminEditPenerima(this.value, this.getAttribute('data-email'), this.checked);
      });

      const lbl = document.createElement('label');
      lbl.htmlFor = `ae_c_${i}`;
      lbl.className = 'ml-3 text-sm font-medium text-slate-700 cursor-pointer flex-1 select-none';
      lbl.textContent = p.nama;

      div.appendChild(chk);
      div.appendChild(lbl);
      nc.appendChild(div);
    });
  } else {
    const warn = document.createElement('div');
    warn.className = 'text-slate-400 italic text-sm mt-1';
    warn.textContent = 'Sila Pilih Unit Atau Gunakan Carian Pantas Dahulu';
    nc.appendChild(warn);
  }
}

window.toggleAdminEditPenerima = function(nama, emel, isChecked) {
  if (typeof adminEditSelected === 'undefined') return;
  if (isChecked) adminEditSelected.set(emel, nama);
  else adminEditSelected.delete(emel);
  renderAdminEditTags();
};

window.selectAllAdminEditInUnit = function() {
  const checkboxes = document.querySelectorAll('.ae-checkbox');
  if (checkboxes.length === 0) return;
  const allChecked = Array.from(checkboxes).every(c => c.checked);
  checkboxes.forEach(c => {
    c.checked = !allChecked;
    toggleAdminEditPenerima(c.value, c.getAttribute('data-email'), !allChecked);
  });
};

window.removeAdminEditTag = function(emel) {
  if (typeof adminEditSelected !== 'undefined') {
    adminEditSelected.delete(emel);
  }
  const cb = document.querySelector(`.ae-checkbox[data-email="${emel}"]`);
  if (cb) cb.checked = false;
  renderAdminEditTags();
};

function renderAdminEditTags() {
  const container = document.getElementById('adminEditSelectedTagsContainer');
  if (!container) return;
  container.textContent = '';

  if (typeof adminEditSelected === 'undefined' || adminEditSelected.size === 0) {
    const span = document.createElement('span');
    span.className = 'text-sm text-slate-400 italic mt-1 ml-1';
    span.textContent = 'Belum ada penerima dipilih...';
    container.appendChild(span);
    return;
  }

  adminEditSelected.forEach((nama, emel) => {
    const div = document.createElement('div');
    div.className = 'inline-flex items-center bg-indigo-50 text-indigo-700 text-xs font-bold px-3 py-1.5 rounded-full border border-indigo-200 shadow-sm transition-transform hover:-translate-y-0.5';

    const span = document.createElement('span');
    span.textContent = nama;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ml-2 text-indigo-400 hover:text-red-500 focus:outline-none transition-colors';
    btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>';
    btn.addEventListener('click', () => removeAdminEditTag(emel));

    div.appendChild(span);
    div.appendChild(btn);
    container.appendChild(div);
  });
}

window.editMemo = function(id) {
  const dataMemo = typeof adminMemoData !== 'undefined' ? adminMemoData : [];
  let m = dataMemo.find(x => x.id === id);
  if (!m && typeof allRecords !== 'undefined') {
    m = allRecords.find(x => x.id === id);
  }
  if (!m) return window.showMessage("Ralat pangkalan data: Memo tidak dijumpai.", "error");

  const memoIdEl = document.getElementById('memoId');
  const noRujEl = document.getElementById('memoNoRujukan');
  const noTamEl = document.getElementById('memoNoTambahan');
  const dariEl = document.getElementById('memoDari');
  const tajukEl = document.getElementById('memoTajuk');
  const tarikhSuratEl = document.getElementById('memoTarikhSurat');
  const tarikhTerimaEl = document.getElementById('memoTarikhTerima');
  const masaRekodEl = document.getElementById('memoMasaRekod');
  const carianEditEl = document.getElementById('carianPegawaiEdit');
  const dropEditEl = document.getElementById('dropdownCarianEdit');

  if (memoIdEl) memoIdEl.value = m.id;
  if (noRujEl) noRujEl.value = m.no_rujukan || '';
  if (noTamEl) noTamEl.value = m.no_tambahan || '';
  if (dariEl) dariEl.value = m.dari || '';
  if (tajukEl) tajukEl.value = m.tajuk_program || '';
  if (tarikhSuratEl) tarikhSuratEl.value = m.tarikh_surat || '';
  if (tarikhTerimaEl) tarikhTerimaEl.value = m.tarikh_terima || '';
  if (masaRekodEl) masaRekodEl.value = m.masa_rekod || '';

  if (carianEditEl) carianEditEl.value = '';
  if (dropEditEl) dropEditEl.classList.add('hidden');

  if (typeof adminEditSelected !== 'undefined') {
    adminEditSelected.clear();
    if (m.emel_penerima && m.nama_penerima) {
      const emels = m.emel_penerima.split(',').map(e => e.trim());
      const namas = m.nama_penerima.split(',').map(n => n.trim());
      emels.forEach((e, i) => {
        if (e) adminEditSelected.set(e, namas[i] || e);
      });
    }
  }

  populateAdminEditSektor();
  const sSelect = document.getElementById('adminEditSektor');
  if (sSelect) sSelect.value = m.sektor || '';

  populateAdminEditUnit();
  const uSelect = document.getElementById('adminEditUnit');
  if (uSelect) uSelect.value = m.unit || '';

  populateAdminEditNama();
  renderAdminEditTags();

  if (typeof toggleModal === 'function') {
    toggleModal('modalMemo', true);
  }
};

async function handleMemoSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('memoId')?.value;
  const btn = document.getElementById('btnSimpanMemo');

  const dataMemo = typeof adminMemoData !== 'undefined' ? adminMemoData : [];
  let m = dataMemo.find(x => x.id == id);
  if (!m && typeof allRecords !== 'undefined') {
    m = allRecords.find(x => x.id == id);
  }
  if (!m) return window.showMessage("Ralat pangkalan data: Memo tidak dijumpai.", "error");

  if (typeof adminEditSelected === 'undefined' || adminEditSelected.size === 0) {
    return window.showMessage("Sila pilih sekurang-kurangnya 1 pegawai penerima dari senarai unit.", "error");
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<div class="loader mr-2 border-slate-300 border-top-slate-500 w-4 h-4"></div> Memproses...';
  }

  try {
    if (window.appConfigReady && typeof window.appConfigReady.then === 'function') {
      await window.appConfigReady;
    }
    const client = window._supabase;
    if (!client) throw new Error("Supabase tidak tersedia.");

    const names = Array.from(adminEditSelected.values());
    const emails = Array.from(adminEditSelected.keys());
    const targetSektor = document.getElementById('adminEditSektor')?.value || '';
    const targetUnit = document.getElementById('adminEditUnit')?.value || '';

    const oldEmailsStr = m.emel_penerima || "";
    const oldEmailsArr = oldEmailsStr.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

    const newlyAddedEmails = [];
    const newlyAddedNames = [];

    emails.forEach(e => {
      if (!oldEmailsArr.includes(e.trim().toLowerCase())) {
        newlyAddedEmails.push(e);
        newlyAddedNames.push(adminEditSelected.get(e) || e);
      }
    });

    const isEmailAdded = newlyAddedEmails.length > 0;
    const currentAdminUser = window.currentAdmin || (typeof currentAdmin !== 'undefined' ? currentAdmin : null);
    const adminEmail = (currentAdminUser && currentAdminUser.email) ? currentAdminUser.email.toLowerCase() : '';

    const dataPegawai = typeof adminPegawaiData !== 'undefined' ? adminPegawaiData : [];
    const managerProfile = dataPegawai.find(p => p.emel_rasmi && p.emel_rasmi.toLowerCase() === adminEmail);
    const actualDelegasiNama = managerProfile ? managerProfile.nama : ((currentAdminUser && (currentAdminUser.managerUnit || currentAdminUser.role)) || 'Pentadbir Sistem');

    const payload = {
      no_rujukan: (document.getElementById('memoNoRujukan')?.value || '').trim().toUpperCase(),
      no_tambahan: (document.getElementById('memoNoTambahan')?.value || '').trim().toUpperCase(),
      dari: (document.getElementById('memoDari')?.value || '').trim().toUpperCase(),
      tajuk_program: (document.getElementById('memoTajuk')?.value || '').trim().toUpperCase(),
      tarikh_surat: document.getElementById('memoTarikhSurat')?.value || '',
      tarikh_terima: document.getElementById('memoTarikhTerima')?.value || '',
      masa_rekod: document.getElementById('memoMasaRekod')?.value || '',
      sektor: targetSektor,
      unit: targetUnit,
      nama_penerima: names.join(', '),
      emel_penerima: emails.join(', ')
    };

    const { error } = await client.from('memo_rekod').update(payload).eq('id', id);
    if (error) throw error;

    if (window.CacheService) await window.CacheService.clearStore('memo_rekod');

    let messageText = "Maklumat surat dikemaskini. (Tiada notifikasi e-mel tambahan dihantar)";

    if (isEmailAdded && window.GAS_URL) {
      try {
        await fetch(window.GAS_URL, {
          method: 'POST',
          redirect: "follow",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: 'notifyExtraEmailsOnly',
            sektor: targetSektor,
            unit: targetUnit,
            newEmailsOnly: newlyAddedEmails,
            delegasiNama: actualDelegasiNama,
            picNames: newlyAddedNames,
            noRujukan: payload.no_rujukan || 'TIADA',
            tajukProgram: payload.tajuk_program,
            fileUrl: m.file_url || 'Tiada Salinan'
          })
        });
        messageText = `Maklumat dikemaskini. (Notifikasi e-mel telah dipancarkan kepada ${newlyAddedEmails.length} penerima tambahan sahaja)`;
      } catch (gasErr) {
        messageText = "Maklumat dikemaskini, tetapi sistem gagal menghubungi pelayan e-mel.";
      }
    }

    if (typeof toggleModal === 'function') toggleModal('modalMemo', false);

    if (currentAdminUser && currentAdminUser.isSystemAdmin && typeof loadAdminMemo === 'function') {
      loadAdminMemo();
    }
    if (typeof loadDashboardData === 'function') loadDashboardData();

    window.showMessage("Selesai. " + messageText, "success");
  } catch (err) {
    window.showMessage("Ralat Transaksi: Gagal mengemaskini maklumat surat. " + err.message, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Simpan & Kemaskini';
    }
  }
}

async function handleTambahAdminSubmit(e) {
  e.preventDefault();
  const emailInput = document.getElementById('tambahAdminEmail');
  const passInput = document.getElementById('tambahAdminPassword');
  const roleSelect = document.getElementById('tambahAdminRole');
  const btn = document.getElementById('btnSimpanAdmin');

  const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
  const pass = passInput ? passInput.value.trim() : '';
  const role = roleSelect ? roleSelect.value.trim() : '';

  if (!email || !pass || !role) {
    return window.showMessage("Sila lengkapkan semua medan mandatori.", "error");
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<div class="loader mr-2 border-white border-top-indigo-500"></div> Menyimpan...';
  }

  try {
    if (window.appConfigReady && typeof window.appConfigReady.then === 'function') {
      await window.appConfigReady;
    }
    const client = window._supabase;
    if (!client) throw new Error("Supabase tidak tersedia.");

    await client.from('memo_admin').insert([{
      email: email,
      password: pass,
      role: role
    }]);

    if (window.CacheService) await window.CacheService.clearStore('memo_admin');
    if (typeof loadAdminSistem === 'function') loadAdminSistem();

    if (typeof toggleModal === 'function') toggleModal('modalTambahAdmin', false);
    const form = document.getElementById('formTambahAdmin');
    if (form) form.reset();
    window.showMessage(`Akses pengguna baharu berjawatan ${role} berjaya didaftarkan.`, "success");
  } catch (err) {
    window.showMessage("Gagal menambah akses sistem: " + err.message, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Daftar Pengguna';
    }
  }
}

window.deleteAdmin = function(id) {
  Swal.fire({
    title: 'Gugurkan Akses',
    text: "Gugurkan akses sistem ini secara kekal?",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#94a3b8',
    confirmButtonText: 'Ya, Gugurkan',
    cancelButtonText: 'Batal',
    customClass: { popup: 'rounded-2xl', confirmButton: 'text-sm font-bold', cancelButton: 'text-sm font-bold' }
  }).then(async (result) => {
    if (result.isConfirmed) {
      try {
        if (window.appConfigReady && typeof window.appConfigReady.then === 'function') {
          await window.appConfigReady;
        }
        const client = window._supabase;
        if (!client) throw new Error("Supabase tidak tersedia.");

        await client.from('memo_admin').delete().eq('id', id);
        if (window.CacheService) await window.CacheService.clearStore('memo_admin');
        if (typeof loadAdminSistem === 'function') loadAdminSistem();

        window.showMessage("Akses profil telah berjaya dibatalkan.", "success");
      } catch (err) {
        window.showMessage("Gagal membatalkan akses profil.", "error");
      }
    }
  });
};

window.handlePegawaiSubmit = handlePegawaiSubmit;
window.handleMemoSubmit = handleMemoSubmit;
window.populateAdminEditSektor = populateAdminEditSektor;
window.populateAdminEditUnit = populateAdminEditUnit;
window.populateAdminEditNama = populateAdminEditNama;
window.renderAdminEditTags = renderAdminEditTags;
window.handleTambahAdminSubmit = handleTambahAdminSubmit;