/* ==========================================================================
   Madrasah Management System - Resilient PWA Service Worker (Offline Engine)
   Author: Senior Software Engineer & UI/UX Architect
   Description: GET-only caching, bypasses non-HTTP, and uses Promise.allSettled.
   ========================================================================== */

const CACHE_NAME = 'madrasah-pwa-v5';

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

// ১. রেজিলিয়েন্ট ইনস্টল ইভেন্ট (একটি ফাইল মিসিং হলেও ইন্সটলেশন ফেইল হবে না)
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('Resilient caching started...');
            // Promise.allSettled ব্যবহার করে প্রতিটি ফাইল আলাদাভাবে ট্রাই করা হচ্ছে
            return Promise.allSettled(
                ASSETS_TO_CACHE.map(url => {
                    return fetch(url).then(response => {
                        if (response.ok) {
                            return cache.put(url, response);
                        }
                        throw new Error(`Failed to fetch ${url}`);
                    });
                })
            ).then(results => {
                console.log('Caching process completed with results:', results);
            });
        }).then(() => self.skipWaiting())
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
        }).then(() => self.clients.claim())
    );
});

// ৩. ফেচ ইন্টারসেপ্টর (নিরাপদ ফিল্টারিং মেকানিজম)
self.addEventListener('fetch', event => {
    // ৩.১ শুধুমাত্র HTTP/HTTPS প্রোটোকল হ্যান্ডেল করুন (Browser Extension বাইপাস)
    if (!event.request.url.startsWith('http')) {
        return;
    }

    // ৩.২ শুধুমাত্র GET রিকোয়েস্ট ক্যাশ বা অফলাইন হ্যান্ডেল করুন (POST/Sync সরাসরি সার্ভারে যাবে)
    if (event.request.method !== 'GET') {
        return; 
    }

    const requestUrl = new URL(event.request.url);

    // ৩.৩ গুগল অ্যাপস স্ক্রিপ্ট এপিআই বাইপাস (সরাসরি লাইভ নেটওয়ার্কে রান করবে)
    if (requestUrl.hostname === 'script.google.com' || requestUrl.href.includes('macros')) {
        return; 
    }

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
                return cachedResponse; // মেমরি ক্যাশ থেকে তাৎক্ষণিক লোড
            }

            return fetch(event.request).then(networkResponse => {
                // রিকোয়েস্ট সফল হলে স্বয়ংক্রিয়ভাবে ক্যাশে সেভ করা
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // অফলাইন ফলব্যাক লজিক (ক্র্যাশ প্রতিরোধক)
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html').then(fallback => {
                        if (fallback) return fallback;
                        // যদি কোনো কারণে ইনডেক্স ফাইল ক্যাশে না থাকে, তবে ক্র্যাশ না করে ব্রাউজার রেসপন্স দেখাবে
                        return new Response(
                            '<div style="font-family:sans-serif; text-align:center; padding:50px;"><h2>মাদরাসা প্যানেল অফলাইন</h2><p>অ্যাপ্লিকেশনটি খুলতে সক্রিয় ইন্টারনেট সংযোগ প্রয়োজন।</p></div>',
                            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
                        );
                    });
                }
                return null;
            });
        })
    );
});
