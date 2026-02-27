// Auth tekshiruvi
checkAuth('admin');

// Elementlarni tanlab olish
const receiptForm = document.getElementById('receiptForm');
const ticketsTableBody = document.getElementById('ticketsTableBody');
const centerSelect = document.getElementById('centerSelect');
const adminNameDisplay = document.getElementById('adminNameDisplay');

// Yuklangan cheklarni saqlab turish uchun massiv (qaytadan chek chiqarish uchun kerak)
let allLoadedTickets = [];

document.addEventListener('DOMContentLoaded', () => {
    // Admin ismini chiqarish
    const name = localStorage.getItem('userName') || 'Admin';
    if(adminNameDisplay) adminNameDisplay.textContent = name;

    // Ma'lumotlarni yuklash
    fetchCenters();
    fetchTickets();
});

// 1. Supabase'dan o'quv markazlarini yuklab select'ga qo'yish
async function fetchCenters() {
    const { data, error } = await _supabase
        .from('centers')
        .select('id, name'); // Faqat nomini emas, ID-sini ham olamiz

    if (error) {
        console.error("Markazlarni yuklashda xatolik:", error);
        return;
    }

    if (centerSelect) {
        centerSelect.innerHTML = '<option value="">Tanlang...</option>';
        data.forEach(center => {
            const option = document.createElement('option');
            option.value = center.id; // VALUE qismiga ID-ni beramiz
            option.textContent = center.name; // FOYDALANUVCHI-ga nomini ko'rsatamiz
            centerSelect.appendChild(option);
        });
    }
}

// 2. Barcha cheklarni (tickets) jadvalga yuklash
async function fetchTickets() {
    const { data, error } = await _supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Cheklarni yuklashda xatolik:", error);
        return;
    }

    allLoadedTickets = data; // Olingan ma'lumotlarni saqlab qo'yamiz

    if (ticketsTableBody) {
        ticketsTableBody.innerHTML = '';
        data.forEach(item => {
            const statusClass = item.is_active ? 'status-active' : 'status-used';
            const statusText = item.is_active ? 'Active' : 'Used';

            // Jadval qatoriga yangi tugma qo'shildi
            const row = `
                <tr>
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
}

// 3. Yangi chek qo'shish va saqlash
receiptForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Tugmani bloklash (ikki marta bosilmasligi uchun)
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
        admin_id: localStorage.getItem('userId') || 1 // LocalStorage'dan admin ID olinadi
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
        // Muvaffaqiyatli saqlangach, chekni chop etishga yuboramiz
        const newTicket = data[0];
        printReceiptLogic(newTicket);

        // Formani tozalash va jadvalni yangilash
        receiptForm.reset();
        fetchTickets();

        submitBtn.disabled = false;
        submitBtn.textContent = "Ma'lumotlarni saqlash hamda chek chiqarish";
    }
});

// 4. Chekni chop etish mantiqi (Hidden Print Section orqali)
function printReceiptLogic(ticket) {
    // HTML'dagi print-area elementlarini to'ldirish
    document.getElementById('p-id').textContent = ticket.id;
    document.getElementById('p-name').textContent = ticket.full_name;
    document.getElementById('p-center').textContent = ticket.center_name;
    document.getElementById('p-category').textContent = ticket.direction_category;
    document.getElementById('p-minutes').textContent = ticket.minute;
    document.getElementById('p-amount').textContent = Number(ticket.payment_amount).toLocaleString();
    document.getElementById('p-type').textContent = ticket.payment_type;
    document.getElementById('p-date').textContent = new Date(ticket.created_at).toLocaleString('uz-UZ');

    // QR Kodni tozalash va yangidan yaratish (faqat ID bilan)
    const qrContainer = document.getElementById('qrcodeContainer');
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
        text: ticket.id.toString(),
        width: 128,
        height: 128,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });

    // Chop etish oynasini ochish (brauzer media-print orqali chekni ko'rsatadi)
    setTimeout(() => {
        window.print();
    }, 500);
}

// 5. Yangi funksiya: Jadvaldan turib chekni qayta chop etish
window.reprintExistingTicket = function(ticketId) {
    // ID bo'yicha chekni topamiz
    const ticketToPrint = allLoadedTickets.find(t => t.id == ticketId);
    if (ticketToPrint) {
        printReceiptLogic(ticketToPrint);
    } else {
        alert("Ushbu chek ma'lumotlari topilmadi!");
    }
};

// Chiqish funksiyasi
function logout() {
    localStorage.clear();
    window.location.href = 'index.html';
}