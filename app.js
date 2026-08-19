/* ==========================================================================
   Madrasah OS - Universal Core Engine (app.js) - Fully Fixed & Optimized
   Architecture: Zero-Touch Plug & Play Micro-Kernel (Production-Ready)
   ========================================================================== */

// ============================================
// ১. গ্লোবাল অ্যাপ স্টেট ও ইভেন্ট বাস (Event Bus)
// ============================================
window.App = {
    masterUrl: 'https://script.google.com/macros/s/AKfycbzRCoUbwq_v6XxOmWWp9RITolLhSsuf4oebzZu5uZJcaHYtv5J5YOhp0H7RBvO-MZFy/exec',
    currentUser: JSON.parse(sessionStorage.getItem('currentUser')) || null,
    currentModule: 'dashboard',
    isSyncing: false,
    inactivityTimer: null,
    listeners: {},

    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    },
    emit(event, data) {
        if (this.listeners[event]) this.listeners[event].forEach(cb => cb(data));
    },

    getTenantUrl() {
        const scriptId = localStorage.getItem('active_tenant_script_id');
        return scriptId ? `https://script.google.com/macros/s/${scriptId}/exec` : '';
    }
};

// গ্লোবাল ভেরিয়েবল ব্যাকওয়ার্ড কম্প্যাটিবিলিটির জন্য
window.currentUser = App.currentUser;
window.getTenantScriptUrl = () => App.getTenantUrl();

// ============================================
// ২. Dexie.js লোকাল ডাটাবেজ স্কিমা (Version 6)
// ============================================
const db = new Dexie("MadrasahDB");

db.version(6).stores({
    // কোর স্ট্যান্ডার্ড টেবিলসমূহ
    students: 'id, name, class, roll, session_year, parent_phone, boarding_type, previous_student_id, is_synced, is_deleted, created_by, updated_by, [session_year+id]',
    fees: 'receipt_id, student_id, student_name, amount, month, session_year, payment_date, is_synced, is_deleted, created_by, updated_by, [session_year+student_id]',
    settings: 'id, madrasah_name, madrasah_address, madrasah_phone, current_session, madrasah_logo, is_synced, is_deleted',
    expenses: 'expense_id, branch, category, teacher_id, amount, date, session_year, is_synced, is_deleted, created_by, updated_by',
    attendance: 'attendance_id, student_id, date, status, session_year, is_synced, is_deleted, created_by, updated_by, [session_year+date]',
    users: 'username, pin, role, fullname, is_synced, is_deleted',
    teachers: 'id, name, phone, designation, basic_salary, joining_date, is_synced, is_deleted',
    exams: 'id, exam_name, session_year, class_name, is_published, is_synced, is_deleted',
    marks: 'id, exam_id, student_id, subject_id, marks_obtained, grade, session_year, is_synced, is_deleted, [session_year+exam_id]',
    hifz_tracker: 'id, student_id, date, sabaq, sabqi, ampara, is_synced, is_deleted',

    // ইউনিভার্সাল ডাইনামিক স্টোর (ভবিষ্যতের যেকোনো নতুন টেবিলের জন্য)
    dynamic_records: 'id, table_name, session_year, is_synced, is_deleted, created_by, updated_by, [table_name+session_year], [table_name+id]'
});

// ============================================
// ৩. ইউনিভার্সাল ডাইনামিক টেবিল হেল্পার
// ============================================
window.App.table = function(tableName) {
    const tName = tableName.toLowerCase();
    return {
        async add(record) {
            record.table_name = tName;
            record.is_synced = 0;
            record.is_deleted = record.is_deleted || 0;
            const curUser = (App.currentUser ? App.currentUser.username : 'system');
            record.created_by = record.created_by || curUser;
            record.updated_by = curUser;
            return await db.dynamic_records.add(record);
        },
        async put(record) {
            record.table_name = tName;
            record.is_synced = 0;
            record.is_deleted = record.is_deleted || 0;
            const curUser = (App.currentUser ? App.currentUser.username : 'system');
            record.updated_by = curUser;
            return await db.dynamic_records.put(record);
        },
        async get(id) {
            const item = await db.dynamic_records.get(id);
            return (item && item.table_name === tName && item.is_deleted !== 1) ? item : undefined;
        },
        async toArray(sessionYear = null) {
            let items = await db.dynamic_records.where('table_name').equals(tName).toArray();
            items = items.filter(i => i.is_deleted !== 1);
            if (sessionYear) {
                items = items.filter(i => i.session_year === sessionYear || !i.session_year);
            }
            return items;
        },
        async update(id, changes) {
            changes.is_synced = 0;
            changes.updated_by = (App.currentUser ? App.currentUser.username : 'system');
            return await db.dynamic_records.update(id, changes);
        },
        async delete(id) {
            const curUser = (App.currentUser ? App.currentUser.username : 'system');
            return await db.dynamic_records.update(id, { is_deleted: 1, is_synced: 0, updated_by: curUser });
        },
        where(indexField) {
            return db.dynamic_records.where(indexField);
        }
    };
};

