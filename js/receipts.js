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

// 1. Bazadan kelgan barcha markazlar ma'lumotini saqlash uchun o'zgaruvchi
let centersData = [];

// HTML elementlarni tanlab olamiz
const categorySelect = document.getElementById('categorySelect');
const paymentAmount = document.getElementById('paymentAmount');
const hourSelect = document.getElementById('hourSelect');
const paymentType = document.getElementById('paymentType'); // Yangi qo'shilgan maydon

// 2. Supabase'dan o'quv markazlarini va ularning narxlarini yuklab olish
async function fetchCenters() {
    const { data, error } = await _supabase
        .from('centers')
        .select('id, name, collaboration_type, a_category, b_category, c_category, bc_category, cd_category');

    if (error) {
        console.error("Markazlarni yuklashda xatolik:", error);
        return;
    }

    centersData = data; // Ma'lumotlarni global o'zgaruvchiga saqlaymiz

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

// 3. Markaz va toifa tanlanganda maydonlarni avtomatik to'ldirish
function updateFormFields() {
    const selectedCenterId = centerSelect.value;
    const selectedCategory = categorySelect.value;

    if (!selectedCenterId) {
        // Agar markaz tanlanmagan bo'lsa, maydonlarni asl holiga (qulfdan chiqarib) qaytaramiz
        paymentAmount.value = '';
        paymentAmount.readOnly = false;
        hourSelect.disabled = false;
        paymentType.disabled = false;
        return;
    }

    // Tanlangan markazni massivdan topamiz
    const center = centersData.find(c => c.id == selectedCenterId);

    if (center && center.collaboration_type === 'Filial') {
        // Toifaga qarab narxni belgilash
        let price = '';
        switch(selectedCategory) {
            case 'A toifa': price = center.a_category; break;
            case 'B toifa': price = center.b_category; break;
            case 'C toifa': price = center.c_category; break;
            case 'BC toifa': price = center.bc_category; break;
            case 'CD toifa': price = center.cd_category; break;
        }

        // 1. To'lov miqdorini yozib, qulflaymiz (input bo'lgani uchun readOnly)
        paymentAmount.value = price || 0;
        paymentAmount.readOnly = true;

        // 2. Soatni 60 daqiqaga o'zgartirib, qulflaymiz (select bo'lgani uchun disabled)
        hourSelect.value = "60";
        hourSelect.disabled = true;

        // 3. To'lov turini "Pul o'tkazish" qilib, qulflaymiz
        paymentType.value = "Pul o'tkazish";
        paymentType.disabled = true;

    } else {
        // Agar Filial bo'lmasa, ma'lumotlarni qo'lda kiritishga ruxsat beramiz
        paymentAmount.value = '';
        paymentAmount.readOnly = false;
        hourSelect.disabled = false;
        paymentType.disabled = false;
    }
}

// 4. Hodisalarni (Event Listeners) ulash
centerSelect.addEventListener('change', updateFormFields);
categorySelect.addEventListener('change', updateFormFields);

// 5. Formani yuborish (Submit) qismi
receiptForm.addEventListener('submit', (e) => {
    // FORM YUBORILAYOTGANDA DIQQAT QILING:
    // Disabled (qulflangan) <select> maydonlari formata ichida ketmay qoladi.
    // Ularning qiymati bazaga yetib borishi uchun submit paytida vaqtincha qulfdan chiqaramiz.

    if (hourSelect.disabled) {
        hourSelect.disabled = false;
    }

    if (paymentType.disabled) {
        paymentType.disabled = false;
    }

    // Bu yerdan keyin Supabase'ga ma'lumotlarni yozish kodi (insert) davom etadi...
    // e.preventDefault(); qilib, JS orqali fetch yoki supabase.insert() ishlatsangiz bo'ladi.
});

// Dastur ishga tushganda markazlarni yuklash funksiyasini chaqirish
// fetchCenters();

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
// 4. Chekni chop etish mantiqi
function printReceiptLogic(ticket) {
    // 1. Markaz ma'lumotlarini global centersData massividan qidirib topamiz.
    // Formada 'center_name' maydoniga center.id saqlanganligi sababli ID bo'yicha qidiramiz.
    const centerInfo = centersData.find(c => c.id == ticket.center_name);

    // 2. HTML elementlarni to'ldirish
    document.getElementById('p-id').textContent = ticket.id;
    document.getElementById('p-name').textContent = ticket.full_name;

    // Agar markaz obyekti topilsa, uning haqiqiy nomini chiqaramiz, aks holda bazadagi qiymatni
    document.getElementById('p-center').textContent = centerInfo ? centerInfo.name : ticket.center_name;

    document.getElementById('p-category').textContent = ticket.direction_category;
    document.getElementById('p-minutes').textContent = ticket.minute;

    // 3. To'lov miqdori va Strikethrough (ustidan chizish) mantiqi
    const amountElement = document.getElementById('p-amount');
    amountElement.textContent = Number(ticket.payment_amount).toLocaleString();

    // Markaz mavjudligini va uning turi 'Filial' ekanligini tekshiramiz
    if (centerInfo && centerInfo.collaboration_type === 'Filial') {
        amountElement.style.textDecoration = 'line-through';
        amountElement.style.fontWeight = 'bold'; // Vizual ravishda yaqqolroq ko'rinishi uchun
    } else {
        amountElement.style.textDecoration = 'none';
        amountElement.style.fontWeight = 'normal';
    }

    // 4. Boshqa ma'lumotlar
    document.getElementById('p-type').textContent = ticket.payment_type;
    document.getElementById('p-date').textContent = new Date(ticket.created_at).toLocaleString('uz-UZ', {hour12: false});

    // 5. QR Kodni yangilash
    const qrContainer = document.getElementById('qrcodeContainer');
    qrContainer.innerHTML = ''; // Oldingi QR kodni tozalash

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

    // 6. Chop etish oynasini ochish
    // QR kod rasm sifatida generatsiya bo'lishi uchun ozgina kutish beramiz
    setTimeout(() => {
        window.print();
    }, 600);
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