// =============================================
//  GRANDEUR — Firebase Realtime Database
//  Full Hotel Management Logic
// =============================================

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.database();

// ── Auth Guard ───────────────────────────────
auth.onAuthStateChanged(user => {
  if (!user) { location.href = 'index.html'; return; }
  const name = user.displayName || user.email.split('@')[0];
  setText('uName',    name);
  setText('uInitial', name[0].toUpperCase());
  setText('sHotelName', HOTEL.name);
  document.title = HOTEL.name + ' — Hotel Management';
  initApp();
});

function doLogout() {
  auth.signOut().then(() => location.href = 'index.html');
}

// ── Clock ────────────────────────────────────
setInterval(() => {
  const d = new Date();
  setText('clk', d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true})
    + ' · ' + d.toLocaleDateString('en-IN',{day:'2-digit',month:'short'}));
}, 1000);

// ── State ────────────────────────────────────
let rooms    = {};   // { id: roomObj }
let bookings = {};   // { id: bookingObj }
let bills    = {};   // { id: billObj }

// ── Init ─────────────────────────────────────
function initApp() {
  setDefaultDates();

  // Real-time listeners on Realtime Database
  db.ref('rooms').on('value', snap => {
    rooms = snap.val() || {};
    renderRooms();
    populateRoomDDL();
    refreshDash();
  });

  db.ref('bookings').orderByChild('checkIn').on('value', snap => {
    bookings = snap.val() || {};
    renderBookings();
    renderCustomers();
    refreshDash();
  });

  db.ref('bills').orderByChild('createdAt').on('value', snap => {
    bills = snap.val() || {};
    renderBills();
    refreshDash();
  });
}

// ============================================
//  NAVIGATION
// ============================================
const TITLES = {
  dashboard:'Dashboard', rooms:'Room Management', bookings:'Bookings',
  customers:'Customer History', billing:'Bills History', reports:'Reports & Analytics'
};

function go(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.navbtn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelectorAll('.navbtn').forEach(b => {
    if (b.getAttribute('onclick')?.includes("'"+page+"'")) b.classList.add('active');
  });
  setText('tbarTitle', TITLES[page] || page);
  if (page === 'reports') loadReport();
}