// ============================================
// ৪. গ্লোবাল হেল্পার ও নিরাপত্তা ফাংশন
// ============================================
window.convertToEnglishDigits = function(str) {
    if (str === null || str === undefined) return "";
    const bn = {'০':'0','১':'1','২':'2','৩':'3','৪':'4','৫':'5','৬':'6','৭':'7','৮':'8','৯':'9'};
    return str.toString().replace(/[০-৯]/g, d => bn[d]);
};

window.safeParseFloat = function(val) {
    if (val === null || val === undefined) return 0;
    const clean = window.convertToEnglishDigits(val.toString()).replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
};

window.getLocalDateString = function(dateObj = new Date()) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

window.hashPIN = async function(pin) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin + "m@drasah_salt_secure_2026");
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
};

// ============================================
// ৫. সর্বজনীন অটো-ডিসকভারি সিঙ্ক ইঞ্জিন (Zero Data Loss)
// ============================================
async function updatePendingCount() {
    try {
        let total = 0;
        for (const table of db.tables) {
            if (table.schema.indexes.some(idx => idx.name === 'is_synced')) {
                total += await table.where('is_synced').equals(0).count();
            }
        }
        const el = document.getElementById('pending-sync-count');
        if (el) el.textContent = total;
        return total;
    } catch (e) {
        return 0;
    }
}

async function triggerManualSync() {
    const icon = document.getElementById('sync-icon');
    if (icon) icon.classList.add('animate-spin');
    await syncData();
    if (icon) icon.classList.remove('animate-spin');
}

async function triggerAutoSync() {
    await syncData();
}

