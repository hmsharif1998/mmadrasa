/* ==========================================================================
   Madrasah Management System - Resilient PWA Service Worker (V8)
   Author: Senior Software Engineer & UI/UX Architect
   Description: Redirect-safe caching avoids 'Response was redirected' crash,
                supporting offline PWA access for all new and updated modules.
   ========================================================================== */

const CACHE_NAME = 'madrasah-pwa-v8';

// ক্যাশ করার জন্য সকল প্রয়োজনীয় এইচটিএমএল, সিএসএস ও জাভাস্ক্রিপ্ট ফাইলের তালিকা
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './app.js',
    './style.css',
    './dexie.js',
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

// ১. ইন্সটল ইভেন্ট (ক্যাচ ব্লক সেফগার্ড সহ সকল ফাইল প্রি-ক্যাশিং)
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('PWA Pre-caching started...');
            return cache.addAll(ASSETS_TO_CACHE).catch(err => {
                console.warn('Pre-caching warning (some assets might be fetched dynamically):', err);
            });
        }).then(() => self.skipWaiting())
    );
});

// ২. অ্যাক্টিভেশন ইভেন্ট (পুরাতন ক্যাশ ক্লিয়ার করা)
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.map(key => {
                    if (key !== CACHE_NAME) {
                        console.log('Deleting old cache version:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// ৩. ফেচ ইভেন্ট (নেটওয়ার্ক-ফার্স্ট উইথ ক্যাশ ফলব্যাক - ক্র্যাশ প্রতিরোধী লজিক)
self.addEventListener('fetch', event => {
    // ৩.১ প্রোটোকল চেক (শুধুমাত্র http/https রিকোয়েস্ট ইন্টারসেপ্ট হবে)
    if (!event.request.url.startsWith('http')) {
        return;
    }

    // ৩.২ মেথড চেক (শুধুমাত্র GET রিকোয়েস্ট ক্যাশ হবে)
    if (event.request.method !== 'GET') {
        return;
    }

    // ৩.৩ Chrome/Edge 'only-if-cached' বাগ প্রতিরোধক
    if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') {
        return;
    }

    const url = new URL(event.request.url);

    // ৩.৪ গুগল অ্যাপস স্ক্রিপ্ট (GAS) এপিআই বাইপাস (সার্ভার রিকোয়েস্ট ক্যাশ হবে না)
    if (url.hostname === 'script.google.com' || url.href.includes('macros')) {
        return;
    }

    // নেটওয়ার্ক-ফার্স্ট স্ট্র্যাটেজি (অনলাইনে সবসময় লাইভ ফাইল লোড হবে, অফলাইনে ক্যাশ থেকে লোড হবে)
    event.respondWith(
        fetch(event.request).then(response => {
            // রিকোয়েস্ট সফল হলে এবং রিডাইরেক্টেড না হলে ক্যাশে কপি সেভ রাখা
            if (response && response.status === 200 && !response.redirected) {
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseClone).catch(err => {
                        console.warn('Cache put failed (safe ignore):', err);
                    });
                }).catch(err => {
                    console.warn('Cache open failed (safe ignore):', err);
                });
            }
            return response;
        }).catch(err => {
            console.log('Network fetch failed, falling back to PWA cache...', err);
            
            // ইন্টারনেট অফ থাকলে (অফলাইনে) ক্যাশ মেমরি থেকে ফাইল লোড করবে
            return caches.match(event.request, { ignoreSearch: true }).then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                // অফলাইন নেভিগেশন ফলব্যাক (এইচটিএমএল ক্র্যাশ প্রতিরোধক)
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html', { ignoreSearch: true }).then(fallback => {
                        if (fallback) return fallback;
                        
                        // সম্পূর্ণ অফলাইন সেফগার্ড রেসপন্স
                        return new Response(
                            '<div style="font-family:sans-serif; text-align:center; padding:50px; color:#1e293b;">' +
                            '<h2 style="color:#059669;">মাদরাসা প্যানেল অফলাইন</h2>' +
                            '<p>ইন্টারনেট সংযোগ চালু করুন অথবা পূর্বে ক্যাশ হওয়া পেজ লোড করুন।</p></div>',
                            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
                        );
                    });
                }
            });
        })
    );
});