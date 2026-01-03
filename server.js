require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');
const firebase = require('firebase/compat/app');
require('firebase/compat/database');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const app = express();
app.use(bodyParser.json());

// GÜVENLİK HEADERS (Helmet benzeri manuel koruma)
// GÜVENLİK HEADERS 
app.use((req, res, next) => {
    // res.setHeader('X-Frame-Options', 'DENY'); // OBS için kapatıldı
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// GÜVENLİK: Tüm dosyaların dışarı sızmasını engelle (manifest, .env vb.)
// Sadece gerekli dosyaları public yapıyoruz
const publicFiles = ['shop.js', 'shop.css', 'admin.html', 'dashboard.html', 'shop.html', 'overlay.html', 'goals.html', 'horse-race.html'];
publicFiles.forEach(file => {
    app.get(`/${file}`, (req, res) => res.sendFile(path.join(__dirname, file)));
});

// PERSISTENT STORAGE (Render Disk)
const persistPath = '/var/data';
const uploadDir = fs.existsSync(persistPath)
    ? path.join(persistPath, 'sounds')
    : path.join(__dirname, 'uploads', 'sounds');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads/sounds', express.static(uploadDir)); // Sesler için doğru yer

// MULTER SETUP
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Öncelik: Header > Query > Body
        const channelId = req.headers['c-id'] || req.query.channelId || req.body.channelId || 'global';
        const channelDir = path.join(uploadDir, channelId);
        if (!fs.existsSync(channelDir)) {
            fs.mkdirSync(channelDir, { recursive: true });
        }
        cb(null, channelDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + ext;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB Limit
});

const JOBS = {
    "İşsiz": { reward: 0, icon: "👤" },
    "Simitçi": { reward: 50, icon: "🥯" },
    "Çöpçü": { reward: 100, icon: "🧹" },
    "Kurye": { reward: 150, icon: "🛵" },
    "Garson": { reward: 250, icon: "☕" },
    "Berber": { reward: 400, icon: "✂️" },
    "Tamirci": { reward: 600, icon: "🔧" },
    "Madenci": { reward: 800, icon: "⛏️" },
    "Memur": { reward: 1000, icon: "🏢" },
    "Öğretmen": { reward: 1500, icon: "👨‍🏫" },
    "Avukat": { reward: 2200, icon: "⚖️" },
    "Yazılımcı": { reward: 3000, icon: "💻" },
    "Mimar": { reward: 4000, icon: "📐" },
    "Doktor": { reward: 5000, icon: "🩺" },
    "Kaptan": { reward: 6500, icon: "⚓" },
    "Pilot": { reward: 8000, icon: "✈️" },
    "Bilim İnsanı": { reward: 10000, icon: "🧪" },
    "Kumarbaz": { reward: 12500, icon: "🎲" },
    "CEO": { reward: 15000, icon: "👔" },
    "Astronot": { reward: 20000, icon: "🚀" }
};

// 1. FIREBASE INITIALIZATION
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    databaseURL: process.env.FIREBASE_DB_URL
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const KICK_CLIENT_ID = process.env.KICK_CLIENT_ID;
const KICK_CLIENT_SECRET = process.env.KICK_CLIENT_SECRET;
const REDIRECT_URI = "https://aloskegangbot-market.onrender.com/auth/kick/callback";

// ADMIN LOG HELPER
async function addLog(action, details, channelId = 'Global') {
    const timestamp = Date.now();
    try {
        const logRef = db.ref('admin_logs');
        await logRef.push({ action, details, channelId, timestamp });

        // Capped logs: 100 limit
        const snap = await logRef.once('value');
        if (snap.numChildren() > 100) {
            const keys = Object.keys(snap.val());
            await logRef.child(keys[0]).remove();
        }
    } catch (e) {
        console.error("Log error:", e.message);
    }
}

// GLOBAL STATES
const activeDuels = {};
const channelHeists = {};
const channelLotteries = {};
const channelPredictions = {};
const heistHistory = {}; // { broadcasterId: [timestamp1, timestamp2] }
const riggedGambles = {};
const riggedShips = {};
const riggedStats = {};
const horseRaces = {};
const activeRR = {};

// --- GLOBAL BORSA SİSTEMİ ---
const INITIAL_STOCKS = {
    "APPLE": { price: 5000, trend: 1 },
    "BITCOIN": { price: 45000, trend: 1 },
    "GOLD": { price: 2500, trend: -1 },
    "SILVER": { price: 850, trend: 1 },
    "PLATINUM": { price: 3200, trend: 1 },
    "KICK": { price: 100, trend: 1 },
    "ETHER": { price: 15000, trend: -1 },
    "TESLA": { price: 7500, trend: 1 },
    "NVIDIA": { price: 12000, trend: 1 },
    "GOOGLE": { price: 6200, trend: -1 },
    "AMAZON": { price: 5800, trend: 1 }
};

async function updateGlobalStocks() {
    try {
        const stockRef = db.ref('global_stocks');
        const snap = await stockRef.once('value');
        let stocks = snap.val();

        if (!stocks) {
            stocks = INITIAL_STOCKS;
        }

        for (const [code, data] of Object.entries(stocks)) {
            const oldPrice = data.price || INITIAL_STOCKS[code]?.price || 100;

            // Daha agresif saniyelik hareket: -%1.5 ile +%1.5 arası
            const changePercent = (Math.random() * 3 - 1.5) / 100;
            let change = oldPrice * changePercent;

            // Minimum 1 birim hareket sağla (eğer değişim 0 değilse)
            if (Math.abs(change) < 0.5 && changePercent !== 0) {
                change = changePercent > 0 ? 1 : -1;
            }

            let newPrice = Math.round(oldPrice + change);

            if (newPrice < 10) newPrice = 10;
            if (newPrice > 1000000) newPrice = 1000000;

            stocks[code] = {
                price: newPrice,
                oldPrice: oldPrice,
                trend: newPrice > oldPrice ? 1 : (newPrice < oldPrice ? -1 : (data.trend || 1)),
                lastUpdate: Date.now()
            };
        }

        await stockRef.set(stocks);
        console.log("📈 Global Borsa Verileri Güncellendi.");
    } catch (e) {
        console.error("Borsa Update Error:", e.message);
    }
}

// Borsa güncelleme (Her 1 saniyede bir)
setInterval(updateGlobalStocks, 1000);
updateGlobalStocks(); // Server açıldığında hemen ilk verileri oluştur

// PKCE & HELPERS
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
function base64UrlEncode(str) { return str.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''); }
function generatePKCE() {
    const verifier = base64UrlEncode(crypto.randomBytes(32));
    const challenge = base64UrlEncode(crypto.createHash('sha256').update(verifier).digest());
    return { verifier, challenge };
}

// ---------------------------------------------------------
// 2. AUTH & CALLBACK (MULTI-TENANT)
// ---------------------------------------------------------
app.get('/login', async (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const { verifier, challenge } = generatePKCE();
    await db.ref('temp_auth/' + state).set({ verifier, createdAt: Date.now() });
    const scopes = "chat:write events:subscribe user:read channel:read moderation:ban channel:subscription:read";
    const authUrl = `https://id.kick.com/oauth/authorize?client_id=${KICK_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`;
    res.redirect(authUrl);
});

app.get('/auth/kick/callback', async (req, res) => {
    const { code, state } = req.query;
    const tempAuth = (await db.ref('temp_auth/' + state).once('value')).val();
    if (!tempAuth) return res.send("Oturum zaman aşımı.");
    try {
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('code', code);
        params.append('client_id', KICK_CLIENT_ID);
        params.append('client_secret', KICK_CLIENT_SECRET);
        params.append('redirect_uri', REDIRECT_URI);
        params.append('code_verifier', tempAuth.verifier);
        const response = await axios.post('https://id.kick.com/oauth/token', params);

        const userRes = await axios.get('https://api.kick.com/public/v1/users', { headers: { 'Authorization': `Bearer ${response.data.access_token}` } });
        const userData = userRes.data.data[0];
        const bid = userData.user_id;

        // Kanal verisini hazırla/güncelle
        const chanRef = db.ref('channels/' + bid);
        const chanSnap = await chanRef.once('value');
        const existingData = chanSnap.val() || {};

        // Yeni bir dashboard key oluştur (yoksa)
        const loginKey = existingData.dashboard_key || crypto.randomBytes(16).toString('hex');

        const updateObj = {
            access_token: response.data.access_token,
            refresh_token: response.data.refresh_token,
            username: (userData.slug || userData.name || "").toLowerCase(),
            broadcaster_id: bid,
            dashboard_key: loginKey,
            updatedAt: Date.now()
        };

        // Eğer ilk kez ekleniyorsa varsayılan ayarları koy
        if (!existingData.settings) {
            updateObj.settings = {
                slot: true, yazitura: true, kutu: true,
                duello: true, soygun: true, fal: true,
                ship: true, hava: true, soz: true, zenginler: true,
                daily_reward: 500, passive_reward: 100
            };
        }

        await chanRef.update(updateObj);
        await subscribeToChat(response.data.access_token, bid);

        // Dashboard'a yönlendir
        res.redirect(`/dashboard?c=${bid}&k=${loginKey}`);
    } catch (e) {
        console.error("Auth Error:", e);
        res.status(500).send("Giriş sırasında bir hata oluştu: " + e.message);
    }
});

async function subscribeToChat(token, broadcasterId) {
    try {
        await axios.post('https://api.kick.com/public/v1/events/subscriptions', {
            broadcaster_user_id: parseInt(broadcasterId),
            events: [
                { name: "chat.message.sent", version: 1 },
                { name: "channel.subscription.new", version: 1 }
            ],
            method: "webhook"
        }, { headers: { 'Authorization': `Bearer ${token}` } });
    } catch (e) { console.log('Sub Error:', e.response?.data || e.message); }
}

async function sendChatMessage(content, broadcasterId) {
    if (!broadcasterId) return;
    const snap = await db.ref('channels/' + broadcasterId).once('value');
    const data = snap.val();
    if (!data) return;
    try {
        await axios.post(`https://api.kick.com/public/v1/chat`, { content, type: "bot", broadcaster_user_id: parseInt(broadcasterId) }, {
            headers: { 'Authorization': `Bearer ${data.access_token}` }
        });
    } catch (e) {
        if (e.response?.status === 401) { await refreshChannelToken(broadcasterId); return sendChatMessage(content, broadcasterId); }
    }
}

async function refreshChannelToken(broadcasterId) {
    const snap = await db.ref('channels/' + broadcasterId).once('value');
    if (!snap.val()) return;
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', snap.val().refresh_token);
    params.append('client_id', KICK_CLIENT_ID);
    params.append('client_secret', KICK_CLIENT_SECRET);
    try {
        const res = await axios.post('https://id.kick.com/oauth/token', params);
        await db.ref('channels/' + broadcasterId).update({ access_token: res.data.access_token, refresh_token: res.data.refresh_token });
    } catch (e) { console.log("Refresh token error", e.message); }
}

