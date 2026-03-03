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
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Ma\'lumot topilmadi</td></tr>';
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
function showCalculationModal(data) {
    // Orqa fonni (qoraytirilgan oyna) yaratish
    const overlay = document.createElement('div');
    overlay.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 9999;";

    // Asosiy oq oyna
    const modal = document.createElement('div');
    modal.style.cssText = "background: white; padding: 25px; border-radius: 10px; width: 320px; text-align: center; box-shadow: 0 4px 15px rgba(0,0,0,0.2); font-family: sans-serif;";

    modal.innerHTML = `
        <h3 style="margin-top: 0; color: #333;">To'lovni hisoblash</h3>
        <p style="font-size: 14px; color: #555; margin-bottom: 10px;">Instruktorning 1 soatlik to'lovi (so'm):</p>
        <input type="number" id="hourlyRateInput" style="width: 100%; padding: 10px; margin-bottom: 20px; box-sizing: border-box; border: 1px solid #ccc; border-radius: 5px; font-size: 16px;" placeholder="Masalan: 50000">
        <button id="calcBtn" style="padding: 12px 15px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; width: 100%; font-size: 16px; font-weight: bold;">Hisoblash va Chek chiqarish</button>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // "Hisoblash" tugmasi hodisasi
    document.getElementById('calcBtn').onclick = () => {
        const rateInput = document.getElementById('hourlyRateInput').value;
        const hourlyRate = parseFloat(rateInput);

        if (!hourlyRate || hourlyRate <= 0) {
            alert("Iltimos, to'g'ri qiymat kiriting!");
            return;
        }

        // 1. Summani hisoblash: (Daqiqa / 60) * Soatlik_stavka
        // Yaxlitlash uchun Math.round dan foydalanamiz
        const summa = Math.round((data.estimatedMinutes / 60) * hourlyRate);

        // 2. Chek chop etish funksiyasini chaqirish
        printStopReceipt({
            id: data.partnerRecordId,
            startTime: data.startTimeStr,
            stopTime: data.stopTimeStr,
            fullName: data.instructorData.full_name,
            carNumber: data.instructorData.car_number,
            estimatedMinutes: data.estimatedMinutes,
            summa: summa
        });

        // 3. UI ni (jadvallardagi yozuvlarni) yangilash
        document.getElementById(`stop-${data.instructorId}`).textContent = formatTime(data.stopTimeStr);
        document.getElementById(`est-${data.instructorId}`).textContent = `${data.estimatedMinutes} min`;

        const totalCell = document.getElementById(`total-${data.instructorId}`);
        const oldTotal = parseFloat(totalCell.textContent) || 0;
        totalCell.textContent = `${oldTotal + data.estimatedMinutes} min`;

        // 4. Tugmani dastlabki (Boshlash) holatiga qaytarish
        data.btn.textContent = "Boshlash";
        data.btn.className = "btn-start";
        data.btn.disabled = false;
        data.btn.onclick = () => startAction(data.instructorId);

        // 5. Modal oynani yopish (o'chirish)
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