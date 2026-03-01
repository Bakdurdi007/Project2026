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
        // Instruktorlarni olish uchun asosiy so'rov
        let query = _supabase
            .from('instructors')
            .select('id, full_name, car_number')
            .eq('source', 'hamkor');

        // AGAR QIDIRUV MATNI BO'LSA, MASHINA RAQAMI BO'YICHA IZLASH QO'SHILADI
        if (searchQuery) {
            query = query.ilike('car_number', `%${searchQuery}%`);
        }

        // O'zgartirilgan (yoki o'zgartirilmagan) so'rovni ishga tushirish
        const { data: instructors, error: instError } = await query;

        if (instError) throw instError;

        // BAZADAN BARCHA AMALLARNI OLISH (Jami vaqt va faol sessiyalar uchun)
        const { data: allPartnerRecords, error: partnerError } = await _supabase
            .from('partner')
            .select('id, instructor_id, start_time, stop_time, estimated_time');

        if (partnerError) throw partnerError;

        // Ma'lumotlarni saralash (Xarita yaratish)
        const activeMap = {}; // Hozir ishlayotganlar
        const totalTimeMap = {}; // Har bir instruktor uchun jami minutlar

        allPartnerRecords.forEach(record => {
            const instId = record.instructor_id;

            // 1. Faol sessiyalarni aniqlash (stop_time yo'q bo'lsa)
            if (!record.stop_time) {
                activeMap[instId] = record;
            }

            // 2. Jami vaqtni hisoblash (estimated_time bor bo'lsa)
            if (record.estimated_time) {
                totalTimeMap[instId] = (totalTimeMap[instId] || 0) + parseFloat(record.estimated_time);
            }
        });

        const tbody = document.getElementById('monitoringTableBody');
        tbody.innerHTML = '';

        // Agar ma'lumot topilmasa, foydalanuvchiga bildirish
        if (instructors.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Ma\'lumot topilmadi</td></tr>';
            return;
        }

        instructors.forEach(instructor => {
            const tr = document.createElement('tr');
            const currentSession = activeMap[instructor.id];
            const totalTime = totalTimeMap[instructor.id] || 0;

            // Umumiy qator qurilishi
            let actionBtnHTML = "";
            let startTimeHTML = "--:--";

            if (currentSession) {
                // AGAR FAOL BO'LSA
                actionBtnHTML = `
                    <button id="btn-${instructor.id}" class="btn-stop" 
                        onclick="stopAction(${instructor.id}, ${currentSession.id}, '${currentSession.start_time}')">
                        To'xtatish
                    </button>`;
                startTimeHTML = formatTime(currentSession.start_time);
            } else {
                // AGAR BO'SH BO'LSA
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

        // 2. Instructors jadvalidagi statusni false ga o'zgartirish
        const { error: statusError } = await _supabase
            .from('instructors')
            .update({ status: false })
            .eq('id', instructorId);

        if (statusError) throw statusError;

        // UI ni yangilash
        document.getElementById(`start-${instructorId}`).textContent = formatTime(startTimeStr);
        document.getElementById(`stop-${instructorId}`).textContent = "--:--";
        document.getElementById(`est-${instructorId}`).textContent = "--:--";

        btn.textContent = "To'xtatish";
        btn.className = "btn-stop";
        btn.disabled = false;
        btn.onclick = () => stopAction(instructorId, data.id, startTimeStr);

    } catch (err) {
        console.error("Boshlashda xato:", err);
        btn.disabled = false;
        btn.textContent = "Boshlash";
    }
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

        // 2. Instructors jadvalidagi statusni true ga o'zgartirish
        const { error: statusError } = await _supabase
            .from('instructors')
            .update({ status: true })
            .eq('id', instructorId);

        if (statusError) throw statusError;

        // UI yangilash
        document.getElementById(`stop-${instructorId}`).textContent = formatTime(stopTimeStr);
        document.getElementById(`est-${instructorId}`).textContent = `${estimatedMinutes} min`;

        // Jami vaqtni yangilash (Eski qiymatga yangisini qo'shamiz)
        const totalCell = document.getElementById(`total-${instructorId}`);
        const oldTotal = parseFloat(totalCell.textContent) || 0;
        totalCell.textContent = `${oldTotal + estimatedMinutes} min`;

        // Tugmani qaytarish
        btn.textContent = "Boshlash";
        btn.className = "btn-start";
        btn.disabled = false;
        btn.onclick = () => startAction(instructorId);

    } catch (err) {
        console.error("To'xtatishda xato:", err);
        btn.disabled = false;
        btn.textContent = "To'xtatish";
    }
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