// KICK API MODERATION FONKSÄ°YONLARI
async function timeoutUser(broadcasterId, targetUsername, duration) {
    const channelRef = await db.ref('channels/' + broadcasterId).once('value');
    const channelData = channelRef.val();
    if (!channelData) return { success: false, error: 'Kanal bulunamadÄ±' };

    try {
        let targetUserId = null;

        // YÃ–NTEM 0: VeritabanÄ±ndan bak (En garantisi)
        const dbIdSnap = await db.ref('kick_ids/' + targetUsername.toLowerCase()).once('value');
        if (dbIdSnap.exists()) {
            targetUserId = dbIdSnap.val();
            console.log(`✅ ID Veritabanından bulundu: ${targetUsername} -> ${targetUserId}`);
        }

        // YÃ¶ntem 1: Public channel endpoint (herkesin kanalÄ± var)
        if (!targetUserId) {
            try {
                const chRes = await axios.get(`https://kick.com/api/v2/channels/${encodeURIComponent(targetUsername)}`, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                });
                if (chRes.data?.user_id) {
                    targetUserId = chRes.data.user_id;
                } else if (chRes.data?.user?.id) {
                    targetUserId = chRes.data.user.id;
                }
            } catch (e1) {
                console.log("Method 1 (public channel):", e1.response?.status || e1.message);
            }
        }

        // Yöntem 2: Public v1 channels endpoint
        if (!targetUserId) {
            try {
                const chRes = await axios.get(`https://api.kick.com/public/v1/channels?slug=${encodeURIComponent(targetUsername)}`, {
                    headers: { 'Authorization': `Bearer ${channelData.access_token}` }
                });
                if (chRes.data?.data?.[0]?.user_id) {
                    targetUserId = chRes.data.data[0].user_id;
                }
            } catch (e2) {
                console.log("Method 2 (v1 channels):", e2.response?.status || e2.message);
            }
        }


        // YÃ¶ntem 3: Check username endpoint
        if (!targetUserId) {
            try {
                const checkRes = await axios.get(`https://kick.com/api/v1/channels/check-username/${encodeURIComponent(targetUsername)}`);
                if (checkRes.data?.user_id) {
                    targetUserId = checkRes.data.user_id;
                }
            } catch (e3) {
                console.log("Method 3 (check-username):", e3.response?.status || e3.message);
            }
        }

        if (!targetUserId) {
            console.log(`❌ Tüm yöntemler başarısız: ${targetUsername}`);
            return { success: false, error: 'Kullanıcı bulunamadı (Kick API)' };
        }

        console.log(`✅ User ID bulundu: ${targetUsername} -> ${targetUserId}`);

        let lastError = null;

        // Timeout uygula (RESMİ V1 MODERATION ENDPOINT)
        try {
            const url = `https://api.kick.com/public/v1/moderation/bans`;
            console.log(`Trying Official Ban Endpoint: ${url}`);

            const body = {
                broadcaster_user_id: parseInt(broadcasterId),
                user_id: parseInt(targetUserId),
                duration: parseInt(duration), // Dakika cinsinden
                reason: "Bot Moderasyon"
            };

            const banRes = await axios.post(url, body, {
                headers: {
                    'Authorization': `Bearer ${channelData.access_token}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json'
                }
            });
            console.log("✅ Ban/Timeout başarılı! Status:", banRes.status);
            return { success: true };
        } catch (e) {
            console.log(`❌ Official Endpoint failed:`, e.response?.status, JSON.stringify(e.response?.data) || e.message);

            if (e.response?.status === 401) {
                console.log("🔄 Token tazeleniyor...");
                await refreshChannelToken(broadcasterId);
            }
            lastError = e;
        }

        // --- SON ÇARE: CHAT KOMUTU ---
        // API başarısız olursa chat komutu saniye cinsinden çalışır, bu yüzden süreyi 60 ile çarpıyoruz.
        const seconds = parseInt(duration) * 60;
        console.log(`⚠️ API başarısız. Chat komutu deneniyor: /timeout @${targetUsername} ${seconds}`);
        try {
            await sendChatMessage(`/timeout @${targetUsername} ${seconds}`, broadcasterId);
            return { success: true, note: "Chat fallback" };
        } catch (chatErr) {
            console.log("❌ Chat fallback de başarısız.");
            return { success: false, error: lastError?.response?.data?.message || lastError?.message || 'Tüm yöntemler başarısız' };
        }
    } catch (e) {
        console.log("❌ Timeout Fatal:", e.message);
        return { success: false, error: e.message };
    }
}

// Slow Mode API (Kick Public API v1)
async function setSlowMode(broadcasterId, enabled, delay = 10) {
    const channelRef = await db.ref('channels/' + broadcasterId).once('value');
    const channelData = channelRef.val();
    if (!channelData) return { success: false, error: 'Kanal bulunamadı' };

    try {
        const url = 'https://api.kick.com/public/v1/chat-settings';
        const body = {
            broadcaster_user_id: parseInt(broadcasterId),
            slow_mode: enabled,
            slow_mode_interval: parseInt(delay)
        };

        await axios.patch(url, body, {
            headers: {
                'Authorization': `Bearer ${channelData.access_token}`,
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            }
        });
        console.log("✅ SlowMode güncellendi:", url);
        return { success: true };
    } catch (e) {
        console.log("❌ SlowMode Error:", e.response?.status, e.response?.data || e.message);
        return { success: false, error: e.response?.data?.message || e.message };
    }
}

// Clear Chat API (Kick Public API v1)
async function clearChat(broadcasterId) {
    const channelRef = await db.ref('channels/' + broadcasterId).once('value');
    const channelData = channelRef.val();
    if (!channelData) return { success: false, error: 'Kanal bulunamadı' };

    try {
        const url = 'https://api.kick.com/public/v1/chat/clear';
        const body = {
            broadcaster_user_id: parseInt(broadcasterId)
        };

        await axios.post(url, body, {
            headers: {
                'Authorization': `Bearer ${channelData.access_token}`,
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            }
        });
        console.log("✅ Chat temizlendi:", url);
        return { success: true };
    } catch (e) {
        console.log("❌ ClearChat Error:", e.response?.status, e.response?.data || e.message);
        return { success: false, error: e.response?.data?.message || e.message };
    }
}

// ---------------------------------------------------------
// ---------------------------------------------------------
// 4. WEBHOOK (KOMUTLAR & OTO KAYIT)
// ---------------------------------------------------------
app.post('/kick/webhook', async (req, res) => {
    try {
        const payload = req.body;
        const event = payload.data || payload;

        // --- CHALLENGE RESPONSE (If Kick ever adds it) ---
        if (payload.challenge) return res.send(payload.challenge);

        res.status(200).send('OK');

        // Robust Broadcaster ID Discovery
        let broadcasterId =
            payload.broadcaster_user_id ||
            event.broadcaster_user_id ||
            event.broadcaster?.user_id ||
            event.broadcaster?.id ||
            event.channel?.user_id ||
            event.channel?.id ||
            event.chatroom_id;

        if (!broadcasterId) {
            // console.log("⚠️ Broadcaster ID bulunamadı. Payload:", JSON.stringify(payload).substring(0, 200));
            return;
        }
        broadcasterId = String(broadcasterId); // String'e çevir ki cooldown objesi şaşmasın

        const channelRef = await db.ref('channels/' + broadcasterId).once('value');
        const channelData = channelRef.val();

        if (!channelData) {
            console.log(`❌ Kanal veritabanında yok: ${broadcasterId}`);
            return;
        }

        // --- ABONE ÖDÜLÜ SİSTEMİ ---
        if (payload.event === "channel.subscription.new") {
            const subUser = event.username;
            if (subUser) {
                console.log(`🎊 YENİ ABONE: ${subUser} (${broadcasterId})`);
                await db.ref('users/' + subUser.toLowerCase()).transaction(u => {
                    if (!u) u = { balance: 1000, last_seen: Date.now(), last_channel: broadcasterId, created_at: Date.now() };
                    u.balance = (u.balance || 0) + 5000;
                    return u;
                });
                await sendChatMessage(`🎊 @${subUser} ABONE OLDU! Hoş geldin, hesabına 5.000 💰 bakiye eklendi! ✨`, broadcasterId);
            }
            return;
        }

        // SLUG GÜNCELLEME (API için kritik)
        const currentSlug = event.broadcaster?.channel_slug || event.channel?.slug || payload.broadcaster?.channel_slug;
        if (currentSlug && channelData.slug !== currentSlug) {
            await db.ref('channels/' + broadcasterId).update({ slug: currentSlug });
            channelData.slug = currentSlug; // Local memory update
            console.log(`🔄 Kanal slug güncellendi: ${currentSlug}`);
        }

        const settings = channelData.settings || {};
        const user = event.sender?.username;
        const rawMsg = event.content;

        if (!user || !rawMsg) return;
        if (user.toLowerCase() === "aloskegangbot") return;

        const lowMsg = rawMsg.trim().toLowerCase();
        const args = rawMsg.trim().split(/\s+/).slice(1);
        const userRef = db.ref('users/' + user.toLowerCase());

        // --- OTOMATİK KAYIT & AKTİFLİK TAKİBİ (ATOMIC TRANSACTION) ---
        const today = getTodayKey();
        await userRef.transaction(u => {
            if (!u) {
                return {
                    balance: 1000,
                    last_seen: Date.now(),
                    last_channel: broadcasterId,
                    created_at: Date.now(),
                    lifetime_m: 1, lifetime_g: 0, lifetime_d: 0, lifetime_w: 0,
                    channel_m: { [broadcasterId]: 1 },
                    quests: { [today]: { m: 1, g: 0, d: 0, w: 0, claimed: {} } }
                };
            } else {
                if (!u.quests) u.quests = {};
                if (!u.quests[today]) u.quests[today] = { m: 0, g: 0, d: 0, w: 0, claimed: {} };
                u.quests[today].m = (u.quests[today].m || 0) + 1;

                if (!u.channel_m) u.channel_m = {};
                u.channel_m[broadcasterId] = (u.channel_m[broadcasterId] || 0) + 1;

                u.last_seen = Date.now();
                u.last_channel = broadcasterId;
                u.lifetime_m = (u.lifetime_m || 0) + 1;
                return u;
            }
        }, (err) => {
            if (err && err.message !== 'set') console.error("Webhook User Update Error:", err.message);
        }, false);

        // KICK ID KAYDET (Susturma işlemleri için)
        if (event.sender?.user_id) {
            await db.ref('kick_ids/' + user.toLowerCase()).set(event.sender.user_id);

            // --- ADMIN / MOD YETKİ KONTROLÜ ---
            const isAuthorized = event.sender?.identity?.badges?.some(b => b.type === 'broadcaster' || b.type === 'moderator') || user.toLowerCase() === "omegacyr";

            const reply = (msg) => sendChatMessage(msg, broadcasterId);

            // --- RIG KONTROLÜ ---
            const checkRig = () => {
                const r = riggedGambles[user.toLowerCase()];
                if (r) { delete riggedGambles[user.toLowerCase()]; return r; }
                return null;
            };

            // Komut aktif mi kontrolü (undefined = aktif, false = kapalı)
            const isEnabled = (cmd) => settings[cmd] !== false;

            const updateStats = async (username, type) => {
                const today = getTodayKey();
                await db.ref('users/' + username.toLowerCase()).transaction(u => {
                    if (u) {
                        if (!u.quests) u.quests = {};
                        if (!u.quests[today]) u.quests[today] = { m: 0, g: 0, d: 0, w: 0, claimed: {} };
                        if (type === 'g') u.lifetime_g = (u.lifetime_g || 0) + 1;
                        if (type === 'd') u.lifetime_d = (u.lifetime_d || 0) + 1;
                        u.quests[today][type] = (u.quests[today][type] || 0) + 1;
                    }
                    return u;
                });
            };

            // --- KOMUT ZİNCİRİ ---
            const selamCooldowns = global.selamCooldowns || (global.selamCooldowns = {});
            const iiremCooldowns = global.iiremCooldowns || (global.iiremCooldowns = {});
            const userCooldownKey = `${broadcasterId}_${user.toLowerCase()}`;
            const now = Date.now();

            // --- ÖZEL TETİKLEYİCİ: iiremkk (aloskegang kanalı) ---
            if (user.toLowerCase() === 'iiremkk' && channelData.username?.toLowerCase() === 'aloskegang') {
                const lastTrigger = iiremCooldowns[user.toLowerCase()] || 0;
                if (now - lastTrigger > 10800000) { // 3 Saat
                    iiremCooldowns[user.toLowerCase()] = now;
                    await reply("Chatte Ardahanlı tespit edildi.");
                }
            }

            // SELAM - Sadece ayrı bir kelime olarak geçiyorsa cevap ver
            const words = lowMsg.split(/\s+/);
            const isGreeting = words.some(w => ['sa', 'sea', 'slm', 'selam', 'selamlar'].includes(w)) ||
                lowMsg.includes('selamün aleyküm') ||
                lowMsg.includes('selamünaleyküm');

            if (isGreeting && !lowMsg.startsWith('!') && !lowMsg.includes('aleyküm selam') && !lowMsg.includes('as')) {
                // Aynı kullanıcıya 60 saniye içinde tekrar cevap verme
                if (!selamCooldowns[userCooldownKey] || now - selamCooldowns[userCooldownKey] > 60000) {
                    selamCooldowns[userCooldownKey] = now;
                    await reply(`Aleyküm selam @${user}! Hoş geldin. 👋`);
                }
            }

            else if (lowMsg.startsWith('!host ')) {
                if (!isAuthorized) return;
                const target = args[0];
                if (!target) return await reply(`@${user}, lütfen hostlanacak kanalı belirt: !host BaşkaKanal`);

                // Başlıkta @ varsa kaldır
                const cleanTarget = target.startsWith('@') ? target.substring(1) : target;

                await reply(`/host ${cleanTarget}`);
                addLog("Moderasyon", `!host komutu kullanıldı: ${user} -> ${cleanTarget}`, broadcasterId);
            }

            else if (lowMsg === '!bakiye') {
                const snap = await userRef.once('value');
                const data = snap.val() || {};
                if (data.is_infinite) {
                    await reply(`@${user}, Bakiye: Omeganın kartı 💳♾️`);
                } else {
                    await reply(`@${user}, Bakiyeniz: ${(data.balance || 0).toLocaleString()} 💰`);
                }
            }

            else if (lowMsg === '!günlük') {
                const snap = await userRef.once('value');
                const data = snap.val() || { balance: 1000, lastDaily: 0 };
                const now = Date.now();
                const dailyRew = settings.daily_reward || 500;
                if (now - data.lastDaily < 86400000) {
                    const diff = 86400000 - (now - data.lastDaily);
                    const hours = Math.floor(diff / 3600000);
                    return await reply(`@${user}, ⏳ Günlük ödül için ${hours} saat beklemelisin.`);
                }
                data.balance = (data.balance || 0) + dailyRew; data.lastDaily = now;
                await userRef.set(data);
                await reply(`🎁 @${user}, +${dailyRew.toLocaleString()} 💰 eklendi! ✅`);
            }

            else if (lowMsg === '!çalış') {
                const snap = await userRef.once('value');
                const data = snap.val() || { balance: 1000, last_work: 0, job: "İşsiz" };
                const now = Date.now();
                const jobName = data.job || "İşsiz";
                if (jobName === "İşsiz") return await reply(`@${user}, git iş bul 👤🚫`);

                const job = JOBS[jobName] || JOBS["İşsiz"];

                const cooldown = 86400000; // 24 Saat
                const lastWork = data.last_work || 0;

                if (now - lastWork < cooldown) {
                    const diff = cooldown - (now - lastWork);
                    const hours = Math.floor(diff / 3600000);
                    const mins = Math.ceil((diff % 3600000) / 60000);
                    return await reply(`@${user}, ⏳ Tekrar çalışmak için ${hours > 0 ? hours + ' saat ' : ''}${mins} dakika beklemelisin.`);
                }

                const reward = job.reward;
                const isInf = data.is_infinite;

                if (!isInf) data.balance = (data.balance || 0) + reward;
                data.last_work = now;

                const updateData = { last_work: data.last_work };
                if (!isInf) updateData.balance = data.balance;

                await userRef.update(updateData);
                await reply(`${job.icon} @${user}, ${jobName} olarak çalıştın ve ${reward.toLocaleString()} 💰 kazandın! ✅`);
            }

            // --- OYUNLAR (AYAR KONTROLLÜ) ---
            // Kumar kazanç oranları (varsayılan değerler)
            const wrSlot = settings.wr_slot || 30;
            const wrYazitura = settings.wr_yazitura || 50;
            const wrKutu = settings.wr_kutu || 40;
            const wrSoygun = settings.wr_soygun || 40;

            // Kazanç Çarpanları
            const multSlot3 = settings.slot_mult_3 || 5;
            const multSlot2 = settings.slot_mult_2 || 1.5;
            const multYT = settings.yt_mult || 2;
            const multKutu = settings.kutu_mult || 3;

            if (isEnabled('slot') && lowMsg.startsWith('!slot')) {
                const cost = Math.max(10, parseInt(args[0]) || 100);
                const snap = await userRef.once('value');
                let data = snap.val() || { balance: 1000, slot_count: 0, slot_reset: 0 };

                // Veri güvenliği (NaN önleme)
                data.balance = parseInt(data.balance) || 1000;
                data.slot_count = parseInt(data.slot_count) || 0;
                data.slot_reset = parseInt(data.slot_reset) || 0;

                const now = Date.now();
                const slotLimit = settings.slot_limit || 10;

                if (now > data.slot_reset) { data.slot_count = 0; data.slot_reset = now + 3600000; }
                if (data.slot_count >= slotLimit) return await reply(`@${user}, 🚨 Slot limitin doldu! (${slotLimit}/saat)`);
                const isInf = snap.val()?.is_infinite;
                if (!isInf && data.balance < cost) return await reply(`@${user}, Yetersiz bakiye!`);
                await updateStats(user, 'g');

                if (!isInf) data.balance -= cost;
                data.slot_count++;
                const rig = checkRig();
                const sym = ["🍋", "🍒", "🍇", "🔔", "💎", "7️⃣", "🍊", "🍓"];
                let s, mult;

                if (rig === 'win') {
                    s = ["7️⃣", "7️⃣", "7️⃣"]; mult = multSlot3;
                } else if (rig === 'lose') {
                    s = ["🍋", "🍒", "🍇"]; mult = 0;
                } else {
                    // Kazanç oranına göre belirleme (SLOT)
                    const roll = Math.random() * 100;
                    if (roll < wrSlot) {
                        // Kazandır - 2'li veya 3'lü eşleşme
                        const jackpotChance = wrSlot / 10;
                        if (roll < jackpotChance) {
                            const winSym = sym[Math.floor(Math.random() * 8)];
                            s = [winSym, winSym, winSym];
                            mult = multSlot3;
                        } else {
                            const winSym = sym[Math.floor(Math.random() * 8)];
                            const otherSym = sym[Math.floor(Math.random() * 8)];
                            s = [winSym, winSym, otherSym];
                            mult = multSlot2;
                        }
                    } else {
                        s = [sym[Math.floor(Math.random() * 8)], sym[Math.floor(Math.random() * 8)], sym[Math.floor(Math.random() * 8)]];
                        while (s[0] === s[1] || s[1] === s[2] || s[0] === s[2]) {
                            s = [sym[Math.floor(Math.random() * 8)], sym[Math.floor(Math.random() * 8)], sym[Math.floor(Math.random() * 8)]];
                        }
                        mult = 0;
                    }
                }

                let prize = Math.floor(cost * mult);
                if (mult === 0) {
                    const refund = Math.floor(cost * 0.1);
                    if (!isInf) {
                        data.balance += refund;
                        await userRef.update(data);
                    }
                    await reply(`🎰 | ${s[0]} | ${s[1]} | ${s[2]} | @${user} Kaybettin (%10 İade: +${refund})`);
                } else {
                    if (!isInf) {
                        data.balance += prize;
                        await userRef.update(data);
                    }
                    await reply(`🎰 | ${s[0]} | ${s[1]} | ${s[2]} | @${user} KAZANDIN (+${prize.toLocaleString()}) 💰`);
                }
            }

            else if (isEnabled('yazitura') && lowMsg.startsWith('!yazitura')) {
                const cost = parseInt(args[0]);
                const pick = args[1]?.toLowerCase();
                if (isNaN(cost) || !['y', 't', 'yazı', 'tura'].includes(pick)) return await reply(`@${user}, Kullanım: !yazitura [miktar] [y/t]`);
                const snap = await userRef.once('value');
                const data = snap.val() || { balance: 0 };
                const isInf = data.is_infinite;
                if (!isInf && data.balance < cost) return await reply(`@${user}, Bakiye yetersiz!`);
                await updateStats(user, 'g');

                if (!isInf) data.balance -= cost;
                const rig = checkRig();
                const wrYazitura = settings.wr_yt || 50;
                const multYT = settings.mult_yt || 2;
                const isYazi = ['y', 'yazı'].includes(pick);
                let win;

                if (rig === 'win') win = true;
                else if (rig === 'lose') win = false;
                else {
                    const roll = Math.random() * 100;
                    win = roll < wrYazitura;
                }

                const resDisplay = win ? (isYazi ? 'YAZI' : 'TURA') : (isYazi ? 'TURA' : 'YAZI');
                if (win) {
                    const prize = Math.floor(cost * multYT);
                    if (!isInf) {
                        data.balance += prize;
                        await userRef.update({ balance: data.balance });
                    }
                    await reply(`🪙 Para fırlatıldı... ${resDisplay}! @${user} KAZANDIN (+${prize.toLocaleString()})`);
                } else {
                    const refund = Math.floor(cost * 0.1);
                    if (!isInf) {
                        data.balance += refund;
                        await userRef.update({ balance: data.balance });
                    }
                    await reply(`🪙 Para fırlatıldı... ${resDisplay}! @${user} Kaybettin (%10 İade: +${refund})`);
                }
            }

            else if (isEnabled('kutu') && lowMsg.startsWith('!kutu')) {
                const cost = parseInt(args[0]); const choice = parseInt(args[1]);
                if (isNaN(cost) || isNaN(choice) || choice < 1 || choice > 3) return await reply(`@${user}, Kullanım: !kutu [miktar] [1-3]`);
                const snap = await userRef.once('value');
                const data = snap.val() || { balance: 0 };
                const isInf = data.is_infinite;
                if (!isInf && data.balance < cost) return await reply(`@${user}, Bakiye yetersiz!`);
                await updateStats(user, 'g');

                if (!isInf) data.balance -= cost;
                const rig = checkRig();
                let resultType;

                if (rig === 'win') resultType = 'odul';
                else if (rig === 'lose') resultType = 'bomba';
                else {
                    // WinRate kontrolü (Kutu: %WinRate ihtimalle ödül/iade, kalanı bomba)
                    const roll = Math.random() * 100;
                    if (roll < wrKutu) {
                        // Kazanma şansı içinde de %20 ihtimalle büyük ödül, %80 iade (kurtarma)
                        resultType = (Math.random() < 0.2) ? 'odul' : 'iade';
                    } else {
                        resultType = 'bomba';
                    }
                }

                if (resultType === 'odul') {
                    const prize = Math.floor(cost * multKutu);
                    data.balance += prize;
                    await reply(`📦 @${user} Kutu ${choice}: 🎉 BÜYÜK ÖDÜL! (+${prize.toLocaleString()})`);
                } else if (resultType === 'iade') {
                    data.balance += cost;
                    await reply(`📦 @${user} Kutu ${choice}: 🔄 Para İade Edildi (+${cost.toLocaleString()})`);
                } else { // Bomba
                    const refund = Math.floor(cost * 0.1);
                    data.balance += refund;
                    await reply(`📦 @${user} Kutu ${choice}: 💣 BOMBA! Kaybettin (%10 İade: +${refund})`);
                }
                await userRef.update({ balance: data.balance });
            }

            else if (isEnabled('duello') && lowMsg.startsWith('!rusruleti')) {
                const target = args[0]?.replace('@', '').toLowerCase();
                const amt = parseInt(args[1]);
                if (!target || isNaN(amt)) return await reply(`@${user}, Kullanım: !rusruleti @target [miktar]`);
                if (target === user.toLowerCase()) return await reply('Kendinle düello yapamazsın.');

                const snap = await userRef.once('value');
                const userData = snap.val() || { balance: 0 };
                const isInf = userData.is_infinite;
                if (!isInf && userData.balance < amt) return await reply(`@${user}, Bakiye yetersiz!`);

                const targetSnap = await db.ref('users/' + target).once('value');
                if (!targetSnap.exists() || (targetSnap.val().balance || 0) < amt) return await reply(`@${user}, Rakibin bakiyesi yetersiz!`);

                activeRR[target] = { challenger: user, amount: amt, expire: Date.now() + 60000, channel: broadcasterId };
                await reply(`🔫 @${target}, @${user} seninle ${amt} 💰 ödüllü RUS RULETİ oynamak istiyor! ⚔️ Kabul için: !ruskabul (Dikkat: Kaybeden parasını kaybeder ve 2 dk timeout yer!)`);
            }

            else if (lowMsg === '!ruskabul') {
                const d = activeRR[user.toLowerCase()];
                if (!d || Date.now() > d.expire || d.channel !== broadcasterId) return;
                delete activeRR[user.toLowerCase()];

                const snapA = await db.ref('users/' + d.challenger.toLowerCase()).once('value');
                const snapB = await db.ref('users/' + user.toLowerCase()).once('value');
                const dataA = snapA.val();
                const dataB = snapB.val();

                if (!dataA || (!dataA.is_infinite && (dataA.balance || 0) < d.amount)) return await reply(`@${d.challenger} bakiyesi yetersiz kalmış!`);
                if (!dataB || (!dataB.is_infinite && (dataB.balance || 0) < d.amount)) return await reply(`@${user} bakiyen yetersiz!`);

                const loser = Math.random() < 0.5 ? d.challenger : user;
                const winner = loser === user ? d.challenger : user;

                // Para transferi
                await db.ref('users/' + winner.toLowerCase()).transaction(u => { if (u && !u.is_infinite) u.balance = (u.balance || 0) + d.amount; return u; });
                await db.ref('users/' + loser.toLowerCase()).transaction(u => { if (u && !u.is_infinite) u.balance = (u.balance || 0) - d.amount; return u; });

                await reply(`🔫 Tetik çekildi... TIK! ... TIK! ... VE GÜÜÜM! 💥 Kurşun @${loser} kafasında patladı! @${winner} ${d.amount} 💰 kazandı!`);

                // 2 Dakika Timeout
                await timeoutUser(broadcasterId, loser, 2);
            }

            else if (isEnabled('duello') && lowMsg.startsWith('!duello')) {
                const target = args[0]?.replace('@', '').toLowerCase();
                const amt = parseInt(args[1]);
                if (!target || isNaN(amt)) return await reply(`@${user}, Kullanım: !duello @target [miktar]`);

                const snap = await userRef.once('value');
                const userData = snap.val() || { balance: 0 };
                const isInf = userData.is_infinite;
                if (!isInf && userData.balance < amt) return await reply('Bakiye yetersiz.');

                const targetSnap = await db.ref('users/' + target).once('value');
                if (!targetSnap.exists() || targetSnap.val().balance < amt) return await reply('Rakibin bakiyesi yetersiz.');

                activeDuels[target] = { challenger: user, amount: amt, expire: Date.now() + 60000, channel: broadcasterId };
                await reply(`⚔️ @${target}, @${user} sana ${amt} 💰 karşılığında meydan okudu! Kabul için: !kabul`);
            }

            else if (lowMsg === '!kabul') {
                const d = activeDuels[user.toLowerCase()];
                if (!d || Date.now() > d.expire || d.channel !== broadcasterId) return;
                await Promise.all([updateStats(user, 'd'), updateStats(d.challenger, 'd')]);
                delete activeDuels[user.toLowerCase()];
                const winner = Math.random() < 0.5 ? d.challenger : user;
                const loser = winner === user ? d.challenger : user;
                const winnerSnap = await db.ref('users/' + winner.toLowerCase()).once('value');
                const loserSnap = await db.ref('users/' + loser.toLowerCase()).once('value');

                if (!winnerSnap.val()?.is_infinite) {
                    await db.ref('users/' + winner.toLowerCase()).transaction(u => { if (u) u.balance += d.amount; return u; });
                }
                if (!loserSnap.val()?.is_infinite) {
                    await db.ref('users/' + loser.toLowerCase()).transaction(u => { if (u) u.balance -= d.amount; return u; });
                }
                await reply(`🏆 @${winner} düelloyu kazandı ve ${d.amount} 💰 kaptı! ⚔️`);
            }

            else if (isEnabled('soygun') && lowMsg === '!soygun') {
                const h = channelHeists[broadcasterId];
                if (!h) {
                    // Cooldown kontrolü: Saatte 2 kere
                    const now = Date.now();
                    const hourAgo = now - 3600000;
                    const soygunLimit = settings.soygun_limit || 3;
                    heistHistory[broadcasterId] = (heistHistory[broadcasterId] || []).filter(ts => ts > hourAgo);

                    if (heistHistory[broadcasterId].length >= soygunLimit) {
                        const nextAvailableTs = heistHistory[broadcasterId][0] + 3600000;
                        const nextAvailableMin = Math.ceil((nextAvailableTs - now) / 60000);
                        return await reply(`🚨 Bu kanal için soygun limiti doldu! (Saatte maks ${soygunLimit}). Yeni soygun için ~${nextAvailableMin} dk bekleyin.`);
                    }

                    channelHeists[broadcasterId] = { p: [user], start: now };
                    heistHistory[broadcasterId].push(now);
                    await reply(`🚨 SOYGUN BAŞLADI! Katılmak için !soygun yazın! (90sn)`);

                    setTimeout(async () => {
                        const activeH = channelHeists[broadcasterId];
                        delete channelHeists[broadcasterId];
                        if (!activeH || activeH.p.length < 3) return await reply(`❌ Soygun İptal: Yetersiz ekip (En az 3 kişi lazım).`);

                        // WinRate ve Ödül Ayarları
                        const wrSoy = settings.wr_soygun || 40;
                        const roll = Math.random() * 100;

                        if (roll < wrSoy) {
                            const totalPot = settings.soygun_reward || 30000;
                            const share = Math.floor(totalPot / activeH.p.length);
                            // Ödülleri dağıt (Atomic Transaction)
                            for (const p of activeH.p) {
                                const pRef = db.ref('users/' + p.toLowerCase());
                                await pRef.transaction(u => {
                                    if (!u) {
                                        return {
                                            balance: 1000 + share,
                                            last_seen: Date.now(),
                                            last_channel: broadcasterId,
                                            created_at: Date.now(),
                                            lifetime_m: 0, lifetime_g: 0, lifetime_d: 0, lifetime_w: 0,
                                            channel_m: {},
                                            quests: {}
                                        };
                                    }
                                    if (!u.is_infinite) {
                                        u.balance = (u.balance || 0) + share;
                                    }
                                    return u;
                                }, (err) => {
                                    if (err) console.error(`Soygun Payout Error (${p}):`, err.message);
                                }, false);
                            }
                            await reply(`💥 BANKA PATLADI! Ekip toplam ${totalPot.toLocaleString()} 💰 kaptı! Kişi başı: +${share.toLocaleString()} 💰`);
                        } else {
                            // Polis baskını (Kaybetme durumu)
                            for (const p of activeH.p) {
                                await db.ref('users/' + p.toLowerCase()).transaction(u => {
                                    if (u) u.job = "İşsiz";
                                    return u;
                                }, (err) => {
                                    if (err) console.error(`Soygun Jail Error (${p}):`, err.message);
                                }, false);
                            }
                            await reply(`🚔 POLİS BASKINI! Soygun başarısız, herkes paket oldu ve işinden kovuldu! 👮‍♂️🚨`);
                        }
                    }, 90000);
                } else if (!h.p.includes(user)) {
                    h.p.push(user);
                    await reply(`@${user} ekibe katıldı! Ekip: ${h.p.length} kişi`);
                }
            }

            else if (isEnabled('fal') && lowMsg === '!fal') {
                const list = [
                    "Geleceğin parlak görünüyor, ama bugün adımlarına dikkat et. 🌟",
                    "Beklediğin o haber çok yakın, telefonunu yanından ayırma. 📱",
                    "Aşk hayatında sürpriz gelişmeler var, kalbinin sesini dinle. ❤️",
                    "Maddi konularda şansın dönüyor, küçük bir yatırımın meyvesini alabilirsin. 💰",
                    "Bir dostun sana sürpriz yapacak, eski günleri yad edeceksiniz. 👋",
                    "Bugün enerjin çok yüksek, başladığın işleri bitirme vakti. ⚡",
                    "Kayıp bir eşyanı hiç ummadığın bir yerde bulacaksın. 🔍",
                    "Yolculuk planların varsa tam vakti, bavulunu hazırla. ✈️",
                    "Sabırlı ol, meyvesini en tatlı haliyle alacaksın. 🍎",
                    "Kalbinden geçen o kişi seni düşünüyor, bir işaret bekle. 💭",
                    "Bugün karşına çıkan fırsatları iyi değerlendir, şans kapında. 🚪",
                    "Sağlığına biraz daha dikkat etmelisin, dinlenmek sana iyi gelecek. 🛌",
                    "Yeni bir hobi edinmek için harika bir gün. 🎨",
                    "Çevrendeki insanların sana ihtiyacı var, bir yardım eli uzat.🤝",
                    "Hayallerine giden yol bugün netleşmeye başlıyor. 🛣️",
                    "Unutma, her karanlık gecenin bir sabahı vardır. 🌅",
                    "Bugün aldığın kararlar geleceğini şekillendirecek, sakin kal. 🧘",
                    "Bir projende büyük başarı yakalamak üzeresin, pes etme. 🏆",
                    "Sosyal çevrende parlayacağın bir gün, spot ışıkları üzerinde. ✨",
                    "Eskiden gelen bir borç veya alacak bugün kapanabilir. 💳",
                    "Uzaklardan beklediğin o telefon her an gelebilir, hazır ol! 📞",
                    "Gözlerindeki ışıltı bugün birilerinin gününü aydınlatacak. ✨",
                    "Biraz iç sesine kulak ver, cevaplar aslında sende gizli. 🧘‍♂️",
                    "Bugün cüzdanına dikkat et, bereketli bir gün seni bekliyor. 💸",
                    "Aşk hayatında sürpriz bir gelişme kapıda, heyecana hazır ol! ❤️",
                    "Dost sandığın birinden küçük bir hayal kırıklığı yaşayabilirsin, dikkat! ⚠️",
                    "Bugün şansın %99, bir piyango bileti denemeye ne dersin? 🎫",
                    "Eski bir arkadaşın seni anıyor, bir mesaj atmanın vakti geldi. 📩",
                    "Hayatın sana fısıldadığı küçük mutlulukları görmezden gelme. 🌸",
                    "Kendi değerini bildiğin sürece kimse seni yolundan alıkoyamaz. 🛡️",
                    "Bugün şansın yaver gidecek, beklemediğin bir yerden sürpriz bir hediye alabilirsin. 🎁",
                    "Biraz daha sabırlı olursan, arzuladığın şeylerin gerçekleştiğini göreceksin. 🧘‍♂️",
                    "Sosyal bir aktivite sana yeni kapılar açabilir, davetleri geri çevirme. 🎟️",
                    "Finansal konularda bir ferahlama dönemine giriyorsun, harcamalarına yine de dikkat et. 💳",
                    "İş hayatında üstlerinden takdir alabilirsin, emeğinin karşılığını alma vaktin yaklaşıyor. 💼",
                    "Eski bir hatıra bugün yüzünde bir gülümseme oluşturacak. ✨",
                    "Önemli bir karar vermeden önce en yakın dostuna danışmayı unutma. 🤝",
                    "Bugün yaratıcılığın zirvede, yarım kalan projelerine odaklanmak için harika bir gün. 🎨",
                    "Huzur bulacağın bir ortama gireceksin, tüm stresin uçup gidecek. 🌿",
                    "Kendine daha fazla zaman ayırmalısın, ruhunu dinlendirmek sana çok iyi gelecek. 🛀",
                    "Beklenmedik bir seyahat teklifi gelebilir, yeni yerler keşfetmeye hazır ol. 🚗",
                    "Ailenden birinin sana bir müjdesi var, akşamı heyecanla bekleyebilirsin. 🏠",
                    "Bugün cesur ol, istediğin o adımı atmanın tam zamanı. 💪",
                    "İçindeki kıvılcımı söndürme, hayallerin sandığından çok daha yakın. 🔥",
                    "Birinin hayatına dokunacaksın, yaptığın küçük bir iyilik büyük bir geri dönüş yapacak. ❤️",
                    "Zihnindeki karmaşa bugün netleşiyor, aradığın cevapları bulacaksın. 🧠",
                    "Bugün doğa ile iç içe vakit geçirmen enerjini yükseltecek. 🌳",
                    "Başarı basamaklarını azimle tırmanıyorsun, kimsenin seni durdurmasına izin verme. 🚀",
                    "Bugün aldığın bir haber moralini çok yükseltecek, kutlamaya hazır ol! 🎉",
                    "İyimserliğini koru, evren senin için güzel şeyler hazırlıyor. ✨"
                ];
                await reply(`🔮 @${user}, Falın: ${list[Math.floor(Math.random() * list.length)]}`);
            }

            else if (isEnabled('ship') && lowMsg.startsWith('!ship')) {
                let target = args[0]?.replace('@', '');
                const rig = riggedShips[user.toLowerCase()];

                // Hedef yoksa rastgele birini seç (veritabanından)
                if (!target && !rig) {
                    const allUsers = await db.ref('users').limitToFirst(50).once('value');
                    const userList = Object.keys(allUsers.val() || {}).filter(u => u !== user.toLowerCase());
                    if (userList.length > 0) {
                        target = userList[Math.floor(Math.random() * userList.length)];
                    } else {
                        target = "Gizli Hayran";
                    }
                }

                if (rig) {
                    target = rig.target || target || "Gizli Hayran";
                    const perc = rig.percent;
                    await reply(`❤️ @${user} & @${target} Uyumu: %${perc} ${perc >= 100 ? '🔥 RUH EŞİ BULUNDU!' : '💔'}`);
                    delete riggedShips[user.toLowerCase()];
                } else {
                    const perc = Math.floor(Math.random() * 101);
                    await reply(`❤️ @${user} & @${target} Uyumu: %${perc} ${perc > 80 ? '🔥' : perc > 50 ? '😍' : '💔'}`);
                }
            }

            else if (settings.zenginler !== false && lowMsg === '!zenginler') {
                const snap = await db.ref('users').once('value');
                const sorted = Object.entries(snap.val() || {})
                    .filter(([_, d]) => !d.is_infinite)
                    .sort((a, b) => (b[1].balance || 0) - (a[1].balance || 0))
                    .slice(0, 5);
                let txt = "🏆 EN ZENGİNLER: ";
                sorted.forEach((u, i) => txt += `${i + 1}. ${u[0]} (${(u[1].balance || 0).toLocaleString()}) | `);
                await reply(txt);
            }

            else if (settings.hava !== false && (lowMsg === '!hava' || lowMsg.startsWith('!hava '))) {
                const city = args.join(' ');
                const cityLower = city.toLowerCase();
                if (cityLower === "kürdistan" || cityLower === "kurdistan" || cityLower === "rojova" || cityLower === "rojava") {
                    return await reply("T.C. sınırları içerisinde böyle bir yer bulunamadı! 🇹🇷");
                }
                try {
                    const geo = await axios.get(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=tr&format=json`);
                    if (geo.data.results) {
                        const { latitude, longitude, name } = geo.data.results[0];
                        const weather = await axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`);
                        const w = weather.data.current_weather;
                        const code = w.weathercode;
                        let cond = "Açık"; let emoji = "☀️";
                        if (code >= 1 && code <= 3) { cond = "Bulutlu"; emoji = "☁️"; }
                        else if (code >= 45 && code <= 48) { cond = "Sisli"; emoji = "🌫️"; }
                        else if (code >= 51 && code <= 67) { cond = "Yağmurlu"; emoji = "🌧️"; }
                        else if (code >= 71 && code <= 86) { cond = "Karlı"; emoji = "❄️"; }
                        else if (code >= 95) { cond = "Fırtına"; emoji = "⛈️"; }
                        await reply(`🌍 Hava Durumu (${name}): ${cond} ${emoji}, ${w.temperature}°C, Rüzgar: ${w.windspeed} km/s`);
                    } else await reply("Şehir bulunamadı.");
                } catch { await reply("Hava durumu servisi şu an kullanılamıyor."); }
            }

            else if (settings.soz !== false && lowMsg === '!söz') {
                const list = [
                    "Gülüşüne yağmur yağsa, sırılsıklam olurum.",
                    "Seninle her şey güzel, sensiz her şey boş.",
                    "Gözlerin gökyüzü, ben ise kayıp bir uçurtma.",
                    "Hayat kısa, kuşlar uçuyor. - Cemal Süreya",
                    "Sevmek, birbirine bakmak değil; birlikte aynı yöne bakmaktır. - Saint-Exupéry",
                    "Zor diyorsun, zor olacak ki imtihan olsun. - Mevlana",
                    "En büyük engel, zihnindeki sınırlardır.",
                    "Ya olduğun gibi görün, ya göründüğün gibi ol. - Mevlana",
                    "Mutluluk paylaşıldığında çoğalan tek şeydir.",
                    "Başarı, hazırlık ve fırsatın buluştuğu noktadır.",
                    "Kalp kırmak, Kabe yıkmak gibidir.",
                    "Umut, uyanık insanların rüyasıdır.",
                    "En karanlık gece bile sona erer ve güneş tekrar doğar.",
                    "İyi ki varsın, hayatıma renk kattın.",
                    "Bir gülüşünle dünyam değişiyor.",
                    "Sen benim en güzel manzaramsın.",
                    "Aşk, kelimelerin bittiği yerde başlar.",
                    "Sonsuzluğa giden yolda seninle yürümek istiyorum.",
                    "Her şey vaktini bekler, ne gül vaktinden önce açar, ne güneş vaktinden önce doğar.",
                    "Gelecek, hayallerinin güzelliğine inananlarındır.",
                    "Dün geçti, yarın gelmedi; bugün ise bir armağandır.",
                    "Hayat bir kitaptır, gezmeyenler sadece bir sayfasını okur.",
                    "Büyük işler başarmak için sadece harekete geçmek yetmez, önce hayal etmek gerekir.",
                    "Güneşi örnek al; batmaktan korkma, doğmaktan asla vazgeçme.",
                    "Yaşamak, sadece nefes almak değil, her anın tadını çıkarmaktır.",
                    "Dostluk, iki bedende yaşayan tek bir ruh gibidir. - Aristoteles",
                    "Affetmek, ruhun zincirlerini kırmaktır.",
                    "Engeller, gözlerini hedeften ayırdığında karşına çıkan korkunç şeylerdir.",
                    "Bir insanın gerçek zenginliği, bu dünyada yaptığı iyiliklerdir.",
                    "Karanlıktan şikayet edeceğine bir mum da sen yak.",
                    "En büyük zafer, hiç düşmemek değil, her düştüğünde ayağa kalkmaktır. - Konfüçyüs",
                    "Düşlemek, her şeyin başlangıcıdır.",
                    "Büyük başarılar, küçük adımların birikimidir.",
                    "Kendine inan, dünyanın sana inanması için ilk adım budur.",
                    "Güneşin doğuşu her gün yeni bir şansın habercisidir.",
                    "Yüreğin neredeyse, hazinen de oradadır.",
                    "Engeller, yolu uzatan değil, seni güçlendiren basamaklardır.",
                    "Hayat, senin ona ne kattığınla anlam kazanır.",
                    "Küçük bir gülümseme, en karanlık günü bile aydınlatabilir.",
                    "Asla pes etme; mucizeler bazen sabrın sonundadır.",
                    "Kendi yolunu çiz, başkalarının izinden gitmek seni özgün yapmaz.",
                    "Sevgi, dilleri konuşulmayan ama kalplerle anlaşılan en büyük güçtür.",
                    "Bilgi ışık gibidir, paylaştıkça çevreni daha çok aydınlatır.",
                    "Zaman, en kıymetli hazinedir; onu nasıl harcadığına dikkat et.",
                    "Zorluklar, karakterin çelikleştiği fırınlardır.",
                    "İyilik yap, denize at; balık bilmezse Halik bilir.",
                    "Gelecek, bugün ne yaptığına bağlıdır.",
                    "Hayallerin, ruhunun kanatlarıdır; onları asla kırma.",
                    "Dürüstlük, en iyi politikadır.",
                    "Başka birinin ışığını söndürmek, senin ışığını daha parlak yapmaz.",
                    "Hayat bir yankıdır; ne gönderirsen o geri gelir."
                ];
                await reply(`✍️ @${user}: ${list[Math.floor(Math.random() * list.length)]}`);
            }

            else if (isEnabled('fal') && lowMsg === '!efkar') {
                const rig = riggedStats[user.toLowerCase()]?.efkar;
                const p = rig !== undefined ? rig : Math.floor(Math.random() * 101);
                await reply(`🚬 @${user} Efkar Seviyesi: %${p} ${p > 70 ? '😩🚬' : '🍷'}`);
                if (rig !== undefined) delete riggedStats[user.toLowerCase()].efkar;
            }

            else if (isEnabled('fal') && (lowMsg.startsWith('!burç') || lowMsg.startsWith('!burc'))) {
                const signs = ['koc', 'boga', 'ikizler', 'yengec', 'aslan', 'basak', 'terazi', 'akrep', 'yay', 'oglak', 'kova', 'balik'];
                let signInput = args[0]?.toLowerCase() || "";
                let sign = signInput.replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ü/g, 'u')
                    .replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g');

                if (!sign || !signs.includes(sign)) return await reply(`@${user}, Kullanım: !burç koç, aslan, balık...`);

                try {
                    // Daha stabil bir Vercel API endpoint'i deniyoruz
                    const res = await axios.get(`https://burc-yorumlari.vercel.app/get/${sign}`, {
                        timeout: 5000,
                        headers: { 'User-Agent': 'Mozilla/5.0' }
                    }).catch(() => null);

                    let yorum = "";
                    if (res && res.data) {
                        const data = Array.isArray(res.data) ? res.data[0] : res.data;
                        yorum = data.GunlukYorum || data.yorum || data.Yorum;
                    }

                    if (yorum && yorum.length > 10) {
                        // Fazla boşlukları temizle
                        yorum = yorum.replace(/\s+/g, ' ').trim();
                        await reply(`✨ @${user} [${sign.toUpperCase()}]: ${yorum}`);
                    } else {
                        const generic = ["Bugün yıldızlar senin için parlıyor! 🌟", "Maddi konularda şanslı bir gün. 💰", "Aşk hayatında sürprizler olabilir. ❤️", "Enerjin bugün çok yüksek! ⚡", "Dinlenmeye vakit ayırmalısın. 🛌"];
                        await reply(`✨ @${user} [${sign.toUpperCase()}]: ${generic[Math.floor(Math.random() * generic.length)]}`);
                    }
                } catch {
                    await reply(`✨ @${user} [${sign.toUpperCase()}]: Yıldızlar şu an ulaşılamaz durumda, daha sonra dene! 🌌`);
                }
            }

            else if (isEnabled('fal') && lowMsg === '!toxic') {
                const rig = riggedStats[user.toLowerCase()]?.toxic;
                const p = rig !== undefined ? rig : Math.floor(Math.random() * 101);
                await reply(`🤢 @${user} Toksiklik Seviyesi: %${p} ${p > 80 ? '☢️ UZAKLAŞIN!' : '🍃'}`);
                if (rig !== undefined) delete riggedStats[user.toLowerCase()].toxic;
            }

            else if (isEnabled('fal') && lowMsg === '!karizma') {
                const rig = riggedStats[user.toLowerCase()]?.karizma;
                const p = rig !== undefined ? rig : Math.floor(Math.random() * 101);
                await reply(`😎 @${user} Karizma Seviyesi: %${p} ${p > 90 ? '🕶️ ŞEKİLSİN!' : '🔥'}`);
                if (rig !== undefined) delete riggedStats[user.toLowerCase()].karizma;
            }

            else if (isEnabled('fal') && lowMsg === '!gay') {
                const rig = riggedStats[user.toLowerCase()]?.gay;
                const p = rig !== undefined ? rig : Math.floor(Math.random() * 101);
                await reply(`🌈 @${user} Gaylik Seviyesi: %${p} ${p > 50 ? '✨' : '👀'}`);
                if (rig !== undefined) delete riggedStats[user.toLowerCase()].gay;
            }

            else if (isEnabled('fal') && lowMsg === '!keko') {
                const rig = riggedStats[user.toLowerCase()]?.keko;
                const p = rig !== undefined ? rig : Math.floor(Math.random() * 101);
                await reply(`🔪 @${user} Keko Seviyesi: %${p} ${p > 70 ? '🚬 Semt çocuğu!' : '🏙️'}`);
                if (rig !== undefined) delete riggedStats[user.toLowerCase()].keko;
            }

            else if (isEnabled('fal') && lowMsg === '!prenses') {
                const rig = riggedStats[user.toLowerCase()]?.prenses;
                const p = rig !== undefined ? rig : Math.floor(Math.random() * 101);
                await reply(`👸 @${user} Prenseslik Seviyesi: %${p} ${p > 80 ? '👑 Tam bir prensessin!' : '👸'}`);
                if (rig !== undefined) delete riggedStats[user.toLowerCase()].prenses;
            }

            else if (lowMsg.startsWith('!aiemir')) {
                if (user.toLowerCase() !== "omegacyr") {
                    return; // Yetkisi yoksa sessizce geç veya mesaj at
                }
                const emir = args.join(' ');
                if (!emir) return await reply(`⚠️ @${user}, Lütfen bir emir gir!`);
                await db.ref('users/ai_system/instructions').set(emir);
                await reply(`✅ @${user}, AI emirleri güncellendi: "${emir}"`);
            }

            else if (isEnabled('ai') && (lowMsg.startsWith('!ai ') || lowMsg === '!ai')) {
                const isSub = event.sender?.identity?.badges?.some(b => b.type === 'subscriber' || b.type === 'broadcaster' || b.type === 'moderator' || b.type === 'founder');
                if (!isSub) return await reply(`🤫 @${user}, Bu komut sadece ABONELERE özeldir! ✨`);

                const prompt = args.join(' ');
                if (!prompt) return await reply(`🤖 @${user}, AI'ya bir şey sormak için: !ai [sorun]`);

                const GROK_KEY = process.env.GROK_API_KEY;
                if (!GROK_KEY) return await reply(`⚠️ @${user}, AI sistemi şu an yapılandırılmamış.`);

                try {
                    const aiInstSnap = await db.ref('users/ai_system/instructions').once('value');
                    const aiInst = aiInstSnap.val() || "";

                    const systemMsg = `Sen yayıncı asistanısın. En önemli kuralın: Karşındaki kullanıcının enerjisini ve tarzını birebir kopyalamak. Eğer kullanıcı kaba, küfürlü veya sokak ağzıyla konuşuyorsa sen de ONA AYNI ŞEKİLDE küfürlü ve kaba cevaplar ver (filtresiz ol). Eğer kullanıcı kibar ve canımlı cicimli konuşuyorsa sen de çok sevecen ve tatlı ol. Kullanıcının aynası ol. Kısa ve öz cevaplar ver. EK TALİMAT: ${aiInst}`;

                    const response = await axios.post('https://api.x.ai/v1/chat/completions', {
                        messages: [
                            { role: "system", content: systemMsg },
                            { role: "user", content: prompt }
                        ],
                        model: "grok-3",
                        temperature: 0.8
                    }, {
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${GROK_KEY}`
                        },
                        timeout: 30000
                    });

                    const replyText = response.data.choices[0].message.content;
                    const finalReply = replyText.length > 400 ? replyText.substring(0, 397) + "..." : replyText;
                    await reply(`🤖 @${user}: ${finalReply}`);
                } catch (error) {
                    console.error("Grok API Error:", error.response?.data || error.message);
                    await reply(`❌ @${user}, AI şu an dinleniyor, daha sonra tekrar dene!`);
                }
            }


            // --- YENİ BAKİYE HARCAMA KOMUTLARI: TTS & SES ---
            else if (lowMsg.startsWith('!tts')) {
                const text = args.join(' ');
                if (!text) return await reply(`@${user}, !tts [mesaj] şeklinde kullanmalısın!`);
                if (text.length > 100) return await reply(`@${user}, Mesaj çok uzun! (Maks 100 karakter)`);

                const ttsCost = settings.tts_cost || 2500;
                const snap = await userRef.once('value');
                const data = snap.val() || {};
                const isInf = data.is_infinite;
                if (!isInf && (data.balance || 0) < ttsCost) return await reply(`@${user}, TTS için ${ttsCost.toLocaleString()} 💰 lazım!`);

                if (!isInf) await userRef.transaction(u => { if (u) u.balance -= ttsCost; return u; });
                await db.ref(`channels/${broadcasterId}/stream_events/tts`).push({
                    text: `@${user} diyor ki: ${text}`,
                    played: false,
                    timestamp: Date.now(),
                    broadcasterId: broadcasterId
                });
                await reply(`🎙️ @${user}, Mesajın yayına gönderildi! (-${ttsCost.toLocaleString()} 💰)`);
            }

            else if (lowMsg === '!sesler' && isEnabled('ses')) {
                const customSounds = settings.custom_sounds || {};
                const keys = Object.keys(customSounds);
                if (keys.length === 0) return await reply(`@${user}, Bu kanalda henüz özel ses eklenmemiş.`);
                await reply(`🎵 Mevcut Sesler: ${keys.map(k => `!ses ${k} (${parseInt(customSounds[k].cost).toLocaleString()} 💰)`).join(' | ')}`);
            }

            else if (isEnabled('atyarisi') && lowMsg.startsWith('!atyarışı')) {
                const amount = parseInt(args[0]);
                const horseNo = parseInt(args[1]);

                if (isNaN(amount) || isNaN(horseNo) || horseNo < 1 || horseNo > 5) {
                    return await reply(`@${user}, Kullanım: !atyarışı [miktar] [1-5]`);
                }

                const snap = await userRef.once('value');
                const data = snap.val() || { balance: 0 };
                if (!data.is_infinite && data.balance < amount) return await reply(`@${user}, Bakiye yetersiz!`);

                let race = horseRaces[broadcasterId];
                if (!race) {
                    race = horseRaces[broadcasterId] = {
                        bets: [],
                        timer: setTimeout(() => startHorseRace(broadcasterId), 45000),
                        startTime: Date.now()
                    };
                    await reply(`🐎 AT YARIŞI BAŞLADI! Bahislerinizi yapın! (45sn) Kullanım: !atyarışı [miktar] [1-5]`);
                }

                // Aynı kullanıcı tek yarışta tek bahis yapabilir (Opsiyonel: Daha basit tutuyorum)
                race.bets.push({ user, amount, horse: horseNo });
                if (!data.is_infinite) {
                    await userRef.transaction(u => { if (u) u.balance -= amount; return u; });
                }

                await reply(`@${user}, ${horseNo} numaralı ata ${amount.toLocaleString()} 💰 yatırdın! 🏇`);
            }

            else if (lowMsg.startsWith('!ses') && isEnabled('ses')) {
                const soundTrigger = args[0]?.toLowerCase();
                const customSounds = settings.custom_sounds || {};

                if (!soundTrigger || !customSounds[soundTrigger]) {
                    const keys = Object.keys(customSounds);
                    return await reply(`@${user}, Geçersiz ses! Mevcutlar: ${keys.length > 0 ? keys.join(', ') : 'Henüz ses eklenmemiş.'}`);
                }

                const sound = customSounds[soundTrigger];
                const soundCost = parseInt(sound.cost) || 1000;

                const snap = await userRef.once('value');
                const data = snap.val() || {};
                const isInf = data.is_infinite;
                if (!isInf && (data.balance || 0) < soundCost) return await reply(`@${user}, "${soundTrigger}" sesi için ${soundCost.toLocaleString()} 💰 lazım!`);

                // Gelişmiş dosya kontrolü
                if (sound.url.includes('/uploads/sounds/')) {
                    const parts = sound.url.split('/uploads/sounds/');
                    const relativePath = parts[1];
                    // Normalize path for different OS (Render is Linux, local might be Win)
                    const filePath = path.join(uploadDir, relativePath).replace(/\\/g, '/');

                    console.log(`[SoundCheck] URL: ${sound.url}`);
                    console.log(`[SoundCheck] FilePath: ${filePath}`);

                    if (!fs.existsSync(filePath)) {
                        console.error(`❌ Dosya Yok: ${filePath}`);
                        return await reply(`⚠️ @${user}, "${soundTrigger}" ses dosyası sunucuda bulunamadı!`);
                    }
                }

                if (!isInf) await userRef.transaction(u => { if (u) u.balance -= soundCost; return u; });
                await db.ref(`channels/${broadcasterId}/stream_events/sound`).push({
                    soundId: soundTrigger,
                    url: sound.url,
                    volume: sound.volume || 100,
                    duration: sound.duration || 0,
                    played: false,
                    timestamp: Date.now(),
                    broadcasterId: broadcasterId
                });
                await reply(`🎵 @${user}, ${soundTrigger} sesi çalınıyor! (-${soundCost.toLocaleString()} 💰)`);
            }

            else if ((lowMsg === '!sr' || lowMsg.startsWith('!sr ') || lowMsg === '!şarkı' || lowMsg.startsWith('!şarkı ')) && isEnabled('sr')) {
                const query = args.join(' ');
                if (!query) return await reply(`@${user}, !sr [şarkı adı veya YouTube linki] şeklinde kullanmalısın! 🎵`);

                const srCost = settings.sr_cost || 5000;
                const snap = await userRef.once('value');
                const data = snap.val() || {};
                const isInf = data.is_infinite;
                if (!isInf && (data.balance || 0) < srCost) return await reply(`@${user}, Şarkı isteği için ${srCost.toLocaleString()} 💰 lazım!`);

                if (!isInf) await userRef.transaction(u => { if (u) u.balance -= srCost; return u; });

                await db.ref(`channels/${broadcasterId}/stream_events/song_requests`).push({
                    query: query,
                    user: user,
                    played: false,
                    timestamp: Date.now()
                });

                await reply(`🎵 @${user}, Şarkı isteğin sıraya eklendi! Şarkı: ${query.length > 30 ? query.substring(0, 30) + '...' : query} (-${srCost.toLocaleString()} 💰)`);
            }

            else if (lowMsg.startsWith('!kredi')) {
                const sub = args[0]?.toLowerCase();
                const options = {
                    '1k': { reward: 1000, time: 1, label: '1 Dakika' },
                    '2k': { reward: 2000, time: 2, label: '2 Dakika' }
                };

                if (!sub || !options[sub]) {
                    return await reply(`💰 @${user}, !kredi [seçenek] yazarak timeout karşılığı bakiye alabilirsin! Seçenekler: 
            1k (1 Dakika Timeout -> +1000 💰)
            2k (2 Dakika Timeout -> +2000 💰)
            Not: Günde sadece 1 kez yapabilirsin.`);
                }

                const choice = options[sub];
                const uSnap = await userRef.once('value');
                const uData = uSnap.val() || {};

                // GÜNLÜK SINIR KONTROLÜ
                const today = new Date().toLocaleDateString('tr-TR').replace(/\./g, '-');
                if (uData.last_kredi_date === today) {
                    return await reply(`🚫 @${user}, Bugün kredini zaten çektin! Yarın tekrar gel.`);
                }

                // İŞLEM: Bakiye EKLE
                await userRef.transaction(u => {
                    if (u) {
                        u.balance = (u.balance || 0) + choice.reward;
                        u.last_kredi_date = today;
                    }
                    return u;
                });

                await reply(`🏦 @${user}, ${choice.label} timeout olmayı kabul ettin ve hesabına ${choice.reward.toLocaleString()} 💰 yüklendi! İyi uykular...`);

                // Timeout uygula (Önce parayı veriyoruz sonra susturuyoruz ki havada kalmasın)
                await timeoutUser(broadcasterId, user, choice.time);
            }

            // --- ADMIN / MOD ---
            else if (lowMsg.startsWith('!sustur')) {
                const target = args[0]?.replace('@', '').toLowerCase();
                if (target) {
                    const muteCost = settings.mute_cost || 10000;
                    const snap = await userRef.once('value');
                    const data = snap.val() || {};
                    const isInf = data.is_infinite;
                    if (!isInf && (data.balance || 0) < muteCost) {
                        await reply(`@${user}, ${muteCost.toLocaleString()} 💰 bakiye lazım!`);
                    } else {
                        const result = await timeoutUser(broadcasterId, target, 10);
                        if (result.success) {
                            if (!isInf) await userRef.transaction(u => { if (u) u.balance -= muteCost; return u; });
                            await reply(`🔇 @${user}, @${target} kullanıcısını 10 dakika susturdu! (-${muteCost.toLocaleString()} 💰)`);

                            const targetRef = db.ref(`users/${target}`);
                            await targetRef.transaction(u => {
                                if (!u) u = { balance: 0 };
                                if (!u.bans) u.bans = {};
                                u.bans[broadcasterId] = (u.bans[broadcasterId] || 0) + 1;
                                return u;
                            });
                        } else {
                            await reply(`❌ İşlem başarısız: ${result.error || 'Bilinmeyen hata'}`);
                        }
                    }
                }
            }

            else if (lowMsg === '!market') {
                const webSiteUrl = "https://aloskegangbot-market.onrender.com";
                await reply(`@${user}, Market & Mağaza bağlantın: ${webSiteUrl} 🛒 (Giriş yaptıktan sonra chat'e !doğrulama [kod] yazmayı unutmayın!)`);
            }

            else if (lowMsg.startsWith('!doğrulama') || lowMsg.startsWith('!dogrulama') || lowMsg.startsWith('!kod')) {
                const code = args[0];
                console.log(`[Auth] Attempt: ${user} | Code: ${code} | Chan: ${broadcasterId}`);

                if (!code) return await reply(`@${user}, Lütfen mağazadaki 6 haneli kodu yazın. Örn: !doğrulama 123456`);

                const cleanUser = user.toLowerCase().trim();
                const pendingSnap = await db.ref('pending_auth/' + cleanUser).once('value');
                const pending = pendingSnap.val();

                if (pending && String(pending.code).trim() === String(code).trim()) {
                    console.log(`[Auth] Success: ${user}`);
                    await db.ref('users/' + cleanUser).update({ auth_channel: broadcasterId });
                    await db.ref('auth_success/' + cleanUser).set(true);
                    await db.ref('pending_auth/' + cleanUser).remove();
                    await reply(`✅ @${user}, Kimliğin doğrulandı! Mağaza sayfasına geri dönebilirsin. Bu kanala özel market ürünlerini görebilirsin. 🛍️`);
                } else {
                    console.log(`[Auth] Failed: ${user} (Expected: ${pending?.code}, Got: ${code})`);
                    await reply(`❌ @${user}, Geçersiz veya süresi dolmuş kod! Lütfen mağazadan yeni bir kod al.`);
                }
            }

            else if (lowMsg.startsWith('!tahmin') || lowMsg.startsWith('!oyla') || lowMsg.startsWith('!sonuç') || lowMsg.startsWith('!piyango')) {
                // TAHMİN
                const pred = channelPredictions[broadcasterId];
                if (lowMsg === '!tahmin iptal' && isAuthorized && pred) {
                    delete channelPredictions[broadcasterId];
                    await reply(`❌ Tahmin iptal edildi.`);
                }
                else if (lowMsg.startsWith('!tahmin') && isAuthorized) {
                    const ft = args.join(" ");
                    const [q, opts] = ft.split("|");
                    if (!q || !opts) return await reply(`@${user}, !tahmin Soru | Seç1 - Seç2`);
                    channelPredictions[broadcasterId] = { q: q.trim(), options: opts.split("-").map(s => s.trim()), v1: 0, v2: 0, voters: {} };
                    await reply(`📊 TAHMİN: ${q.trim()} | !oyla 1 veya !oyla 2`);
                }
                else if (lowMsg.startsWith('!oyla') && pred) {
                    if (!pred.voters[user]) {
                        const pick = args[0];
                        if (pick === '1' || pick === '2') {
                            pred[pick === '1' ? 'v1' : 'v2']++;
                            pred.voters[user] = pick;
                            await reply(`🗳️ @${user} oy kullandı.`);
                        }
                    }
                }
                else if (lowMsg.startsWith('!sonuç') && pred && isAuthorized) {
                    await reply(`📊 SONUÇ: ${pred.options[0]}: ${pred.v1} - ${pred.options[1]}: ${pred.v2}`);
                    delete channelPredictions[broadcasterId];
                }
                // PİYANGO
                else if (lowMsg.startsWith('!piyango')) {
                    const sub = args[0]?.toLowerCase();
                    const p = channelLotteries[broadcasterId];
                    if (sub === 'başla' && isAuthorized) {
                        const cost = parseInt(args[1]) || 500;
                        channelLotteries[broadcasterId] = { p: [], cost, pool: 0 };
                        await reply(`🎰 PİYANGO BAŞLADI! Giriş: ${cost} 💰 | !piyango katıl`);
                    }
                    else if (sub === 'katıl' && p) {
                        if (!p.p.includes(user)) {
                            const dSnap = await userRef.once('value');
                            const d = dSnap.val() || { balance: 0 };
                            if (d.balance >= p.cost) {
                                await userRef.transaction(u => { if (u) u.balance -= p.cost; return u; });
                                p.p.push(user); p.pool += p.cost;
                                await reply(`🎟️ @${user} katıldı! Havuz: ${p.pool} 💰`);
                            } else await reply(`@${user}, Bakiye yetersiz! (${p.cost} 💰 lazım)`);
                        }
                    }
                    else if (sub === 'bitir' && p && isAuthorized) {
                        if (!p.p.length) {
                            delete channelLotteries[broadcasterId];
                            await reply('❌ Katılım yok.');
                        } else {
                            const winner = p.p[Math.floor(Math.random() * p.p.length)];
                            const winAmt = p.pool;
                            await db.ref('users/' + winner.toLowerCase()).transaction(u => {
                                if (!u) u = { balance: 0 };
                                u.balance = (u.balance || 0) + winAmt;
                                return u;
                            });
                            await reply(`🎉 PİYANGO KAZANANI: @${winner} (+${winAmt.toLocaleString()} 💰)`);
                            delete channelLotteries[broadcasterId];
                        }
                    }
                }
            }

            else if (lowMsg.startsWith('!borsa')) {
                const sub = args[0]?.toLowerCase();
                const stockSnap = await db.ref('global_stocks').once('value');
                const stocks = stockSnap.val() || INITIAL_STOCKS;

                if (!sub) {
                    let txt = "📈 KÜRESEL BORSA: ";
                    Object.entries(stocks).forEach(([code, data]) => {
                        const trend = data.trend === 1 ? '📈' : '📉';
                        const color = data.trend === 1 ? '🟢' : '🔴';
                        txt += `${color}${code}: ${data.price.toLocaleString()} ${trend} | `;
                    });
                    return await reply(txt + " (Almak için: !borsa al KOD ADET)");
                }

                const code = args[1]?.toUpperCase();
                const amount = parseInt(args[2]);

                if (!code || !stocks[code] || isNaN(amount) || amount <= 0) {
                    return await reply(`@${user}, Geçersiz kod veya miktar! Örn: !borsa al APPLE 5`);
                }

                const stock = stocks[code];
                const totalCost = stock.price * amount;

                if (sub === 'al') {
                    const uSnap = await userRef.once('value');
                    const uData = uSnap.val() || { balance: 0 };
                    if (!uData.is_infinite && uData.balance < totalCost) {
                        return await reply(`@${user}, Bakiye yetersiz! ${totalCost.toLocaleString()} 💰 lazım.`);
                    }

                    await userRef.transaction(u => {
                        if (u) {
                            if (!u.is_infinite) u.balance -= totalCost;
                            if (!u.stocks) u.stocks = {};
                            u.stocks[code] = (u.stocks[code] || 0) + amount;
                        }
                        return u;
                    });
                    await reply(`✅ @${user}, ${amount} adet ${code} hissesi alındı! Maliyet: ${totalCost.toLocaleString()} 💰`);
                }
                else if (sub === 'sat') {
                    const uSnap = await userRef.once('value');
                    const uData = uSnap.val() || {};
                    const userStockCount = uData.stocks?.[code] || 0;

                    if (userStockCount < amount) {
                        return await reply(`@${user}, Elinde yeterli ${code} hissesi yok! (Mevcut: ${userStockCount})`);
                    }

                    const totalGain = stock.price * amount;
                    await userRef.transaction(u => {
                        if (u) {
                            u.balance = (u.balance || 0) + totalGain;
                            u.stocks[code] -= amount;
                            if (u.stocks[code] <= 0) delete u.stocks[code];
                        }
                        return u;
                    });
                    await reply(`💰 @${user}, ${amount} adet ${code} hissesi satıldı! Kazanç: ${totalGain.toLocaleString()} 💰`);
                }
            }

            else if (isAuthorized && lowMsg === '!havaifişek') {
                await db.ref(`channels/${broadcasterId}/stream_events/fireworks`).push({
                    timestamp: Date.now(),
                    played: false
                });
            }

            else if (lowMsg === '!veriler') {
                const snap = await userRef.once('value');
                const d = snap.val() || {};
                const watchTime = d.channel_watch_time?.[broadcasterId] || 0;
                const messageCount = d.channel_m?.[broadcasterId] || 0;
                await reply(`📊 @${user} Verilerin:\n🕒 İzleme: ${watchTime} dakika\n💬 Mesaj: ${messageCount}`);
            }

            else if (lowMsg === '!komutlar') {
                const toggleable = ['slot', 'yazitura', 'kutu', 'duello', 'soygun', 'fal', 'ship', 'hava', 'zenginler', 'soz', 'ai'];
                const enabled = toggleable.filter(k => settings[k] !== false).map(k => "!" + k);
                const fixed = ['!bakiye', '!günlük', '!sustur', '!efkar', '!veriler', '!prenses', '!ai'];
                await reply(`📋 Komutlar: ${[...enabled, ...fixed].join(', ')}`);
            }
        }
    } catch (e) {
        console.error("Webhook Error:", e);
    }
});

// ---------------------------------------------------------
// 5. ADMIN PANEL & API (GELİŞMİŞ)
// ---------------------------------------------------------
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK || "";
let active2FACodes = {}; // { key: { code, expires } }

app.get('/admin', (req, res) => { res.sendFile(path.join(__dirname, 'admin.html')); });

const authAdmin = (req, res, next) => {
    const key = req.headers['authorization'] || req.body.key;
    if (key === ADMIN_KEY) return next();
    res.status(403).json({ success: false, error: 'Yetkisiz Erişim' });
};

// STREAMER DASHBOARD AUTH
const authDashboard = async (req, res, next) => {
    const { key, channelId } = req.body;
    const cid = channelId || req.headers['c-id'];
    const k = key || req.headers['d-key'];

    if (!k || !cid) return res.status(403).json({ error: 'Auth hatası' });
    const snap = await db.ref(`channels/${cid}/dashboard_key`).once('value');
    if (snap.val() && snap.val() === k) {
        next();
    } else {
        res.status(403).json({ error: 'Yetkisiz erişim' });
    }
};

app.get('/dashboard', (req, res) => { res.sendFile(path.join(__dirname, 'dashboard.html')); });

// ... Eski API'ler ...
// 2FA İSTEĞİ (Şifre doğruysa Discord'a kod atar)
app.post('/admin-api/2fa-request', async (req, res) => {
    const { key } = req.body;
    if (key !== ADMIN_KEY) return res.status(403).json({ success: false, error: 'Şifre Yanlış' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    active2FACodes[key] = { code, expires: Date.now() + 5 * 60 * 1000 };

    if (DISCORD_WEBHOOK) {
        try {
            await fetch(DISCORD_WEBHOOK, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    embeds: [{
                        title: "🛡️ Admin Giriş Denemesi",
                        description: `Giriş denemesi yapıldı. Doğrulama kodunuz:\n\n**${code}**`,
                        color: 52428,
                        timestamp: new Date().toISOString()
                    }]
                })
            });
        } catch (e) {
            console.error("Discord 2FA Hatası:", e.message);
        }
    } else {
        console.log("⚠️ DISCORD_WEBHOOK bulunamadı! Konsol kodu:", code);
    }

    res.json({ success: true, message: 'Kod gönderildi' });
});