// ============================================
//  DASHBOARD
// ============================================
function refreshDash() {
  const rArr = Object.values(rooms);
  const bArr = Object.values(bookings);
  const biArr = sortedBills();

  setText('ds-tot', rArr.length);
  setText('ds-av',  rArr.filter(r => r.status === 'available').length);
  setText('ds-oc',  rArr.filter(r => r.status === 'occupied').length);
  setText('ds-re',  rArr.filter(r => r.status === 'reserved').length);

  const todayPfx = new Date().toISOString().slice(0,10);
  const todayRev = biArr.filter(b => new Date(b.createdAt).toISOString().slice(0,10) === todayPfx)
                        .reduce((s,b) => s + b.totalAmount, 0);
  setText('ds-rev', fmt(todayRev));

  // Active guests
  const active = bArr.filter(b => b.status === 'checked_in');
  const gEl = document.getElementById('dGuests');
  if (!active.length) {
    gEl.innerHTML = `<div class="empty"><i class="bi bi-moon-stars"></i><p>No guests checked in</p></div>`;
  } else {
    gEl.innerHTML = `<div class="dtable-wrap"><table class="dtable">
      <thead><tr><th>Guest</th><th>Room</th><th>Check-In</th><th>Action</th></tr></thead>
      <tbody>${active.sort((a,b)=>b.checkIn-a.checkIn).map(b => `<tr>
        <td><div style="display:flex;align-items:center;gap:8px">
          <div class="av">${b.guestName[0].toUpperCase()}</div>
          <div><div style="font-weight:600;color:white">${esc(b.guestName)}</div>
            <div style="font-size:.73rem;color:var(--muted)">${esc(b.guestPhone)}</div></div>
        </div></td>
        <td><span class="badge b-oc">Room ${esc(b.roomNumber)}</span></td>
        <td style="font-size:.8rem;color:var(--slate)">${fmtTs(b.checkIn)}</td>
        <td><button class="btn btn-ok btn-xs" onclick="openBillModal('${b.id}')">
          <i class="bi bi-receipt"></i> Bill</button></td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  // Recent bills
  const bEl = document.getElementById('dBills');
  const rec  = biArr.slice(0, 6);
  if (!rec.length) {
    bEl.innerHTML = `<div class="empty"><i class="bi bi-receipt"></i><p>No bills yet</p></div>`;
  } else {
    bEl.innerHTML = rec.map(b => `
      <div style="display:flex;justify-content:space-between;align-items:center;
                  padding:11px 20px;border-bottom:1px solid rgba(255,255,255,.04)">
        <div>
          <div style="font-weight:600;color:white;font-size:.87rem">${esc(b.guestName)}</div>
          <div style="font-size:.72rem;color:var(--muted)">Rm ${esc(b.roomNumber)} · ${esc(b.paymentMode)}</div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:700;color:var(--amber)">${fmt(b.totalAmount)}</div>
          <a onclick="openInv('${b.id}')" style="font-size:.72rem;color:#2dd4bf;cursor:pointer">View</a>
        </div>
      </div>`).join('') +
      `<div style="display:flex;justify-content:space-between;padding:11px 20px;background:var(--navy3);font-size:.84rem">
        <span style="color:var(--muted)">Total Revenue</span>
        <span style="font-weight:700;color:var(--amber)">${fmt(biArr.reduce((s,b)=>s+b.totalAmount,0))}</span>
      </div>`;
  }
}

// ============================================
//  ROOMS  (RTDB)
// ============================================
let editRoomId = null;

function openRoomModal(id = null) {
  editRoomId = id;
  const r = id ? rooms[id] : null;
  setText('rmTitle', r ? 'Edit Room' : 'Add New Room');
  setVal('rmNum',    r?.roomNumber  || '');
  setVal('rmType',   r?.roomType    || '');
  setVal('rmPrice',  r?.pricePerDay || '');
  setVal('rmStatus', r?.status      || 'available');
  setVal('rmDesc',   r?.description || '');
  openMod('roomModal');
}

async function saveRoom() {
  const num   = gv('rmNum').trim();
  const type  = gv('rmType');
  const price = parseFloat(gv('rmPrice'));
  if (!num || !type || isNaN(price)) { toast('Fill all required fields','err'); return; }

  const data = {
    roomNumber:  num,
    roomType:    type,
    pricePerDay: price,
    status:      gv('rmStatus'),
    description: gv('rmDesc').trim(),
    updatedAt:   firebase.database.ServerValue.TIMESTAMP
  };

  try {
    if (editRoomId) {
      await db.ref('rooms/' + editRoomId).update(data);
    } else {
      data.createdAt = firebase.database.ServerValue.TIMESTAMP;
      await db.ref('rooms').push(data);
    }
    closeMod('roomModal');
    toast('Room saved!', 'ok');
  } catch(e) { toast('Error: ' + e.message, 'err'); }
}

async function deleteRoom(id) {
  if (rooms[id]?.status === 'occupied') { toast('Room is occupied — checkout first','err'); return; }
  if (!confirm('Delete Room ' + rooms[id]?.roomNumber + '?')) return;
  await db.ref('rooms/' + id).remove();
  toast('Room deleted','ok');
}

function renderRooms() {
  const grid = document.getElementById('roomsGrid');
  const arr  = Object.entries(rooms).sort((a,b) => a[1].roomNumber?.localeCompare(b[1].roomNumber));
  if (!arr.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><i class="bi bi-door-open"></i><p>No rooms yet</p></div>`;
    return;
  }
  grid.innerHTML = arr.map(([id,r]) => {
    const bc = r.status === 'available' ? 'b-av' : r.status === 'occupied' ? 'b-oc' : 'b-re';
    return `<div class="rcard">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div><div class="rnum">${esc(r.roomNumber)}</div><div class="rtype">${esc(r.roomType)}</div></div>
        <span class="badge ${bc}"><i class="bi bi-circle-fill"></i>${cap(r.status)}</span>
      </div>
      <div class="rprice">${fmt(r.pricePerDay)}<span style="font-size:.68rem;color:var(--muted);font-weight:400">/night</span></div>
      ${r.description ? `<div style="font-size:.73rem;color:var(--muted);margin-top:4px">${esc(r.description)}</div>` : ''}
      <div class="ract">
        <button class="btn btn-s btn-xs" onclick="openRoomModal('${id}')"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-d btn-xs" onclick="deleteRoom('${id}')"><i class="bi bi-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}

function populateRoomDDL() {
  const sel = document.getElementById('bkRoom');
  const cur = sel.value;
  const avail = Object.entries(rooms).filter(([,r]) => r.status === 'available' || r.status === 'reserved');
  sel.innerHTML = '<option value="">Select room…</option>' +
    avail.sort((a,b)=>a[1].roomNumber?.localeCompare(b[1].roomNumber)).map(([id,r]) =>
      `<option value="${id}" data-price="${r.pricePerDay}" data-num="${esc(r.roomNumber)}" data-type="${esc(r.roomType)}">
        Room ${esc(r.roomNumber)} — ${esc(r.roomType)} — ${fmt(r.pricePerDay)}/night</option>`).join('');
  if (cur) sel.value = cur;
}

// ============================================
//  BOOKINGS  (RTDB)
// ============================================
let editBkId = null;

function openBkModal(id = null) {
  editBkId = id;
  const b = id ? bookings[id] : null;
  const now = new Date(); now.setSeconds(0,0);
  setText('bkTitle', b ? 'Edit Booking' : 'New Booking / Check-In');
  setVal('bkId',   '');
  setVal('bkName', b?.guestName  || '');
  setVal('bkPhone',b?.guestPhone || '');
  setVal('bkId2',  b?.idProof   || '');
  setVal('bkAddr', b?.address   || '');
  setVal('bkCI',   toLocalDT(b?.checkIn ? new Date(b.checkIn) : now));
  setVal('bkCO',   b?.checkOut  ? toLocalDT(new Date(b.checkOut)) : '');
  setVal('bkRoom', b?.roomId    || '');
  setVal('bkTyp',  b?.type      || 'checkin');
  toggleCoField();
  updatePreview();
  openMod('bkModal');
}

function toggleCoField() {
  document.getElementById('bkCOGrp').style.opacity = gv('bkTyp') === 'reservation' ? '1' : '0.5';
}

function updatePreview() {
  const sel   = document.getElementById('bkRoom');
  const opt   = sel.options[sel.selectedIndex];
  const prev  = document.getElementById('bkPreview');
  if (!opt?.dataset?.price) { prev.style.display = 'none'; return; }
  const price  = parseFloat(opt.dataset.price);
  const cin    = new Date(gv('bkCI'));
  const cout   = new Date(gv('bkCO'));
  const days   = isNaN(cout.getTime()) ? 1 : Math.max(1, Math.ceil((cout - cin) / 86400000));
  setText('bkRmLbl', `Room ${opt.dataset.num} × ${days} night(s)`);
  setText('bkRmAmt', fmt(days * price));
  setText('bkTot',   fmt(days * price));
  prev.style.display = 'block';
}

async function saveBk() {
  const name  = gv('bkName').trim();
  const phone = gv('bkPhone').trim();
  const roomId = gv('bkRoom');
  const cin   = gv('bkCI');
  if (!name || !phone || !roomId || !cin) { toast('Fill all required fields','err'); return; }

  const sel   = document.getElementById('bkRoom');
  const opt   = sel.options[sel.selectedIndex];
  const type  = gv('bkTyp');
  const cout  = gv('bkCO');
  const newRoomStatus = type === 'checkin' ? 'occupied' : 'reserved';

  const data = {
    guestName:  name,
    guestPhone: phone,
    idProof:    gv('bkId2').trim(),
    address:    gv('bkAddr').trim(),
    roomId,
    roomNumber: opt.dataset.num,
    roomPrice:  parseFloat(opt.dataset.price),
    roomType:   opt.dataset.type,
    checkIn:    new Date(cin).getTime(),
    checkOut:   cout ? new Date(cout).getTime() : null,
    type,
    status:     type === 'checkin' ? 'checked_in' : 'reserved',
    updatedAt:  firebase.database.ServerValue.TIMESTAMP
  };

  try {
    if (editBkId) {
      await db.ref('bookings/' + editBkId).update(data);
    } else {
      data.createdAt = firebase.database.ServerValue.TIMESTAMP;
      await db.ref('bookings').push(data);
    }
    // Free old room if editing and room changed
    if (editBkId && bookings[editBkId]?.roomId !== roomId) {
      await db.ref('rooms/' + bookings[editBkId].roomId).update({ status: 'available' });
    }
    await db.ref('rooms/' + roomId).update({ status: newRoomStatus });
    closeMod('bkModal');
    toast(type === 'checkin' ? 'Guest checked in!' : 'Reservation saved!', 'ok');
  } catch(e) { toast('Error: ' + e.message, 'err'); }
}

async function convertToCheckin(id) {
  const b = bookings[id];
  if (!b) return;
  await db.ref('bookings/' + id).update({
    status: 'checked_in', type: 'checkin',
    checkIn: firebase.database.ServerValue.TIMESTAMP
  });
  await db.ref('rooms/' + b.roomId).update({ status: 'occupied' });
  toast('Converted to check-in!','ok');
}

async function deleteBk(id) {
  if (!confirm('Delete this booking?')) return;
  const b = bookings[id];
  await db.ref('bookings/' + id).remove();
  if (b?.roomId && b.status !== 'checked_out')
    await db.ref('rooms/' + b.roomId).update({ status: 'available' });
  toast('Booking deleted','ok');
}

function renderBookings() {
  const wrap = document.getElementById('bkWrap');
  const arr  = sortedBookings();
  if (!arr.length) {
    wrap.innerHTML = `<div class="empty"><i class="bi bi-calendar-x"></i><p>No bookings yet</p></div>`;
    return;
  }
  wrap.innerHTML = `<div class="dtable-wrap"><table class="dtable">
    <thead><tr><th>Guest</th><th>Room</th><th>Check-In</th><th>Check-Out</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${arr.map(b => {
      const bc = b.status === 'checked_in' ? 'b-oc' : b.status === 'reserved' ? 'b-re' : 'b-co';
      return `<tr>
        <td><div style="display:flex;align-items:center;gap:8px">
          <div class="av">${b.guestName[0].toUpperCase()}</div>
          <div><div style="font-weight:600;color:white">${esc(b.guestName)}</div>
            <div style="font-size:.72rem;color:var(--muted)">${esc(b.guestPhone)}</div></div>
        </div></td>
        <td><span class="badge b-re">Rm ${esc(b.roomNumber)}</span></td>
        <td style="font-size:.8rem;color:var(--slate)">${fmtTs(b.checkIn)}</td>
        <td style="font-size:.8rem;color:var(--slate)">${fmtTs(b.checkOut)}</td>
        <td><span class="badge ${bc}"><i class="bi bi-circle-fill"></i>${cap((b.status||'').replace('_',' '))}</span></td>
        <td style="white-space:nowrap">
          ${b.status === 'checked_in'
            ? `<button class="btn btn-ok btn-xs me-1" onclick="openBillModal('${b.id}')"><i class="bi bi-receipt"></i> Bill</button>`
            : b.status === 'reserved'
            ? `<button class="btn btn-p btn-xs me-1" onclick="convertToCheckin('${b.id}')"><i class="bi bi-door-open"></i> Check-In</button>`
            : ''}
          <button class="btn btn-d btn-xs" onclick="deleteBk('${b.id}')"><i class="bi bi-trash"></i></button>
        </td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

function renderCustomers() {
  const wrap = document.getElementById('custWrap');
  const arr  = sortedBookings();
  if (!arr.length) {
    wrap.innerHTML = `<div class="empty"><i class="bi bi-people"></i><p>No customers yet</p></div>`;
    return;
  }
  wrap.innerHTML = `<div class="dtable-wrap"><table class="dtable">
    <thead><tr><th>Name</th><th>Phone</th><th>ID Proof</th><th>Room</th><th>Check-In</th><th>Check-Out</th><th>Status</th></tr></thead>
    <tbody>${arr.map(b => {
      const bc = b.status === 'checked_in' ? 'b-oc' : b.status === 'reserved' ? 'b-re' : 'b-co';
      return `<tr>
        <td><div style="display:flex;align-items:center;gap:8px">
          <div class="av">${b.guestName[0].toUpperCase()}</div>
          <span style="font-weight:600;color:white">${esc(b.guestName)}</span>
        </div></td>
        <td style="color:var(--slate)">${esc(b.guestPhone)}</td>
        <td style="color:var(--muted);font-size:.8rem">${esc(b.idProof||'—')}</td>
        <td><span class="badge b-re">Rm ${esc(b.roomNumber)}</span></td>
        <td style="font-size:.79rem;color:var(--slate)">${fmtTs(b.checkIn)}</td>
        <td style="font-size:.79rem;color:var(--slate)">${fmtTs(b.checkOut)}</td>
        <td><span class="badge ${bc}"><i class="bi bi-circle-fill"></i>${cap((b.status||'').replace('_',' '))}</span></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

// ============================================
//  BILLING  (RTDB)
// ============================================
let billingBk = null;

function openBillModal(bkId) {
  billingBk = { id: bkId, ...bookings[bkId] };
  if (!billingBk.guestName) return;
  setVal('blBkId', bkId);
  const now = new Date(); now.setSeconds(0,0);
  setVal('blCO', toLocalDT(now));
  document.getElementById('extraRows').innerHTML = '';
  document.getElementById('blGuestSum').innerHTML = `
    <div class="bline"><span style="font-weight:600;color:white">${esc(billingBk.guestName)}</span>
      <span style="color:var(--muted)">${esc(billingBk.guestPhone)}</span></div>
    <div class="bline"><span>Room ${esc(billingBk.roomNumber)}</span><span>${fmt(billingBk.roomPrice)}/night</span></div>
    <div class="bline"><span>Checked-In</span><span style="color:var(--slate)">${fmtTs(billingBk.checkIn)}</span></div>`;
  recalc();
  openMod('billModal');
}

function addExtra() {
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;gap:9px;margin-bottom:9px;align-items:center';
  div.innerHTML = `
    <input type="text" class="fc ex-desc" placeholder="Description (Food, Laundry…)" style="flex:1">
    <input type="number" class="fc ex-amt" placeholder="Amount" min="0" step="0.01"
           style="max-width:130px" oninput="recalc()">
    <button class="btn btn-d btn-ic btn-sm" onclick="this.parentElement.remove();recalc()">
      <i class="bi bi-x"></i></button>`;
  document.getElementById('extraRows').appendChild(div);
}

function recalc() {
  if (!billingBk) return;
  const cin   = new Date(billingBk.checkIn);
  const cout  = new Date(gv('blCO'));
  const days  = isNaN(cout) ? 1 : Math.max(1, Math.ceil((cout - cin) / 86400000));
  const room  = days * billingBk.roomPrice;
  let extras  = 0;
  document.querySelectorAll('.ex-amt').forEach(el => extras += parseFloat(el.value)||0);
  const total = room + extras;
  document.getElementById('blFinal').innerHTML = `
    <div class="bline"><span>Room ${esc(billingBk.roomNumber)} × ${days} night(s)</span><span>${fmt(room)}</span></div>
    ${extras > 0 ? `<div class="bline"><span>Extra Charges</span><span>${fmt(extras)}</span></div>` : ''}
    <div class="bline"><span>TOTAL</span><span>${fmt(total)}</span></div>`;
}

async function finalizeBill() {
  const bk = billingBk;
  if (!bk) return;
  const cout = new Date(gv('blCO'));
  if (isNaN(cout.getTime())) { toast('Set valid checkout time','err'); return; }

  const cin   = new Date(bk.checkIn);
  const days  = Math.max(1, Math.ceil((cout - cin) / 86400000));
  const roomChg = days * bk.roomPrice;

  const extraItems = [];
  document.querySelectorAll('#extraRows > div').forEach(row => {
    const desc = row.querySelector('.ex-desc').value.trim();
    const amt  = parseFloat(row.querySelector('.ex-amt').value)||0;
    if (desc && amt > 0) extraItems.push({ description: desc, amount: amt });
  });
  const extraTotal = extraItems.reduce((s,e) => s+e.amount, 0);
  const total = roomChg + extraTotal;

  const bill = {
    bookingId:   bk.id,
    guestName:   bk.guestName,
    guestPhone:  bk.guestPhone,
    idProof:     bk.idProof  || '',
    address:     bk.address  || '',
    roomId:      bk.roomId,
    roomNumber:  bk.roomNumber,
    roomType:    bk.roomType  || '',
    roomPrice:   bk.roomPrice,
    daysStayed:  days,
    checkIn:     bk.checkIn,
    checkOut:    cout.getTime(),
    roomCharges: roomChg,
    extraItems,
    extraTotal,
    totalAmount: total,
    paymentMode: gv('blPay'),
    notes:       gv('blNotes').trim(),
    createdAt:   firebase.database.ServerValue.TIMESTAMP
  };

  try {
    const ref = await db.ref('bills').push(bill);
    await db.ref('bookings/' + bk.id).update({ status: 'checked_out', checkOut: cout.getTime() });
    await db.ref('rooms/' + bk.roomId).update({ status: 'available' });
    closeMod('billModal');
    toast('Invoice generated! Room is now free.','ok');
    setTimeout(() => openInv(ref.key), 700);
  } catch(e) { toast('Error: '+e.message,'err'); }
}

function renderBills() {
  const wrap = document.getElementById('billsWrap');
  const arr  = sortedBills();
  if (!arr.length) {
    wrap.innerHTML = `<div class="empty"><i class="bi bi-receipt"></i><p>No bills yet</p></div>`;
    return;
  }
  wrap.innerHTML = `<div class="dtable-wrap"><table class="dtable">
    <thead><tr><th>#</th><th>Guest</th><th>Room</th><th>Nights</th>
      <th>Total</th><th>Mode</th><th>Date</th><th>Action</th></tr></thead>
    <tbody>${arr.map((b,i) => `<tr>
      <td style="color:var(--amber);font-weight:700">#${String(arr.length-i).padStart(4,'0')}</td>
      <td style="font-weight:600;color:white">${esc(b.guestName)}</td>
      <td><span class="badge b-re">Rm ${esc(b.roomNumber)}</span></td>
      <td style="color:var(--muted)">${b.daysStayed}n</td>
      <td style="font-weight:700;color:var(--amber)">${fmt(b.totalAmount)}</td>
      <td style="font-size:.8rem;color:var(--slate)">${esc(b.paymentMode)}</td>
      <td style="font-size:.77rem;color:var(--muted)">${fmtTs(b.createdAt)}</td>
      <td><button class="btn btn-s btn-xs" onclick="openInv('${b.id}')">
        <i class="bi bi-eye"></i> View</button></td>
    </tr>`).join('')}</tbody></table></div>`;
}

// ============================================
//  INVOICE
// ============================================
function openInv(billId) {
  window.open(`invoice.html?bill=${billId}`, '_blank');
}

// ============================================
//  REPORTS
// ============================================
let revCh = null, occCh = null;

function setDefaultDates() {
  const to   = new Date();
  const from = new Date(); from.setDate(1);
  setVal('rpFrom', from.toISOString().slice(0,10));
  setVal('rpTo',   to.toISOString().slice(0,10));
}

function loadReport() {
  const from = new Date(gv('rpFrom') + 'T00:00:00');
  const to   = new Date(gv('rpTo')   + 'T23:59:59');
  const type = gv('rpType');

  const filtered = sortedBills().filter(b => {
    const d = new Date(b.createdAt);
    return d >= from && d <= to;
  });

  const totRev  = filtered.reduce((s,b) => s+b.totalAmount, 0);
  const avgBill = filtered.length ? totRev/filtered.length : 0;
  const rArr    = Object.values(rooms);
  const rngDays = Math.max(1, Math.ceil((to-from)/86400000));
  const occDays = filtered.reduce((s,b) => s+b.daysStayed, 0);
  const occ     = Math.min(100, Math.round(occDays/((rArr.length||1)*rngDays)*100));

  setText('rp-bk', filtered.length);
  setText('rp-rv', fmt(totRev));
  setText('rp-oc', occ + '%');
  setText('rp-av', fmt(avgBill));

  buildRevChart(filtered, type, from, to);
  buildOccChart();
  buildRpTable(filtered);
}

function buildRevChart(bills, type, from, to) {
  const ctx = document.getElementById('revChart').getContext('2d');
  if (revCh) revCh.destroy();
  let labels = [], data = [];

  if (type === 'daily') {
    const map = {};
    const d = new Date(from);
    while (d <= to) { const k = d.toISOString().slice(0,10); map[k]=0; d.setDate(d.getDate()+1); }
    bills.forEach(b => { const k = new Date(b.createdAt).toISOString().slice(0,10); if(map[k]!==undefined) map[k]+=b.totalAmount; });
    labels = Object.keys(map).map(k=>k.slice(5).replace('-','/'));
    data   = Object.values(map);
  } else if (type === 'monthly') {
    const map = {};
    bills.forEach(b => {
      const k = new Date(b.createdAt).toLocaleString('en',{month:'short',year:'2-digit'});
      map[k] = (map[k]||0) + b.totalAmount;
    });
    labels = Object.keys(map); data = Object.values(map);
  } else {
    const map = {};
    bills.forEach(b => {
      const k = new Date(b.createdAt).getFullYear().toString();
      map[k] = (map[k]||0) + b.totalAmount;
    });
    labels = Object.keys(map); data = Object.values(map);
  }

  revCh = new Chart(ctx, {
    type:'bar',
    data:{ labels, datasets:[{ label:'Revenue', data,
      backgroundColor:'rgba(212,164,58,.28)', borderColor:'rgba(212,164,58,.75)',
      borderWidth:1.5, borderRadius:5 }]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{
        x:{ticks:{color:'#64748b'},grid:{color:'rgba(255,255,255,.04)'}},
        y:{ticks:{color:'#64748b'},grid:{color:'rgba(255,255,255,.04)'}}
      }}
  });
}

function buildOccChart() {
  const ctx = document.getElementById('occChart').getContext('2d');
  if (occCh) occCh.destroy();
  const rArr = Object.values(rooms);
  const av = rArr.filter(r=>r.status==='available').length;
  const oc = rArr.filter(r=>r.status==='occupied').length;
  const re = rArr.filter(r=>r.status==='reserved').length;
  const ot = rArr.length - av - oc - re;
  occCh = new Chart(ctx,{
    type:'doughnut',
    data:{ labels:['Available','Occupied','Reserved','Other'],
      datasets:[{ data:[av,oc,re,ot],
        backgroundColor:['rgba(13,148,136,.7)','rgba(225,29,72,.7)','rgba(212,164,58,.7)','rgba(100,116,139,.35)'],
        borderWidth:0 }]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{legend:{labels:{color:'#94a3b8',font:{size:11}}}}}
  });
}

function buildRpTable(bills) {
  const wrap = document.getElementById('rpTable');
  if (!bills.length) {
    wrap.innerHTML = `<div class="empty"><i class="bi bi-table"></i><p>No records in range</p></div>`;
    return;
  }
  wrap.innerHTML = `<div class="dtable-wrap"><table class="dtable">
    <thead><tr>
      <th>#</th><th>Guest</th><th>Room</th><th>Check-In</th><th>Check-Out</th>
      <th>Nights</th><th>Room</th><th>Extras</th><th>Total</th><th>Mode</th>
    </tr></thead>
    <tbody>${bills.map((b,i) => `<tr>
      <td style="color:var(--amber)">${i+1}</td>
      <td style="font-weight:600;color:white">${esc(b.guestName)}</td>
      <td><span class="badge b-re">Rm ${esc(b.roomNumber)}</span></td>
      <td style="font-size:.78rem;color:var(--slate)">${fmtTs(b.checkIn)}</td>
      <td style="font-size:.78rem;color:var(--slate)">${fmtTs(b.checkOut)}</td>
      <td style="color:var(--muted)">${b.daysStayed}</td>
      <td>${fmt(b.roomCharges)}</td>
      <td style="color:var(--muted)">${fmt(b.extraTotal||0)}</td>
      <td style="font-weight:700;color:var(--amber)">${fmt(b.totalAmount)}</td>
      <td style="font-size:.78rem;color:var(--muted)">${esc(b.paymentMode)}</td>
    </tr>`).join('')}
    </tbody></table></div>`;
}

function exportExcel() {
  const from = gv('rpFrom'), to = gv('rpTo');
  const arr  = sortedBills().filter(b => {
    const d = new Date(b.createdAt).toISOString().slice(0,10);
    return d >= from && d <= to;
  });
  const rows = arr.map((b,i) => ({
    '#': i+1, 'Guest': b.guestName, 'Phone': b.guestPhone,
    'Room': b.roomNumber, 'Check-In': fmtTs(b.checkIn),
    'Check-Out': fmtTs(b.checkOut), 'Nights': b.daysStayed,
    'Room Charges': b.roomCharges, 'Extras': b.extraTotal||0,
    'Total': b.totalAmount, 'Payment': b.paymentMode,
    'Date': fmtTs(b.createdAt)
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${HOTEL.name}_Report_${from}_to_${to}.xlsx`);
  toast('Excel exported!','ok');
}

function exportPDF() {
  toast('Opening print dialog for PDF…','info');
  setTimeout(() => window.print(), 500);
}

// ============================================
//  HELPERS
// ============================================
const fmt = n => HOTEL.currency + parseFloat(n||0).toLocaleString('en-IN',{maximumFractionDigits:0});
const gv  = id => document.getElementById(id)?.value || '';
const setVal = (id,v) => { const el=document.getElementById(id); if(el) el.value=v; };
const setText = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
const cap = s => s ? s.charAt(0).toUpperCase()+s.slice(1) : '';
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function fmtTs(ts) {
  if (!ts) return '—';
  const d = new Date(typeof ts === 'number' ? ts : ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
}

function toLocalDT(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0,16);
}

function sortedBills() {
  return Object.entries(bills)
    .map(([id,b]) => ({id,...b}))
    .sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
}

function sortedBookings() {
  return Object.entries(bookings)
    .map(([id,b]) => ({id,...b}))
    .sort((a,b) => (b.checkIn||0) - (a.checkIn||0));
}

function openMod(id)  { document.getElementById(id).classList.add('show'); }
function closeMod(id) { document.getElementById(id).classList.remove('show'); }

document.querySelectorAll('.moverlay').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('show'); });
});

function toast(msg, type='info') {
  const el = document.createElement('div');
  const cls = {ok:'toast-ok',err:'toast-err',info:'toast-info'};
  const ico = {ok:'check-circle-fill',err:'exclamation-circle-fill',info:'info-circle-fill'};
  el.className = `toast ${cls[type]||'toast-info'}`;
  el.innerHTML = `<i class="bi bi-${ico[type]||'info-circle-fill'}"></i> ${msg}`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
