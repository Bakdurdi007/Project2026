// Auth tekshiruvi
checkAuth('admin');

// Joriy filial ID si
const CURRENT_BRANCH_ID = localStorage.getItem('branch_id');

// Elementlarni tanlab olish
const receiptForm = document.getElementById('receiptForm');
const ticketsTableBody = document.getElementById('ticketsTableBody');
const centerSelect = document.getElementById('centerSelect');
const adminNameDisplay = document.getElementById('adminNameDisplay');

// Server-side Pagination sozlamalari
let allLoadedTickets = []; // Faqat joriy sahifadagi 100 ta ma'lumotni saqlaydi
let currentPage = 1;
const itemsPerPage = 100;
let totalTicketsCount = 0; // Bazadagi jami cheklar soni

document.addEventListener('DOMContentLoaded', () => {
    // Admin ismini chiqarish
    const name = localStorage.getItem('userName') || 'Admin';
    if(adminNameDisplay) adminNameDisplay.textContent = name;

    // Agar joriy filial ID si 2 ga teng bo'lsa, 45 minutlik variantni qo'shamiz
    if (CURRENT_BRANCH_ID == 2) {
        const newOption = document.createElement('option');
        newOption.value = "45";
        newOption.textContent = "0.75 soat (45 min)";

        if (hourSelect.options.length > 1) {
            hourSelect.insertBefore(newOption, hourSelect.options[1]);
        } else {
            hourSelect.appendChild(newOption);
        }
    }

    // Ma'lumotlarni yuklash
    fetchCenters();
    fetchTickets();
});

let centersData = [];
const categorySelect = document.getElementById('categorySelect');
const paymentAmount = document.getElementById('paymentAmount');
const hourSelect = document.getElementById('hourSelect');
const paymentType = document.getElementById('paymentType');

// Supabase'dan o'quv markazlarini yuklab olish
async function fetchCenters() {
    const { data, error } = await _supabase
        .from('centers')
        .select('id, name, collaboration_type, a_category, b_category, c_category, bc_category, cd_category')
        .eq('branch_id', CURRENT_BRANCH_ID);

    if (error) {
        console.error("Markazlarni yuklashda xatolik:", error);
        return;
    }

    centersData = data;

    if (centerSelect) {
        centerSelect.innerHTML = '<option value="">Tanlang...</option>';
        data.forEach(center => {
            const option = document.createElement('option');
            option.value = center.id;
            option.textContent = center.name;
            centerSelect.appendChild(option);
        });
    }
}

// Markaz va toifa tanlanganda maydonlarni avtomatik to'ldirish
function updateFormFields() {
    const selectedCenterId = centerSelect.value;
    const selectedCategory = categorySelect.value;

    if (!selectedCenterId) {
        paymentAmount.value = '';
        paymentAmount.readOnly = false;
        hourSelect.disabled = false;
        paymentType.disabled = false;
        return;
    }

    const center = centersData.find(c => c.id == selectedCenterId);

    if (center && center.collaboration_type === 'Filial') {
        let price = '';
        switch(selectedCategory) {
            case 'A toifa': price = center.a_category; break;
            case 'B toifa': price = center.b_category; break;
            case 'C toifa': price = center.c_category; break;
            case 'BC toifa': price = center.bc_category; break;
            case 'CD toifa': price = center.cd_category; break;
        }

        paymentAmount.value = price || 0;
        paymentAmount.readOnly = true;
        hourSelect.value = "60";
        hourSelect.disabled = true;
        paymentType.value = "Pul o'tkazish";
        paymentType.disabled = true;
    } else {
        paymentAmount.value = '';
        paymentAmount.readOnly = false;
        hourSelect.disabled = false;
        paymentType.disabled = false;
    }
}

centerSelect.addEventListener('change', updateFormFields);
categorySelect.addEventListener('change', updateFormFields);

receiptForm.addEventListener('submit', (e) => {
    if (hourSelect.disabled) hourSelect.disabled = false;
    if (paymentType.disabled) paymentType.disabled = false;
});

// Bazadan ma'lumotlarni 100 tadan ajratib tortish (Server-side Pagination)
async function fetchTickets() {
    // Qaysi indeksdan qaysi indeksgacha bo'lgan qatorlarni olishni hisoblaymiz
    const from = (currentPage - 1) * itemsPerPage;
    const to = from + itemsPerPage - 1;

    // count: 'exact' orqali bazada ushbu filialga tegishli jami cheklar sonini ham birga qaytaradi
    const { data, error, count } = await _supabase
        .from('tickets')
        .select('*', { count: 'exact' })
        .eq('branch_id', CURRENT_BRANCH_ID)
        .order('created_at', { ascending: false })
        .range(from, to);

    if (error) {
        console.error("Cheklarni yuklashda xatolik:", error);
        return;
    }

    allLoadedTickets = data;
    totalTicketsCount = count || 0;

    renderTable();
    renderPagination();
}