async function syncData() {
    const tenantUrl = App.getTenantUrl();
    if (App.isSyncing || !navigator.onLine || !tenantUrl) return;
    App.isSyncing = true;

    const loader = document.getElementById('sync-loader');
    if (loader) loader.classList.remove('hidden');

    try {
        // ১. অটোমেটিক পুশ (কোর টেবিলসমূহ)
        for (const table of db.tables) {
            if (table.name === 'dynamic_records') continue;

            if (table.schema.indexes.some(idx => idx.name === 'is_synced')) {
                const unsynced = await table.where('is_synced').equals(0).toArray();
                if (unsynced.length > 0) {
                    
                    // সেশন অনুযায়ী S2026, S2027 গ্রুপ হ্যান্ডলিং
                    if (table.name === 'students') {
                        const sessionGroups = {};
                        unsynced.forEach(row => {
                            const sYear = row.session_year || new Date().getFullYear().toString();
                            const tabName = 'S' + sYear;
                            if (!sessionGroups[tabName]) sessionGroups[tabName] = [];
                            sessionGroups[tabName].push(row);
                        });

                        for (const [tabName, sessionRows] of Object.entries(sessionGroups)) {
                            const cleanData = sessionRows.map(item => {
                                const { is_synced, ...rest } = item;
                                return { ...rest, is_deleted: parseInt(rest.is_deleted) || 0 };
                            });

                            const payload = new URLSearchParams({
                                action: 'sync',
                                sheetName: tabName,
                                rows: JSON.stringify(cleanData)
                            }).toString();

                            const res = await fetch(tenantUrl, {
                                method: 'POST',
                                mode: 'cors',
                                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                                body: payload
                            });

                            if (res.ok) {
                                for (const row of sessionRows) {
                                    await table.update(row.id, { is_synced: 1 });
                                }
                            }
                        }
                    } else {
                        const sheetName = table.name.charAt(0).toUpperCase() + table.name.slice(1);
                        const cleanData = unsynced.map(item => {
                            const { is_synced, ...rest } = item;
                            return { ...rest, is_deleted: parseInt(rest.is_deleted) || 0 };
                        });

                        const payload = new URLSearchParams({
                            action: 'sync',
                            sheetName: sheetName,
                            rows: JSON.stringify(cleanData)
                        }).toString();

                        const res = await fetch(tenantUrl, {
                            method: 'POST',
                            mode: 'cors',
                            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                            body: payload
                        });

                        if (res.ok) {
                            const primaryKey = table.schema.primKey.name;
                            for (const row of unsynced) {
                                await table.update(row[primaryKey], { is_synced: 1 });
                            }
                        }
                    }
                }
            }
        }

        // ২. ডাইনামিক রেকর্ড পুশ
        const unsyncedDynamics = await db.dynamic_records.where('is_synced').equals(0).toArray();
        if (unsyncedDynamics.length > 0) {
            const grouped = {};
            unsyncedDynamics.forEach(item => {
                const tName = item.table_name || 'custom_data';
                if (!grouped[tName]) grouped[tName] = [];
                grouped[tName].push(item);
            });

            for (const [tName, rows] of Object.entries(grouped)) {
                const sheetName = tName.charAt(0).toUpperCase() + tName.slice(1);
                const cleanData = rows.map(item => {
                    const { is_synced, ...rest } = item;
                    return { ...rest, is_deleted: parseInt(rest.is_deleted) || 0 };
                });

                const payload = new URLSearchParams({
                    action: 'sync',
                    sheetName: sheetName,
                    rows: JSON.stringify(cleanData)
                }).toString();

                const res = await fetch(tenantUrl, {
                    method: 'POST',
                    mode: 'cors',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: payload
                });

                if (res.ok) {
                    for (const row of rows) {
                        await db.dynamic_records.update(row.id, { is_synced: 1 });
                    }
                }
            }
        }

        // ৩. অটোমেটিক পুল (ক্লাউড থেকে সকল টেবিল লোকাল ডাটাবেজে রিড)
        const pullRes = await fetch(tenantUrl, { method: 'GET' });
        if (pullRes.ok) {
            const resJson = await pullRes.json();
            if (resJson.status === 'success' && resJson.data) {
                const standardTableNames = db.tables.map(t => t.name.toLowerCase());

                for (const [cloudSheetName, cloudRows] of Object.entries(resJson.data)) {
                    if (!Array.isArray(cloudRows)) continue;

                    const lowerSheetName = cloudSheetName.toLowerCase();
                    const isStudentSessionTab = /^s\d{4}$/i.test(lowerSheetName) || lowerSheetName === "students";
                    const isStandard = standardTableNames.includes(lowerSheetName) || isStudentSessionTab;

                    if (isStandard && lowerSheetName !== 'dynamic_records') {
                        const targetTable = isStudentSessionTab ? db.students : db.table(lowerSheetName);
                        const primaryKey = targetTable.schema.primKey.name;

                        for (const row of cloudRows) {
                            if (parseInt(row.is_deleted) === 1) {
                                if (row[primaryKey]) await targetTable.delete(row[primaryKey]);
                            } else {
                                row.is_synced = 1;
                                
                                // সেটিংস অবজেক্ট আইডি নিশ্চিতকরণ
                                if (lowerSheetName === 'settings') {
                                    row.id = row.id || 'madrasah_config_block';
                                }

                                await targetTable.put(row);
                            }
                        }
                    } else {
                        for (const row of cloudRows) {
                            row.table_name = lowerSheetName;
                            if (parseInt(row.is_deleted) === 1) {
                                await db.dynamic_records.delete(row.id);
                            } else {
                                row.is_synced = 1;
                                await db.dynamic_records.put(row);
                            }
                        }
                    }
                }
            }
        }

        await updatePendingCount();
        App.emit('sync:completed');

        // সক্রিয় মডিউলের রিলোড ট্রিগার
        if (App.currentModule) {
            const cleanMod = App.currentModule.toLowerCase().replace(/_([a-z])/g, (g) => g[1].toUpperCase());
            const initFn = `init${cleanMod.charAt(0).toUpperCase() + cleanMod.slice(1)}`;
            if (typeof window[initFn] === 'function') {
                await window[initFn]();
            } else {
                const directInit = `init${App.currentModule.charAt(0).toUpperCase() + App.currentModule.slice(1)}`;
                if (typeof window[directInit] === 'function') await window[directInit]();
            }
        }

    } catch (err) {
        console.error("সিঙ্ক ব্যর্থ:", err);
    } finally {
        App.isSyncing = false;
        if (loader) loader.classList.add('hidden');
    }
}

