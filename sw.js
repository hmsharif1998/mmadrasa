/* ==========================================================================
   Madrasah Management System - PWA Service Worker (Offline Engine)
   Author: Senior Software Engineer & UI/UX Architect
   Description: Caches static templates while bypassing real-time GAS API requests.
   ========================================================================== */

const CACHE_NAME = 'madrasah-pwa-v4';

// ক্যাশ করার জন্য সকল প্রয়োজনীয় স্ট্যাটিক ফাইলের তালিকা
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

// ১. সার্ভিস ওয়ার্কার ইনস্টল ইভেন্ট (ফাইলগুলো ব্রাউজার মেমরিতে ডাউনলোড ও ক্যাশ করা)
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Static assets caching started...');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting()) // নতুন সার্ভিস ওয়ার্কার সাথে সাথে সচল হবে
    );
});

// ২. অ্যাক্টিভেশন ইভেন্ট (পুরোনো বা বাতিল ক্যাশ মেমরি পরিষ্কার করা)
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        console.log('Clearing old cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim()) // সব ট্যাব বা উইন্ডোর ওপর নিয়ন্ত্রণ নেওয়া
    );
});

// ৩. ফেচ ইন্টারসেপ্টর (গুগল শিট API বাইপাস এবং অফলাইন ক্যাশ ফলব্যাক)
self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);

    // গুগল অ্যাপস স্ক্রিপ্ট (SCRIPT_URL) রিকোয়েস্ট সনাক্তকরণ (সরাসরি অনলাইন চেক)
    if (requestUrl.hostname === 'script.google.com' || requestUrl.href.includes('macros')) {
        // এপিআই রিকোয়েস্ট ক্যাশ মেমরি থেকে লোড হবে না, সরাসরি অনলাইনে গুগল শিট ভ্যালিডেট করবে
        event.respondWith(fetch(event.request));
        return;
    }

    // সাধারণ লোকাল ফাইলগুলোর জন্য ক্যাশ-ফার্স্ট পলিসি
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
                return cachedResponse; // মেমরি ক্যাশ থেকে তাৎক্ষণিক লোড
            }
            return fetch(event.request).then(networkResponse => {
                // নতুন কোনো ফাইল লোড হলে তা মেমরি ক্যাশে যুক্ত করে নেওয়া
                if (networkResponse.status === 200 && event.request.method === 'GET') {
                    return caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                }
                return networkResponse;
            }).catch(() => {
                // ইন্টারনেট অফ থাকা অবস্থায় যদি পেজ না পাওয়া যায় তবে মূল ইনডেক্সে ফলব্যাক করবে
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});