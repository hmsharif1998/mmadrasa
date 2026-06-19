// ============================================
// ১. গুগল অ্যাপস স্ক্রিপ্ট লিংক
// ============================================
const SCRIPT_URL = localStorage.getItem('madrasah_script_url') || 'https://script.google.com/macros/s/AKfycbwsHbZD2dPeNt1959Au1CD-te7egM6aRVNjG7_F2_bY0lrtgLPZxzu_PNKNskJG3yW3Xg/exec';

// ============================================
// ২. Dexie.js লোকাল ডাটাবেজ টেবিল স্কিমা
// ============================================
const db = new Dexie("MadrasahDB");
db.version(2).stores({
    students: 'id, name, class, roll, parent_phone, admission_date, is_synced, is_deleted',
    fees: 'receipt_id, student_id, student_name, amount, month, payment_date, is_synced, is_deleted',
    settings: 'id, madrasah_name, madrasah_address, madrasah_phone, madrasah_pin, madrasah_script_url, is_synced, is_deleted',
    expenses: 'expense_id, branch, category, amount, date, is_synced, is_deleted',
    attendance: 'attendance_id, student_id, date, status, is_synced, is_deleted'
});

let isSyncing = false;
window.currentModule = 'dashboard';

// ============================================
// ৩. লোকাল ফাইল লোড করার জন্য Fetch API
// ============================================
async function fetchLocalFile(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error("লোকাল ফাইল লোড করতে ব্যর্থ: " + url);
    }
    return await response.text();
}

// ============================================
// ৪. ডাইনামিক রাউটার (মডিউল লোডার)
// ============================================
function loadModule(moduleName) {
    window.currentModule = moduleName;

    document.getElementById('main-content').innerHTML = `
        <div class="flex items-center justify-center h-64 text-gray-500">
            <div class="text-center">
                <i class="fa-solid fa-circle-notch animate-spin text-5xl text-emerald-600 mb-4"></i>
                <p class="text-lg font-medium">লোড হচ্ছে...</p>
            </div>
        </div>`;

    updateNavStyles(moduleName);

    fetchLocalFile(`${moduleName}.html`)
        .then(html => {
            const mainContent = document.getElementById('main-content');
            mainContent.innerHTML = html;

const titles = {
    'dashboard': 'ড্যাশবোর্ড',
    'admission': 'ছাত্র ভর্তি',
    'fees': 'বেতন কালেকশন',
    'student_list': 'ছাত্রদের তালিকা ও রিপোর্ট',
    'expense': 'খরচ এন্ট্রি ও রিপোর্ট', // নতুন যুক্ত
    'attendance': 'দৈনিক হাজিরা খাতা',    // নতুন যুক্ত
    'settings': 'সেটিংস'
};
            document.getElementById('page-title').textContent = titles[moduleName] || 'ম্যানেজমেন্ট';

            executeInlineScripts(mainContent);

            const initFuncName = `init${moduleName.charAt(0).toUpperCase() + moduleName.slice(1).replace('_', '')}`;
            if (typeof window[initFuncName] === 'function') {
                window[initFuncName]();
            }
        })
        .catch(err => {
            document.getElementById('main-content').innerHTML = `
                <div class="text-center py-12 text-red-500 bg-red-50 rounded-xl border border-red-200 m-6">
                    <i class="fa-solid fa-triangle-exclamation text-5xl mb-4"></i>
                    <p class="text-lg font-bold">${err.message}</p>
                </div>`;
        });
}

function executeInlineScripts(container) {
    const scripts = container.querySelectorAll('script');
    scripts.forEach(oldScript => {
        const newScript = document.createElement('script');
        Array.from(oldScript.attributes).forEach(attr => {
            newScript.setAttribute(attr.name, attr.value);
        });
        newScript.appendChild(document.createTextNode(oldScript.innerHTML));
        oldScript.parentNode.replaceChild(newScript, oldScript);
    });
}

function updateNavStyles(activeModule) {
const modules = ['dashboard', 'admission', 'fees', 'student_list', 'expense', 'attendance', 'settings'];
    modules.forEach(mod => {
        const el = document.getElementById(`nav-${mod}`);
        if (el) {
            if (mod === activeModule) {
                el.classList.add('bg-emerald-700', 'text-yellow-300');
                el.classList.remove('hover:bg-emerald-700');
            } else {
                el.classList.remove('bg-emerald-700', 'text-yellow-300');
                el.classList.add('hover:bg-emerald-700');
            }
        }
    });
}