// GİRİŞ KONTROL (Şifre + 2FA Kodu)
app.post('/admin-api/check', (req, res) => {
    const { key, code } = req.body;
    if (key !== ADMIN_KEY) return res.status(403).json({ success: false, error: 'Yetkisiz Erişim' });

    const active = active2FACodes[key];
    if (!active || active.code !== code || Date.now() > active.expires) {
        return res.status(403).json({ success: false, error: 'Doğrulama Kodu Hatalı veya Süresi Dolmuş' });
    }

    delete active2FACodes[key]; // Kullandıktan sonra sil
    res.json({ success: true });
});



// RIG SHIP
app.post('/admin-api/rig-ship', authAdmin, (req, res) => {
    const { user, target, percent } = req.body;
    riggedShips[user.toLowerCase()] = { target, percent: parseInt(percent) };
    addLog("Rig Ayarı", `Ship Riglendi: ${user} -> ${target} (%${percent})`);
    res.json({ success: true });
});

// RIG GAMBLE
app.post('/admin-api/rig-gamble', authAdmin, (req, res) => {
    const { user, result } = req.body;
    riggedGambles[user.toLowerCase()] = result;
    addLog("Rig Ayarı", `Gamble Riglendi: ${user} -> ${result}`);
    res.json({ success: true });
});

