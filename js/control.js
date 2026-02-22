document.addEventListener('DOMContentLoaded', () => {
    fetchControlData();
    setupFilters();
});

// Talabalar va to'lovlar ma'lumotlarini olish
async function fetchControlData() {
    // Supabase'dan talabalar va ularning to'lovlarini (join) orqali olish mumkin
    // Hozircha asosiy 'students' jadvalidan misol:
    const { data: students, error } = await _supabase
        .from('students')
        .select(`
            id, 
            full_name, 
            group_id, 
            total_sum, 
            paid_sum
        `);

    if (error) {
        console.error("Xatolik:", error);
        return;
    }

    renderTable(students);
}

function renderTable(data) {
    const tbody = document.getElementById('controlTableBody');
    tbody.innerHTML = '';

    data.forEach(student => {
        const debt = student.total_sum - student.paid_sum;
        const statusClass = debt <= 0 ? 'status-paid' : 'status-debt';
        const statusText = debt <= 0 ? 'To\'langan' : 'Qarzi bor';

        tbody.innerHTML += `
            <tr>
                <td><b>${student.full_name}</b></td>
                <td>Guruh-${student.group_id}</td>
                <td>${student.paid_sum.toLocaleString()} UZS</td>
                <td style="color: ${debt > 0 ? '#ef4444' : 'inherit'}">
                    ${debt.toLocaleString()} UZS
                </td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td><button class="view-btn">Ko'rish</button></td>
            </tr>
        `;
    });
}

function setupFilters() {
    const searchInput = document.getElementById('studentSearch');
    const groupFilter = document.getElementById('groupFilter');
    const statusFilter = document.getElementById('statusFilter');

    const runFilter = async () => {
        let query = _supabase.from('students').select('*');

        if (searchInput.value) {
            query = query.ilike('full_name', `%${searchInput.value}%`);
        }

        const { data } = await query;

        // Qo'shimcha JS filtrlar (status va guruh uchun)
        let filtered = data;
        if (statusFilter.value === 'debt') {
            filtered = data.filter(s => (s.total_sum - s.paid_sum) > 0);
        } else if (statusFilter.value === 'paid') {
            filtered = data.filter(s => (s.total_sum - s.paid_sum) <= 0);
        }

        renderTable(filtered);
    };

    searchInput.addEventListener('input', runFilter);
    statusFilter.addEventListener('change', runFilter);
}

document.addEventListener('DOMContentLoaded', () => {
    // Ismni chiqarish
    const name = localStorage.getItem('userName');
    document.getElementById('adminNameDisplay').textContent = name;
});