// ============================================
// ৬. ডায়নামিক মডিউল লোডার ও রাউটার (Fixed Title & Route Guard)
// ============================================
async function fetchLocalFile(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("ফাইল লোড করতে ব্যর্থ: " + url);
    return await res.text();
}

function loadModule(moduleName) {
    const user = App.currentUser || JSON.parse(sessionStorage.getItem('currentUser'));
    
    if (!user && moduleName !== 'installer' && moduleName !== 'parent_portal') {
        window.lockApp();
        return;
    }

    // ★ ১. রাউটার লেভেল পারমিশন গার্ড (Security Route Guard) ★
    if (user && moduleName !== 'installer' && moduleName !== 'parent_portal') {
        const currentRole = (user.role || '').toLowerCase();
        const navBtn = document.getElementById(`nav-${moduleName}`);
        if (navBtn) {
            const allowedRoles = navBtn.getAttribute('data-roles');
            if (allowedRoles && allowedRoles !== 'all') {
                const roleList = allowedRoles.split(',').map(r => r.trim().toLowerCase());
                if (!roleList.includes(currentRole) && currentRole !== 'muhtamim') {
                    showToast("দুঃখিত, এই পেজটি দেখার অনুমতি আপনার নেই!", "error");
                    return;
                }
            }
        }
    }

    App.currentModule = moduleName;

    const sidebar = document.getElementById('sidebar');
    const header = document.querySelector('header');
    const sidebarBackdrop = document.getElementById('sidebar-backdrop');

    if (moduleName === 'installer') {
        if (sidebar) sidebar.style.display = 'none';
        if (header) header.style.display = 'none';
        if (sidebarBackdrop) sidebarBackdrop.style.display = 'none';
    } else if (moduleName !== 'parent_portal') {
        if (sidebar) sidebar.style.display = '';
        if (header) header.style.display = '';
    }

    const mainContent = document.getElementById('main-content');
    if (mainContent) {
        mainContent.innerHTML = `
            <div class="flex items-center justify-center h-64 text-gray-500">
                <div class="text-center">
                    <i class="fa-solid fa-circle-notch animate-spin text-5xl text-emerald-600 mb-4"></i>
                    <p class="text-lg font-medium">লোড হচ্ছে...</p>
                </div>
            </div>`;
    }

    fetchLocalFile(`${moduleName}.html`)
        .then(html => {
            if (mainContent) {
                mainContent.innerHTML = html;

                // ★ ২. ফিক্সড পেজ টাইটেল ডিকশনারি (Title Map Dictionary) ★
                const MODULE_TITLES = {
                    'dashboard': 'ড্যাশবোর্ড',
                    'admission': 'তামরিন (ভর্তি)',
                    'fees': 'বেতন কালেকশন',
                    'student_list': 'তালিবে ইলম তালিকা',
                    'attendance': 'হাজিরা খাতা',
                    'teachers': 'আসাতেজা ও স্টাফ',
                    'exams': 'ইমতিহান (পরীক্ষা)',
                    'expense': 'ইখরাজাত (ব্যয়)',
                    'settings': 'সেটিংস',
                    'installer': 'ইনস্টলার উইজার্ড',
                    'parent_portal': 'অভিভাবক পোর্টাল'
                };

                const moduleRoot = mainContent.querySelector('[data-title]') || mainContent.firstElementChild;
                const dynamicTitle = moduleRoot?.getAttribute('data-title') 
                                  || MODULE_TITLES[moduleName] 
                                  || document.getElementById(`nav-${moduleName}`)?.innerText?.trim() 
                                  || 'মাদরাসা ম্যানেজমেন্ট';

                const pageTitleEl = document.getElementById('page-title');
                if (pageTitleEl) pageTitleEl.textContent = dynamicTitle;

                const scripts = mainContent.querySelectorAll('script');
                scripts.forEach(oldScript => {
                    const newScript = document.createElement('script');
                    Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
                    newScript.appendChild(document.createTextNode(oldScript.innerHTML));
                    oldScript.parentNode.replaceChild(newScript, oldScript);
                });

                const cleanMod = moduleName.toLowerCase().replace(/_([a-z])/g, (g) => g[1].toUpperCase());
                const initFuncName = `init${cleanMod.charAt(0).toUpperCase() + cleanMod.slice(1)}`;
                
                if (typeof window[initFuncName] === 'function') {
                    window[initFuncName]();
                } else {
                    const directInit = `init${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}`;
                    if (typeof window[directInit] === 'function') window[directInit]();
                }

                App.emit('module:loaded', { module: moduleName, title: dynamicTitle });
            }
        })
        .catch(err => {
            if (mainContent) {
                mainContent.innerHTML = `
                    <div class="text-center py-12 text-red-500 bg-red-50 rounded-xl border border-red-200 m-6">
                        <i class="fa-solid fa-triangle-exclamation text-5xl mb-4"></i>
                        <p class="text-lg font-bold">${err.message}</p>
                    </div>`;
            }
        });
}