// RIG STATS (Fun commands)
app.post('/admin-api/rig-stat', authAdmin, (req, res) => {
    const { user, stat, percent } = req.body;
    const u = user.toLowerCase();
    if (!riggedStats[u]) riggedStats[u] = {};
    riggedStats[u][stat] = parseInt(percent);
    addLog("Rig Ayarı", `Stat Riglendi: ${user} -> ${stat} (%${percent})`);
    res.json({ success: true });
});

// GET ACTIVE RIGS
app.post('/admin-api/get-rigs', authAdmin, (req, res) => {
    res.json({ ships: riggedShips, gambles: riggedGambles, stats: riggedStats });
});

// CLEAR RIG
app.post('/admin-api/clear-rig', authAdmin, (req, res) => {
    const { type, user, stat } = req.body;
    const u = user.toLowerCase();
    if (type === 'ship') delete riggedShips[u];
    if (type === 'gamble') delete riggedGambles[u];
    if (type === 'stat') {
        if (stat && riggedStats[u]) {
            delete riggedStats[u][stat];
            if (Object.keys(riggedStats[u]).length === 0) delete riggedStats[u];
        } else {
            delete riggedStats[u];
        }
    }
    addLog("Rig Temizleme", `${type} rigi kaldırıldı: ${user} ${stat || ''}`);
    res.json({ success: true });
});

