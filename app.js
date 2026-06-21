// ============================================
// ১. গুগল অ্যাপস স্ক্রিপ্ট লিংক এবং সেশন গ্লোবাল স্টেট
// ============================================
const SCRIPT_URL = localStorage.getItem('madrasah_script_url') || 'https://script.google.com/macros/s/AKfycbxB0PBAPPREra1hUXkmGnDTo2xVi6J9ZgMJVPY9PfSU_rzDm5G5UP5PMhnH6RoS9qFZeg/exec';

// গ্লোবাল ইউজার স্টেট (সেশন স্টোরেজ থেকে পুনরুদ্ধার)
window.currentUser = JSON.parse(sessionStorage.getItem('currentUser')) || null;
window.currentModule = 'dashboard';
let isSyncing = false;

// ============================================
// ২. Dexie.js লোকাল ডাটাবেজ টেবিল স্কিমা (সংস্করণ ৪ - অডিট ট্রায়াল ট্র্যাকিং সহ)
// ============================================
const db = new Dexie("MadrasahDB");
db.version(4).stores({
    students: 'id, name, class, roll, parent_phone, admission_date, is_synced, is_deleted, created_by, updated_by, [class+roll]',
    fees: 'receipt_id, student_id, student_name, amount, month, payment_date, is_synced, is_deleted, created_by, updated_by',
    settings: 'id, madrasah_name, madrasah_address, madrasah_phone, madrasah_pin, madrasah_script_url, is_synced, is_deleted',
    expenses: 'expense_id, branch, category, amount, date, is_synced, is_deleted, created_by, updated_by',
    attendance: 'attendance_id, student_id, date, status, is_synced, is_deleted, created_by, updated_by',
    users: 'username, pin, role, fullname, is_synced, is_deleted' // fullname সহ ডাইনামিক ইউজার টেবিল
});

// ============================================
// ৩. গ্লোবাল বাংলা থেকে ইংরেজি সংখ্যা কনভার্টার ও নিরাপদ পার্সার
// ============================================
window.convertToEnglishDigits = function(str) {
    if (str === null || str === undefined) return "";
    const banglaDigits = {'০':'0','১':'1','২':'2','৩':'3','৪':'4','৫':'5','৬':'6','৭':'7','৮':'8','৯':'9'};
    return str.toString().replace(/[০-৯]/g, d => banglaDigits[d]);
};

// গ্লোবাল বাংলা-বান্ধব নিরাপদ ফ্লোট পার্সার (NaN এরর প্রতিরোধক)
window.safeParseFloat = function(val) {
    if (val === null || val === undefined) return 0;
    let eng = window.convertToEnglishDigits(val.toString());
    // সংখ্যা, দশমিক এবং মাইনাস চিহ্ন ব্যতীত সবকিছু রিমুভ করা
    let clean = eng.replace(/[^0-9.-]/g, ''); 
    let parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
};

// ============================================
// ৪. রোল ভিত্তিক নেভিগেশন প্যানেল কন্ট্রোলার (RBAC UI)
// ============================================
window.updateSidebarNavigation = function() {
    const user = window.currentUser || JSON.parse(sessionStorage.getItem('currentUser'));
    if (!user) return;

    const role = user.role;
    const allModules = ['dashboard', 'admission', 'fees', 'student_list', 'expense', 'attendance', 'settings'];

    // মডিউল আইডি ম্যাপিং
    const navElements = {
        dashboard: document.getElementById('nav-dashboard'),
        admission: document.getElementById('nav-admission'),
        fees: document.getElementById('nav-fees'),
        student_list: document.getElementById('nav-student_list'),
        expense: document.getElementById('nav-expense'),
        attendance: document.getElementById('nav-attendance'),
        settings: document.getElementById('nav-settings')
    };

    // সব বাটন শো করা
    allModules.forEach(mod => {
        if (navElements[mod]) navElements[mod].classList.remove('hidden');
    });

    // রোল অনুযায়ী হাইড করা (শিক্ষকের জন্য ভর্তি ও তালিকা এখন উন্মুক্ত)
    if (role === 'teacher') {
        // শিক্ষকের জন্য বেতন কালেকশন, ব্যয়ের খাতা ও সেটিংস হাইড থাকবে
        const blockedForTeacher = ['fees', 'expense', 'settings'];
        blockedForTeacher.forEach(mod => {
            if (navElements[mod]) navElements[mod].classList.add('hidden');
        });
    } else if (role === 'accountant') {
        // হিসাবরক্ষকের জন্য সেটিংস হাইড থাকবে
        if (navElements['settings']) navElements['settings'].classList.add('hidden');
    }
};

