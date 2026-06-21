/* ==========================================================================
   Madrasah Management System - Network-First PWA Service Worker
   Author: Senior Software Engineer & UI/UX Architect
   Description: Network-First strategy ensures 0% ERR_FAILED when online, 
                falling back to cache ONLY when offline.
   ========================================================================== */

const CACHE_NAME = 'madrasah-pwa-v6';

// ক্যাশ করার জন্য প্রয়োজনীয় ফাইলের তালিকা
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
    './settings.html'
];

// ১. ইন্সটল ইভেন্ট (ক্যাচ ব্লক সেফগার্ড সহ)
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('Pre-caching started...');
            // addAll ফেইল করলেও যেন পুরো ইনস্টলেশন ক্র্যাশ না করে সেজন্য ক্যাচ ব্লক যুক্ত করা হলো
            return cache.addAll(ASSETS_TO_CACHE).catch(err => {
                console.warn('Pre-caching warning (some files might be missing in repo):', err);
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
                        console.log('Deleting old cache:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// ৩. ফেচ ইভেন্ট (নেটওয়ার্ক-ফার্স্ট উইথ ক্যাশ ফলব্যাক - ক্র্যাশ প্রতিরোধী লজিক)
self.addEventListener('fetch', event => {
    // ৩.১ প্রোটোকল চেক (শুধুমাত্র http/https ইন্টারসেপ্ট হবে)
    if (!event.request.url.startsWith('http')) {
        return;
    }

    // ৩.২ মেথড চেক (শুধুমাত্র GET ক্যাশ হবে, POST সরাসরি সার্ভারে যাবে)
    if (event.request.method !== 'GET') {
        return;
    }

    const url = new URL(event.request.url);

    // ৩.৩ গুগল অ্যাপস স্ক্রিপ্ট এপিআই বাইপাস (সরাসরি লাইভ অনলাইন রান করবে)
    if (url.hostname === 'script.google.com' || url.href.includes('macros')) {
        return;
    }

    // নেটওয়ার্ক-ফার্স্ট স্ট্র্যাটেজি (অনলাইনে সবসময় লাইভ ফাইল লোড হবে, অফলাইনে ক্যাশ থেকে লোড হবে)
    event.respondWith(
        fetch(event.request).then(response => {
            // রিকোয়েস্ট সফল হলে ক্যাশে কপি সেভ করে রাখুন
            if (response && response.status === 200) {
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseClone);
                });
            }
            return response;
        }).catch(() => {
            // ইন্টারনেট অফ থাকলে (বা অফলাইন হলে) ক্যাশ মেমরি থেকে লোড করবে
            return caches.match(event.request).then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                // ক্যাশেও না থাকলে অফলাইন মেসেজ পেজ দেখাবে যেন ব্রাউজার ক্র্যাশ না করে
                if (event.request.mode === 'navigate') {
                    return new Response(
                        '<div style="font-family:sans-serif; text-align:center; padding:50px; color:#1e293b;">' +
                        '<h2 style="color:#059669;">মাদরাসা প্যানেল অফলাইন</h2>' +
                        '<p>ইন্টারনেট সংযোগ চালু করুন অথবা পূর্বে ক্যাশ হওয়া পেজ লোড করুন।</p></div>',
                        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
                    );
                }
            });
        })
    );
});