// Jadvalga faqat olingan 100 ta chekni chizish
function renderTable() {
    if (!ticketsTableBody) return;
    ticketsTableBody.innerHTML = '';

    allLoadedTickets.forEach(item => {
        const statusClass = item.is_active ? 'status-active' : 'status-used';
        const statusText = item.is_active ? 'Active' : 'Used';

        const row = `
            <tr>
                <td>${item.id}</td>
                <td><strong>${item.full_name}</strong></td>
                <td>${item.center_name}</td>
                <td>${item.direction_category}</td>
                <td>${item.group}</td>
                <td>${item.minute} min</td>
                <td>${Number(item.payment_amount).toLocaleString()}</td>
                <td><span class="${statusClass}">${statusText}</span></td>
                <td>${new Date(item.created_at).toLocaleString('uz-UZ', {hour12: false})}</td>
                <td>
                    <button onclick="reprintExistingTicket('${item.id}')" class="print-qr-btn">
                        🖨️ Chek
                    </button>
                </td>
            </tr>
        `;
        ticketsTableBody.insertAdjacentHTML('beforeend', row);
    });
}

// Sahifalash tugmalari mantiqi (1, 2, 3 ... 9, 10, 11)
function renderPagination() {
    const paginationContainer = document.getElementById('paginationContainer');
    if (!paginationContainer) return;
    paginationContainer.innerHTML = '';

    const totalPages = Math.ceil(totalTicketsCount / itemsPerPage);
    if (totalPages <= 1) return;

    let pages = [];
    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
        if (currentPage <= 4) {
            pages = [1, 2, 3, 4, 5, '...', totalPages - 1, totalPages];
        } else if (currentPage >= totalPages - 3) {
            pages = [1, 2, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
        } else {
            pages = [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
        }
    }

    pages.forEach(p => {
        const btn = document.createElement('button');
        btn.className = `page-btn ${p === currentPage ? 'active' : ''}`;
        btn.textContent = p;

        if (p === '...') {
            btn.disabled = true;
        } else {
            btn.onclick = () => {
                currentPage = p;
                fetchTickets(); // Har safar yangi sahifa bosilganda faqat shu sahifani bazadan tortadi
            };
        }
        paginationContainer.appendChild(btn);
    });
}

// Yangi chek qo'shish va saqlash
receiptForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = document.getElementById('saveAndPrintBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = "Saqlanmoqda...";

    const formData = {
        full_name: document.getElementById('fullName').value,
        center_name: document.getElementById('centerSelect').value,
        direction_category: document.getElementById('categorySelect').value,
        group: document.getElementById('groupInput').value,
        minute: parseInt(document.getElementById('hourSelect').value),
        payment_amount: parseFloat(document.getElementById('paymentAmount').value),
        payment_type: document.getElementById('paymentType').value,
        is_active: true,
        admin_id: localStorage.getItem('admin_id') || 1,
        branch_id: CURRENT_BRANCH_ID
    };

    const { data, error } = await _supabase
        .from('tickets')
        .insert([formData])
        .select();

    if (error) {
        alert("Saqlashda xatolik: " + error.message);
        submitBtn.disabled = false;
        submitBtn.textContent = "Ma'lumotlarni saqlash hamda chek chiqarish";
    } else {
        const newTicket = data[0];
        printReceiptLogic(newTicket);

        receiptForm.reset();
        currentPage = 1; // Yangi chek qo'shilganda ro'yxat boshi ko'rinishi uchun 1-sahifaga qaytamiz
        fetchTickets();

        submitBtn.disabled = false;
        submitBtn.textContent = "Ma'lumotlarni saqlash hamda chek chiqarish";
    }
});

// Chekni chop etish mantiqi
function printReceiptLogic(ticket) {
    const centerInfo = centersData.find(c => c.id == ticket.center_name);

    document.getElementById('p-id').textContent = ticket.id;
    document.getElementById('p-name').textContent = ticket.full_name;
    document.getElementById('p-center').textContent = centerInfo ? centerInfo.name : ticket.center_name;
    document.getElementById('p-category').textContent = ticket.direction_category;
    document.getElementById('p-minutes').textContent = ticket.minute;

    const amountElement = document.getElementById('p-amount');
    amountElement.textContent = Number(ticket.payment_amount).toLocaleString();

    if (centerInfo && centerInfo.collaboration_type === 'Filial') {
        amountElement.style.textDecoration = 'line-through';
        amountElement.style.fontWeight = 'bold';
    } else {
        amountElement.style.textDecoration = 'none';
        amountElement.style.fontWeight = 'normal';
    }

    document.getElementById('p-type').textContent = ticket.payment_type;
    document.getElementById('p-date').textContent = new Date(ticket.created_at).toLocaleString('uz-UZ', {hour12: false});

    const qrContainer = document.getElementById('qrcodeContainer');
    qrContainer.innerHTML = '';

    if (typeof QRCode !== 'undefined') {
        new QRCode(qrContainer, {
            text: ticket.id.toString(),
            width: 128,
            height: 128,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });
    }

    setTimeout(() => {
        window.print();
    }, 600);
}

// Jadvaldan chekni qayta chop etish (allLoadedTickets ichidan qidiradi)
window.reprintExistingTicket = function(ticketId) {
    const ticketToPrint = allLoadedTickets.find(t => t.id == ticketId);
    if (ticketToPrint) {
        printReceiptLogic(ticketToPrint);
    } else {
        alert("Ushbu chek ma'lumotlari topilmadi!");
    }
};

function logout() {
    localStorage.clear();
    window.location.href = 'index.html';
}