// ============================================
// ৭. ডায়নামিক পারমিশন ও সাইডবার নেভিগেশন
// ============================================
window.updateSidebarNavigation = function() {
    const user = App.currentUser || JSON.parse(sessionStorage.getItem('currentUser'));
    if (!user) return;

    const currentRole = (user.role || '').toLowerCase();

    document.querySelectorAll('#sidebar nav button').forEach(btn => {
        const allowedRoles = btn.getAttribute('data-roles');
        
        if (!allowedRoles || allowedRoles === 'all') {
            btn.classList.remove('hidden');
        } else {
            const roleList = allowedRoles.split(',').map(r => r.trim().toLowerCase());
            if (roleList.includes(currentRole) || currentRole === 'muhtamim') {
                btn.classList.remove('hidden');
            } else {
                btn.classList.add('hidden');
            }
        }
    });
};

// ============================================
// ৮. টোস্ট ও গ্লোবাল ইউটিলিটি
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
    setTimeout(() => toast.classList.remove('translate-x-12', 'opacity-0'), 10);
    setTimeout(() => {
        toast.classList.add('translate-x-12', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

window.applyGlobalSettings = async function() {
    try {
        let config = await db.settings.get('madrasah_config_block');
        if (!config) {
            const allSettings = await db.settings.toArray();
            if (allSettings && allSettings.length > 0) config = allSettings[0];
        }
        config = config || {};

        const name = config.madrasah_name || localStorage.getItem('madrasah_name') || 'মাদরাসা ম্যানেজমেন্ট';
        const logoUrl = config.madrasah_logo || localStorage.getItem('madrasah_logo') || '';

        const lockTitle = document.getElementById('lock-madrasah-name');
        if (lockTitle) lockTitle.textContent = name;

        const sidebarTitle = document.getElementById('sidebar-madrasah-name');
        if (sidebarTitle) {
            sidebarTitle.innerHTML = `
                <div class="flex items-center gap-2.5">
                    ${logoUrl ? `<img class="w-8 h-8 rounded-full object-cover border border-emerald-800/50" src="${logoUrl}">` : '<i class="fa-solid fa-mosque text-emerald-300"></i>'}
                    <span class="truncate text-base font-bold">${name}</span>
                </div>`;
        }
    } catch(err){}
};

// ============================================
// ৯. সেশন, ইনঅ্যাক্টিভিটি ও ক্লিন লাইফসাইকেল
// ============================================
function resetInactivityTimer() {
    clearTimeout(App.inactivityTimer);
    const timeout = parseInt(localStorage.getItem('madrasah_lock_timeout') || '0');
    if (timeout > 0 && typeof window.lockApp === 'function') {
        App.inactivityTimer = setTimeout(() => window.lockApp(), timeout * 60 * 1000);
    }
}

['mousemove', 'keypress', 'touchstart', 'click'].forEach(evt => document.addEventListener(evt, resetInactivityTimer));

window.flushTenantDatabase = async function() {
    for (const table of db.tables) {
        await table.clear();
    }
};

window.checkActiveSession = async function() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('p') || urlParams.get('student_id')) {
        return;
    }

    const userStr = sessionStorage.getItem('currentUser');
    if (userStr) {
        App.currentUser = JSON.parse(userStr);
        window.currentUser = App.currentUser;

        const overlay = document.getElementById('pin-lock-overlay');
        if (overlay) overlay.style.display = 'none';
        
        window.updateSidebarNavigation();

        // ব্যাকগ্রাউন্ড ডাটা সিঙ্ক চালু
        if (navigator.onLine) {
            triggerAutoSync();
        }

        const tenantUrl = App.getTenantUrl();
        if (tenantUrl && navigator.onLine) {
            try {
                const res = await fetch(`${tenantUrl}?action=check_installation`);
                const data = await res.json();
                if (data.status === 'success' && data.is_installed === false) {
                    loadModule('installer');
                    return;
                }
            } catch(e){}
        }

        loadModule(App.currentModule || 'dashboard');
    } else {
        if (App.currentModule !== 'installer') {
            window.lockApp();
        }
    }
};

window.lockApp = function() {
    sessionStorage.clear();
    App.currentUser = null;
    window.currentUser = null;
    App.currentModule = 'dashboard'; // লগআউটে মডিউল রিসেট

    const overlay = document.getElementById('pin-lock-overlay');
    if (overlay) overlay.style.display = 'flex';
    
    const userBadge = document.getElementById('user-display-badge');
    if (userBadge) userBadge.classList.add('hidden');
};

// ============================================
// ১০. PWA পুল-টু-রিফ্রেশ ও কানেকশন হ্যান্ডলার
// ============================================
function initPullToRefresh() {
    const mainContainer = document.querySelector('main');
    const indicator = document.getElementById('pull-to-refresh-indicator');
    const icon = document.getElementById('refresh-icon');
    if (!mainContainer || !indicator || !icon) return;

    let startY = 0;
    let active = false;
    let currentPull = 0;

    mainContainer.addEventListener('touchstart', (e) => {
        if (mainContainer.scrollTop === 0) {
            startY = e.touches[0].pageY;
            active = true;
            indicator.style.transition = 'none';
            icon.style.transition = 'none';
        } else {
            active = false;
        }
    }, { passive: true });

    mainContainer.addEventListener('touchmove', (e) => {
        if (!active) return;
        const currentY = e.touches[0].pageY;
        const pullDistance = currentY - startY;

        if (pullDistance > 0) {
            currentPull = Math.min(pullDistance * 0.4, 90); 
            indicator.style.transform = `translateY(${currentPull}px)`;
            const rotateDeg = currentPull * 4;
            icon.style.transform = `rotate(${rotateDeg}deg)`;
        }
    }, { passive: true });

    mainContainer.addEventListener('touchend', () => {
        if (!active) return;
        active = false;

        if (currentPull >= 60) {
            indicator.style.transition = 'transform 0.2s ease';
            indicator.style.transform = 'translateY(70px)';
            icon.style.transition = 'none';
            icon.classList.add('pull-refresh-spinning');
            
            showToast("ডাটা রিলোড হচ্ছে...", "info");
            
            setTimeout(() => {
                window.location.reload();
            }, 800);
        } else {
            indicator.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            indicator.style.transform = 'translateY(0px)';
            icon.style.transform = 'rotate(0deg)';
            currentPull = 0;
        }
    });
}

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
// ১১. সিস্টেম লাইফসাইকেল বুটস্ট্র্যাপ
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    window.applyGlobalSettings();
    updateConnectionStatus();
    await updatePendingCount();
    resetInactivityTimer();
    initPullToRefresh();
    window.checkActiveSession();
});

window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);