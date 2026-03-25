checkAuth('admin'); // Faqat admin ko'ra oladi

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Ismni chiqarish
    const name = localStorage.getItem('userName');
    if (document.getElementById('adminNameDisplay')) {
        document.getElementById('adminNameDisplay').textContent = name;
    }

    // 2. Barcha statistikani yuklash (Ketma-ketlikda)
    await updateDashboardStats();
    await loadAdminsReport();
});

async function updateDashboardStats() {
    try {
        // Bugungi sana (00:00:00 holatida)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayISO = today.toISOString();

        // 1. Adminlar soni
        const {count: adminCount} = await _supabase
            .from('admins')
            .select('*', {count: 'exact', head: true});

        // 2. Instruktorlar soni
        const {count: instructorCount} = await _supabase
            .from('instructors')
            .select('*', {count: 'exact', head: true});

        // 3. Bugungi cheklar soni
        const {count: checkCount} = await _supabase
            .from('tickets')
            .select('*', {count: 'exact', head: true})
            .gte('created_at', todayISO);

        // 4. Bugungi jami summa (payment_amount ustuni bo'yicha)
        const {data: moneyData, error: moneyError} = await _supabase
            .from('tickets')
            .select('payment_amount')
            .gte('created_at', todayISO);

        // Xatolikni tekshirish va summani hisoblash
        let totalMoney = 0;
        if (moneyData) {
            totalMoney = moneyData.reduce((sum, item) => sum + (Number(item.payment_amount) || 0), 0);
        }

        // --- Ekranga chiqarish (Faqat element mavjud bo'lsa) ---
        if (document.getElementById('count-admins'))
            document.getElementById('count-admins').textContent = adminCount || 0;

        if (document.getElementById('count-instructors'))
            document.getElementById('count-instructors').textContent = instructorCount || 0;

        if (document.getElementById('count-checks'))
            document.getElementById('count-checks').textContent = checkCount || 0;

        if (document.getElementById('count-money'))
            document.getElementById('count-money').textContent = totalMoney.toLocaleString() + " so'm";

    } catch (err) {
        console.error("Dashboard statistikani yuklashda xato:", err);
    }
}

















function openSalaryModal() {
    const startDate = document.getElementById('report-start-date').value;
    const endDate = document.getElementById('report-end-date').value;

    if (!startDate || !endDate) {
        alert("Iltimos, avval A va B sanalarni to'liq tanlang!");
        return;
    }
    document.getElementById('salary-modal').style.display = 'flex';
}

function closeSalaryModal() {
    document.getElementById('salary-modal').style.display = 'none';
    document.getElementById('min-salary-rate').value = '';
    document.getElementById('max-salary-rate').value = '';
}

// 1000 talik limitni aylanib o'tib barcha cheklarni yuklab olish funksiyasi
async function fetchAllTickets(startDateTime, endDateTime) {
    let allTickets = [];
    let startLimit = 0;
    const step = 1000;
    let hasMoreData = true;

    while (hasMoreData) {
        const { data, error } = await _supabase
            .from('tickets')
            .select('instructor_id, actual_minute, lesson_stop_time')
            .gte('lesson_stop_time', startDateTime)
            .lte('lesson_stop_time', endDateTime)
            .range(startLimit, startLimit + step - 1);

        if (error) throw error;

        if (data && data.length > 0) {
            allTickets = allTickets.concat(data);
            startLimit += step;
        }

        // Agar kelgan ma'lumotlar 1000 tadan kam bo'lsa, demak oxiriga yetdik
        if (!data || data.length < step) {
            hasMoreData = false;
        }
    }

    return allTickets;
}

