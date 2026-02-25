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

async function generateReport() {
    const period = document.getElementById('report-period-instructor').value;

    // 1. Ma'lumotlarni ustun nomlariga moslash
    const columnMap = {
        '1day': { time: 'daily_minute', money: 'daily_money', label: 'Kunlik' },
        '1week': { time: 'weekly_minute', money: 'weekly_money', label: 'Haftalik' },
        '1month': { time: 'monthly_minute', money: 'monthly_money', label: 'Oylik' },
        '1year': { time: 'annual_minute', money: 'annual_money', label: 'Yillik' }
    };

    const selected = columnMap[period];

    // 2. Supabase'dan ma'lumotlarni olish (Join orqali)
    // Eslatma: 'supabase' o'zgaruvchisi loyihangizda tashabbus qilingan bo'lishi kerak
    const { data: instructors, error } = await _supabase
        .from('instructors')
        .select(`
            id, 
            full_name, 
            car_number, 
            source,
            reports (
                ${selected.time},
                ${selected.money},
                cashback_money
            )
        `);

    if (error) {
        console.error("Xatolik:", error);
        alert("Ma'lumotlarni yuklashda xatolik yuz berdi");
        return;
    }

    // 3. Hisobot oynasini yaratish
    const printWindow = window.open('', '_blank');

    let tableRows = '';
    instructors.forEach((inst, index) => {
        const report = inst.reports?.[0] || {};
        const timeValue = report[selected.time] || 0;
        const moneyValue = report[selected.money] || 0;

        // Keshbek mantig'i: faqat 'hamkor' bo'lsa hisoblanadi
        const cashbackValue = inst.source === 'hamkor' ? (report.cashback_money || 0) : 0;

        tableRows += `
            <tr>
                <td>${index + 1}</td>
                <td>${inst.full_name}</td>
                <td>${inst.car_number}</td>
                <td>${inst.source}</td>
                <td>${timeValue} min</td>
                <td>${moneyValue.toLocaleString()} so'm</td>
                <td>${cashbackValue.toLocaleString()} so'm</td>
            </tr>
        `;
    });

    // 4. A4 formatdagi HTML shablon
    const htmlContent = `
        <html>
        <head>
            <title>Instruktorlar Hisoboti - ${selected.label}</title>
            <style>
                body { font-family: 'Arial', sans-serif; padding: 20px; }
                h2 { text-align: center; color: #333; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #ddd; padding: 10px; text-align: left; font-size: 12px; }
                th { background-color: #f3f4f6; color: #333; }
                tr:nth-child(even) { background-color: #fafafa; }
                .footer { margin-top: 30px; text-align: right; font-size: 10px; }
                @media print {
                    @page { size: A4; margin: 15mm; }
                    button { display: none; }
                }
            </style>
        </head>
        <body>
            <h2>Instruktorlar uchun ${selected.label} hisobot</h2>
            <p>Sana: ${new Date().toLocaleDateString()}</p>
            <table>
                <thead>
                    <tr>
                        <th>№</th>
                        <th>Instructor to'liq ismi</th>
                        <th>Mashina raqami</th>
                        <th>Hamkorlik turi</th>
                        <th>Vaqti</th>
                        <th>Daromad (so'm)</th>
                        <th>Keshbek (so'm)</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
            <div class="footer">
                <p>Hisobot avtomatik tarzda yaratildi: ${new Date().toLocaleString()}</p>
            </div>
            <script>window.print();<\/script>
        </body>
        </html>
    `;

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
    const periodSelect = document.getElementById('report-period');
    const btn = document.querySelector('button[onclick="generateProfessionalReport()"]');
    const period = periodSelect ? periodSelect.value : '1day';

    if (btn) {
        btn.innerText = "Yuklanmoqda...";
        btn.disabled = true;
    }

    try {
        const now = new Date();
        let startDate = new Date();
        if (period === '1day') startDate.setHours(0, 0, 0, 0);
        else if (period === '1week') startDate.setDate(now.getDate() - 7);
        else if (period === '1month') startDate.setMonth(now.getMonth() - 1);
        else if (period === '1year') startDate.setFullYear(now.getFullYear() - 1);

        // 1. Ma'lumotlarni parallel olish (Bog'lanishlar uchun 3 ta jadval)
        const [centersRes, ticketsRes, instructorsRes] = await Promise.all([
            _supabase.from('centers').select('*'),
            _supabase.from('tickets').select('*').gte('created_at', startDate.toISOString()),
            _supabase.from('instructors').select('*')
        ]);

        const centers = centersRes.data || [];
        const tickets = ticketsRes.data || [];
        const instructors = instructorsRes.data || [];

        if (tickets.length === 0) {
            alert("Ushbu davr uchun cheklar topilmadi.");
            if (btn) { btn.innerText = "Hisobotni chiqarish"; btn.disabled = false; }
            return;
        }

        const totalSum = tickets.reduce((s, t) => s + (Number(t.payment_amount) || 0), 0);

        // 2. Hisobot HTML strukturasini qurish
        let reportHtml = `
            <html>
            <head>
                <title>Professional Hisobot</title>
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
                    <p style="margin: 5px 0;">Davr: <b>${periodSelect.selectedOptions[0].text}</b></p>
                </div>
                
                <div style="font-size: 13pt; margin-bottom: 15px;">
                    <p style="margin: 3px 0;">Jami cheklar soni: <b>${tickets.length} ta</b></p>
                    <p style="margin: 3px 0;">Umumiy tushum: <b>${totalSum.toLocaleString()} so'm</b></p>
                    <p style="margin: 3px 0;">Sana: <b>${now.toLocaleString()}</b></p>
                </div>`;

        // Markazlar bo'yicha sikl
        centers.forEach(center => {
            // tickets.center_name ustuni orqali bog'lanish
            const centerTickets = tickets.filter(t => String(t.center_name) === String(center.id));

            if (centerTickets.length > 0) {
                const centerSum = centerTickets.reduce((s, t) => s + (Number(t.payment_amount) || 0), 0);

                reportHtml += `
                    <div class="center-info" style="page-break-inside: avoid;">
                        <p style="font-size: 12pt; margin: 5px 0;">O'quv markazi: <b>${center.name}</b></p>
                        <p style="font-size: 11pt; margin: 5px 0;">Markaz bo'yicha: ${centerTickets.length} ta chek, ${centerSum.toLocaleString()} so'm</p>
                        
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
                                    <th style="width: 80px;">Moshina</th>
                                </tr>
                            </thead>
                            <tbody>`;

                centerTickets.forEach((t, i) => {
                    // Instruktor ma'lumotlarini bog'lash (tickets.instructor_id == instructors.id)
                    const inst = instructors.find(ins => String(ins.id) === String(t.instructor_id)) || {};

                    reportHtml += `
                        <tr>
                            <td style="text-align: center;">${i + 1}</td>
                            <td>${t.full_name || '—'}</td>
                            <td style="text-align: center;">${t.group || '—'}</td>
                            <td style="text-align: center;">${new Date(t.created_at).toLocaleDateString()}</td>
                            <td style="text-align: center;">${t.minute || 0}</td>
                            <td>${inst.full_name || '—'}</td>
                            <td style="text-align: center;">${(Number(t.payment_amount) || 0).toLocaleString()} so'm</td>
                            <td style="text-align: center;">${inst.car_number || '—'}</td>
                        </tr>`;
                });

                reportHtml += `</tbody></table></div>`;
            }
        });

        reportHtml += `
            <div style="margin-top: 40px;">
                <p>Mas'ul shaxs: _________________ (imzo)</p>
            </div>
            </body></html>`;

        // 3. Yangi oynada chop etish
        // Eski iframe bo'lsa o'chirib tashlaymiz
        const oldFrame = document.getElementById('printFrame');
        if (oldFrame) oldFrame.remove();

        // Yangi yashirin iframe yaratamiz
        const iframe = document.createElement('iframe');
        iframe.id = 'printFrame';
        iframe.style.display = 'none'; // Foydalanuvchiga ko'rinmaydi
        document.body.appendChild(iframe);

        const pri = iframe.contentWindow;
        pri.document.open();
        pri.document.write(reportHtml); // Hisobot mazmunini yozamiz
        pri.document.close();

        // Ma'lumotlar yuklanishi bilan chop etishni boshlaymiz
        iframe.onload = function() {
            setTimeout(() => {
                pri.focus();
                pri.print();

                // Chop etib bo'lingach, iframeni o'chirib yuboramiz
                setTimeout(() => {
                    document.body.removeChild(iframe);
                    if (btn) {
                        btn.innerText = "Hisobotni chiqarish";
                        btn.disabled = false;
                    }
                }, 1000);
            }, 500);
        };

    } catch (err) {
        console.error("Hisobotda xatolik:", err);
        alert("Xatolik yuz berdi: " + err.message);
        if (btn) {
            btn.innerText = "Hisobotni chiqarish";
            btn.disabled = false;
        }
    }
}