// Supabase ulanish ma'lumotlari
const SUPABASE_URL = '';
const SUPABASE_KEY = '';

// Supabase mijozini yaratish
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Sahifani himoya qilish funksiyasi
 * @param {string} requiredRole - 'admin' yoki 'instructor'
 */
function checkAuth(requiredRole) {
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const userRole = localStorage.getItem('userRole');

    if (!isLoggedIn || isLoggedIn !== 'true') {
        window.location.href = 'index.html';
        return;
    }

    if (requiredRole && userRole !== requiredRole) {
        alert("Sizda ushbu sahifaga kirish huquqi mavjud emas!");
        window.location.href = 'index.html';
    }
}

// Tizimdan chiqish funksiyasi
function logout() {
    localStorage.clear();
    window.location.href = 'index.html';
}

// --- DARK MODE LOGIKASI (HIMOYA BILAN) ---
const themeToggle = document.getElementById('themeToggle');
const body = document.body;
const themeIcon = document.getElementById('themeIcon');
const themeText = document.getElementById('themeText');

// Sahifa yuklanganda xotirani tekshirish
if (localStorage.getItem('theme') === 'dark') {
    body.classList.add('dark-mode');
    if (themeIcon) themeIcon.textContent = '☀️';
    if (themeText) themeText.textContent = 'Light Mode';
}

// Tugma bosilganda rejimni almashtirish (Faqat tugma bor sahifada ishlaydi)
if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        body.classList.toggle('dark-mode');
        const isDark = body.classList.contains('dark-mode');

        localStorage.setItem('theme', isDark ? 'dark' : 'light');

        if (themeIcon) themeIcon.textContent = isDark ? '☀️' : '🌙';
        if (themeText) themeText.textContent = isDark ? 'Light Mode' : 'Dark Mode';
    });
}

// --- ADMIN ISMINI CHIQARISH (HIMOYA BILAN) ---
async function displayAdminName() {
    const adminDisplay = document.getElementById('adminNameDisplay');

    // Agar bu element sahifada yo'q bo'lsa (masalan instructor_panelda), funksiyani to'xtatish
    if (!adminDisplay) return;

    const adminId = localStorage.getItem('admin_id');
    const userRole = localStorage.getItem('userRole');

    // Agar admin kirmagan bo'lsa yoki roli admin bo'lmasa qidirmaymiz
    if (!adminId || userRole !== 'admin') {
        adminDisplay.textContent = "Mehmon";
        return;
    }

    try {
        const { data, error } = await _supabase
            .from('admins')
            .select('admin_fullname')
            .eq('id', adminId)
            .single();

        if (error) throw error;

        if (data && data.admin_fullname) {
            adminDisplay.textContent = data.admin_fullname;
        }
    } catch (err) {
        console.error("Ismni yuklashda xato:", err.message);
        adminDisplay.textContent = "Xatolik!";
    }
}

// Sahifa yuklanganda ishga tushiramiz
document.addEventListener('DOMContentLoaded', () => {
    displayAdminName();
});