// ============================================
// ৫. ইন্টারনেট সংযোগ পরীক্ষা
// ============================================
function updateConnectionStatus() {
    const statusEl = document.getElementById('connection-status');
    if (navigator.onLine) {
        statusEl.textContent = "অনলাইন";
        statusEl.className = "px-2 py-0.5 rounded bg-emerald-500 text-white font-semibold flex items-center gap-1";
        triggerAutoSync();
    } else {
        statusEl.textContent = "অফলাইন";
        statusEl.className = "px-2 py-0.5 rounded bg-red-500 text-white font-semibold flex items-center gap-1";
    }
}

// ============================================
// ৬. পেন্ডিং ডাটা কাউন্ট
// ============================================
async function updatePendingCount() {
    try {
        const unsyncedStudents = await db.students.where('is_synced').equals(0).count();
        const unsyncedFees = await db.fees.where('is_synced').equals(0).count();
        const unsyncedSettings = await db.settings.where('is_synced').equals(0).count();
        const unsyncedExpenses = await db.expenses.where('is_synced').equals(0).count(); // নতুন
        const unsyncedAttendance = await db.attendance.where('is_synced').equals(0).count(); // নতুন
        const total = unsyncedStudents + unsyncedFees + unsyncedSettings;
        document.getElementById('pending-sync-count').textContent = total;
        return total;
    } catch (err) {
        console.error("পেন্ডিং কাউন্ট গণনা করতে ব্যর্থ:", err);
        return 0;
    }
}

// ============================================
// ७. সিঙ্ক ট্রিগার
// ============================================
async function triggerManualSync() {
    const syncIcon = document.getElementById('sync-icon');
    syncIcon.classList.add('animate-spin');
    await syncData();
    syncIcon.classList.remove('animate-spin');
}

async function triggerAutoSync() {
    await syncData();
}

// ============================================
// ৮. সম্পূর্ণ সিঙ্ক ফাংশন
// ============================================
async function syncData() {
    if (isSyncing || !navigator.onLine) return;
    isSyncing = true;

    const loader = document.getElementById('sync-loader');
    if (loader) loader.classList.remove('hidden');

    try {
        // Push Data
        await pushLocalData();

        // Pull Data
        await pullServerData();

        await updatePendingCount();

        if (window.currentModule) {
            const initFuncName = `init${window.currentModule.charAt(0).toUpperCase() + window.currentModule.slice(1).replace('_', '')}`;
            if (typeof window[initFuncName] === 'function') {
                await window[initFuncName]();
            }
        }

        showToast("সিঙ্ক সম্পন্ন হয়েছে!", "success");

    } catch (error) {
        console.error("সিঙ্ক ব্যর্থ:", error);
        showToast("সিঙ্ক করতে সমস্যা হয়েছে: " + error.message, "error");
    } finally {
        isSyncing = false;
        if (loader) loader.classList.add('hidden');
    }
}

// ============================================
// ৯. লোকাল ডেটা পুশ
// ============================================
async function pushLocalData() {
    const unsyncedStudents = await db.students.where('is_synced').equals(0).toArray();
    if (unsyncedStudents.length > 0) {
        const success = await pushToSheet('Students', unsyncedStudents);
        if (success) {
            await updateLocalSyncStatus('students', unsyncedStudents);
        }
    }

    const unsyncedFees = await db.fees.where('is_synced').equals(0).toArray();
    if (unsyncedFees.length > 0) {
        const success = await pushToSheet('Fees', unsyncedFees);
        if (success) {
            await updateLocalSyncStatus('fees', unsyncedFees);
        }
    }

    const unsyncedSettings = await db.settings.where('is_synced').equals(0).toArray();
    if (unsyncedSettings.length > 0) {
        const success = await pushToSheet('Settings', unsyncedSettings);
        if (success) {
            await updateLocalSyncStatus('settings', unsyncedSettings);
        }
    }
	 // নতুন: খরচের ডাটা পুশ
    const unsyncedExpenses = await db.expenses.where('is_synced').equals(0).toArray();
    if (unsyncedExpenses.length > 0) {
        const success = await pushToSheet('Expenses', unsyncedExpenses);
        if (success) await updateLocalSyncStatus('expenses', unsyncedExpenses);
    }

    // নতুন: হাজিরার ডাটা পুশ
    const unsyncedAttendance = await db.attendance.where('is_synced').equals(0).toArray();
    if (unsyncedAttendance.length > 0) {
        const success = await pushToSheet('Attendance', unsyncedAttendance);
        if (success) await updateLocalSyncStatus('attendance', unsyncedAttendance);
    }
	
}

// ============================================
// ১০. শিটে ডেটা পুশ
// ============================================
async function pushToSheet(sheetName, data) {
    try {
        const cleanData = data.map(item => {
            const { is_synced, ...rest } = item;
            return {
                ...rest,
                is_deleted: parseInt(rest.is_deleted) || 0
            };
        });

        const payload = new URLSearchParams({
            sheetName: sheetName,
            rows: JSON.stringify(cleanData)
        }).toString();

        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'cors',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8'
            },
            body: payload
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        return result.status === 'success';

    } catch (error) {
        console.error(`Push to ${sheetName} failed:`, error);
        return false;
    }
}