async function generateA4Report() {
    const startDate = document.getElementById('report-start-date').value;
    const endDate = document.getElementById('report-end-date').value;
    const minRate = parseFloat(document.getElementById('min-salary-rate').value);
    const maxRate = parseFloat(document.getElementById('max-salary-rate').value);

    if (isNaN(minRate) || isNaN(maxRate)) {
        alert("Iltimos, min va max qiymatlarni to'g'ri raqamlarda kiriting!");
        return;
    }

    closeSalaryModal();

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert("Brauzer yangi oyna ochishni blokladi. Iltimos, ruxsat bering!");
        return;
    }

    printWindow.document.write('<h2 style="font-family: sans-serif; text-align: center; margin-top: 50px;">Ma\'lumotlar yig\'ilmoqda (2500+ cheklar tekshirilmoqda)... Iltimos kuting.</h2>');

    try {
        const { data: instructors, error: instError } = await _supabase
            .from('instructors')
            .select('id, full_name, car_number')
            .eq('source', 'filial');

        if (instError) throw instError;

        const startDateTime = `${startDate}T00:00:00.000Z`;
        const endDateTime = `${endDate}T23:59:59.999Z`;

        // Yordamchi funksiya orqali BARChA cheklarni tortib olamiz
        const tickets = await fetchAllTickets(startDateTime, endDateTime);

        const reportData = instructors.map((instructor, index) => {
            const instructorTickets = tickets.filter(t => t.instructor_id === instructor.id);
            // Vaqtni to'g'ridan-to'g'ri minute ustunidan olamiz
            const totalMinutes = instructorTickets.reduce((sum, ticket) => sum + (ticket.actual_minute || 0), 0);

            let salary = 0;
            if (totalMinutes > 0 && totalMinutes <= 12000) {
                salary = (totalMinutes / 60) * minRate;
            } else if (totalMinutes > 12000) {
                salary = (totalMinutes / 60) * maxRate;
            }

            return {
                index: index + 1,
                fullName: instructor.full_name,
                carNumber: instructor.car_number,
                totalMinutes: totalMinutes,
                salary: salary
            };
        });

        printA4Report(printWindow, reportData, startDate, endDate, minRate, maxRate);

    } catch (error) {
        console.error("Hisobotni yuklashda xatolik:", error);
        printWindow.close();
        alert("Ma'lumotlarni yuklashda xatolik yuz berdi.");
    }
}

function printA4Report(printWindow, data, startDate, endDate, minRate, maxRate) {
    let tableRows = '';
    data.forEach(item => {
        tableRows += `
            <tr>
                <td>${item.index}</td>
                <td>${item.fullName || '-'}</td>
                <td>${item.carNumber || '-'}</td>
                <td>${item.totalMinutes} min</td>
                <td><strong>${item.salary.toLocaleString('uz-UZ')} UZS</strong></td>
            </tr>
        `;
    });

    const htmlContent = `
        <!DOCTYPE html>
        <html lang="uz">
        <head>
            <meta charset="UTF-8">
            <title>Filial Instruktorlar Hisoboti</title>
            <style>
                @page { size: A4; margin: 20mm; }
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; }
                .header { text-align: center; margin-bottom: 20px; }
                .header h2 { margin: 0 0 10px 0; text-transform: uppercase; }
                .info { font-size: 14px; margin-bottom: 20px; display: flex; justify-content: space-between; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; }
                th, td { border: 1px solid #000; padding: 8px 12px; text-align: center; }
                th { background-color: #f3f4f6; font-weight: bold; }
                td { text-align: center; }
                td:nth-child(2) { text-align: left; }
                .footer-sign { margin-top: 50px; display: flex; justify-content: space-between; font-size: 14px; }
                .sign-line { width: 200px; border-bottom: 1px solid #000; display: inline-block; }
            </style>
        </head>
        <body>
            <div class="header">
                <h2>Filial Instruktorlari Ish Haqi Hisoboti</h2>
            </div>
            <div class="info">
                <div>
                    <strong>Oraliq:</strong> ${startDate} dan ${endDate} gacha<br>
                    <strong>Hisoblash koeffitsienti:</strong> Min: ${minRate} / Max: ${maxRate}
                </div>
                <div>
                    <strong>Chop etilgan sana:</strong> ${new Date().toLocaleDateString('uz-UZ')}
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th width="5%">№</th>
                        <th width="35%">F.I.SH</th>
                        <th width="20%">Mashina raqami</th>
                        <th width="15%">Ishlagan minut</th>
                        <th width="25%">Oylik ish haqqi</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>

            <div class="footer-sign">
                <div>Hisobot tayyorladi: <span class="sign-line"></span></div>
                <div>Tasdiqladi: <span class="sign-line"></span></div>
            </div>
            
            <script>
                // Oyna yuklanishi bilan to'g'ridan-to'g'ri chop etish oynasini ochish
                window.onload = function() {
                    setTimeout(() => {
                        window.print();
                    }, 500);
                };
            </script>
        </body>
        </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
}






// Admin table info
async function loadAdminsReport() {
    const tbody = document.getElementById('adminsTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5">Yuklanmoqda...</td></tr>';

    try {
        const {data: admins, error: adminError} = await _supabase
            .from('admins')
            .select('*')
            .order('id', {ascending: true});

        if (adminError) throw adminError;

        const adminsWithTickets = await Promise.all(admins.map(async (admin) => {
            const {count} = await _supabase
                .from('tickets')
                .select('*', {count: 'exact', head: true})
                .eq('admin_id', admin.id);

            return {...admin, ticket_count: count || 0};
        }));

        tbody.innerHTML = '';
        if (document.getElementById('report-admins')) {
            document.getElementById('report-admins').textContent = admins.length;
        }

        adminsWithTickets.forEach(admin => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><span class="id-circle">${admin.id}</span></td>
                <td style="font-weight: 600;">${admin.admin_fullname}</td>
                <td>
                    <div class="ticket-badge">
                        🎟️ ${admin.ticket_count} ta
                    </div>
                </td>
                <td><code style="color: #6366f1; background: rgba(99,102,241,0.1); padding: 3px 8px; border-radius: 5px;">${admin.login}</code></td>
                <td style="color: #64748b;">${new Date(admin.created_at).toLocaleDateString('uz-UZ')}</td>
            `;
            tbody.appendChild(row);
        });

    } catch (err) {
        console.error("Xisobotni yuklashda xato:", err);
        tbody.innerHTML = '<tr><td colspan="5" style="color:red">Xatolik yuz berdi!</td></tr>';
    }
}