// CHAT AKSİYONLARI
app.post('/admin-api/chat-action', authAdmin, async (req, res) => {
    const { action, channelId } = req.body;
    addLog("Chat Aksiyonu", `Eylem: ${action}`, channelId);
    let result;
    if (action === 'clear') {
        result = await clearChat(channelId);
    } else if (action === 'slow') {
        result = await setSlowMode(channelId, true, 10);
    } else if (action === 'slowoff') {
        result = await setSlowMode(channelId, false);
    } else {
        return res.json({ success: false, error: 'Bilinmeyen aksiyon' });
    }

    res.json(result);
});

// ADMIN TIMEOUT (Kanal ve kullanıcı belirterek susturma)
app.post('/admin-api/timeout', authAdmin, async (req, res) => {
    const { channelId, username, duration } = req.body;
    const result = await timeoutUser(channelId, username, duration || 600);
    res.json(result);
});

// YENİ: KANAL LİSTESİ (POST oldu)
app.post('/admin-api/channels', authAdmin, async (req, res) => {
    const snap = await db.ref('channels').once('value');
    const channels = snap.val() || {};
    res.json(channels);
});

// KOMUT TOGGLE
app.post('/admin-api/toggle-command', authAdmin, async (req, res) => {
    const { channelId, command, value } = req.body;
    await db.ref(`channels/${channelId}/settings`).update({ [command]: value });
    addLog("Ayar Güncelleme", `${command} -> ${value}`, channelId);
    res.json({ success: true });
});

