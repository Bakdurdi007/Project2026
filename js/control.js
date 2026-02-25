// --- O'ZGARUVCHILAR ---
const LESSON_DURATION_MINUTES = 60; // Dars davomiyligi
let activeTimers = []; // Taymerlarni tozalash uchun
let targetInstructorIdForEnd = null; // Tugatish uchun ID

document.addEventListener('DOMContentLoaded', () => {
    // Admin ismini chiqarish
    const name = localStorage.getItem('userName') || 'Admin';
    const adminDisplay = document.getElementById('adminNameDisplay');
    if (adminDisplay) adminDisplay.textContent = name;

    // Ma'lumotlarni yuklash (Ikkala bo'lim uchun)
    fetchInstructors();       // Instruktorlar ro'yxati (Tahrirlash bo'limi)
    fetchMonitoringData();    // Jonli nazorat paneli

    // Har 30 soniyada nazorat panelini yangilab turish
    setInterval(fetchMonitoringData, 30000);

    // Forma yuborish (Instruktor qo'shish/tahrirlash)
    const instructorForm = document.getElementById('instructorForm');
    if (instructorForm) {
        instructorForm.addEventListener('submit', handleFormSubmit);
    }
});

// =========================================================================
// 1-BO'LIM: INSTRUKTORLARNI BOSHQARISH (QO'SHISH, TAHRIRLASH, O'CHIRISH)
// =========================================================================

async function fetchInstructors() {
    const { data, error } = await _supabase
        .from('instructors')
        .select('*')
        .order('id', { ascending: false });

    const tbody = document.getElementById('instructorsTableBody');
    if (!tbody || error) return;
    tbody.innerHTML = '';

    data.forEach(ins => {
        const statusClass = ins.status ? 'status-active' : 'status-inactive';
        const statusText = ins.status ? 'Bo`sh' : 'Band';
        const typeClass = ins.source === 'hamkor' ? 'type-hamkor' : 'type-filial';
        const typeText = ins.source === 'hamkor' ? 'Hamkor' : 'Filial';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${ins.id}</td>
            <td class="fw-bold">${ins.full_name}</td>
            <td><code>${ins.login}</code></td>
            <td><span class="badge-car ${typeClass}">${ins.car_number}</span></td>
            <td><span class="${typeClass}" style="padding: 4px 10px; border-radius: 8px; font-size: 12px;">${typeText}</span></td>
            <td><span class="${statusClass}">${statusText}</span></td>
            <td>
                <div class="action-buttons">
                    <button onclick="viewInstructor(${ins.id})" class="btn-icon view" title="Ko'rish">👁️</button>
                    <button id="edit-btn-${ins.id}" class="btn-icon edit" title="Tahrirlash">✏️</button>
                    <button onclick="openDeleteModal(${ins.id}, ${ins.status})" class="btn-icon delete" title="O'chirish">🗑️</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
        document.getElementById(`edit-btn-${ins.id}`).onclick = () => editInstructor(ins);
    });
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const instructorId = document.getElementById('instructorId').value;
    const submitBtn = document.getElementById('submitBtn');

    const instructorData = {
        full_name: document.getElementById('fullName').value,
        car_number: document.getElementById('carNumber').value.toUpperCase(),
        login: document.getElementById('login').value,
        password: document.getElementById('password').value,
        source: document.getElementById('source').value,
        status: true,
        updated_at: new Date().toISOString()
    };

    submitBtn.disabled = true;
    let result = instructorId
        ? await _supabase.from('instructors').update(instructorData).eq('id', instructorId)
        : await _supabase.from('instructors').insert([instructorData]);

    if (result.error) {
        showAlert("Xatolik: " + result.error.message, 'error');
    } else {
        showAlert(instructorId ? "Yangilandi!" : "Qo'shildi!", 'success');
        resetInstructorForm();
        fetchInstructors();
        fetchMonitoringData(); // Nazorat panelini ham yangilash
    }
    submitBtn.disabled = false;
}

function editInstructor(ins) {
    if (ins.status === false) {
        showAlert("Hozir instructor band", "error");
        return;
    }
    document.getElementById('instructorId').value = ins.id;
    document.getElementById('fullName').value = ins.full_name;
    document.getElementById('carNumber').value = ins.car_number;
    document.getElementById('login').value = ins.login;
    document.getElementById('password').value = ins.password;
    document.getElementById('source').value = ins.source || 'hamkor';
    document.getElementById('submitBtn').textContent = "Yangilash";
}

// =========================================================================
// 2-BO'LIM: JONLI NAZORAT PANELI (TIMER VA RPC FUNKSIYA)
// =========================================================================