async function generateProfessionalReport() {
    const startDateInput = document.getElementById('ticket-start-date').value;
    const endDateInput = document.getElementById('ticket-end-date').value;
    const btn = document.getElementById('btn-ticket-report');

    if (!startDateInput || !endDateInput) {
        alert("Iltimos, hisobot davrini (Boshlanish va Tugash sanalarini) to'liq tanlang!");
        return;
    }

    if (btn) {
        btn.innerText = "Yuklanmoqda...";
        btn.disabled = true;
    }

    try {
        // Sanalarni aniq vaqt bilan sozlash (Kun boshidan kun oxirigacha)
        const startDateTime = `${startDateInput}T00:00:00.000Z`;
        const endDateTime = `${endDateInput}T23:59:59.999Z`;

        // 1. Ma'lumotlarni olish (Markazlar va Instruktorlarni odatiy usulda, Cheklarni esa to'liq tortib oluvchi funksiya orqali)
        const centersRes = await _supabase.from('centers').select('*');
        const instructorsRes = await _supabase.from('instructors').select('*');
        const ticketsData = await fetchAllTicketsForReport(startDateTime, endDateTime);

        const centers = centersRes.data || [];
        const instructors = instructorsRes.data || [];
        const tickets = ticketsData || [];

        if (tickets.length === 0) {
            alert("Belgilangan davr uchun cheklar topilmadi.");
            if (btn) { btn.innerText = "Hisobot"; btn.disabled = false; }
            return;
        }

        const totalSum = tickets.reduce((s, t) => s + (Number(t.payment_amount) || 0), 0);

        // 2. Hisobot HTML strukturasini qurish
        let reportHtml = `
            <!DOCTYPE html>
            <html lang="uz">
            <head>
                <meta charset="UTF-8">
                <title>Chek Hisoboti</title>
                <style>
                    body { font-family: 'Times New Roman', serif; padding: 30px; color: black; line-height: 1.4; }
                    .header { text-align: center; margin-bottom: 20px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11pt; }
                    th, td { border: 1px solid black; padding: 6px; text-align: left; }
                    th { background-color: #f2f2f2 !important; text-align: center; }
                    .center-info { margin-top: 25px; border-top: 1px dashed #ccc; padding-top: 10px; }
                    @media print { .no-print { display: none; } }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1 style="margin: 0;">CHEK HISOBOTI</h1>
                    <p style="margin: 5px 0;">Davr: <b>${startDateInput} dan ${endDateInput} gacha</b></p>
                </div>
                
                <div style="font-size: 13pt; margin-bottom: 15px;">
                    <p style="margin: 3px 0;">Jami cheklar soni: <b>${tickets.length} ta</b></p>
                    <p style="margin: 3px 0;">Umumiy tushum: <b>${totalSum.toLocaleString('uz-UZ')} so'm</b></p>
                    <p style="margin: 3px 0;">Chop etilgan sana: <b>${new Date().toLocaleString('uz-UZ')}</b></p>
                </div>`;

        // Markazlar bo'yicha sikl
        centers.forEach(center => {
            const centerTickets = tickets.filter(t => String(t.center_name) === String(center.id));

            if (centerTickets.length > 0) {
                const centerSum = centerTickets.reduce((s, t) => s + (Number(t.payment_amount) || 0), 0);

                reportHtml += `
                    <div class="center-info" style="page-break-inside: avoid;">
                        <p style="font-size: 12pt; margin: 5px 0;">O'quv markazi: <b>${center.name}</b></p>
                        <p style="font-size: 11pt; margin: 5px 0;">Markaz bo'yicha: ${centerTickets.length} ta chek, ${centerSum.toLocaleString('uz-UZ')} so'm</p>
                        
                        <table>
                            <thead>
                                <tr>
                                    <th style="width: 30px;">№</th>
                                    <th>Mijoz F.I.Sh</th>
                                    <th>Guruh</th>
                                    <th style="width: 90px;">Sana</th>
                                    <th style="width: 50px;">Min.</th>
                                    <th>Instruktor</th>
                                    <th style="width: 100px;">Summa</th>
                                    <th style="width: 80px;">Mashina</th>
                                </tr>
                            </thead>
                            <tbody>`;

                centerTickets.forEach((t, i) => {
                    const inst = instructors.find(ins => String(ins.id) === String(t.instructor_id)) || {};
                    const formattedDate = new Date(t.created_at).toLocaleDateString('uz-UZ');
                    const paymentAmount = Number(t.payment_amount) || 0;

                    reportHtml += `
                        <tr>
                            <td style="text-align: center;">${i + 1}</td>
                            <td>${t.full_name || '—'}</td>
                            <td style="text-align: center;">${t.group || '—'}</td>
                            <td style="text-align: center;">${formattedDate}</td>
                            <td style="text-align: center;">${t.minute || 0}</td>
                            <td>${inst.full_name || '—'}</td>
                            <td style="text-align: center;">${paymentAmount.toLocaleString('uz-UZ')} so'm</td>
                            <td style="text-align: center;">${inst.car_number || '—'}</td>
                        </tr>`;
                });

                reportHtml += `</tbody></table></div>`;
            }
        });

        reportHtml += `
            <div style="margin-top: 40px; display: flex; justify-content: space-between;">
                <p>Mas'ul shaxs: _________________ (imzo)</p>
                <p>Tasdiqladi: _________________ (imzo)</p>
            </div>
            </body></html>`;

        // 3. Yashirin iframe orqali to'g'ridan-to'g'ri chop etish oynasini chaqirish
        const oldFrame = document.getElementById('printFrame');
        if (oldFrame) oldFrame.remove();

        const iframe = document.createElement('iframe');
        iframe.id = 'printFrame';
        iframe.style.display = 'none';
        document.body.appendChild(iframe);

        const pri = iframe.contentWindow;
        pri.document.open();
        pri.document.write(reportHtml);
        pri.document.close();

        // Oyna yuklangandan so'ng print dialogini ochish
        iframe.onload = function() {
            setTimeout(() => {
                pri.focus();
                pri.print();

                setTimeout(() => {
                    document.body.removeChild(iframe);
                    if (btn) {
                        btn.innerText = "Hisobot";
                        btn.disabled = false;
                    }
                }, 1000);
            }, 500);
        };

    } catch (err) {
        console.error("Hisobotda xatolik:", err);
        alert("Xatolik yuz berdi: " + err.message);
        if (btn) {
            btn.innerText = "Hisobot";
            btn.disabled = false;
        }
    }
}

