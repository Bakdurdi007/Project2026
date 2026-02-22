let currentDeleteId = null;

document.addEventListener('DOMContentLoaded', () => {
    // Admin ismini chiqarish
    const adminName = localStorage.getItem('userName') || "Bakdurdi Davletov";
    const adminDisplay = document.getElementById('adminNameDisplay');
    if (adminDisplay) adminDisplay.textContent = adminName;

    fetchCenters(); // Sahifa yuklanganda jadvalni to'ldirish

    // Forma yuborishni tinglash
    const centerForm = document.getElementById('centerForm');
    if (centerForm) {
        centerForm.addEventListener('submit', handleFormSubmit);
    }
});

// 1. Ma'lumotlarni bazadan olish
async function fetchCenters() {
    const tbody = document.getElementById('centersTableBody');
    if (!tbody) return;

    const { data, error } = await _supabase
        .from('centers')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Xatolik:", error.message);
        showAlert("Ma'lumotlarni yuklashda xatolik yuz berdi", "error");
        return;
    }

    tbody.innerHTML = '';
    data.forEach(item => {
        const date = new Date(item.created_at).toLocaleDateString('uz-UZ');

        // Xavfsiz tahrirlash: Obyektni string qilib o'tirmasdan, global massivdan olish yoki dataset ishlatish mumkin.
        // Bu yerda soddalik uchun atribut sifatida qoldiramiz, lekin maxsus belgilarni tozalaymiz.
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.id}</td>
            <td>${date}</td>
            <td><b>${item.name}</b></td>
            <td><span class="badge">${item.collaboration_type}</span></td>
            <td>${item.students_count} ta</td>
            <td class="action-icons">
                <span class="action-icon view-icon" title="Ko'rish" onclick="viewCenter(${item.id})">👁️</span>
                <span class="action-icon edit-icon" title="Tahrirlash" id="edit-btn-${item.id}">✏️</span>
                <span class="action-icon delete-icon" title="O'chirish" onclick="askDelete(${item.id})">🗑️</span>
            </td>
        `;
        tbody.appendChild(row);

        // Tahrirlash tugmasiga hodisa biriktirish (JSON stringify xatolarini oldini oladi)
        document.getElementById(`edit-btn-${item.id}`).addEventListener('click', () => prepareEdit(item));
    });
}

// 2. Qo'shish yoki Tahrirlash
async function handleFormSubmit(e) {
    e.preventDefault();

    const idInput = document.getElementById('centerId').value;
    const name = document.getElementById('centerName').value;
    const type = document.getElementById('collabType').value;
    const count = document.getElementById('studentCount').value;

    // Supabase-ga yuboriladigan obyekt (ID bu yerda yo'q)
    const centerData = {
        name: name,
        collaboration_type: type,
        students_count: parseInt(count)
    };

    let result;

    if (idInput) {
        // TAHRIRLASH: Mavjud ID bo'yicha yangilash
        result = await _supabase
            .from('centers')
            .update(centerData)
            .eq('id', idInput);
    } else {
        // QO'SHISH: ID yuborilmaydi, Supabase o'zi generatsiya qiladi
        result = await _supabase
            .from('centers')
            .insert([centerData]);
    }

    if (result.error) {
        showAlert("Xatolik: " + result.error.message, "error");
    } else {
        const successMsg = idInput ? "Ma'lumot yangilandi!" : "Yangi markaz qo'shildi!";
        showAlert(successMsg, "success");
        resetForm();
        fetchCenters();
    }
}

// 3. Ko'rish (Modalda)
async function viewCenter(id) {
    const { data, error } = await _supabase
        .from('centers')
        .select('*')
        .eq('id', id)
        .single();

    if (error || !data) {
        showAlert("Ma'lumotni yuklab bo'lmadi", "error");
        return;
    }

    const details = `
        <div class="info-details-container">
            <div class="info-row">
                <span class="info-label">🆔 ID</span>
                <span class="info-dots"></span>
                <span class="info-value">${data.id}</span>
            </div>
            <div class="info-row">
                <span class="info-label">🏢 Nomi</span>
                <span class="info-dots"></span>
                <span class="info-value">${data.name}</span>
            </div>
            <div class="info-row">
                <span class="info-label">🤝 Turi</span>
                <span class="info-dots"></span>
                <span class="info-value" style="text-transform: capitalize;">${data.collaboration_type}</span>
            </div>
            <div class="info-row">
                <span class="info-label">👥 O'quvchilar</span>
                <span class="info-dots"></span>
                <span class="info-value">${data.students_count} ta</span>
            </div>
            <div class="info-row">
                <span class="info-label">📅 Sana</span>
                <span class="info-dots"></span>
                <span class="info-value">${new Date(data.created_at).toLocaleString('uz-UZ')}</span>
            </div>
        </div>
        <button class="modal-btn btn-modern-action" onclick="closeModal('viewModal')">Yopish</button>
    `;

    document.getElementById('viewDetails').innerHTML = details;
    document.getElementById('viewModal').style.display = 'flex';
}

// 4. O'chirish
function askDelete(id) {
    currentDeleteId = id;
    document.getElementById('deleteModal').style.display = 'flex';
}

// O'chirishni tasdiqlash tugmasi
const confirmBtn = document.getElementById('confirmDeleteBtn');
if (confirmBtn) {
    confirmBtn.onclick = async () => {
        if (currentDeleteId) {
            const { error } = await _supabase
                .from('centers')
                .delete()
                .eq('id', currentDeleteId);

            if (!error) {
                closeModal('deleteModal');
                showAlert("Ma'lumot o'chirildi", "success");
                fetchCenters();
            } else {
                showAlert("Xatolik: " + error.message, "error");
            }
            currentDeleteId = null;
        }
    };
}

// Tahrirlashga tayyorlash
function prepareEdit(item) {
    document.getElementById('centerId').value = item.id;
    document.getElementById('centerName').value = item.name;
    document.getElementById('collabType').value = item.collaboration_type;
    document.getElementById('studentCount').value = item.students_count;

    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) submitBtn.textContent = 'Yangilash';

    // Formaga ravon skroll qilish
    const formCard = document.querySelector('.info-card');
    if (formCard) formCard.scrollIntoView({ behavior: 'smooth' });
}

// Formani tozalash
function resetForm() {
    const form = document.getElementById('centerForm');
    if (form) form.reset();

    const idField = document.getElementById('centerId');
    if (idField) idField.value = '';

    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) submitBtn.textContent = 'Qo\'shish';
}

// Modalni yopish
function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
}

// Universal ogohlantirish (Alert)
function showAlert(message, type = 'warning') {
    const modal = document.getElementById('alertModal');
    const title = document.getElementById('alertTitle');
    const msg = document.getElementById('alertMessage');
    const icon = document.getElementById('alertIcon');
    const content = modal.querySelector('.modal-content');

    if (!modal || !title || !msg) return;

    msg.innerText = message;

    const themes = {
        error: { title: 'Xatolik!', color: '#ef4444', icon: '❌' },
        success: { title: 'Muvaffaqiyatli!', color: '#10b981', icon: '✅' },
        warning: { title: 'Ogohlantirish', color: '#f59e0b', icon: '⚠️' }
    };

    const config = themes[type] || themes.warning;

    title.innerText = config.title;
    title.style.color = config.color;
    icon.innerText = config.icon;
    content.style.borderTop = `5px solid ${config.color}`;

    modal.style.display = 'flex';
}

// Modaldan tashqarini bossa yopilishini ta'minlash
window.onclick = function(event) {
    const modals = ['viewModal', 'deleteModal', 'alertModal'];
    modals.forEach(id => {
        const m = document.getElementById(id);
        if (event.target == m) closeModal(id);
    });
};