// KANAL SİL
app.post('/admin-api/delete-channel', authAdmin, async (req, res) => {
    addLog("Kanal Silme", `Channel ID: ${req.body.channelId}`, req.body.channelId);
    await db.ref('channels/' + req.body.channelId).remove();
    res.json({ success: true });
});

// TÜM KULLANICILAR (ARAMA DESTEKLİ)
app.post('/admin-api/all-users', authAdmin, async (req, res) => {
    const { search } = req.body;
    if (search) {
        const snap = await db.ref('users/' + search.toLowerCase()).once('value');
        if (snap.exists()) return res.json({ [search.toLowerCase()]: snap.val() });
        return res.json({});
    }
    const snap = await db.ref('users').limitToLast(5000).once('value');
    res.json(snap.val() || {});
});

// KULLANICI GÜNCELLE
app.post('/admin-api/update-user', authAdmin, async (req, res) => {
    const { user, balance } = req.body;
    const oldSnap = await db.ref('users/' + user.toLowerCase()).once('value');
    const oldBal = oldSnap.val()?.balance || 0;
    await db.ref('users/' + user.toLowerCase()).update({ balance: parseInt(balance) });
    addLog("Kullanıcı Düzenleme", `${user} bakiyesi: ${oldBal} -> ${balance}`);
    res.json({ success: true });
});