// Barcha cheklarni 1000 talik qismlarga bo'lib yuklab olish funksiyasi
async function fetchAllTicketsForReport(startISO, endISO) {
    let allTickets = [];
    let startLimit = 0;
    const step = 1000;
    let hasMoreData = true;

    while (hasMoreData) {
        const { data, error } = await _supabase
            .from('tickets')
            .select('*')
            .gte('created_at', startISO)
            .lte('created_at', endISO)
            .range(startLimit, startLimit + step - 1);

        if (error) throw error;

        if (data && data.length > 0) {
            allTickets = allTickets.concat(data);
            startLimit += step;
        }

        // Agar ma'lumot qolmagan bo'lsa, siklni to'xtatamiz
        if (!data || data.length < step) {
            hasMoreData = false;
        }
    }
    return allTickets;
}

async function getDailyStats() {
    // 1. Bugungi kunning boshlanish vaqtini aniqlash (00:00:00)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfToday = today.toISOString();

    // 2. Supabase'dan faqat bugungi ma'lumotlarni tortib olish
    // 'created_at' o'rniga o'zingizdagi sana ustuni nomini yozishingiz mumkin
    const { data: tickets, error } = await _supabase
        .from('tickets')
        .select('payment_type, payment_amount')
        .gte('created_at', startOfToday);

    if (error) {
        console.error("Ma'lumotlarni olishda xatolik:", error);
        return;
    }

    // 3. Boshlang'ich qiymatlarni belgilash
    let stats = {
        "Naqd": { count: 0, sum: 0 },
        "Karta": { count: 0, sum: 0 },
        "Pul o'tkazish": { count: 0, sum: 0 }
    };

    // 4. Olingan ma'lumotlarni turlarga qarab hisoblash
    tickets.forEach(ticket => {
        const type = ticket.payment_type;
        const amount = Number(ticket.payment_amount) || 0;

        if (stats[type]) {
            stats[type].count += 1;
            stats[type].sum += amount;
        }
    });

    // 5. HTML (DOM) elementlarni yangilash va raqamlarni chiroyli formatlash
    // Naqd
    document.getElementById('count-cash').innerText = stats["Naqd"].count + " ta";
    document.getElementById('summa-cash').innerText = stats["Naqd"].sum.toLocaleString() + " so'm";

    // Karta
    document.getElementById('count-card').innerText = stats["Karta"].count + " ta";
    document.getElementById('summa-card').innerText = stats["Karta"].sum.toLocaleString() + " so'm";

    // Pul o'tkazish
    document.getElementById('count-transfer').innerText = stats["Pul o'tkazish"].count + " ta";
    document.getElementById('summa-transfer').innerText = stats["Pul o'tkazish"].sum.toLocaleString() + " so'm";
}