// --- JONLI NAZORAT PANELI FUNKSIYASI ---
async function fetchMonitoringData() {
    const { data: instructors, error } = await _supabase.from('instructors').select('*').order('id', { ascending: true });
    if (error) return;

    // Navbatdagi faol chiptani topish
    const { data: nextTicket } = await _supabase
        .from('tickets')
        .select('id')
        .eq('is_active', true)
        .order('id', { ascending: true })
        .limit(1).maybeSingle();

    const activeIds = instructors.filter(i => i.active_ticket_id).map(i => i.active_ticket_id);
    let ticketsData = [];

    if (activeIds.length > 0) {
        // DIQQAT: Bu yerda 'minute' ustunini ham qo'shib oldik
        const { data: t } = await _supabase
            .from('tickets')
            .select('id, lesson_start_time, minute')
            .in('id', activeIds);
        ticketsData = t || [];
    }

    const tbody = document.getElementById('monitoringTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Eski taymerlarni tozalash
    activeTimers.forEach(clearInterval);
    activeTimers = [];

    instructors.forEach((ins, idx) => {
        const row = document.createElement('tr');
        const carClass = ins.source === 'hamkor' ? 'car-hamkor' : 'car-filial';
        const statusClass = ins.status ? 'status-free' : 'status-busy';
        const statusText = ins.status ? 'Bo`sh' : 'Band';

        row.innerHTML = `
            <td>${idx + 1}</td>
            <td class="fw-bold">${ins.full_name}</td>
            <td><span class="badge-car ${carClass}">${ins.car_number}</span></td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td><span id="mon-timer-${ins.id}" class="timer-red">00:00:00</span></td>
            <td>${!ins.status ? `<button class="btn-end-lesson" onclick="openEndLessonModal(${ins.id})">Tugatish</button>` : ''}</td>
            <td><span style="color: #3b82f6; font-weight: bold;">${ins.status && nextTicket ? '#' + nextTicket.id : '-'}</span></td>
        `;
        tbody.appendChild(row);

        const timerEl = document.getElementById(`mon-timer-${ins.id}`);
        if (ins.active_ticket_id) {
            const tInfo = ticketsData.find(t => t.id === ins.active_ticket_id);
            // Endi funksiyaga tInfo.minute qiymatini ham yuboramiz
            if (tInfo) startLiveTimer(tInfo.lesson_start_time, tInfo.minute, timerEl);
        }
    });
}

// --- TAYMERNI DINAMIK MINUT BILAN ISHLATISH ---
function startLiveTimer(startTimeIso, plannedMinutes, element) {
    const start = new Date(startTimeIso).getTime();
    // Rejalashtirilgan minutni millisekundga aylantiramiz: minute * 60 * 1000
    const end = start + (plannedMinutes * 60 * 1000);

    const intrvl = setInterval(() => {
        const now = new Date().getTime();
        const diff = end - now;

        if (diff <= 0) {
            element.textContent = "00:00:00";
            element.className = "timer-red";
            clearInterval(intrvl);
            return;
        }

        // hh:mm:ss formatini hisoblash
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);

        element.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

        // Ranglarni boshqarish (10 daqiqa qolganda sariq bo'ladi)
        if (diff <= 10 * 60 * 1000) {
            element.className = "timer-yellow";
        } else {
            element.className = "timer-green";
        }
    }, 1000);

    activeTimers.push(intrvl);
}

// --- RPC FUNKSIYANI CHAQIRISH (TUGATISH TUGMASI) ---

function openEndLessonModal(id) {
    targetInstructorIdForEnd = id;
    document.getElementById('endLessonModal').style.display = 'flex';
}

function closeEndLessonModal() {
    document.getElementById('endLessonModal').style.display = 'none';
}

document.getElementById('confirmEndBtn').onclick = async () => {
    if (!targetInstructorIdForEnd) return;
    const btn = document.getElementById('confirmEndBtn');
    btn.textContent = "Kuting...";
    btn.disabled = true;

    // MUHIM: Parametr nomi SQL'dagi bilan bir xil bo'lishi kerak: current_inst_id
    const { error } = await _supabase.rpc('end_lesson_complete', {
        current_inst_id: targetInstructorIdForEnd
    });

    if (error) {
        alert("Xatolik: " + error.message);
    } else {
        closeEndLessonModal();
        fetchMonitoringData();
        fetchInstructors();
    }
    btn.textContent = "Ha";
    btn.disabled = false;
};

// =========================================================================
// YORDAMCHI FUNKSIYALAR
// =========================================================================

let deleteTargetId = null;
function openDeleteModal(id, status) {
    if (status === false) { showAlert("Hozir instructor band", "error"); return; }
    deleteTargetId = id;
    document.getElementById('deleteModal').style.display = 'flex';
}

document.getElementById('confirmDeleteBtn').onclick = async () => {
    await _supabase.from('instructors').delete().eq('id', deleteTargetId);
    closeModal('deleteModal');
    fetchInstructors();
};

function resetInstructorForm() {
    document.getElementById('instructorForm').reset();
    document.getElementById('instructorId').value = '';
    document.getElementById('submitBtn').textContent = "Qo'shish";
}

function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function showAlert(m, t) {
    const modal = document.getElementById('alertModal');
    document.getElementById('alertMessage').textContent = m;
    const title = document.getElementById('alertTitle');
    title.textContent = t === 'error' ? "Xatolik!" : "Muvaffaqiyatli!";
    title.style.color = t === 'error' ? "#ef4444" : "#10b981";
    modal.style.display = 'flex';
}

window.onclick = (e) => { if (e.target.classList.contains('modal')) e.target.style.display = 'none'; };