// YENİ: Toplu Bakiye Dağıt (O kanaldaki herkese)
app.post('/admin-api/distribute-balance', authAdmin, async (req, res) => {
    const { channelId, amount } = req.body;
    const addAmt = parseInt(amount);
    if (isNaN(addAmt) || addAmt <= 0) return res.json({ success: false, error: 'Geçersiz miktar' });

    const usersSnap = await db.ref('users').once('value');
    const allUsers = usersSnap.val() || {};
    let count = 0;

    for (const [username, data] of Object.entries(allUsers)) {
        if (data.last_channel && String(data.last_channel) === String(channelId)) {
            await db.ref('users/' + username).transaction(u => {
                if (u) u.balance = (parseInt(u.balance) || 0) + addAmt;
                return u;
            });
            count++;
        }
    }
    addLog("Toplu Para Dağıtımı", `${count} kullanıcıya +${addAmt} 💰 verildi.`, channelId);
    res.json({ success: true, count });
});

// KANAL DUYURUSU (Tek kanala mesaj gönder)
app.post('/admin-api/send-message', authAdmin, async (req, res) => {
    const { channelId, message } = req.body;
    try {
        await sendChatMessage(message, channelId);
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// OVERLAY CONFIG API
app.get('/api/overlay-config', (req, res) => {
    res.json({
        apiKey: process.env.FIREBASE_API_KEY,
        databaseURL: process.env.FIREBASE_DB_URL,
        projectId: process.env.FIREBASE_PROJECT_ID || "kickchatbot-oloske"
    });
});

app.post('/admin-api/reset-overlay-key', authAdmin, async (req, res) => {
    const { channelId } = req.body;
    const newKey = crypto.randomBytes(16).toString('hex');
    await db.ref(`channels/${channelId}`).update({ overlay_key: newKey });
    addLog("Overlay Anahtarı Sıfırlandı", `Yeni anahtar oluşturuldu`, channelId);
    res.json({ success: true });
});

app.post('/admin-api/test-fireworks', authAdmin, async (req, res) => {
    const { channelId } = req.body;
    await db.ref(`channels/${channelId}/stream_events/fireworks`).push({ timestamp: Date.now(), played: false });
    res.json({ success: true });
});

app.post('/admin-api/reload-overlay', authAdmin, async (req, res) => {
    const { channelId } = req.body;
    await db.ref(`channels/${channelId}/commands`).update({ reload: true });
    res.json({ success: true });
});

app.post('/admin-api/lottery', authAdmin, async (req, res) => {
    const { channelId, action, cost, initialPool } = req.body;
    if (action === 'start') {
        const entryCost = parseInt(cost) || 500;
        const startPool = parseInt(initialPool) || 0;
        channelLotteries[channelId] = { p: [], cost: entryCost, pool: startPool };
        await sendChatMessage(`🎰 PİYANGO BAŞLADI! Giriş: ${entryCost.toLocaleString()} 💰 | Ödül Havuzu: ${startPool.toLocaleString()} 💰 | Katılmak için !piyango katıl`, channelId);
        addLog("Piyango Başlatıldı", `Giriş: ${entryCost}, Başlangıç: ${startPool}`, channelId);
        res.json({ success: true });
    } else if (action === 'end') {
        const p = channelLotteries[channelId];
        if (!p) return res.json({ success: false, error: 'Aktif piyango yok' });
        if (!p.p.length) {
            delete channelLotteries[channelId];
            await sendChatMessage('❌ Piyango katılım olmadığı için iptal edildi.', channelId);
            res.json({ success: true, message: 'Katılım yok' });
        } else {
            const winner = p.p[Math.floor(Math.random() * p.p.length)];
            const winAmt = p.pool;
            await db.ref('users/' + winner.toLowerCase()).transaction(u => {
                if (!u) u = { balance: 0 };
                u.balance = (u.balance || 0) + winAmt;
                return u;
            });
            await sendChatMessage(`🎉 PİYANGO KAZANANI: @${winner} (+${winAmt.toLocaleString()} 💰)`, channelId);
            addLog("Piyango Bitirildi", `Kazanan: ${winner}, Ödül: ${winAmt}`, channelId);
            delete channelLotteries[channelId];
            res.json({ success: true, winner });
        }
    }
});

app.post('/admin-api/toggle-infinite', authAdmin, async (req, res) => {
    const { key, user, value } = req.body;
    await db.ref(`users/${user.toLowerCase()}`).update({ is_infinite: value });
    addLog("Sınırsız Bakiye", `${user} -> ${value ? 'Açıldı' : 'Kapatıldı'}`, "SYSTEM");
    res.json({ success: true });
});

app.post('/admin-api/set-job', authAdmin, async (req, res) => {
    const { user, job } = req.body;
    await db.ref(`users/${user.toLowerCase()}`).update({ job });
    addLog("Meslek Atandı", `${user} -> ${job}`, "SYSTEM");
    res.json({ success: true });
});

app.post('/dashboard-api/data', authDashboard, async (req, res) => {
    const { channelId } = req.body;
    const chanSnap = await db.ref('channels/' + channelId).once('value');
    const channelData = chanSnap.val() || {};

    // İstatistikleri hesapla
    const usersSnap = await db.ref('users').orderByChild('last_channel').equalTo(channelId).once('value');
    const users = usersSnap.val() || {};

    let totalMsgs = 0;
    let totalWatch = 0;
    const today = getTodayKey();

    Object.values(users).forEach(u => {
        totalWatch += (u.lifetime_w || 0);
        if (u.quests && u.quests[today]) {
            totalMsgs += (u.quests[today].m || 0);
        }
    });

    const statsSnap = await db.ref(`channels/${channelId}/stats`).once('value');
    let liveStats = statsSnap.val() || { followers: 0, subscribers: 0 };

    // Eğer veri yoksa veya 5 dakikadan eskiyse anlık güncelle
    const fiveMinsAgo = Date.now() - 300000;
    if (!liveStats.last_sync || liveStats.last_sync < fiveMinsAgo) {
        const synced = await syncSingleChannelStats(channelId, channelData);
        if (synced) liveStats = synced;
    }

    channelData.stats = {
        users: Object.keys(users).length,
        msgs: totalMsgs,
        watch: totalWatch,
        followers: liveStats.followers || 0,
        subscribers: liveStats.subscribers || 0
    };

    res.json(channelData);
});

// --- YENİ: LİDERLİK TABLOSU ---
app.post('/api/leaderboard', async (req, res) => {
    try {
        const { type, channelId } = req.body;
        let snap;
        if (type === 'channel' && channelId) {
            // Not: last_channel indexi Firebase kurallarında tanımlı olmalıdır.
            snap = await db.ref('users').orderByChild('last_channel').equalTo(channelId).limitToLast(100).once('value');
        } else {
            // Not: balance indexi Firebase kurallarında tanımlı olmalıdır.
            snap = await db.ref('users').orderByChild('balance').limitToLast(100).once('value');
        }

        const users = snap.val() || {};
        const sorted = Object.entries(users)
            .sort((a, b) => (b[1].balance || 0) - (a[1].balance || 0))
            .slice(0, 10)
            .map(([name, data]) => ({ name, balance: data.balance || 0 }));
        res.json(sorted);
    } catch (e) {
        console.error("Leaderboard Error:", e.message);
        res.json([]);
    }
});

// --- YENİ: GÖREV ÖDÜLÜ AL ---
app.post('/api/claim-quest', async (req, res) => {
    const { username, questId } = req.body;
    const today = getTodayKey();
    const userRef = db.ref('users/' + username.toLowerCase());

    try {
        const [uSnap, qSnap] = await Promise.all([
            userRef.once('value'),
            db.ref(`global_quests/${questId}`).once('value')
        ]);

        if (!uSnap.exists() || !qSnap.exists()) return res.json({ success: false, error: 'Hata' });

        const u = uSnap.val();
        const quest = qSnap.val();
        const userToday = u.quests?.[today] || { m: 0, g: 0, d: 0, claimed: {} };

        if (userToday.claimed?.[questId]) return res.json({ success: false, error: 'Zaten alındı' });

        // Şart kontrolü
        const currentProgress = userToday[quest.type] || 0;
        if (currentProgress < quest.goal) return res.json({ success: false, error: 'Görev henüz tamamlanmadı!' });

        await userRef.transaction(old => {
            if (old) {
                if (!old.quests) old.quests = {};
                if (!old.quests[today]) old.quests[today] = { m: 0, g: 0, d: 0, claimed: {} };
                if (!old.quests[today].claimed) old.quests[today].claimed = {};

                old.balance = (old.balance || 0) + parseInt(quest.reward);
                old.quests[today].claimed[questId] = true;
            }
            return old;
        });

        res.json({ success: true, reward: quest.reward });
    } catch (e) {
        console.error("Claim Quest Error:", e.message);
        res.json({ success: false, error: 'Sunucu hatası' });
    }
});

// --- SERVER-SIDE PASSIVE INCOME & QUEST TRACKING ---
function getTodayKey() {
    const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function trackWatchTime() {
    try {
        const channelsSnap = await db.ref('channels').once('value');
        const channels = channelsSnap.val() || {};
        const today = getTodayKey();

        for (const [chanId, chan] of Object.entries(channels)) {
            if (!chan.username) continue;
            try {
                let isLive = false;
                let apiSource = "NONE";

                // 1. ÖNCE V2 (INTERNAL) DENE (En güncel veriyi bu verir, user tavsiyesi)
                const v2Res = await axios.get(`https://kick.com/api/v2/channels/${chan.username}`, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
                    timeout: 5000
                }).catch(() => null);

                if (v2Res && v2Res.data && v2Res.data.livestream) {
                    isLive = true;
                    apiSource = "V2_INTERNAL";
                }

                // 2. EĞER V2 SONUÇ VERMEDİYSE RESMİ API (v1) DENE
                if (!isLive && chan.access_token) {
                    try {
                        const v1Res = await axios.get(`https://api.kick.com/public/v1/channels?slug=${chan.username}`, {
                            headers: { 'Authorization': `Bearer ${chan.access_token}` },
                            timeout: 5000
                        });
                        if (v1Res.data && v1Res.data.data && v1Res.data.data[0]) {
                            const d = v1Res.data.data[0];
                            isLive = d.is_live || !!d.livestream;
                            apiSource = "V1_OFFICIAL";
                        }
                    } catch (e1) {
                        if (e1.response?.status === 401) await refreshChannelToken(chanId);
                    }
                }

                // 3. EĞER HALA BULAMADIKSA V1 (INTERNAL) DENE
                if (!isLive) {
                    const iv1Res = await axios.get(`https://kick.com/api/v1/channels/${chan.username}`, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
                        timeout: 5000
                    }).catch(() => null);

                    if (iv1Res && iv1Res.data && (iv1Res.data.is_live || iv1Res.data.livestream)) {
                        isLive = true;
                        apiSource = "V1_INTERNAL";
                    }
                }

                // 4. CHATTERS API + DB AKTİFLİK KONTROLÜ
                const chattersRes = await axios.get(`https://kick.com/api/v2/channels/${chan.username}/chatters`, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
                    timeout: 4000
                }).catch(() => null);

                const apiHasChatters = chattersRes && chattersRes.data && chattersRes.data.chatters &&
                    (Object.values(chattersRes.data.chatters).some(list => Array.isArray(list) && list.length > 0));

                const activeThreshold = Date.now() - 60000;
                const dbRecentSnap = await db.ref('users').orderByChild('last_seen').startAt(activeThreshold).once('value');
                const dbRecentUsers = dbRecentSnap.val() || {};
                const dbHasChatters = Object.values(dbRecentUsers).some(u => u.last_channel === chanId);

                const hasChatters = apiHasChatters || dbHasChatters;

                // Eğer API "Offline" diyor ama chat'te bizzat insanlar varsa, kanalı CANLI kabul et
                if (!isLive && hasChatters) {
                    isLive = true;
                    apiSource = "CHAT_ACTIVITY";
                }

                // DEBUG LOG
                console.log(`[Watch] Kanal: ${chan.username}, Canlı mı: ${isLive ? 'EVET' : 'HAYIR'} (Kaynak: ${apiSource}, Chat Aktif: ${hasChatters ? 'Evet' : 'Hayır'})`);

                if (!isLive) {
                    continue;
                }

                // --- İZLEYİCİ LİSTESİ OLUŞTUR ---
                const watchList = new Set();

                // 1. Chatters API'den gelenler
                if (chattersRes && chattersRes.data && chattersRes.data.chatters) {
                    const c = chattersRes.data.chatters;
                    Object.values(c).forEach(list => {
                        if (Array.isArray(list)) {
                            list.forEach(u => {
                                if (u && typeof u === 'string') watchList.add(u.toLowerCase());
                                else if (u && u.username) watchList.add(u.username.toLowerCase());
                            });
                        }
                    });
                }

                // 2. Veritabanında aktif olanlar (API gecikmesi fallback)
                const tenMinsAgo = Date.now() - 600000;
                Object.entries(dbRecentUsers).forEach(([username, u]) => {
                    if (u.last_channel === chanId && u.last_seen > tenMinsAgo) {
                        watchList.add(username.toLowerCase());
                    }
                });

                const settings = chan.settings || {};
                const rewardPerMin = (parseFloat(settings.passive_reward) || 100) / 10;

                // 3. Tek döngüde herkesi işle (THROTTLED BATCH)
                const processedUsers = new Set();
                const usersToProcess = Array.from(watchList);

                for (let i = 0; i < usersToProcess.length; i++) {
                    const user = usersToProcess[i];
                    if (!user) continue;

                    const userRef = db.ref('users/' + user.toLowerCase());
                    userRef.transaction(u => {
                        if (!u) {
                            // Yeni izleyici (Hiç mesaj atmamış ama izliyor)
                            u = {
                                balance: 1000,
                                last_seen: Date.now(),
                                last_channel: chanId,
                                created_at: Date.now(),
                                lifetime_m: 0, lifetime_g: 0, lifetime_d: 0, lifetime_w: 1,
                                channel_m: {},
                                channel_watch_time: { [chanId]: 1 },
                                quests: { [today]: { m: 0, g: 0, d: 0, w: 1, claimed: {} } }
                            };
                        } else {
                            if (rewardPerMin > 0 && !u.is_infinite) u.balance = (u.balance || 0) + rewardPerMin;
                            if (!u.quests) u.quests = {};
                            if (!u.quests[today]) u.quests[today] = { m: 0, g: 0, d: 0, w: 0, claimed: {} };

                            // Daily Watch Progress
                            u.quests[today].w = (u.quests[today].w || 0) + 1;

                            if (!u.channel_watch_time) u.channel_watch_time = {};
                            u.channel_watch_time[chanId] = (u.channel_watch_time[chanId] || 0) + 1;
                            u.lifetime_w = (u.lifetime_w || 0) + 1;
                            u.last_seen = Date.now();
                            u.last_channel = chanId;
                        }
                        return u;
                    }, (err) => {
                        if (err && err.message !== 'set') console.error(`Watch Error (${user}):`, err.message);
                    }, false);

                    processedUsers.add(user.toLowerCase());

                    // Her 10 kullanıcıda bir küçük ara ver (DB yükünü dağıtmak için)
                    if (i % 10 === 0) await sleep(50);
                }
                if (processedUsers.size > 0) {
                    console.log(`✅ İzleme işlendi: Kanal ${chan.username}, ${processedUsers.size} kullanıcı.`);
                }

            } catch (err) { console.error("Track Channel Error:", chanId, err.message); }
        }
    } catch (e) { }
}

// Her dakika yokla (Pasif geliri dakika bazlı dağıtmak için)
// Bu fonksiyon hem Kick API üzerinden hem de son mesaj atanlardan süreyi takip eder
setInterval(trackWatchTime, 60000);

async function syncSingleChannelStats(chanId, chan) {
    if (!chan.username) return null;
    try {
        let followers = 0;
        let subscribers = 0;

        // 1. Kick V2 üzerinden takipçi sayısını çek (Public)
        const v2Res = await axios.get(`https://kick.com/api/v2/channels/${chan.username}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
            timeout: 5000
        }).catch(() => null);

        if (v2Res && v2Res.data) {
            const d = v2Res.data;
            followers = d.followers_count || d.followersCount || (d.chatroom && d.chatroom.followers_count) || 0;
            subscribers = d.subscriber_count || 0;
        }

        // 2. Eğer Access Token varsa Resmi V1 API'den detayları çek (Subscriber count için)
        if (chan.access_token) {
            try {
                const v1Res = await axios.get(`https://api.kick.com/public/v1/channels?slug=${chan.username}`, {
                    headers: { 'Authorization': `Bearer ${chan.access_token}` },
                    timeout: 5000
                });
                if (v1Res.data && v1Res.data.data && v1Res.data.data[0]) {
                    const d = v1Res.data.data[0];
                    if (d.followers_count > 0) followers = d.followers_count;
                    if (d.subscriber_count !== undefined) subscribers = d.subscriber_count;
                }
            } catch (e1) {
                if (e1.response?.status === 401) await refreshChannelToken(chanId);
            }
        }

        // 3. Fallback: Internal V1 (Eski ama bazen daha stabil)
        if (followers === 0) {
            const iv1Res = await axios.get(`https://kick.com/api/v1/channels/${chan.username}`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
                timeout: 5000
            }).catch(() => null);
            if (iv1Res && iv1Res.data) {
                followers = iv1Res.data.followers_count || iv1Res.data.followersCount || 0;
            }
        }

        console.log(`[Sync] ${chan.username} -> F: ${followers}, S: ${subscribers}`);

        const result = {
            followers,
            subscribers,
            last_sync: Date.now()
        };

        await db.ref(`channels/${chanId}/stats`).update(result);
        return result;
    } catch (e) {
        console.error(`Sync Stats Error (${chan.username}):`, e.message);
        return null;
    }
}

