// Vaqtni HH:MM formatida ko'rsatish uchun yordamchi funksiya
function formatTime(isoString) {
    if (!isoString) return '--:--';
    const date = new Date(isoString);
    return date.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}

// 1. Sahifa yuklanganda va qidiruv berilganda ma'lumotlarni olib kelish
// searchQuery parametrini qo'shdik (sukut bo'yicha bo'sh matn)
async function fetchInstructors(searchQuery = "") {
    try {
        // 1. Bugungi kunning boshlanish va tugash vaqtini aniqlash (UTC bo'yicha)
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();

        // Instruktorlarni olish uchun asosiy so'rov
        let query = _supabase
            .from('instructors')
            .select('id, full_name, car_number')
            .eq('source', 'hamkor');

        if (searchQuery) {
            query = query.ilike('car_number', `%${searchQuery}%`);
        }

        const { data: instructors, error: instError } = await query;
        if (instError) throw instError;

        // BAZADAN FAQAT BUGUNGI AMALLARNI OLISH
        // .gte (greater than or equal) - dan katta yoki teng (bugun 00:00:00)
        // .lte (less than or equal) - dan kichik yoki teng (bugun 23:59:59)
        const { data: allPartnerRecords, error: partnerError } = await _supabase
            .from('partner')
            .select('id, instructor_id, start_time, stop_time, estimated_time')
            .gte('start_time', startOfToday)
            .lte('start_time', endOfToday);

        if (partnerError) throw partnerError;

        // Ma'lumotlarni saralash (Xarita yaratish)
        const activeMap = {};
        const totalTimeMap = {};

        allPartnerRecords.forEach(record => {
            const instId = record.instructor_id;

            // 1. Faol sessiyalarni aniqlash (stop_time yo'q bo'lsa)
            if (!record.stop_time) {
                activeMap[instId] = record;
            }

            // 2. Jami vaqtni hisoblash (Faqat bugungi recordlar kelgani uchun hammasini qo'shsak bo'ladi)
            if (record.estimated_time) {
                totalTimeMap[instId] = (totalTimeMap[instId] || 0) + parseFloat(record.estimated_time);
            }
        });

        const tbody = document.getElementById('monitoringTableBody');
        tbody.innerHTML = '';

        if (instructors.length === 0) {
            // Ustunlar soni 9 ta bo'lgani uchun colspan="9" qilib o'zgartirildi
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Ma\'lumot topilmadi</td></tr>';
            return;
        }

        instructors.forEach(instructor => {
            const tr = document.createElement('tr');
            const currentSession = activeMap[instructor.id];
            const totalTime = totalTimeMap[instructor.id] || 0;

            let actionBtnHTML = "";
            let startTimeHTML = "--:--";

            if (currentSession) {
                actionBtnHTML = `
                    <button id="btn-${instructor.id}" class="btn-stop" 
                        onclick="stopAction(${instructor.id}, ${currentSession.id}, '${currentSession.start_time}')">
                        To'xtatish
                    </button>`;
                startTimeHTML = formatTime(currentSession.start_time);
            } else {
                actionBtnHTML = `
                    <button id="btn-${instructor.id}" class="btn-start" 
                        onclick="startAction(${instructor.id})">
                        Boshlash
                    </button>`;
            }

            // Dastlabki 8 ta ustunni joylaymiz
            tr.innerHTML = `
                <td>${instructor.id}</td>
                <td>${instructor.full_name}</td>
                <td><span class="car-number-badge">${instructor.car_number}</span></td>
                <td>${actionBtnHTML}</td>
                <td id="start-${instructor.id}">${startTimeHTML}</td> 
                <td id="stop-${instructor.id}">--:--</td> 
                <td id="est-${instructor.id}">--:--</td> 
                <td id="total-${instructor.id}" style="font-weight: bold; color: #3b82f6;">${totalTime} min</td>
            `;

            // 9-ustun: Jamiy chek uchun yangi TD va Button yaratish
            const tdTotalReceipt = document.createElement('td');
            const btnTotalReceipt = document.createElement('button');
            btnTotalReceipt.textContent = "Kunlik Chek";
            btnTotalReceipt.style.cssText = "padding: 6px 12px; background: #17a2b8; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; transition: 0.3s;";

            // Tugmaga bosilganda oldingi javobdagi modalni chaqiradi va ma'lumotlarni berib yuboradi
            btnTotalReceipt.onclick = () => showDailyCalculationModal(instructor.id, instructor);

            tdTotalReceipt.appendChild(btnTotalReceipt);
            tr.appendChild(tdTotalReceipt); // 9-ustunni qatorga qo'shish

            // Tayyor bo'lgan qatorni jadvalga qo'shish
            tbody.appendChild(tr);
        });

    } catch (err) {
        console.error("Tizim xatosi:", err);
    }
}

