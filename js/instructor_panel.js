let currentInstructor = null;
let html5QrCode = null;
let activeTicket = null;

// 1. Tizimga kirishni tekshirish
async function init() {
    const userJson = localStorage.getItem('instructorUser');

    // AGAR FOYDALANUVCHI TIZIMGA KIRMAGAN BO'LSA index.html GA QAYTARISH
    if (!userJson) {
        window.location.href = 'index.html';
        return;
    }

    currentInstructor = JSON.parse(userJson);
    document.getElementById('instName').innerText = currentInstructor.full_name;

    lucide.createIcons();
    checkInstructorStatus();
    startScanner();
    loadReports();
    loadClients();
}

// 2. Instructor statusini va taymerni tekshirish
async function checkInstructorStatus() {
    const { data: inst } = await _supabase
        .from('instructors')
        .select('status, id')
        .eq('id', currentInstructor.id)
        .single();

    if (inst && inst.status === false) {
        // Band bo'lsa oxirgi aktiv ticketni topish
        const { data: ticket } = await _supabase
            .from('tickets')
            .select('*')
            .eq('instructor_id', inst.id)
            .order('lesson_start_time', { ascending: false })
            .limit(1)
            .single();

        if (ticket) {
            showCountdown(ticket.lesson_stop_time);
        }
    } else {
        const alertBox = document.getElementById('status-alert');
        const scannerContainer = document.getElementById('scanner-container');
        if(alertBox) alertBox.classList.add('hidden');
        if(scannerContainer) scannerContainer.classList.remove('hidden');
    }
}

function showCountdown(stopTime) {
    const scannerContainer = document.getElementById('scanner-container');
    const alertBox = document.getElementById('status-alert');
    const countDisplay = document.getElementById('countdown');

    if(scannerContainer) scannerContainer.classList.add('hidden');
    if(alertBox) alertBox.classList.remove('hidden');

    const msgElem = document.getElementById('status-msg');
    if(msgElem) msgElem.innerText = "Siz hali bandsiz, mashg'ulot tugashini kuting:";

    const timer = setInterval(() => {
        const now = new Date().getTime();
        const distance = new Date(stopTime).getTime() - now;

        if (distance < 0) {
            clearInterval(timer);
            // Vaqt tugaganda statusni true qilish
            completeLesson();
        } else {
            const h = Math.floor(distance / (1000 * 60 * 60));
            const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((distance % (1000 * 60)) / 1000);
            if(countDisplay) countDisplay.innerText = `${h}:${m}:${s}`;
        }
    }, 1000);
}

// 3. Skanerlash logikasi
function startScanner() {
    const readerElem = document.getElementById("reader");
    if (!readerElem) return;

    html5QrCode = new Html5QrCode("reader");
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess)
        .catch(err => console.error("Skaner ishga tushmadi:", err));
}

async function onScanSuccess(decodedText) {
    // decodedText bu ticket_id deb hisoblaymiz
    await html5QrCode.stop();
    const ticketId = decodedText;

    const { data: ticket, error } = await _supabase
        .from('tickets')
        .select('*')
        .eq('id', ticketId)
        .single();

    if (!ticket || ticket.is_active === false) {
        alert("Xatolik: Ushbu chek yaroqsiz yoki oldin ishlatilgan!");
        location.reload();
        return;
    }

    activeTicket = ticket;

    // Markaz nomini olish
    const { data: center } = await _supabase
        .from('centers')
        .select('name')
        .eq('id', ticket.center_name)
        .single();

    // Ma'lumotlarni chiqarish
    document.getElementById('scanner-container').classList.add('hidden');
    document.getElementById('ticket-info').classList.remove('hidden');

    document.getElementById('t-id').innerText = ticket.id;
    document.getElementById('t-name').innerText = ticket.full_name;
    document.getElementById('t-center').innerText = center ? center.name : 'Noma\'lum';
    document.getElementById('t-type').innerText = ticket.direction_category;
    document.getElementById('t-group').innerText = ticket.group;
    document.getElementById('t-amount').innerText = ticket.payment_amount.toLocaleString();
    document.getElementById('t-min').innerText = ticket.minute;
    document.getElementById('t-date').innerText = new Date(ticket.created_at).toLocaleString();
}

