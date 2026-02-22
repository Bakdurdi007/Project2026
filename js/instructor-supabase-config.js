// Supabase ulanish ma'lumotlari
const SUPABASE_URL = 'https://wczijkqackrmzssfgdqm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indjemlqa3FhY2tybXpzc2ZnZHFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1OTk4MzksImV4cCI6MjA4NzE3NTgzOX0.ooRafiR7nR08d1f0_XEyX19AXPHRaOzjurNYw7SvZwI'; // To'liq kalitni qoldiring

// Supabase mijozini yaratish (O'zgaruvchi nomini instructor_panel bilan mosladik)
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Sahifani himoya qilish funksiyasi
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