// 2. BOSHlash tugmasi
async function startAction(instructorId) {
    const btn = document.getElementById(`btn-${instructorId}`);
    btn.disabled = true;
    btn.textContent = "Kuting...";

    try {
        const startTimeStr = new Date().toISOString();

        // 1. Partner jadvaliga yangi qator qo'shish
        const { data, error } = await _supabase
            .from('partner')
            .insert([{ instructor_id: instructorId, start_time: startTimeStr }])
            .select().single();

        if (error) throw error;

        // 2. Instructors jadvalidagi statusni false ga o'zgartirish va ma'lumotlarni qaytarish
        // Chek uchun full_name va car_number kerak bo'ladi
        const { data: instructorData, error: statusError } = await _supabase
            .from('instructors')
            .update({ status: false })
            .eq('id', instructorId)
            .select('full_name, car_number')
            .single();

        if (statusError) throw statusError;

        // 3. UI ni yangilash
        document.getElementById(`start-${instructorId}`).textContent = formatTime(startTimeStr);
        document.getElementById(`stop-${instructorId}`).textContent = "--:--";
        document.getElementById(`est-${instructorId}`).textContent = "--:--";

        btn.textContent = "To'xtatish";
        btn.className = "btn-stop";
        btn.disabled = false;
        btn.onclick = () => stopAction(instructorId, data.id, startTimeStr);

        // 4. Chekni chop etish funksiyasini chaqirish
        printReceipt({
            id: data.id,
            startTime: startTimeStr,
            fullName: instructorData.full_name,
            carNumber: instructorData.car_number
        });

    } catch (err) {
        console.error("Boshlashda xato:", err);
        btn.disabled = false;
        btn.textContent = "Boshlash";
    }
}