// 4. Mashg'ulotni boshlash
async function startLesson() {
    if (!activeTicket) return;

    const startTime = new Date();
    const stopTime = new Date(startTime.getTime() + activeTicket.minute * 60000);

    // 1. Instructor statusini false qilish
    await _supabase.from('instructors').update({ status: false }).eq('id', currentInstructor.id);

    // 2. Ticketni yangilash
    await _supabase.from('tickets').update({
        is_active: false,
        instructor_id: currentInstructor.id,
        lesson_start_time: startTime.toISOString(),
        lesson_stop_time: stopTime.toISOString()
    }).eq('id', activeTicket.id);

    alert("Mashg'ulot boshlandi!");
    location.reload();
}

// 5. Mashg'ulot tugashi
async function completeLesson() {
    await _supabase.from('instructors').update({ status: true }).eq('id', currentInstructor.id);
    location.reload();
}

// 6. Hisobotlar (Salary calculation logic)
async function loadReports() {
    const { data: rep } = await _supabase
        .from('reports')
        .select('*')
        .eq('instructor_id', currentInstructor.id)
        .single();

    if (rep) {
        const delta = rep.monthly_minute > 12000 ? 45000 : 40000;

        document.getElementById('rep-day').innerText = rep.daily_minute + " min";
        document.getElementById('rep-day-m').innerText = Math.round((rep.daily_minute/60) * delta).toLocaleString() + " so'm";

        document.getElementById('rep-week').innerText = rep.weekly_minute + " min";
        document.getElementById('rep-week-m').innerText = Math.round((rep.weekly_minute/60) * delta).toLocaleString() + " so'm";

        document.getElementById('rep-month').innerText = rep.monthly_minute + " min";
        document.getElementById('rep-month-m').innerText = Math.round((rep.monthly_minute/60) * delta).toLocaleString() + " so'm";

        document.getElementById('rep-cash').innerText = (rep.cashback_money || 0).toLocaleString() + " so'm";
    }
}

// 7. Mijozlar ro'yxati
async function loadClients() {
    const { data: clients } = await _supabase
        .from('tickets')
        .select('*')
        .eq('instructor_id', currentInstructor.id)
        .not('lesson_start_time', 'is', null)
        .order('lesson_start_time', { ascending: false });

    const tbody = document.getElementById('clientList');
    if(!tbody) return;

    tbody.innerHTML = '';

    if (clients) {
        clients.forEach((c, i) => {
            tbody.innerHTML += `
                <tr class="border-b border-slate-800">
                    <td class="p-3 text-center">${i + 1}</td>
                    <td class="p-3 font-medium">${c.full_name}</td>
                    <td class="p-3 text-xs text-slate-400">${new Date(c.lesson_start_time).toLocaleDateString()}</td>
                    <td class="p-3 text-center">${c.minute}</td>
                </tr>
            `;
        });
    }
}

// 8. Tablarni almashtirish
function switchTab(tab) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const targetTab = document.getElementById('tab-' + tab);
    if(targetTab) targetTab.classList.add('active');

    document.querySelectorAll('footer button').forEach(b => {
        b.classList.remove('nav-active');
        b.classList.add('text-slate-400');
    });

    const targetBtn = document.getElementById('btn-' + tab);
    if(targetBtn) {
        targetBtn.classList.add('nav-active');
        targetBtn.classList.remove('text-slate-400');
    }
}

// CHIQISH FUNKSIYASI (index.html GA YO'NALTIRILGAN)
function logout() {
    if (confirm("Rostdan ham tizimdan chiqmoqchimisiz?")) {
        localStorage.removeItem('instructorUser');
        window.location.href = 'index.html';
    }
}

// Sahifa yuklanganda ishga tushirish
document.addEventListener('DOMContentLoaded', init);