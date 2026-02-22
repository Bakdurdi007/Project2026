const loginForm = document.getElementById('loginForm');
const errorDiv = document.getElementById('error-message');

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Xatolik yozuvini yashirib turish
    if (errorDiv) errorDiv.style.display = 'none';

    const login = document.getElementById('phone').value.trim();
    const password = document.getElementById('password').value.trim();

    // 1. Validatsiya
    if (!/^\d{1,12}$/.test(login)) {
        showError("Telefon raqami faqat raqamlardan iborat bo'lsin (maks 12 ta)!");
        return;
    }

    if (password.length < 5) {
        showError("Parol kamida 5 ta belgidan iborat bo'lishi kerak!");
        return;
    }

    try {
        // 2. Adminlar jadvalidan qidirish
        let { data: admin, error: adminErr } = await _supabase
            .from('admins')
            .select('*')
            .eq('login', login)
            .eq('password', password)
            .maybeSingle();

        if (admin) {
            saveSession(admin, 'admin');
            window.location.href = 'admin_panel.html';
            return;
        }

        // 3. Instruktorlar jadvalidan qidirish
        let { data: instructor, error: instErr } = await _supabase
            .from('instructors')
            .select('*')
            .eq('login', login)
            .eq('password', password)
            .maybeSingle();

        if (instructor) {
            saveSession(instructor, 'instructor');
            window.location.href = 'instructor_panel.html';
            return;
        }

        // Agar hech biri topilmasa
        showError("Login yoki parol xato!");

    } catch (err) {
        console.error("Xatolik:", err);
        showError("Server bilan bog'lanishda xatolik yuz berdi.");
    }
});

// SESSIYANI SAQLASH FUNKSIYASI
function saveSession(user, role) {
    localStorage.clear(); // Eski qoldiqlarni tozalash
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('userRole', role);

    if (role === 'admin') {
        // Admin uchun eski config formatini saqlab qolamiz
        localStorage.setItem('admin_id', user.id);
        localStorage.setItem('userName', user.admin_fullname || user.full_name);
    } else {
        // Instruktor uchun panelga kerakli formatda saqlaymiz
        // instructor_panel.js aynan 'instructorUser' kalitini kutadi
        localStorage.setItem('instructorUser', JSON.stringify(user));
        localStorage.setItem('admin_id', user.id); // Id har ehtimolga qarshi
        localStorage.setItem('userName', user.full_name);
    }
}

function showError(msg) {
    if (errorDiv) {
        errorDiv.textContent = msg;
        errorDiv.style.display = 'block';
    } else {
        alert(msg);
    }
}