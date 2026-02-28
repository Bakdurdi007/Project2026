document.addEventListener('DOMContentLoaded', () => {
    // Admin ismini chiqarish
    const name = localStorage.getItem('userName') || 'Admin';
    const adminDisplay = document.getElementById('adminNameDisplay');
    if (adminDisplay) adminDisplay.textContent = name;

    // Ma'lumotlarni yuklash
    fetchInstructors();

    // Forma yuborish
    const instructorForm = document.getElementById('instructorForm');
    if (instructorForm) {
        instructorForm.addEventListener('submit', handleFormSubmit);
    }

    // Input cheklovlari
    const loginInput = document.getElementById('login');
    if (loginInput) {
        loginInput.addEventListener('input', (e) => {
            if (e.target.value.length > 12) e.target.value = e.target.value.slice(0, 12);
        });
    }

    const carNumberInput = document.getElementById('carNumber');
    if (carNumberInput) {
        carNumberInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });
    }
});

// --- QIDIRUV TUGMASI UCHUN HODISALAR ---
document.addEventListener('DOMContentLoaded', () => {
    const searchBtn = document.getElementById('searchBtn');
    const searchInput = document.getElementById('phoneSearchInput');

    if(searchBtn && searchInput) {
        // 1. Tugma bosilganda izlash
        searchBtn.addEventListener('click', () => {
            const searchTerm = searchInput.value.trim();
            fetchInstructors(searchTerm);
        });

        // 2. Kiritish maydonida "Enter" bosilganda izlash
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const searchTerm = searchInput.value.trim();
                fetchInstructors(searchTerm);
            }
        });

        // 3. Input tozalanganda (masalan hamma raqamni o'chirib tashlasa) avtomatik yana hammani chiqarish
        searchInput.addEventListener('input', (e) => {
            if(e.target.value.trim() === '') {
                fetchInstructors('');
            }
        });
    }
});

async function fetchInstructors(searchTerm = '') {
    // 1. Avval barcha ma'lumotni olamiz (filtrsiz)
    const { data, error } = await _supabase
        .from('instructors')
        .select('*')
        .order('id', { ascending: false });

    const tbody = document.getElementById('instructorsTableBody');
    if (!tbody || error) {
        if(error) console.error("Xatolik:", error);
        return;
    }

    // 2. JS orqali filtrlash (Bu usulda cast xatosi bo'lmaydi)
    let filteredData = data;
    if (searchTerm) {
        filteredData = data.filter(ins => {
            // Loginni stringga aylantirib, ichida searchTerm borligini tekshiramiz
            return String(ins.login).includes(searchTerm);
        });
    }

    tbody.innerHTML = '';

    if (filteredData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px;">Ma'lumot topilmadi</td></tr>`;
        return;
    }

    // 3. Filtrlangan ma'lumotni ekranga chiqaramiz
    filteredData.forEach(ins => {
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

// --- QO'SHISH VA TAHRIRLASH ---
async function handleFormSubmit(e) {
    e.preventDefault();
    const instructorId = document.getElementById('instructorId').value;
    const submitBtn = document.getElementById('submitBtn');
    const loginValue = document.getElementById('login').value;

    if (loginValue.length > 12) {
        showAlert("Login 12 raqamdan oshmasin!", "error");
        return;
    }

    const instructorData = {
        full_name: document.getElementById('fullName').value,
        car_number: document.getElementById('carNumber').value.toUpperCase(),
        login: loginValue,
        password: document.getElementById('password').value,
        source: document.getElementById('source').value,
        status: true,
        updated_at: new Date().toISOString()
    };

    submitBtn.disabled = true;
    submitBtn.textContent = "Saqlanmoqda...";

    let result = instructorId
        ? await _supabase.from('instructors').update(instructorData).eq('id', instructorId)
        : await _supabase.from('instructors').insert([instructorData]);

    if (result.error) {
        showAlert("Xatolik: " + result.error.message, 'error');
    } else {
        showAlert(instructorId ? "Yangilandi!" : "Qo'shildi!", 'success');
        resetInstructorForm();
        fetchInstructors();
    }
    submitBtn.disabled = false;
    submitBtn.textContent = instructorId ? "Yangilash" : "Qo'shish";
}

// --- TAHRIRLASH ---
function editInstructor(ins) {
    // Holatni tekshirish: agar band (false) bo'lsa, tahrirlashga ruxsat bermaslik
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
    document.querySelector('.info-card').scrollIntoView({ behavior: 'smooth' });
}

// --- O'CHIRISH ---
let deleteTargetId = null;

// Funksiyaga status parametri qo'shildi
function openDeleteModal(id, status) {
    // Holatni tekshirish: agar band (false) bo'lsa, o'chirishga ruxsat bermaslik
    if (status === false) {
        showAlert("Hozir instructor band", "error");
        return;
    }

    deleteTargetId = id;
    document.getElementById('deleteModal').style.display = 'flex';
}

document.getElementById('confirmDeleteBtn').onclick = async () => {
    if (!deleteTargetId) return;
    const { error } = await _supabase.from('instructors').delete().eq('id', deleteTargetId);
    if (!error) {
        closeModal('deleteModal');
        fetchInstructors();
        showAlert("O'chirildi", 'success');
    }
    deleteTargetId = null;
};

// --- KO'RISH ---
async function viewInstructor(id) {
    const { data, error } = await _supabase.from('instructors').select('*').eq('id', id).single();
    if (error || !data) return;

    const details = `
        <div class="instructor-details">
            <div class="detail-row"><span>🆔 ID</span><span class="dots"></span><span class="info-dots"><b>${data.id}</b></span></div>
            <div class="detail-row"><span>👤 F.I.SH</span><span class="dots"></span><span class="info-dots"><b>${data.full_name}</b></span></div>
            <div class="detail-row"><span>📞 Telefon</span><span class="dots"></span><span class="info-dots"><b>${data.login}</b></span></div>
            <div class="detail-row"><span>🔒 Parol</span><span class="dots"></span><span class="info-dots"><b>${data.password}</b></span></div>
            <div class="detail-row"><span>🚗 Mashina</span><span class="dots"></span><span class="info-dots"><b>${data.car_number}</b></span></div>
            <div class="detail-row"><span>🤝 Turi</span><span class="dots"></span><span class="info-dots"><b>${data.source === 'hamkor' ? 'Hamkor' : 'Filial'}</b></span></div>
            <div class="detail-row"><span>📅 Sana</span><span class="dots"></span><span class="info-dots"><b>${new Date(data.created_at).toLocaleString('uz-UZ')}</b></span></div>
            <div class="detail-row"><span>⚡ Status</span><span class="dots"></span><span class="info-dots"><b>${data.status ? '✅ Bo`sh' : '❌ Band'}</b></span></div>
        </div>
    `;
    document.getElementById('viewDetails').innerHTML = details;
    document.getElementById('viewModal').style.display = 'flex';
}

// --- YORDAMCHI ---
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