async function updatePartnerStats() {
    // 1. Bugungi kunning boshlanishi va oxirini ISO formatda olish
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    try {
        // 2. Supabase'dan bugungi ma'lumotlarni filtrlab olish
        // 'created_at' ustuni o'rniga sizda sana qaysi ustunda bo'lsa o'shani yozing
        const { data, error } = await _supabase
            .from('partner')
            .select('payment_type, summa')
            .gte('created_at', startOfDay.toISOString())
            .lte('created_at', endOfDay.toISOString());

        if (error) throw error;

        // 3. Hisoblash mantiqi
        let naqdCount = 0;
        let kartaCount = 0;
        let jamiSumma = 0;

        data.forEach(row => {
            // To'lov turlarini sanash
            if (row.payment_type === 'Naqd') {
                naqdCount++;
            } else if (row.payment_type === 'Karta') {
                kartaCount++;
            }

            // Umumiy summani qo'shish
            jamiSumma += parseFloat(row.summa || 0);
        });

        // 4. Ma'lumotlarni HTML-ga chiqarish
        // p id="1" bo'limi (Naqd va Karta yonma-yon)
        document.getElementById('payment-type').innerHTML = `
            <span>${naqdCount + kartaCount} ta</span>
        `;

        // p id="2" bo'limi (Jami summa)
        document.getElementById('payment-summa').innerHTML = `${jamiSumma.toLocaleString()} so'm`;

    } catch (err) {
        console.error("Statistikani yuklashda xatolik:", err.message);
    }
}

// Sahifa yuklanganda bir marta ishga tushsin
updatePartnerStats();

// Har 10 daqiqada avtomatik yangilab turish (ixtiyoriy)
setInterval(updatePartnerStats, 10 * 60 * 1000);

// Sahifa yuklanganda funksiyani ishga tushirish
document.addEventListener('DOMContentLoaded', getDailyStats);