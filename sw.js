
/* ==========================================================================
   Madrasah Management System - Universal PWA Service Worker (V9)
   Architecture: Stale-While-Revalidate & Resilient Offline Engine
   ========================================================================== */

const CACHE_NAME = 'madrasah-pwa-v9';

// ১. প্রি-ক্যাশ করার জন্য লোকাল ফাইলসমূহের তালিকা
const LOCAL_ASSETS = [
    './',
    './index.html',
    './app.js',
    './style.css',
    './manifest.json',
    './dashboard.html',
    './admission.html',
    './fees.html',
    './student_list.html',
    './expense.html',
    './attendance.html',
    './settings.html',
    './teachers.html',
    './exams.html',
    './parent_portal.html',
    './installer.html'
];

// ২. অফলাইনে চালানোর জন্য প্রয়োজনীয় মূল সিডিএন লাইব্রেরিসমূহ
const CDN_ASSETS = [
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://unpkg.com/dexie@3.2.4/dist/dexie.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
];

// ৩. ইন্সটল ইভেন্ট (লোকাল ও সিডিএন ফাইলগুলো ক্যাশ করা)
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async cache => {
            console.log('[PWA] Pre-caching local assets...');
            try {
                await cache.addAll(LOCAL_ASSETS);
            } catch (err) {
                console.warn('[PWA] Some local assets failed to pre-cache:', err);
            }

            // সিডিএন ফাইলগুলো একে একে নিরাপদভাবে ক্যাশ করা
            for (const url of CDN_ASSETS) {
                try {
                    const res = await fetch(url, { mode: 'cors' });
                    if (res.ok) await cache.put(url, res);
                } catch (e) {
                    console.warn('[PWA] CDN caching skipped for:', url);
                }
            }
        }).then(() => self.skipWaiting())
    );
});

// ৪. অ্যাক্টিভেশন ইভেন্ট (পুরাতন ক্যাশ ভার্সন ক্লিয়ার করা)
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.map(key => {
                    if (key !== CACHE_NAME) {
                        console.log('[PWA] Deleting old cache:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// ৫. ফেচ ইভেন্ট (স্মার্ট ক্যাশিং ও অফলাইন ফলব্যাক ইঞ্জিন)
self.addEventListener('fetch', event => {
    const request = event.request;

    // শুধুমাত্র HTTP/HTTPS রিকোয়েস্ট গ্রহণযোগ্য
    if (!request.url.startsWith('http')) return;

    // শুধুমাত্র GET মেথড ক্যাশ করা হবে
    if (request.method !== 'GET') return;

    // Chrome/Edge 'only-if-cached' বাগ প্রতিরোধ
    if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

    const url = new URL(request.url);

    // গুগল অ্যাপস স্ক্রিপ্ট (GAS) ক্লাউড এপিআই রিকোয়েস্ট কখনই ক্যাশ হবে না
    if (url.hostname === 'script.google.com' || url.href.includes('macros')) {
        return;
    }

    // ৫.১ ফন্ট ও সিডিএন ফাইলের জন্য Cache-First / Stale-While-Revalidate কৌশল
    if (url.hostname.includes('fonts.googleapis.com') || 
        url.hostname.includes('fonts.gstatic.com') || 
        url.hostname.includes('cdnjs.cloudflare.com') ||
        url.hostname.includes('cdn.jsdelivr.net') ||
        url.hostname.includes('unpkg.com') ||
        url.hostname.includes('img.icons8.com')) {
        
        event.respondWith(
            caches.match(request).then(cachedResponse => {
                if (cachedResponse) return cachedResponse;

                return fetch(request).then(networkResponse => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
                    }
                    return networkResponse;
                }).catch(() => cachedResponse);
            })
        );
        return;
    }

    // ৫.২ লোকাল HTML/JS ফাইলের জন্য Network-First কৌশল (অনলাইনে লাইভ আপডেট, অফলাইনে ক্যাশ)
    event.respondWith(
        fetch(request).then(response => {
            if (response && response.status === 200 && !response.redirected) {
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(request, responseClone).catch(() => {});
                });
            }
            return response;
        }).catch(async () => {
            // ইন্টারনেট অফ থাকলে ক্যাশ থেকে ফাইল রিটার্ন করবে
            const cachedResponse = await caches.match(request, { ignoreSearch: true });
            if (cachedResponse) return cachedResponse;

            // যদি পেজ নেভিগেশনের সময় ইন্টারনেট না থাকে তবে index.html লোড করবে
            if (request.mode === 'navigate') {
                const fallback = await caches.match('./index.html', { ignoreSearch: true });
                if (fallback) return fallback;
            }

            // অফলাইন নোটিশ
            return new Response(
                '<div style="font-family:sans-serif; text-align:center; padding:50px; color:#1e293b;">' +
                '<h2 style="color:#059669;">মাদরাসা ম্যানেজমেন্ট অফলাইন</h2>' +
                '<p>ইন্টারনেট সংযোগ চালু করুন অথবা পূর্বে ক্যাশ হওয়া পেজ লোড করুন।</p></div>',
                { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            );
        })
    );
});