// ============================================
// ৫. ডাইনামিক রাউটার ও মডিউল লোডার (নিরাপদ গেটওয়ে)
// ============================================
async function fetchLocalFile(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error("লোকাল ফাইল লোড করতে ব্যর্থ: " + url);
    return await response.text();
}

function loadModule(moduleName) {
    // ১. ভেরিফিকেশন: ব্যবহারকারী লগইন অবস্থায় আছেন কি না
    const user = window.currentUser || JSON.parse(sessionStorage.getItem('currentUser'));
    if (!user) {
        window.lockApp();
        return;
    }

    const role = user.role;

    // ২. মডিউল অ্যাক্সেস কন্ট্রোল (শিক্ষকদের জন্য ভর্তি ও তালিকা উন্মুক্ত করা হলো)
    if (role === 'teacher') {
        const allowedForTeacher = ['dashboard', 'attendance', 'admission', 'student_list'];
        if (!allowedForTeacher.includes(moduleName)) {
            showToast("দুঃখিত, শিক্ষক রোল থেকে এই মডিউলটি দেখার অনুমতি নেই!", "error");
            moduleName = 'attendance'; // ডিফল্টভাবে হাজিরাতে রিডাইরেক্ট হবে
        }
    } else if (role === 'accountant') {
        const blockedForAccountant = ['settings'];
        if (blockedForAccountant.includes(moduleName)) {
            showToast("দুঃখিত, সেটিংস মডিউলটি শুধুমাত্র মুহতামিম অ্যাক্সেস করতে পারবেন!", "error");
            moduleName = 'dashboard'; // ডিফল্ট ড্যাশবোর্ড রিডাইরেক্ট
        }
    }

    window.currentModule = moduleName;

    const mainContentEl = document.getElementById('main-content');
    if (mainContentEl) {
        mainContentEl.innerHTML = `
            <div class="flex items-center justify-center h-64 text-gray-500">
                <div class="text-center">
                    <i class="fa-solid fa-circle-notch animate-spin text-5xl text-emerald-600 mb-4"></i>
                    <p class="text-lg font-medium">লোড হচ্ছে...</p>
                </div>
            </div>`;
    }

    updateNavStyles(moduleName);

    fetchLocalFile(`${moduleName}.html`)
        .then(html => {
            const mainContent = document.getElementById('main-content');
            if (mainContent) {
                mainContent.innerHTML = html;

                const titles = {
                    'dashboard': 'ড্যাশবোর্ড',
                    'admission': 'ছাত্র ভর্তি',
                    'fees': 'বেতন কালেকশন',
                    'student_list': 'ছাত্রদের তালিকা ও রিপোর্ট',
                    'expense': 'খরচ এন্ট্রি ও রিপোর্ট', 
                    'attendance': 'দৈনিক হাজিরা খাতা',    
                    'settings': 'সেটিংস'
                };
                
                const pageTitleEl = document.getElementById('page-title');
                if (pageTitleEl) {
                    pageTitleEl.textContent = titles[moduleName] || 'ম্যানেজমেন্ট';
                }

                executeInlineScripts(mainContent);

                const initFuncName = `init${moduleName.charAt(0).toUpperCase() + moduleName.slice(1).replace('_', '')}`;
                if (typeof window[initFuncName] === 'function') {
                    window[initFuncName]();
                }
            }
        })
        .catch(err => {
            const mainContent = document.getElementById('main-content');
            if (mainContent) {
                mainContent.innerHTML = `
                    <div class="text-center py-12 text-red-500 bg-red-50 rounded-xl border border-red-200 m-6">
                        <i class="fa-solid fa-triangle-exclamation text-5xl mb-4"></i>
                        <p class="text-lg font-bold">${err.message}</p>
                    </div>`;
            }
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
// ৬. ইন্টারনেট সংযোগ পরীক্ষা
// ============================================
function updateConnectionStatus() {
    const statusEl = document.getElementById('connection-status');
    if (statusEl) {
        if (navigator.onLine) {
            statusEl.innerHTML = `<i class="fa-solid fa-plane"></i> অনলাইন`;
            statusEl.className = "px-2 py-0.5 rounded bg-emerald-500 text-white font-semibold flex items-center gap-1";
            triggerAutoSync();
        } else {
            statusEl.innerHTML = `<i class="fa-solid fa-plane-slash"></i> অফলাইন`;
            statusEl.className = "px-2 py-0.5 rounded bg-red-500 text-white font-semibold flex items-center gap-1";
        }
    }
}

// ============================================
// ৭. রিয়্যাল-টাইম পেন্ডিং সিঙ্ক কাউন্টার (৬টি টেবিল ট্র্যাকার)
// ============================================
async function updatePendingCount() {
    try {
        const unsyncedStudents = await db.students.where('is_synced').equals(0).count();
        const unsyncedFees = await db.fees.where('is_synced').equals(0).count();
        const unsyncedSettings = await db.settings.where('is_synced').equals(0).count();
        const unsyncedExpenses = await db.expenses.where('is_synced').equals(0).count(); 
        const unsyncedAttendance = await db.attendance.where('is_synced').equals(0).count(); 
        const unsyncedUsers = await db.users.where('is_synced').equals(0).count();
        
        const total = unsyncedStudents + unsyncedFees + unsyncedSettings + unsyncedExpenses + unsyncedAttendance + unsyncedUsers;
        
        const pendingCountEl = document.getElementById('pending-sync-count');
        if (pendingCountEl) {
            pendingCountEl.textContent = total;
        }
        return total;
    } catch (err) {
        console.error("পেন্ডিং কাউন্ট গণনা করতে ব্যর্থ:", err);
        return 0;
    }
}

// ============================================
// ৮. সিঙ্ক ইন্টিগ্রেশন
// ============================================
async function triggerManualSync() {
    const syncIcon = document.getElementById('sync-icon');
    if (syncIcon) syncIcon.classList.add('animate-spin');
    await syncData();
    if (syncIcon) syncIcon.classList.remove('animate-spin');
}

async function triggerAutoSync() {
    await syncData();
}

async function syncData() {
    if (isSyncing || !navigator.onLine) return;
    isSyncing = true;

    const loader = document.getElementById('sync-loader');
    if (loader) loader.classList.remove('hidden');

    try {
        // ১. লোকাল পেন্ডিং ডেটা ক্লাউডে পুশ করা
        await pushLocalData();

        // ২. ক্লাউড থেকে ডেটা লোকাল ব্রাউজারে নামানো (Pull)
        await pullServerData();

        await updatePendingCount();

        // ৩. বর্তমানে রানিং মডিউলের রিয়্যাল-টাইম রেন্ডারিং ট্রিগার
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
// ৯. লোকাল ডেটা পুশ (Users টেবিল সহ)
// ============================================
async function pushLocalData() {
    const unsyncedStudents = await db.students.where('is_synced').equals(0).toArray();
    if (unsyncedStudents.length > 0) {
        const success = await pushToSheet('Students', unsyncedStudents);
        if (success) await updateLocalSyncStatus('students', unsyncedStudents);
    }

    const unsyncedFees = await db.fees.where('is_synced').equals(0).toArray();
    if (unsyncedFees.length > 0) {
        const success = await pushToSheet('Fees', unsyncedFees);
        if (success) await updateLocalSyncStatus('fees', unsyncedFees);
    }

    const unsyncedSettings = await db.settings.where('is_synced').equals(0).toArray();
    if (unsyncedSettings.length > 0) {
        const success = await pushToSheet('Settings', unsyncedSettings);
        if (success) await updateLocalSyncStatus('settings', unsyncedSettings);
    }

    const unsyncedExpenses = await db.expenses.where('is_synced').equals(0).toArray();
    if (unsyncedExpenses.length > 0) {
        const success = await pushToSheet('Expenses', unsyncedExpenses);
        if (success) await updateLocalSyncStatus('expenses', unsyncedExpenses);
    }

    const unsyncedAttendance = await db.attendance.where('is_synced').equals(0).toArray();
    if (unsyncedAttendance.length > 0) {
        const success = await pushToSheet('Attendance', unsyncedAttendance);
        if (success) await updateLocalSyncStatus('attendance', unsyncedAttendance);
    }

    const unsyncedUsers = await db.users.where('is_synced').equals(0).toArray();
    if (unsyncedUsers.length > 0) {
        const success = await pushToSheet('Users', unsyncedUsers);
        if (success) await updateLocalSyncStatus('users', unsyncedUsers);
    }
}

// ============================================
// ১০. শিটে ডেটা রাইট জেনারেটর
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
// ১১. লোকাল ডাটাবেজে সিঙ্কড স্ট্যাটাস সেভ
// ============================================
async function updateLocalSyncStatus(type, items) {
    if (type === 'students') {
        for (let s of items) {
            await db.students.update(s.id, { is_synced: 1 });
        }
    } else if (type === 'fees') {
        for (let f of items) {
            await db.fees.update(f.receipt_id, { is_synced: 1 });
        }
    } else if (type === 'settings') {
        for (let set of items) {
            await db.settings.update(set.id, { is_synced: 1 });
        }
    } else if (type === 'expenses') {
        for (let e of items) {
            await db.expenses.update(e.expense_id, { is_synced: 1 });
        }
    } else if (type === 'attendance') {
        for (let a of items) {
            await db.attendance.update(a.attendance_id, { is_synced: 1 });
        }
    } else if (type === 'users') {
        for (let u of items) {
            await db.users.update(u.username, { is_synced: 1 });
        }
    }
}

// ============================================
// ১২. ক্লাউড শিট থেকে সম্পূর্ণ ডেটা পুল (Users টেবিল সহ)
// ============================================
async function pullServerData() {
    const response = await fetch(SCRIPT_URL, { method: 'GET' });
    if (!response.ok) throw new Error("সার্ভার ডাটা রিড করতে ব্যর্থ");

    const data = await response.json();
    if (data.status !== 'success') throw new Error(data.message || "Unknown error");

    // Pull Students
    if (data.students) {
        for (let s of data.students) {
            if (parseInt(s.is_deleted) === 1) {
                await db.students.delete(s.id);
            } else {
                s.is_synced = 1;
                s.serial_no = parseInt(s.serial_no) || 0;
                s.roll = parseInt(s.roll) || 0;
                s.monthly_fee = parseFloat(s.monthly_fee) || 0;
                await db.students.put(s);
            }
        }
    }

    // Pull Fees
    if (data.fees) {
        for (let f of data.fees) {
            if (parseInt(f.is_deleted) === 1) {
                await db.fees.delete(f.receipt_id);
            } else {
                f.is_synced = 1;
                f.amount = parseFloat(f.amount) || 0;
                f.fine = parseFloat(f.fine) || 0;
                f.discount = parseFloat(f.discount) || 0;
                f.total = parseFloat(f.total) || 0;
                await db.fees.put(f);
            }
        }
    }

    // Pull Settings
    if (data.settings) {
        for (let set of data.settings) {
            if (parseInt(set.is_deleted) === 1) {
                await db.settings.delete(set.id);
            } else {
                set.is_synced = 1;
                await db.settings.put(set);
            }
        }
    }

    // Pull Expenses
    if (data.expenses) {
        for (let e of data.expenses) {
            if (parseInt(e.is_deleted) === 1) {
                await db.expenses.delete(e.expense_id);
            } else {
                e.is_synced = 1;
                await db.expenses.put(e);
            }
        }
    }

    // Pull Attendance
    if (data.attendance) {
        for (let a of data.attendance) {
            if (parseInt(a.is_deleted) === 1) {
                await db.attendance.delete(a.attendance_id);
            } else {
                a.is_synced = 1;
                await db.attendance.put(a);
            }
        }
    }

    // Pull Users (ডাইনামিক টেবিল পুলিং)
    if (data.users) {
        for (let u of data.users) {
            if (parseInt(u.is_deleted) === 1) {
                await db.users.delete(u.username);
            } else {
                u.is_synced = 1;
                await db.users.put(u);
            }
        }
    }
}

// ============================================
// ১৩. টোস্ট নোটিফিকেশন রেন্ডারার
// ============================================
function showToast(message, type = "success") {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `flex items-center gap-2.5 px-4 py-3 rounded-xl border text-xs font-bold shadow-lg transition-all duration-300 transform translate-x-12 opacity-0 pointer-events-auto bg-white`;
    
    if (type === 'success') {
        toast.classList.add('text-emerald-800', 'border-emerald-200', 'bg-emerald-50');
        toast.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-600 text-lg"></i> <span>${message}</span>`;
    } else if (type === 'error') {
        toast.classList.add('text-red-800', 'border-red-200', 'bg-red-50');
        toast.innerHTML = `<i class="fa-solid fa-circle-xmark text-red-600 text-lg"></i> <span>${message}</span>`;
    } else {
        toast.classList.add('text-blue-800', 'border-blue-200', 'bg-blue-50');
        toast.innerHTML = `<i class="fa-solid fa-circle-info text-blue-600 text-lg"></i> <span>${message}</span>`;
    }

    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.remove('translate-x-12', 'opacity-0');
    }, 10);

    setTimeout(() => {
        toast.classList.add('translate-x-12', 'opacity-0');
        setTimeout(() => { toast.remove(); }, 300);
    }, 3000);
}

// ============================================
// ১৪. গ্লোবাল ডাইনামিক নাম, লোগো ও স্টাইল আপডেট
// ============================================
window.applyGlobalSettings = function() {
    const name = localStorage.getItem('madrasah_name') || 'মাদরাসাতুল মদিনা';
    const logoUrl = localStorage.getItem('madrasah_logo') || '';

    const lockTitle = document.getElementById('lock-madrasah-name');
    if (lockTitle) lockTitle.textContent = name;

    const sidebarTitle = document.getElementById('sidebar-madrasah-name');
    if (sidebarTitle) {
        sidebarTitle.innerHTML = `
            <div class="flex items-center gap-2.5">
                ${logoUrl ? `<img class="w-8 h-8 rounded-full object-cover border border-emerald-800/50 shadow-inner" src="${logoUrl}">` : '<i class="fa-solid fa-mosque text-emerald-300"></i>'}
                <span class="truncate text-base font-bold">${name}</span>
            </div>`;
    }
};

// ============================================
// ১৫. নিরাপদ অফলাইন অটো-লক মেকানিজম (Security Timer)
// ============================================
let inactivityTimer;
function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    const timeoutMinutes = parseInt(localStorage.getItem('madrasah_lock_timeout') || '0');
    if (timeoutMinutes > 0 && typeof window.lockApp === 'function') {
        inactivityTimer = setTimeout(() => {
            console.log("নিষ্ক্রিয়তার জন্য অ্যাপ লক করা হয়েছে।");
            window.lockApp();
        }, timeoutMinutes * 60 * 1000);
    }
}

// গ্লোবাল ইভেন্ট লিসেনার ফর ইন-অ্যাক্টিভিটি
document.addEventListener('mousemove', resetInactivityTimer);
document.addEventListener('keypress', resetInactivityTimer);
document.addEventListener('touchstart', resetInactivityTimer);
document.addEventListener('click', resetInactivityTimer);

// ============================================
// ১৬. গ্লোবাল একটিভ সেশন চেকার (Startup Logic)
// ============================================
window.checkActiveSession = function() {
    const user = sessionStorage.getItem('currentUser');
    if (user) {
        window.currentUser = JSON.parse(user);
        const overlay = document.getElementById('pin-lock-overlay');
        if (overlay) overlay.style.display = 'none';
        
        window.updateSidebarNavigation();
        loadModule(window.currentModule || 'dashboard');
    } else {
        window.lockApp();
    }
};

// ============================================
// ১৭. PWA সার্ভিস ওয়ার্কার রেজিস্ট্রেশন (সার্ভার ছাড়াই অফলাইন লোডের জন্য)
// ============================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker registered successfully:', reg.scope))
            .catch(err => console.error('Service Worker registration failed:', err));
    });
}