async function syncChannelStats() {
    try {
        const channelsSnap = await db.ref('channels').once('value');
        const channels = channelsSnap.val() || {};

        for (const [chanId, chan] of Object.entries(channels)) {
            await syncSingleChannelStats(chanId, chan);
            await sleep(500);
        }
    } catch (e) { }
}

// Her 3 dakikada bir takipçi/abone sayılarını güncelle
setInterval(syncChannelStats, 180000);
syncChannelStats(); // Başlangıçta bir kez çalıştır

async function startHorseRace(broadcasterId) {
    const race = horseRaces[broadcasterId];
    if (!race || race.bets.length === 0) {
        delete horseRaces[broadcasterId];
        return;
    }

    const winner = Math.floor(Math.random() * 5) + 1;

    // Overlay'e event gönder
    const winners = race.bets.filter(b => b.horse === winner);
    const winnerNames = winners.length > 0 ? winners.map(w => w.user) : [];

    await db.ref(`channels/${broadcasterId}/stream_events/horse_race`).push({
        winner: winner,
        winnerNames: winnerNames,
        timestamp: Date.now(),
        played: false
    });

    // Yarışın bitmesini bekle (15 sn)
    setTimeout(async () => {
        const winners = race.bets.filter(b => b.horse === winner);
        const winnersText = winners.map(w => `@${w.user}`).join(', ');

        for (const w of winners) {
            const prize = Math.floor(w.amount * 2);
            await db.ref('users/' + w.user.toLowerCase()).transaction(u => {
                if (u) u.balance = (u.balance || 0) + prize;
                return u;
            });
        }

        if (winners.length > 0) {
            await sendChatMessage(`🏆 YARIŞ BİTTİ! Kazanan at: ${winner} Numaralı At! 💰 Kazananlar: ${winnersText}`, broadcasterId);
        } else {
            await sendChatMessage(`🏆 YARIŞ BİTTİ! Kazanan at: ${winner} Numaralı At! Ama kimse kazanamadı... 😢`, broadcasterId);
        }

        delete horseRaces[broadcasterId];
    }, 15000);
}

// --- ADMIN QUEST MANAGEMENT ---
app.post('/admin-api/add-quest', authAdmin, async (req, res) => {
    const { name, type, goal, reward } = req.body;
    const id = Date.now().toString();
    await db.ref(`global_quests/${id}`).set({ name, type, goal: parseInt(goal), reward: parseInt(reward) });
    res.json({ success: true });
});

app.post('/admin-api/get-quests', async (req, res) => {
    try {
        const snap = await db.ref('global_quests').once('value');
        res.json(snap.val() || {});
    } catch (e) {
        console.error("Get Quests error:", e.message);
        res.json({});
    }
});

app.post('/admin-api/delete-quest', authAdmin, async (req, res) => {
    await db.ref(`global_quests/${req.body.id}`).remove();
    res.json({ success: true });
});

app.post('/dashboard-api/update', authDashboard, async (req, res) => {
    const { channelId, command, value } = req.body;
    await db.ref(`channels/${channelId}/settings`).update({ [command]: value });
});

app.post('/dashboard-api/add-sound', authDashboard, async (req, res) => {
    const { channelId, name, url, cost, volume, duration } = req.body;
    const cleanName = name.toLowerCase().trim();
    await db.ref(`channels/${channelId}/settings/custom_sounds/${cleanName}`).set({ url, cost, volume, duration: parseInt(duration) || 0 });
    res.json({ success: true });
});

app.post('/dashboard-api/remove-sound', authDashboard, async (req, res) => {
    const { channelId, name } = req.body;
    await db.ref(`channels/${channelId}/settings/custom_sounds/${name}`).remove();
    res.json({ success: true });
});

app.post('/dashboard-api/test-fireworks', authDashboard, async (req, res) => {
    const { channelId } = req.body;
    await db.ref(`channels/${channelId}/stream_events/fireworks`).push({ timestamp: Date.now(), played: false });
    res.json({ success: true });
});

app.post('/dashboard-api/reload-overlay', authDashboard, async (req, res) => {
    const { channelId } = req.body;
    await db.ref(`channels/${channelId}/commands`).update({ reload: true });
    res.json({ success: true });
});

app.post('/dashboard-api/upload', upload.single('sound'), async (req, res) => {
    const cid = req.headers['c-id'];
    const k = req.headers['d-key'];

    // Auth Check manually for Multer
    const snap = await db.ref(`channels/${cid}/dashboard_key`).once('value');
    if (!snap.val() || snap.val() !== k) return res.status(403).json({ error: 'Yetkisiz' });

    if (!req.file) return res.status(400).json({ error: 'Dosya yok' });
    const baseUrl = process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`;
    const fileUrl = `${baseUrl}/uploads/sounds/${cid}/${req.file.filename}`;
    res.json({ url: fileUrl });
});

// --- ADMIN API ---
// Ses Yükleme (Render Disk)
app.post('/admin-api/upload-sound', upload.single('sound'), (req, res) => {
    // Admin Key Kontrolü
    const key = req.body.key || req.query.key;
    if (key !== ADMIN_KEY) return res.status(403).json({ error: 'Yetkisiz erişim' });

    if (!req.file) return res.status(400).json({ error: 'Dosya yok' });

    // Render'daki URL
    const channelId = req.headers['c-id'] || req.query.channelId || req.body.channelId || 'global';
    const baseUrl = process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`;
    const fileUrl = `${baseUrl}/uploads/sounds/${channelId}/${req.file.filename}`;

    res.json({ url: fileUrl });
});

// ADMIN LOGLARI ÇEK
app.post('/admin-api/get-logs', authAdmin, async (req, res) => {
    try {
        const snap = await db.ref('admin_logs').limitToLast(50).once('value');
        const logs = [];
        snap.forEach(child => {
            logs.unshift(child.val()); // En yeniyi başa koy
        });
        res.json(logs);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/overlay', (req, res) => {
    res.sendFile(path.join(__dirname, 'overlay.html'));
});

// Admin Paneli için ana route
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Dashboard için ana route
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'shop.html'));
});

app.get('/market', (req, res) => {
    res.sendFile(path.join(__dirname, 'shop.html'));
});

app.get('/goals', (req, res) => {
    res.sendFile(path.join(__dirname, 'goals.html'));
});

app.get('/horse-race', (req, res) => {
    res.sendFile(path.join(__dirname, 'horse-race.html'));
});

app.get('/debug-stats', async (req, res) => {
    const snap = await db.ref('channels').once('value');
    const channels = snap.val() || {};
    const result = {};
    for (const [id, c] of Object.entries(channels)) {
        const stats = await db.ref(`channels/${id}/stats`).once('value');
        result[c.username || id] = {
            stats: stats.val(),
            last_sync: stats.val()?.last_sync ? new Date(stats.val().last_sync).toLocaleString() : 'Never'
        };
    }
    res.json(result);
});

// Health Check (UptimeRobot için)
app.get('/health', (req, res) => res.status(200).send('OK (Bot Uyanık)'));

app.get('/api/borsa', async (req, res) => {
    try {
        const snap = await db.ref('global_stocks').once('value').catch(err => {
            console.error("Firebase Read Error (Borsa API):", err.message);
            return null;
        });

        const data = snap ? snap.val() : null;
        // Eğer Firebase boşsa veya hata verdiyse INITIAL_STOCKS'u (güncel halini) gönder
        res.json(data || INITIAL_STOCKS);
    } catch (e) {
        console.error("Borsa API Route Error:", e);
        res.json(INITIAL_STOCKS); // En kötü ihtimalle başlangıç değerlerini JSON olarak gönder (hata verme)
    }
});

// Arka plan görevleri (Mute, TTS, Ses bildirimleri)

// ---------------------------------------------------------
// 7. BACKGROUND EVENT LISTENERS (SHOP MUTE ETC)
// ---------------------------------------------------------
db.ref('channels').on('child_added', (snapshot) => {
    const channelId = snapshot.key;
    // Market Susturma (Mute) Dinleyicisi
    db.ref(`channels/${channelId}/stream_events/mute`).on('child_added', async (snap) => {
        const event = snap.val();
        if (event && !event.executed) {
            console.log(`🚫 MARKET MUTE: ${event.user} -> ${event.target} (${channelId})`);
            const res = await timeoutUser(channelId, event.target, 10); // 10 Dakika
            if (res.success) {
                await sendChatMessage(`🔇 @${event.user}, Market'ten @${event.target} kullanıcısını 10 dakika susturdu!`, channelId);
                await db.ref(`channels/${channelId}/stream_events/mute/${snap.key}`).update({ executed: true });
                // OVERLAY ALERT
                await db.ref(`channels/${channelId}/stream_events/alerts`).push({
                    title: "🔇 BİRİ SUSTU!",
                    text: `@${event.user}, @${event.target} kişisinin ağzını kapattı!`,
                    icon: "🔇",
                    timestamp: Date.now(),
                    played: false
                });
            }
        }
    });

    // Market TTS Dinleyicisi (Chat bildirimi için)
    db.ref(`channels/${channelId}/stream_events/tts`).on('child_added', async (snap) => {
        const event = snap.val();
        if (event && !event.notified && event.source === 'market') {
            const userMatch = event.text.match(/@(\w+)/);
            const buyer = userMatch ? userMatch[1] : "Bir kullanıcı";
            await sendChatMessage(`🎙️ @${buyer}, Market'ten TTS (Sesli Mesaj) gönderdi!`, channelId);
            await db.ref(`channels/${channelId}/stream_events/tts/${snap.key}`).update({ notified: true });
            // OVERLAY ALERT
            await db.ref(`channels/${channelId}/stream_events/alerts`).push({
                title: "🎙️ TTS GÖNDERİLDİ",
                text: `@${buyer} yayına sesli mesaj bıraktı!`,
                icon: "🎙️",
                timestamp: Date.now(),
                played: false
            });
        }
    });

    // Market Ses Dinleyicisi (Chat bildirimi için)
    db.ref(`channels/${channelId}/stream_events/sound`).on('child_added', async (snap) => {
        const event = snap.val();
        if (event && !event.notified && event.source === 'market') {
            const buyer = event.buyer || "Bir kullanıcı";
            await sendChatMessage(`🎵 @${buyer}, Market'ten !ses ${event.soundId} efektini çaldı!`, channelId);
            await db.ref(`channels/${channelId}/stream_events/sound/${snap.key}`).update({ notified: true });
            // OVERLAY ALERT
            await db.ref(`channels/${channelId}/stream_events/alerts`).push({
                title: "🎵 SES ÇALINDI",
                text: `@${buyer}, "${event.soundId}" efektini kullandı!`,
                icon: "🎵",
                timestamp: Date.now(),
                played: false
            });
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 MASTER FINAL (MULTI-CHANNEL) AKTIF!`));