// ============================================
// ১১. লোকাল সিঙ্ক স্ট্যাটাস আপডেট
// ============================================
async function updateLocalSyncStatus(type, items) {
    if (type === 'students') {
        for (let s of items) {
            if (parseInt(s.is_deleted) === 1) await db.students.delete(s.id);
            else await db.students.update(s.id, { is_synced: 1 });
        }
    } else if (type === 'fees') {
        for (let f of items) {
            if (parseInt(f.is_deleted) === 1) await db.fees.delete(f.receipt_id);
            else await db.fees.update(f.receipt_id, { is_synced: 1 });
        }
    } else if (type === 'settings') {
        for (let set of items) {
            if (parseInt(set.is_deleted) === 1) await db.settings.delete(set.id);
            else await db.settings.update(set.id, { is_synced: 1 });
        }
    } else if (type === 'expenses') { // নতুন
        for (let exp of items) {
            if (parseInt(exp.is_deleted) === 1) await db.expenses.delete(exp.expense_id);
            else await db.expenses.update(exp.expense_id, { is_synced: 1 });
        }
    } else if (type === 'attendance') { // নতুন
        for (let att of items) {
            if (parseInt(att.is_deleted) === 1) await db.attendance.delete(att.attendance_id);
            else await db.attendance.update(att.attendance_id, { is_synced: 1 });
        }
    }
}