window.lockApp = function() {
    const overlay = document.getElementById('pin-lock-overlay');
    if (overlay) {
        overlay.style.display = 'flex'; // পিন লক স্ক্রিন পুনরায় প্রদর্শন
    }
    sessionStorage.removeItem('currentUser');
    window.currentUser = null;
};

// কিবোর্ড ইভেন্ট লিসেনার ও মাউস ইভেন্ট লিসেনার সংযোগ
document.addEventListener('DOMContentLoaded', async () => {
    window.applyGlobalSettings();
    updateConnectionStatus();
    await updatePendingCount();
    resetInactivityTimer();
    window.checkActiveSession();
});

window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);

// ============================================
// ১৮. PWA কাস্টম পুল-টু-রিফ্রেশ ইঞ্জিন (মোবাইলে নিচে টান দিলে রিলোড হবে)
// ============================================
function initPullToRefresh() {
    const mainContainer = document.querySelector('main');
    if (!mainContainer) return;

    let startY = 0;
    let active = false;

    // টাচ বা টান দেওয়া শুরু করার লিসেনার
    mainContainer.addEventListener('touchstart', (e) => {
        // শুধুমাত্র যখন কন্টেইনারের স্ক্রল পজিশন একদম উপরে (scrollTop === 0) থাকবে
        if (mainContainer.scrollTop === 0) {
            startY = e.touches[0].pageY;
            active = true;
        } else {
            active = false;
        }
    }, { passive: true });

    // আঙুল নিচে নামানোর লিসেনার
    mainContainer.addEventListener('touchmove', (e) => {
        if (!active) return;
        const currentY = e.touches[0].pageY;
        const pullDistance = currentY - startY;

        // ব্যবহারকারী যদি নিচে ১২০ পিক্সেলের বেশি টান বা ড্র্যাগ করেন
        if (pullDistance > 120) {
            active = false; // লুপ বা ডাবল রিলোড এড়াতে সাথে সাথে ইন-অ্যাক্টিভ করা
            showToast("ডাটা রিলোড হচ্ছে...", "info");
            setTimeout(() => {
                window.location.reload();
            }, 600);
        }
    }, { passive: true });
}

// ডোমে লোড হওয়ার পর রিফ্রেশার চালু করা
document.addEventListener('DOMContentLoaded', () => {
    initPullToRefresh();
});