// Chek chiqarish funksiyasi
function printReceipt(receiptData) {
    // Vaqtni chiroyli formatlash (ixtiyoriy, mahalliy vaqtga moslab)
    const formattedTime = new Date(receiptData.startTime).toLocaleString('uz-UZ', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    // Yangi yashirin oyna ochish
    const printWindow = window.open('', '_blank', 'width=400,height=600');

    // Chek dizayni (HTML va CSS)
    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Chek</title>
            <style>
                /* Printer o'lchamlarini berish: 80mm kenglik, balandligi avtomat */
                @page { 
                    margin: 0; 
                    size: 80mm auto; 
                }
                body {
                    font-family: 'Courier New', Courier, monospace; /* Cheklar uchun mos shrift */
                    width: 80mm;
                    margin: 0;
                    padding: 5mm; /* Yonlardan ozgina joy */
                    padding-bottom: 7mm; /* TUGAGAN JOYDAN 7MM BO'SH JOY TASHASH */
                    box-sizing: border-box;
                    font-size: 14px;
                    color: #000;
                }
                .center { text-align: center; }
                .line { border-bottom: 1px dashed #000; margin: 8px 0; }
                .row { 
                    display: flex; 
                    justify-content: space-between; 
                    margin: 4px 0; 
                    word-break: break-word;
                }
                .label { font-weight: bold; margin-right: 5px; }
                .value { text-align: right; }
            </style>
        </head>
        <body>
            <h3 class="center">BOSHLASH CHEKI</h3>
            <div class="line"></div>
            
            <div class="row">
                <span class="label">ID:</span> 
                <span class="value">${receiptData.id}</span>
            </div>
            <div class="row">
                <span class="label">Boshlash vaqti:</span> 
                <span class="value">${formattedTime}</span>
            </div>
            <div class="row">
                <span class="label">Instructor ismi:</span> 
                <span class="value">${receiptData.fullName}</span>
            </div>
            <div class="row">
                <span class="label">Mashina raqami:</span> 
                <span class="value">${receiptData.carNumber}</span>
            </div>
            
            <div class="line"></div>
            <div class="center" style="font-size: 12px; margin-top: 10px;">Oq yo'l!</div>
        </body>
        </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();

    // Dizayn yuklanishi uchun ozgina kutib, keyin chop etish buyrug'ini berish
    setTimeout(() => {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
    }, 250);
}

// 3. TO'XTATISH tugmasi
async function stopAction(instructorId, partnerRecordId, startTimeStr) {
    const btn = document.getElementById(`btn-${instructorId}`);
    btn.disabled = true;
    btn.textContent = "Kuting...";

    try {
        const stopTimeStr = new Date().toISOString();
        const startTimeObj = new Date(startTimeStr);
        const stopTimeObj = new Date(stopTimeStr);

        const diffMs = stopTimeObj - startTimeObj;
        const estimatedMinutes = Math.floor(diffMs / 60000);

        // 1. Partner jadvalini yangilash
        const { error } = await _supabase
            .from('partner')
            .update({
                stop_time: stopTimeStr,
                estimated_time: estimatedMinutes
            })
            .eq('id', partnerRecordId);

        if (error) throw error;

        // 2. Instructors jadvalidagi statusni true ga o'zgartirish va ma'lumotlarni olish
        const { data: instructorData, error: statusError } = await _supabase
            .from('instructors')
            .update({ status: true })
            .eq('id', instructorId)
            .select('full_name, car_number')
            .single();

        if (statusError) throw statusError;

        // 3. Hisoblash uchun Modal oynani chaqirish
        showCalculationModal({
            instructorId,
            partnerRecordId,
            startTimeStr,
            stopTimeStr,
            estimatedMinutes,
            instructorData,
            btn
        });

    } catch (err) {
        console.error("To'xtatishda xato:", err);
        btn.disabled = false;
        btn.textContent = "To'xtatish";
    }
}

// Modal oyna yaratish va hisoblash funksiyasi
// Diqqat: Supabase ulanishini kodingizning boshida e'lon qilgan bo'lishingiz kerak.
// Agar ulanmagan bo'lsangiz, quyidagi 3 qatorni o'zingizning ma'lumotlaringiz bilan to'ldirib qo'shing:
// const supabaseUrl = 'https://XXXXX.supabase.co';
// const supabaseKey = 'SIZNING_SUPABASE_ANON_KEY';
// const supabase = supabase.createClient(supabaseUrl, supabaseKey);

function showCalculationModal(data) {
    // Orqa fonni yaratish
    const overlay = document.createElement('div');
    overlay.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 9999;";

    // Asosiy oyna
    const modal = document.createElement('div');
    modal.style.cssText = "background: white; padding: 25px; border-radius: 12px; width: 340px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.3); font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;";

    modal.innerHTML = `
        <h3 style="margin-top: 0; color: #333; margin-bottom: 20px;">To'lovni hisoblash</h3>
        
        <div style="text-align: left; margin-bottom: 15px;">
            <label style="font-size: 13px; color: #666;">1 soatlik to'lov (so'm):</label>
            <input type="number" id="hourlyRateInput" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 16px; margin-top: 5px;" placeholder="Masalan: 50000">
        </div>

        <div style="text-align: left; margin-bottom: 15px;">
            <label style="font-size: 13px; color: #666;">To'lov turi:</label>
            <select id="paymentTypeSelect" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 16px; margin-top: 5px; background: white;">
                <option value="Naqd">Naqd</option>
                <option value="Karta">Karta</option>
            </select>
        </div>

        <div style="text-align: left; margin-bottom: 20px; display: flex; align-items: center; background: #f8f9fa; padding: 10px; border-radius: 6px;">
            <input type="checkbox" id="isPaidNow" style="width: 18px; height: 18px; cursor: pointer;" checked>
            <label for="isPaidNow" style="margin-left: 10px; font-size: 14px; cursor: pointer; color: #333;">To'lov hozir qilindi</label>
        </div>

        <button id="calcBtn" style="padding: 14px; background: #28a745; color: white; border: none; border-radius: 6px; cursor: pointer; width: 100%; font-size: 16px; font-weight: bold; transition: 0.3s;">Hisoblash va Chek chiqarish</button>
        <button id="cancelBtn" style="margin-top: 10px; background: none; border: none; color: #888; cursor: pointer; font-size: 14px;">Bekor qilish</button>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Bekor qilish tugmasi
    document.getElementById('cancelBtn').onclick = () => document.body.removeChild(overlay);

    // "Hisoblash" tugmasi hodisasi
    document.getElementById('calcBtn').onclick = async () => {
        const rateInput = document.getElementById('hourlyRateInput').value;
        const paymentType = document.getElementById('paymentTypeSelect').value;
        const isPaid = document.getElementById('isPaidNow').checked; // true yoki false qaytaradi
        const hourlyRate = parseFloat(rateInput);
        const calcBtn = document.getElementById('calcBtn');

        if (!hourlyRate || hourlyRate <= 0) {
            alert("Iltimos, soatlik stavkani to'g'ri kiriting!");
            return;
        }

        const summa = Math.round((data.estimatedMinutes / 60) * hourlyRate);

        calcBtn.disabled = true;
        calcBtn.textContent = "Saqlanmoqda...";
        calcBtn.style.background = "#6c757d";

        try {
            // Supabase-ga yuboriladigan yangi ma'lumotlar
            const { error } = await _supabase
                .from('partner')
                .update({
                    summa: summa,
                    payment_type: paymentType, // Naqd yoki Karta
                    is_paid: isPaid            // true yoki false
                })
                .eq('id', data.partnerRecordId);

            if (error) throw error;

        } catch (err) {
            console.error("Xato:", err.message);
            alert("Bazaga yozishda xatolik: " + err.message);
            calcBtn.disabled = false;
            calcBtn.textContent = "Hisoblash va Chek chiqarish";
            calcBtn.style.background = "#28a745";
            return;
        }

        // 3. Chek chop etish
        printStopReceipt({
            id: data.partnerRecordId,
            startTime: data.startTimeStr,
            stopTime: data.stopTimeStr,
            fullName: data.instructorData.full_name,
            carNumber: data.instructorData.car_number,
            estimatedMinutes: data.estimatedMinutes,
            summa: summa,
            paymentType: paymentType,
            status: isPaid ? "To'landi" : "Kun oxirida"
        });

        // 4. UI yangilash
        document.getElementById(`stop-${data.instructorId}`).textContent = formatTime(data.stopTimeStr);
        document.getElementById(`est-${data.instructorId}`).textContent = `${data.estimatedMinutes} min`;

        const totalCell = document.getElementById(`total-${data.instructorId}`);
        const oldTotal = parseFloat(totalCell.textContent) || 0;
        totalCell.textContent = `${oldTotal + data.estimatedMinutes} min`;

        // 5. Tugmani qaytarish
        data.btn.textContent = "Boshlash";
        data.btn.className = "btn-start";
        data.btn.disabled = false;
        data.btn.onclick = () => startAction(data.instructorId);

        // 6. Modal yopish
        document.body.removeChild(overlay);
    };
}

// Tugatish chekini chiqarish funksiyasi
function printStopReceipt(receiptData) {
    // Vaqtlarni o'qishli formatga o'tkazish yordamchi funksiyasi
    const formatDateTime = (isoString) => {
        return new Date(isoString).toLocaleString('uz-UZ', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    };

    const printWindow = window.open('', '_blank', 'width=400,height=600');

    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Tugatish Cheki</title>
            <style>
                @page { 
                    margin: 0; 
                    size: 80mm auto; 
                }
                body {
                    font-family: 'Courier New', Courier, monospace;
                    width: 80mm;
                    margin: 0;
                    padding: 5mm;
                    padding-bottom: 7mm; /* TUGAGAN JOYDAN 7MM BO'SH JOY */
                    box-sizing: border-box;
                    font-size: 14px;
                    color: #000;
                }
                .center { text-align: center; }
                .line { border-bottom: 1px dashed #000; margin: 8px 0; }
                .row { 
                    display: flex; 
                    justify-content: space-between; 
                    margin: 4px 0; 
                    word-break: break-word;
                }
                .label { font-weight: normal; margin-right: 5px; }
                .value { text-align: right; font-weight: bold; }
                /* Summa uchun maxsus qora va yirik shrift */
                .summa-row { 
                    font-size: 18px; 
                    font-weight: 900; 
                    margin-top: 10px;
                }
                .summa-row .label { font-weight: 900; }
            </style>
        </head>
        <body>
            <h3 class="center">TUGATISH CHEKI</h3>
            <div class="line"></div>
            
            <div class="row">
                <span class="label">ID:</span> 
                <span class="value">${receiptData.id}</span>
            </div>
            <div class="row">
                <span class="label">Boshlash:</span> 
                <span class="value">${formatDateTime(receiptData.startTime)}</span>
            </div>
            <div class="row">
                <span class="label">Tugash:</span> 
                <span class="value">${formatDateTime(receiptData.stopTime)}</span>
            </div>
            <div class="row">
                <span class="label">Instructor:</span> 
                <span class="value">${receiptData.fullName}</span>
            </div>
            <div class="row">
                <span class="label">Mashina:</span> 
                <span class="value">${receiptData.carNumber}</span>
            </div>
            <div class="row">
                <span class="label">Umumiy vaqt:</span> 
                <span class="value">${receiptData.estimatedMinutes} daqiqa</span>
            </div>
            
            <div class="line"></div>
            
            <div class="row summa-row">
                <span class="label">SUMMA:</span> 
                <span class="value">${receiptData.summa.toLocaleString('uz-UZ')} so'm</span>
            </div>
            
            <div class="row summa-row">
                <span class="label">To'lov turi:</span> 
                <span class="value">${receiptData.paymentType}</span>
            </div>
            
            <div class="row summa-row">
                <span class="label">To'lov xolati:</span> 
                <span class="value">${receiptData.status}</span>
            </div>
            
            <div class="line"></div>
            <div class="center" style="font-size: 12px; margin-top: 10px;">
                Xizmatimizdan foydalanganingiz uchun rahmat!
            </div>
        </body>
        </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();

    setTimeout(() => {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
    }, 250);
}

// QIDIRUV FUNKSIYASI VA EVENT LISTENERS (YANGI QO'SHILGAN QISM)
function handleSearch() {
    const searchInput = document.getElementById('carSearchInput');
    if (searchInput) {
        const query = searchInput.value.trim();
        fetchInstructors(query); // Qidiruv so'zi bilan birga chaqiramiz
    }
}

/**
 * Instruktor uchun kunlik umumiy hisob-kitob modalini ko'rsatish
 */
async function showDailyCalculationModal(instructorId, instructorData) {
    // 1. Orqa fon (Overlay) yaratish
    const overlay = document.createElement('div');
    overlay.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 9999;";

    // 2. Asosiy oyna (Modal)
    const modal = document.createElement('div');
    modal.style.cssText = "background: white; padding: 25px; border-radius: 12px; width: 340px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.3); font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;";

    modal.innerHTML = `
        <h3 style="margin-top: 0; color: #333; margin-bottom: 20px;">Kunlik Umumiy To'lov</h3>
        
        <div style="text-align: left; margin-bottom: 15px;">
            <label style="font-size: 13px; color: #666;">1 soatlik to'lov (so'm):</label>
            <input type="number" id="dailyHourlyRateInput" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 16px; margin-top: 5px;" placeholder="Masalan: 50000">
        </div>

        <div style="text-align: left; margin-bottom: 15px;">
            <label style="font-size: 13px; color: #666;">To'lov turi:</label>
            <select id="dailyPaymentTypeSelect" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 16px; margin-top: 5px; background: white;">
                <option value="Naqd">Naqd</option>
                <option value="Karta">Karta</option>
            </select>
        </div>

        <div style="text-align: left; margin-bottom: 20px; display: flex; align-items: center; background: #f8f9fa; padding: 10px; border-radius: 6px;">
            <input type="checkbox" id="dailyIsPaidNow" style="width: 18px; height: 18px; cursor: pointer;" checked>
            <label for="dailyIsPaidNow" style="margin-left: 10px; font-size: 14px; cursor: pointer; color: #333;">To'lov hozir qilindi</label>
        </div>

        <button id="dailyCalcBtn" style="padding: 14px; background: #28a745; color: white; border: none; border-radius: 6px; cursor: pointer; width: 100%; font-size: 16px; font-weight: bold; transition: 0.3s;">Hisoblash va Umumiy Chek chiqarish</button>
        <button id="dailyCancelBtn" style="margin-top: 10px; background: none; border: none; color: #888; cursor: pointer; font-size: 14px;">Bekor qilish</button>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Bekor qilish tugmasi
    document.getElementById('dailyCancelBtn').onclick = () => document.body.removeChild(overlay);

    // "Hisoblash" tugmasi hodisasi
    document.getElementById('dailyCalcBtn').onclick = async () => {
        const rateInput = document.getElementById('dailyHourlyRateInput').value;
        const paymentType = document.getElementById('dailyPaymentTypeSelect').value;
        const isPaid = document.getElementById('dailyIsPaidNow').checked;
        const hourlyRate = parseFloat(rateInput);
        const calcBtn = document.getElementById('dailyCalcBtn');

        if (!hourlyRate || hourlyRate <= 0) {
            alert("Iltimos, soatlik stavkani to'g'ri kiriting!");
            return;
        }

        calcBtn.disabled = true;
        calcBtn.textContent = "Ma'lumotlar yuklanmoqda...";
        calcBtn.style.background = "#6c757d";

        try {
            // 1. Bugungi kun chegarasini aniqlash (Local vaqt bo'yicha)
            const now = new Date();
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
            const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();

            // 2. Supabase-dan shu instruktorning bugungi BARCHA yopilgan sessiyalarini olish
            const { data: sessions, error } = await _supabase
                .from('partner')
                .select('*')
                .eq('instructor_id', instructorId)
                .gte('start_time', startOfToday)
                .lte('start_time', endOfToday)
                .not('stop_time', 'is', null); // Faqat tugatilgan sessiyalar

            if (error) throw error;

            if (!sessions || sessions.length === 0) {
                alert("Bugun uchun ushbu instruktorda yopilgan sessiyalar topilmadi!");
                calcBtn.disabled = false;
                calcBtn.textContent = "Hisoblash va Umumiy Chek chiqarish";
                calcBtn.style.background = "#28a745";
                return;
            }

            // 3. Jami daqiqalarni aniq raqam ko'rinishida hisoblash
            let calculatedTotalMinutes = 0;
            sessions.forEach(session => {
                // estimated_time ustunidagi qiymatni raqamga o'girib qo'shamiz
                const duration = parseFloat(session.estimated_time || 0);
                calculatedTotalMinutes += duration;
            });

            // Jami summani hisoblash
            const totalSumma = Math.round((calculatedTotalMinutes / 60) * hourlyRate);

            // 4. Bazada barcha sessiyalarni "To'landi" holatiga o'tkazish (agar tanlangan bo'lsa)
            if (isPaid) {
                calcBtn.textContent = "Saqlanmoqda...";
                const sessionIds = sessions.map(s => s.id);

                const { error: updateError } = await _supabase
                    .from('partner')
                    .update({
                        summa: totalSumma, // Jami summani sessiyalarga bo'lib yozish yoki asosiysiga yozish
                        payment_type: paymentType,
                        is_paid: true
                    })
                    .in('id', sessionIds);

                if (updateError) throw updateError;
            }

            // 5. Umumiy chekni chop etishga yuborish
            // (Bu yerda avvalgi javobdagi printDailyReceipt funksiyasi chaqiriladi)
            printDailyReceipt({
                instructorName: instructorData.full_name,
                carNumber: instructorData.car_number,
                sessions: sessions,
                totalMinutes: Math.round(calculatedTotalMinutes),
                totalSumma: totalSumma,
                paymentType: paymentType,
                status: isPaid ? "To'landi" : "Kun oxirida",
                date: new Date().toLocaleDateString('uz-UZ')
            });

            // 6. Modalni yopish va foydalanuvchini xabardor qilish
            document.body.removeChild(overlay);
            alert("Kunlik chek tayyorlandi!");

            // Jadvalni qayta yuklash (Ixtiyoriy)
            if (typeof fetchInstructors === "function") fetchInstructors();

        } catch (err) {
            console.error("Xato yuz berdi:", err.message);
            alert("Xatolik: " + err.message);
            calcBtn.disabled = false;
            calcBtn.textContent = "Hisoblash va Umumiy Chek chiqarish";
            calcBtn.style.background = "#28a745";
        }
    };
}

function printDailyReceipt(data) {
    let sessionsHtml = '';

    data.sessions.forEach((session, index) => {
        const duration = Number(session.estimated_time || 0);
        sessionsHtml += `
            <div style="border-bottom: 1px dashed #000; padding: 10px 0; width: 100%;">
                <div style="font-weight: bold; margin-bottom: 5px;">Qatnov ${index + 1}:</div>
                <div style="display: flex; justify-content: space-between;">
                    <span>Boshlash:</span>
                    <span>${formatFullDateTime(session.start_time)}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span>Tugash:</span>
                    <span>${formatFullDateTime(session.stop_time)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-weight: bold;">
                    <span>Vaqt:</span>
                    <span>${duration} min</span>
                </div>
            </div>
        `;
    });

    const printContents = `
        <div style="width: 80mm; font-family: 'Courier New', monospace; color: #000; padding: 5px; margin: 0 auto; box-sizing: border-box;">
            <div style="text-align: center; margin-bottom: 10px;">
                <h2 style="margin: 0; padding: 0; text-transform: uppercase; font-size: 18px;">KUNLIK UMUMIY CHEK</h2>
                <div style="font-size: 14px;">Sana: ${data.date}</div>
            </div>
            
            <div style="border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 10px 0; margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between;">
                    <span>Instruktor:</span>
                    <span style="font-weight: bold;">${data.instructorName}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span>Mashina:</span>
                    <span style="font-weight: bold;">${data.carNumber}</span>
                </div>
            </div>

            <div style="text-align: center; font-weight: bold; margin-bottom: 5px; text-decoration: underline;">QATNOVLAR TARIXI</div>
            
            ${sessionsHtml}

            <div style="margin-top: 15px; border-top: 2px solid #000; padding-top: 10px; line-height: 1.6;">
                <div style="display: flex; justify-content: space-between;">
                    <span>Umumiy sarflangan vaqt:</span>
                    <span style="font-weight: bold;">${data.totalMinutes} daqiqa</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span>To'lov turi:</span>
                    <span style="font-weight: bold;">${data.paymentType}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span>Holati:</span>
                    <span style="font-weight: bold;">${data.status}</span>
                </div>
            </div>

            <div style="margin-top: 20px; text-align: center; border-top: 2px solid #000; padding-top: 10px;">
                <div style="font-size: 20px; font-weight: bold;">JAMI: ${data.totalSumma.toLocaleString()} so'm</div>
            </div>
            
            <div style="margin-top: 30px; text-align: center; font-size: 12px; font-style: italic;">
                Xizmatingiz uchun rahmat!
            </div>
        </div>
    `;

    const printWindow = window.open('', '', 'width=800,height=900');
    printWindow.document.write('<html><head><title>Chek Chop Etish</title>');
    printWindow.document.write('<style>body{margin:0; padding:0;} @media print { body { width: 80mm; } }</style>');
    printWindow.document.write('</head><body>');
    printWindow.document.write(printContents);
    printWindow.document.write('</body></html>');
    printWindow.document.close();

    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 500);
}

function formatFullDateTime(dateString) {
    if (!dateString) return "--:--:--";
    const d = new Date(dateString);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');

    return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. Sahifa yuklanganda barcha ma'lumotlarni olib kelish
    fetchInstructors();

    // 2. Qidiruv inputida Enter tugmasi bosilishini kuzatish
    const searchInput = document.getElementById('carSearchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                handleSearch();
            }
        });
    }
});