// ============================================
// ১২. সার্ভার থেকে ডেটা পুল
// ============================================
async function pullServerData() {
    try {
        const response = await fetch(SCRIPT_URL, { method: 'GET', mode: 'cors' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();

        if (data.status === 'success') {
            if (data.students) await syncStudentsFromServer(data.students);
            if (data.fees) await syncFeesFromServer(data.fees);
            if (data.settings) await syncSettingsFromServer(data.settings);
            if (data.expenses) await syncExpensesFromServer(data.expenses);     // নতুন যুক্ত
            if (data.attendance) await syncAttendanceFromServer(data.attendance); // নতুন যুক্ত
        }
    } catch (error) {
        console.error('Pull failed:', error);
        throw error;
    }
}
// ============================================
// ১৩. সার্ভার থেকে ছাত্রদের ডেটা সিঙ্ক (সম্পূর্ণ ডাইনামিক)
// ============================================
async function syncStudentsFromServer(serverStudents) {
    const serverIds = new Set(serverStudents.map(s => s.id));
    const localStudents = await db.students.toArray();

    // সার্ভারে যা নেই কিন্তু লোকালে সিঙ্কড অবস্থায় আছে, তা ডিলিট করা
    for (let local of localStudents) {
        if (local.is_synced === 1 && !serverIds.has(local.id)) {
            await db.students.delete(local.id);
        }
    }

    for (let student of serverStudents) {
        const isDeleted = parseInt(student.is_deleted) || 0;

        if (isDeleted === 1) {
            const existing = await db.students.get(student.id);
            if (existing) await db.students.delete(student.id);
            continue;
        }

        // ডাইনামিক অবজেক্ট তৈরি: সার্ভার থেকে আসা সব প্রোপার্টি হুবহু নিয়ে নেওয়া হবে
        const studentObj = {
            ...student,
            serial_no: parseInt(student.serial_no) || 0,
            roll: parseInt(student.roll) || 0,
            is_synced: 1,
            is_deleted: 0
        };

        // Dexie-তে পুট (পুট স্বয়ংক্রিয়ভাবে অ্যাড বা আপডেট হ্যান্ডেল করে)
        await db.students.put(studentObj);
    }
}

// ============================================
// ১৪. সার্ভার থেকে বেতনের ডেটা সিঙ্ক (সম্পূর্ণ ডাইনামিক)
// ============================================
async function syncFeesFromServer(serverFees) {
    const serverIds = new Set(serverFees.map(f => f.receipt_id));
    const localFees = await db.fees.toArray();

    for (let local of localFees) {
        if (local.is_synced === 1 && !serverIds.has(local.receipt_id)) {
            await db.fees.delete(local.receipt_id);
        }
    }

    for (let fee of serverFees) {
        const isDeleted = parseInt(fee.is_deleted) || 0;

        if (isDeleted === 1) {
            const existing = await db.fees.get(fee.receipt_id);
            if (existing) await db.fees.delete(fee.receipt_id);
            continue;
        }

        const feeObj = {
            ...fee,
            amount: parseFloat(fee.amount) || 0,
            is_synced: 1,
            is_deleted: 0
        };

        await db.fees.put(feeObj);
    }
}

// ============================================
// ১৫. সার্ভার থেকে সেটিংস ডেটা সিঙ্ক (সম্পূর্ণ ডাইনামিক)
// ============================================
async function syncSettingsFromServer(serverSettings) {
    for (let set of serverSettings) {
        const isDeleted = parseInt(set.is_deleted) || 0;

        if (isDeleted === 1) {
            const existing = await db.settings.get(set.id);
            if (existing) await db.settings.delete(set.id);
            continue;
        }

        const setObj = {
            ...set,
            is_synced: 1,
            is_deleted: 0
        };

        await db.settings.put(setObj);

        localStorage.setItem('madrasah_name', set.madrasah_name || 'মাদরাসাতুল মদিনা');
        localStorage.setItem('madrasah_address', set.madrasah_address || '');
        localStorage.setItem('madrasah_phone', set.madrasah_phone || '');
        localStorage.setItem('madrasah_pin', set.madrasah_pin || '1234');
        localStorage.setItem('madrasah_script_url', set.madrasah_script_url || '');
    }

    if (typeof window.applyGlobalSettings === 'function') {
        window.applyGlobalSettings();
    }
}
// ============================================
// ১৬. টোস্ট নোটিফিকেশন
// ============================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg border text-sm font-semibold pointer-events-auto transform translate-y-2 opacity-0 transition-all duration-300`;

    if (type === 'success') {
        toast.classList.add('bg-emerald-50', 'text-emerald-800', 'border-emerald-200');
        toast.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-600 text-lg"></i> <span>${message}</span>`;
    } else if (type === 'error') {
        toast.classList.add('bg-red-50', 'text-red-800', 'border-red-200');
        toast.innerHTML = `<i class="fa-solid fa-circle-xmark text-red-600 text-lg"></i> <span>${message}</span>`;
    } else {
        toast.classList.add('bg-blue-50', 'text-blue-800', 'border-blue-200');
        toast.innerHTML = `<i class="fa-solid fa-circle-info text-blue-600 text-lg"></i> <span>${message}</span>`;
    }

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    setTimeout(() => {
        toast.classList.add('translate-y-2', 'opacity-0');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// ============================================
// ১৭. গ্লোবাল ডাইনামিক নাম ও স্টাইল আপডেট
// ============================================
window.applyGlobalSettings = function() {
    const name = localStorage.getItem('madrasah_name') || 'মাদরাসাতুল মদিনা';

    const lockTitle = document.getElementById('lock-madrasah-name');
    if (lockTitle) lockTitle.textContent = name;

    const sidebarTitle = document.getElementById('sidebar-madrasah-name');
    if (sidebarTitle) {
        sidebarTitle.innerHTML = `<i class="fa-solid fa-mosque text-emerald-300"></i> ${name}`;
    }
};

// ============================================
// ১৮. ইভেন্ট লিসেনার
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    window.applyGlobalSettings();
    updateConnectionStatus();
    await updatePendingCount();
});

window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);

window.lockApp = function() {
    const overlay = document.getElementById('pin-lock-overlay');
    if (overlay) {
        overlay.style.display = 'flex';
        window.enteredPin = "";
        updatePinDots();
    }
};

async function syncExpensesFromServer(serverExpenses) {
    const serverIds = new Set(serverExpenses.map(e => e.expense_id));
    const localExpenses = await db.expenses.toArray();

    for (let local of localExpenses) {
        if (local.is_synced === 1 && !serverIds.has(local.expense_id)) {
            await db.expenses.delete(local.expense_id);
        }
    }

    for (let exp of serverExpenses) {
        const isDeleted = parseInt(exp.is_deleted) || 0;
        if (isDeleted === 1) {
            const existing = await db.expenses.get(exp.expense_id);
            if (existing) await db.expenses.delete(exp.expense_id);
            continue;
        }
        const expObj = {
            ...exp,
            amount: parseFloat(exp.amount) || 0,
            is_synced: 1,
            is_deleted: 0
        };
        await db.expenses.put(expObj);
    }
}

async function syncAttendanceFromServer(serverAttendance) {
    const serverIds = new Set(serverAttendance.map(a => a.attendance_id));
    const localAttendance = await db.attendance.toArray();

    for (let local of localAttendance) {
        if (local.is_synced === 1 && !serverIds.has(local.attendance_id)) {
            await db.attendance.delete(local.attendance_id);
        }
    }

    for (let att of serverAttendance) {
        const isDeleted = parseInt(att.is_deleted) || 0;
        if (isDeleted === 1) {
            const existing = await db.attendance.get(att.attendance_id);
            if (existing) await db.attendance.delete(att.attendance_id);
            continue;
        }
        const attObj = {
            ...att,
            is_synced: 1,
            is_deleted: 0
        };
        await db.attendance.put(attObj);
    }
}