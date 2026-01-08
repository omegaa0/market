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

// AI IMAGES TEMP STORAGE
const aiImagesDir = fs.existsSync(persistPath)
    ? path.join(persistPath, 'ai-images')
    : path.join(__dirname, 'uploads', 'ai-images');

if (!fs.existsSync(aiImagesDir)) {
    fs.mkdirSync(aiImagesDir, { recursive: true });
}
app.use('/ai-images', express.static(aiImagesDir));

// Geçici AI resimleri (2 dk sonra silinecek)
const tempAiImages = {};

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

const KICK_CLIENT_ID = process.env.KICK_CLIENT_ID || "01KDQNP2M930Y7YYNM62TVWJCP";
const KICK_CLIENT_SECRET = process.env.KICK_CLIENT_SECRET;
const REDIRECT_URI = "https://aloskegangbot-market.onrender.com/auth/kick/callback";

// ---------------------------------------------------------
// ADMİN KULLANICI SİSTEMİ BAŞLATMA
// ---------------------------------------------------------
async function initAdminUsers() {
    try {
        const adminRef = db.ref('admin_users');
        const snap = await adminRef.once('value');

        const defaultAdmins = {
            "omegacyr": {
                password: "Atgm1974?",
                name: "omegacyr",
                created_at: 1767711297325
            },
            "arven": {
                password: "954687?ğu",
                name: "arven",
                created_at: Date.now()
            }
        };

        if (!snap.exists()) {
            // Hiç admin yoksa oluştur
            await adminRef.set(defaultAdmins);
            console.log("✅ Admin tablosu ilk kez oluşturuldu.");
        } else {
            // Sadece belirli adminleri güncelle/ekle (diğerlerini silme)
            for (const [user, data] of Object.entries(defaultAdmins)) {
                const userSnap = await adminRef.child(user).once('value');
                if (!userSnap.exists()) {
                    await adminRef.child(user).set(data);
                } else {
                    // Sadece şifreyi güncellemek isterseniz:
                    await adminRef.child(user).update({ password: data.password });
                }
            }
            console.log("✅ Mevcut adminler korundu, varsayılan adminler kontrol edildi.");
        }
    } catch (e) {
        console.error("Admin Users Init Error:", e.message);
    }
}
initAdminUsers();

// IP Almak için yardımcı
const getClientIp = (req) => {
    return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
};

// Discord Bildirim Yardımcısı
async function sendDiscordLoginNotify(status, username, ip, details = "") {
    if (!process.env.DISCORD_WEBHOOK) return;
    const color = status === 'success' ? 3066993 : 15158332; // Green or Red
    const title = status === 'success' ? "✅ Başarılı Admin Girişi" : "❌ Hatalı Giriş Denemesi";

    try {
        await axios.post(process.env.DISCORD_WEBHOOK, {
            embeds: [{
                title: title,
                fields: [
                    { name: "Kullanıcı", value: username || "Bilinmiyor", inline: true },
                    { name: "IP Adresi", value: ip, inline: true },
                    { name: "Durum", value: details || (status === 'success' ? "Başarıyla giriş yapıldı" : "Hatalı deneme") }
                ],
                color: color,
                footer: { text: "Admin Panel Güvenliği" },
                timestamp: new Date().toISOString()
            }]
        });
    } catch (e) {
        console.error("Discord Login Notify Error:", e.message);
    }
}

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



// =====================================================
// KICK WEBHOOK SİSTEMİ - Takipçi Bildirimlerini Dinle
// =====================================================

// AI Resim Görüntüleme Sayfası
app.get('/ai-view/:id', (req, res) => {
    const imageId = req.params.id;
    const imageData = tempAiImages[imageId];

    if (!imageData) {
        return res.status(404).send(`
            <!DOCTYPE html>
            <html><head><title>Resim Bulunamadı</title>
            <style>body{font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;background:#1a1a2e;color:#fff;margin:0;}
            .box{text-align:center;padding:40px;background:#16213e;border-radius:16px;}</style></head>
            <body><div class="box"><h1>⏰ Süre Doldu</h1><p>Bu resim artık mevcut değil. AI resimleri 2 dakika sonra silinir.</p></div></body></html>
        `);
    }

    const elapsed = Date.now() - imageData.createdAt;
    const remaining = Math.max(0, Math.floor((120000 - elapsed) / 1000));

    res.send(`
        <!DOCTYPE html>
        <html><head><title>AI Resim - ${imageData.prompt.substring(0, 30)}...</title>
        <meta charset="UTF-8">
        <style>
            body{font-family:'Segoe UI',Arial;display:flex;flex-direction:column;align-items:center;min-height:100vh;background:linear-gradient(135deg,#1a1a2e,#16213e);color:#fff;margin:0;padding:20px;box-sizing:border-box;}
            .container{max-width:600px;width:100%;text-align:center;}
            img{max-width:100%;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,0.5);margin:20px 0;}
            .prompt{background:rgba(255,255,255,0.1);padding:15px 20px;border-radius:10px;font-style:italic;margin:15px 0;}
            .timer{font-size:24px;color:#ff6b6b;margin:10px 0;}
            .info{color:#aaa;font-size:14px;}
            h1{background:linear-gradient(90deg,#667eea,#764ba2);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:28px;}
        </style></head>
        <body>
            <div class="container">
                <h1>🎨 AI Tarafından Üretilen Resim</h1>
                <img src="/ai-images/${imageData.filename}" alt="AI Generated Image">
                <div class="prompt">"${imageData.prompt}"</div>
                <div class="timer">⏳ Kalan süre: <span id="timer">${remaining}</span> saniye</div>
                <div class="info">Oluşturan: @${imageData.createdBy}</div>
            </div>
            <script>
                let remaining = ${remaining};
                const timerEl = document.getElementById('timer');
                setInterval(() => {
                    remaining--;
                    if (remaining <= 0) {
                        location.reload();
                    } else {
                        timerEl.textContent = remaining;
                    }
                }, 1000);
            </script>
        </body></html>
    `);
});

// Webhook Logic moved to /webhook/kick below


// Kick'e Webhook Kaydet (Her kanal için) - RESMİ API FORMAT
// NOT: Webhook URL'si https://kick.com/settings/developer adresinden ayarlanmalı!
async function registerKickWebhook(broadcasterId, accessToken) {
    try {
        console.log(`[Webhook] Kayıt denemesi (Kanal: ${broadcasterId})`);

        // Kick Resmi API - POST /public/v1/events/subscriptions
        const response = await axios.post('https://api.kick.com/public/v1/events/subscriptions', {
            broadcaster_user_id: parseInt(broadcasterId),
            events: [
                { name: 'chat.message.sent', version: 1 },
                { name: 'channel.followed', version: 1 },
                { name: 'channel.subscription.new', version: 1 },
                { name: 'channel.subscription.renewal', version: 1 },
                { name: 'channel.subscription.gifts', version: 1 },
                { name: 'livestream.status.updated', version: 1 }
            ],
            method: 'webhook'
        }, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        console.log(`[Webhook] ✅ Kanal ${broadcasterId} için Kick'e abone olundu.`);

        // Kayıt bilgisini ve Kick'ten gelen subscription ID'leri sakla
        await db.ref(`channels/${broadcasterId}/webhook`).update({
            registered: true,
            last_registration: Date.now(),
            subscription_ids: response.data?.data?.map(s => s.subscription_id) || [],
            last_status: 'SUCCESS'
        });

        return { success: true, data: response.data };
    } catch (e) {
        const errorMsg = e.response?.data?.message || e.response?.data?.error || e.message;
        const statusCode = e.response?.status;

        console.error(`[Webhook Error] ${broadcasterId}:`, statusCode, errorMsg);

        await db.ref(`channels/${broadcasterId}/webhook`).update({
            registered: false,
            last_error: errorMsg,
            last_error_code: statusCode,
            last_error_at: Date.now(),
            last_status: 'FAILED'
        });

        return { success: false, error: errorMsg, code: statusCode };
    }
}

// Manuel Kayıt Endpoint'i (Hata ayıklama için)
app.get('/admin/register-webhook/:broadcasterId', async (req, res) => {
    const { broadcasterId } = req.params;
    const snap = await db.ref('channels/' + broadcasterId).once('value');
    const chan = snap.val();

    if (!chan || !chan.access_token) return res.status(404).json({ error: "Kanal veya token bulunamadı." });

    const result = await registerKickWebhook(broadcasterId, chan.access_token);
    res.json(result);
});

// Tüm kanallar için webhook kaydet
async function registerAllWebhooks() {
    try {
        const channelsSnap = await db.ref('channels').once('value');
        const channels = channelsSnap.val() || {};

        for (const [chanId, chan] of Object.entries(channels)) {
            // Zaten kayıtlıysa atla
            if (chan.webhook?.registered) continue;

            if (chan.access_token) {
                await registerKickWebhook(chanId, chan.access_token);
                await new Promise(r => setTimeout(r, 1000)); // Rate limit için bekle
            }
        }
    } catch (e) {
        console.error('[Webhook] Toplu kayıt hatası:', e.message);
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
const dbRecentUsers = {}; // Aktif kullanıcıları takip etmek için
let botMasterSwitch = true; // Omegacyr için master switch

// --- GLOBAL BORSA SİSTEMİ ---
const INITIAL_STOCKS = {
    "APPLE": { price: 5000, trend: 1, history: [] },
    "BITCOIN": { price: 45000, trend: 1, history: [] },
    "GOLD": { price: 2500, trend: -1, history: [] },
    "SILVER": { price: 850, trend: 1, history: [] },
    "PLATINUM": { price: 3200, trend: 1, history: [] },
    "KICK": { price: 100, trend: 1, history: [] },
    "ETHER": { price: 15000, trend: -1, history: [] },
    "TESLA": { price: 7500, trend: 1, history: [] },
    "NVIDIA": { price: 12000, trend: 1, history: [] },
    "GOOGLE": { price: 6200, trend: -1, history: [] },
    "AMAZON": { price: 5800, trend: 1, history: [] }
};

// --- EMLAK SİSTEMİ (GLOBAL PAZAR) ---
const REAL_ESTATE_TYPES = [
    { name: "Küçük Esnaf Dükkanı", minPrice: 1999999, maxPrice: 3500000, minInc: 15000, maxInc: 25000, type: "low" },
    { name: "Pide Salonu", minPrice: 2500000, maxPrice: 4500000, minInc: 20000, maxInc: 35000, type: "low" },
    { name: "Lüks Rezidans Katı", minPrice: 5000000, maxPrice: 12000000, minInc: 45000, maxInc: 85000, type: "med" },
    { name: "İş Merkezi", minPrice: 15000000, maxPrice: 25000000, minInc: 120000, maxInc: 220000, type: "med" },
    { name: "Butik Otel", minPrice: 20000000, maxPrice: 35000000, minInc: 180000, maxInc: 320000, type: "med" },
    { name: "Gece Kulübü", minPrice: 10000000, maxPrice: 18000000, minInc: 90000, maxInc: 160000, type: "med" },
    { name: "Alışveriş Merkezi", minPrice: 40000000, maxPrice: 50000000, minInc: 450000, maxInc: 750000, type: "high" }
];

async function getCityMarket(cityId) {
    try {
        const marketRef = db.ref(`real_estate_market/${cityId}`);
        const snap = await marketRef.once('value');
        let data = snap.val();

        if (!data) {
            data = [];
            // Bir şehirde en az 10 mülk olsun (10 ile 25 arası)
            const count = Math.floor(Math.random() * 16) + 10;

            for (let i = 1; i <= count; i++) {
                const tpl = REAL_ESTATE_TYPES[Math.floor(Math.random() * REAL_ESTATE_TYPES.length)];
                data.push({
                    id: `${cityId.toLowerCase()}_${i}`,
                    name: `${cityId} ${tpl.name} #${i}`,
                    price: Math.floor(tpl.minPrice + Math.random() * (tpl.maxPrice ? (tpl.maxPrice - tpl.minPrice) : tpl.minPrice * 0.5)),
                    income: Math.floor(tpl.minInc + Math.random() * (tpl.maxInc - tpl.minInc)),
                    owner: null,
                    type: tpl.type
                });
            }
            await marketRef.set(data);
        }
        return data;
    } catch (e) {
        console.error(`City Market Error (${cityId}):`, e.message);
        return [];
    }
}

// --- AI MEMORY HELPER ---
// Not: Fonksiyon dosyanın sonunda daha kapsamlı şekilde tanımlanmıştır.

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
                history: data.history || [],
                lastUpdate: Date.now()
            };
        }

        await stockRef.set(stocks);
    } catch (e) {
        console.error("Borsa Update Error:", e.message);
    }
}

// Borsa Saatlik Geçmiş Kaydı (Grafiklerin daha gerçekçi olması için)
async function saveHourlyStockHistory() {
    try {
        const stockRef = db.ref('global_stocks');
        const snap = await stockRef.once('value');
        const stocks = snap.val();
        if (!stocks) return;

        const updates = {};
        for (const [code, data] of Object.entries(stocks)) {
            let history = data.history || [];
            history.push(data.price);
            if (history.length > 24) history.shift(); // Son 24 saatin verisi
            updates[`${code}/history`] = history;
        }
        await stockRef.update(updates);
        console.log("📈 Borsa saatlik geçmiş verileri güncellendi.");
    } catch (e) {
        console.error("Hourly History Error:", e.message);
    }
}
setInterval(saveHourlyStockHistory, 3600000); // 1 Saat

// Borsa güncelleme (Her 1 saniyede bir)
setInterval(updateGlobalStocks, 1000);
updateGlobalStocks(); // Server açıldığında hemen ilk verileri oluştur

// --- EMLAK GELİR DAĞITIMI (Her 1 Saat) ---
async function distributeRealEstateIncome() {
    try {
        console.log("[Emlak] Saatlik gelir dağıtımı başlıyor...");
        const usersSnap = await db.ref('users').once('value');
        const users = usersSnap.val() || {};

        let totalDistributed = 0;
        for (const [username, userData] of Object.entries(users)) {
            if (userData.properties && Array.isArray(userData.properties)) {
                let hourlyTotal = 0;
                userData.properties.forEach(p => {
                    hourlyTotal += Math.floor(p.income / 24);
                });

                if (hourlyTotal > 0) {
                    await db.ref(`users/${username}`).transaction(u => {
                        if (u) u.balance = (u.balance || 0) + hourlyTotal;
                        return u;
                    });
                    totalDistributed += hourlyTotal;
                }
            }
        }
        console.log(`[Emlak] Dağıtım tamamlandı. Toplam: ${totalDistributed} 💰`);
    } catch (e) {
        console.error("Emlak Gelir Hatası:", e.message);
    }
}
setInterval(distributeRealEstateIncome, 3600000);

// PKCE & HELPERS
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
function base64UrlEncode(str) { return str.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''); }
function generatePKCE() {
    const verifier = base64UrlEncode(crypto.randomBytes(32));
    const challenge = base64UrlEncode(crypto.createHash('sha256').update(verifier).digest());
    return { verifier, challenge };
}

// ---------------------------------------------------------
// CLIENT-SIDE STATS SYNC (Cloudflare Bypass)
// ---------------------------------------------------------
app.post('/dashboard-api/sync-stats', async (req, res) => {
    try {
        const { channelId, key, followers, subscribers } = req.body;
        if (!channelId || !key) return res.json({ success: false, error: 'Missing params' });

        // Key doğrulama
        const chanSnap = await db.ref('channels/' + channelId).once('value');
        const chan = chanSnap.val();
        if (!chan || chan.overlay_key !== key) {
            return res.json({ success: false, error: 'Invalid key' });
        }

        // Stats güncelle
        const updates = { last_client_sync: Date.now() };
        if (followers > 0) updates.followers = followers;
        if (subscribers > 0) updates.subscribers = subscribers;

        await db.ref(`channels/${channelId}/stats`).update(updates);
        console.log(`[Client Sync] ${chan.username}: ${followers} takipçi, ${subscribers} abone`);

        res.json({ success: true });
    } catch (e) {
        console.error('[Client Sync Error]:', e.message);
        res.json({ success: false, error: e.message });
    }
});

// ---------------------------------------------------------
// 2. AUTH & CALLBACK (MULTI-TENANT)
// ---------------------------------------------------------
app.get('/login', async (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const { verifier, challenge } = generatePKCE();
    await db.ref('temp_auth/' + state).set({ verifier, createdAt: Date.now() });
    const scopes = "chat:write events:subscribe user:read channel:read moderation:ban channel:subscription:read channel:followed:read";
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
            slug: (userData.slug || userData.name || ""),
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
        await registerKickWebhook(bid, response.data.access_token);

        // Dashboard'a yönlendir
        res.redirect(`/dashboard?c=${bid}&k=${loginKey}`);
    } catch (e) {
        console.error("Auth Error:", e);
        res.status(500).send("Giriş sırasında bir hata oluştu: " + e.message);
    }
});

// ---------------------------------------------------------
// BORSA & EMLAK API (Tanımlamalar dosyanın sonundadır)
// ---------------------------------------------------------

// V2 Internal API - Takipçi sayısı burada olabilir
async function fetchKickV2Channel(slug) {
    try {
        const res = await axios.get(`https://kick.com/api/v2/channels/${slug}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 5000
        });
        return res.data;
    } catch (e) {
        // Cloudflare engeli - sessiz hata
    }
    return null;
}

// ---------------------------------------------------------
// EMLAK VE PROXY ENDPOINTLERI (GERI YUKLENDI)
// ---------------------------------------------------------

// --- EMLAK API ENDPOİNTLERİ ---
app.get('/api/real-estate/properties/:cityId', async (req, res) => {
    const cityId = req.params.cityId.toUpperCase();
    const props = await getCityMarket(cityId);
    res.json(props);
});

app.post('/api/real-estate/buy', async (req, res) => {
    const { username, cityId, propertyId } = req.body;
    if (!username || !cityId || !propertyId) return res.json({ success: false, error: "Eksik bilgi!" });

    try {
        const user = (await db.ref(`users/${username.toLowerCase()}`).once('value')).val();
        if (!user) return res.json({ success: false, error: "Kullanıcı bulunamadı!" });

        const marketRef = db.ref(`real_estate_market/${cityId.toUpperCase()}`);
        const marketSnap = await marketRef.once('value');
        let cityMarket = marketSnap.val();
        if (!cityMarket) cityMarket = await getCityMarket(cityId.toUpperCase());

        const propIndex = cityMarket.findIndex(p => p.id === propertyId);
        if (propIndex === -1) return res.json({ success: false, error: "Mülk bulunamadı!" });

        const prop = cityMarket[propIndex];

        // 1. Durum Kontrolü: Mülk satılmış mı?
        if (prop.owner) return res.json({ success: false, error: `Bu mülk zaten @${prop.owner} tarafından satın alınmış!` });

        // 2. Bakiye Kontrolü
        if (!user.is_infinite && (user.balance || 0) < prop.price) {
            return res.json({ success: false, error: "Yetersiz bakiye!" });
        }

        // 3. Global Pazarda Evi Kilitle (Atomik Yazım)
        let purchaseSuccess = false;
        await marketRef.transaction(currentMarket => {
            if (currentMarket && currentMarket[propIndex] && !currentMarket[propIndex].owner) {
                currentMarket[propIndex].owner = username.toLowerCase();
                purchaseSuccess = true;
                return currentMarket;
            }
            return; // Transaction'ı durdur
        });

        if (!purchaseSuccess) return res.json({ success: false, error: "Mülk az önce başkası tarafından alındı veya bir hata oluştu!" });

        // 4. Kullanıcı Verilerini Güncelle
        const userRef = db.ref(`users/${username.toLowerCase()}`);
        await userRef.transaction(u => {
            if (u) {
                if (!u.is_infinite) u.balance = (u.balance || 0) - prop.price;
                if (!u.properties) u.properties = [];
                u.properties.push({ ...prop, city: cityId, boughtAt: Date.now() });
            }
            return u;
        });

        res.json({ success: true, message: `${prop.name} başarıyla satın alındı!` });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// ---------------------------------------------------------
// PROXY: KICK PROFILE PIC (CORS BYPASS)
// ---------------------------------------------------------
app.get('/api/kick/pfp/:username', async (req, res) => {
    try {
        const username = req.params.username.toLowerCase();
        const data = await fetchKickV2Channel(username);
        if (data && data.user && data.user.profile_pic) {
            return res.json({ pfp: data.user.profile_pic });
        }
        res.status(404).json({ error: "Not found" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ---------------------------------------------------------
// BORSA RESET (ONLY FOR OMEGACYRA)
// ---------------------------------------------------------
app.post('/api/borsa/reset', async (req, res) => {
    const { requester } = req.body;
    if (requester !== 'omegacyra') return res.status(403).json({ success: false, error: "Yetkisiz işlem!" });

    try {
        console.log("!!! BORSA RESETLENİYOR (Requester: omegacyra) !!!");
        const usersSnap = await db.ref('users').once('value');
        const users = usersSnap.val() || {};

        const updates = {};
        for (const [uname, udata] of Object.entries(users)) {
            if (udata.stocks) {
                updates[`users/${uname}/stocks`] = null;
            }
        }

        if (Object.keys(updates).length > 0) {
            await db.ref().update(updates);
        }

        res.json({ success: true, message: "Tüm borsa hisseleri sıfırlandı!" });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// AI RESİM ÜRETME (Flux Modeli - Grok/Flux Kalitesinde)
async function generateAiImage(prompt, imageId) {
    try {
        let enhancedPrompt = prompt.toLowerCase();

        // --- AKILLI PROMPT ZENGİNLEŞTİRME ---

        // Şehir ve Yerelleştirme Desteği
        const cityMap = {
            'amasya': 'Amasya city Turkey, historical Ottoman houses by the Yeşilırmak river, ancient Pontic Rock Tombs, castle on the mountain',
            'istanbul': 'Istanbul city Turkey, Bosphorus, Hagia Sophia, Galata Tower, minarets and skyline',
            'ankara': 'Ankara city Turkey, Anitkabir, Atakule, city panorama',
            'izmir': 'Izmir city Turkey, clock tower, gulf view, palm trees'
        };

        for (const [tr, en] of Object.entries(cityMap)) {
            if (enhancedPrompt.includes(tr)) {
                enhancedPrompt = enhancedPrompt.replace(new RegExp(tr, 'gi'), en);
            }
        }

        // Zaman ve Stil Desteği
        if (enhancedPrompt.includes('2100') || enhancedPrompt.includes('2050') || enhancedPrompt.includes('gelecek') || enhancedPrompt.includes('future')) {
            enhancedPrompt += ", futuristic cyberpunk aesthetic, flying vehicles, neon lights, advanced architectural design, sci-fi atmosphere, glowing city lights";
        }

        if (enhancedPrompt.includes('gece') || enhancedPrompt.includes('night')) {
            enhancedPrompt += ", ultra night mode, cinematic lighting, deep shadows, neon glow";
        }

        // Genel Kalite Arttırıcılar (Flux Modeli için Optimize)
        const qualityBoost = ", masterpiece, highly detailed, 8k resolution, photorealistic, cinematic composition, sharp focus, intricate textures, ray tracing";
        enhancedPrompt += qualityBoost;

        console.log(`[AI Prompt] Orijinal: ${prompt} -> Zenginleştirilmiş: ${enhancedPrompt}`);

        const encodedPrompt = encodeURIComponent(enhancedPrompt);
        const seed = Math.floor(Math.random() * 1000000);

        // model=flux kullanarak en yüksek kaliteyi hedefliyoruz
        const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&model=flux&seed=${seed}`;

        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 90000
        });

        const filename = `${imageId}.png`;
        const filePath = path.join(aiImagesDir, filename);

        fs.writeFileSync(filePath, response.data);

        // 2 dakika sonra sil
        setTimeout(() => {
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log(`[AI] Resim silindi: ${filename}`);
                }
                delete tempAiImages[imageId];
            } catch (e) { }
        }, 120000);

        return filename;
    } catch (e) {
        console.log(`[AI] Resim üretme hatası: ${e.message}`);
        return null;
    }
}

async function sendChatMessage_FAILED(message, broadcasterId) {
    if (!message || !broadcasterId) return;
    try {
        const snap = await db.ref('channels/' + broadcasterId).once('value');
        const chan = snap.val();

        if (!chan || !chan.access_token) {
            console.error(`[Chat] ${broadcasterId} için token yok.`);
            return;
        }

        const HEADERS = {
            'Authorization': `Bearer ${chan.access_token}`,
            'X-Kick-Client-Id': "01KDQNP2M930Y7YYNM62TVWJCP",
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'KickBot/1.0'
        };

        const MOBILE_HEADERS = {
            ...HEADERS,
            'User-Agent': "Kick/28.0.0 (iPhone; iOS 16.0; Scale/3.00)"
        };

        let realChatroomId = null;

        // 🔍 DETAYLI KİMLİK ANALİZİ
        try {
            const who = await axios.get('https://api.kick.com/public/v1/users', { headers: HEADERS });
            console.log(`[Chat Auth RAW]: ${JSON.stringify(who.data)}`);

            const u = who.data?.data?.[0];
            if (u) {
                // 1. Kullanıcı objesinden ID ara
                if (u.chatroom) realChatroomId = u.chatroom.id;
                else if (u.streamer_channel && u.streamer_channel.chatroom) realChatroomId = u.streamer_channel.chatroom.id;

                console.log(`[Auth] Sahibi: ${u.name} (ID: ${u.user_id}) -> ChatroomID: ${realChatroomId || "Bulunamadı"}`);

                // 2. Bulamadıysan Public V1 Kanal sorgusu yap
                if (!realChatroomId) {
                    try {
                        const chanRes = await axios.get(`https://api.kick.com/public/v1/channels/${u.slug || u.name}`, { headers: HEADERS });
                        const cData = chanRes.data?.data || chanRes.data;
                        if (cData && cData.chatroom) {
                            realChatroomId = cData.chatroom.id;
                            console.log(`[Chat Info] V1 Kanal Sorgusu -> ChatroomID: ${realChatroomId}`);
                        }
                    } catch (e) { }
                }
            }
        } catch (e) {
            console.error(`[Chat Auth] ❌ Kimlik Hatası: ${e.response?.status}`);
        }

        const targetId = realChatroomId || parseInt(broadcasterId);

        // 🛠️ HİBRİT GÖNDERİM
        const trials = [
            { url: 'https://api.kick.com/public/v1/chat-messages', body: { chatroom_id: targetId, content: message }, headers: HEADERS },
            { url: `https://kick.com/api/v2/messages/send/${targetId}`, body: { content: message, type: "bot" }, headers: MOBILE_HEADERS }
        ];

        let success = false;
        let lastErrorMsg = "";

        for (const t of trials) {
            try {
                if (t.body.sender_id) delete t.body.sender_id;
                const res = await axios.post(t.url, t.body, { headers: t.headers, timeout: 8000 });
                if (res.status >= 200 && res.status < 300) {
                    success = true;
                    console.log(`[Chat] ✅ MESAJ GÜNDERİLDİ! URL: ${t.url}`);
                    break;
                }
            } catch (err) {
                lastErrorMsg = `${t.url} -> ${err.response?.status}: ${JSON.stringify(err.response?.data || err.message)}`;
            }
        }

        if (!success) console.error(`[Chat Fatal] HATA: ${lastErrorMsg}`);
    } catch (e) {
        console.error(`[Chat Global Error]:`, e.message);
    }
}

async function sendChatMessage_OLD(message, broadcasterId) {
    if (!message || !broadcasterId) return;
    try {
        const snap = await db.ref('channels/' + broadcasterId).once('value');
        const chan = snap.val();

        if (!chan || !chan.access_token) {
            console.error(`[Chat] ${broadcasterId} için token yok. Giriş (Login) şart!`);
            return;
        }

        const HEADERS = {
            'Authorization': `Bearer ${chan.access_token}`,
            'X-Kick-Client-Id': "01KDQNP2M930Y7YYNM62TVWJCP",
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'KickBot/1.0'
        };
    } catch (e) { }
}

async function fetchKickGraphQL(slug) {
    try {
        const query = `query Channel($slug: String!) {
            channel(slug: $slug) {
                id
                user { username }
                slug
                chatroom { id }
                followersCount
                subscriptionPackages { id }
                livestream {
                    id
                    is_live
                    viewers
                    viewer_count
                    session_title
                }
            }
        }`;
        const response = await axios.post('https://kick.com/api/internal/v1/graphql', {
            query,
            variables: { slug }
        }, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 5000
        });
        return response.data?.data?.channel;
    } catch (e) {
        return null;
    }
}

async function syncChannelStats() {
    try {
        const channelsSnap = await db.ref('channels').once('value');
        const channels = channelsSnap.val() || {};

        for (const [id, chan] of Object.entries(channels)) {
            if (!chan.username) continue;

            const gql = await fetchKickGraphQL(chan.username);
            if (gql) {
                const updates = {
                    last_sync: Date.now(),
                    followers: gql.followersCount || 0
                };
                if (gql.livestream) {
                    updates.viewers = gql.livestream.viewer_count || 0;
                    updates.is_live = gql.livestream.is_live;
                }
                await db.ref(`channels/${id}/stats`).update(updates);
            }
        }
    } catch (e) {
        console.error("Sync Stats Error:", e.message);
    }
}

// YENİ CHAT GÖNDERME FONKSİYONU (V3 - Hibrit & ID Bulucu)
async function sendChatMessage_V3_FAILED(message, broadcasterId) {
    if (!message || !broadcasterId) return;
    try {
        const snap = await db.ref('channels/' + broadcasterId).once('value');
        const chan = snap.val();

        if (!chan || !chan.access_token) {
            console.error(`[Chat] ${broadcasterId} için token yok.`);
            return;
        }

        const HEADERS = {
            'Authorization': `Bearer ${chan.access_token}`,
            'X-Kick-Client-Id': "01KDQNP2M930Y7YYNM62TVWJCP",
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'KickBot/1.0'
        };

        const MOBILE_HEADERS = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': "Kick/28.0.0 (iPhone; iOS 16.0; Scale/3.00)",
            'Authorization': `Bearer ${chan.access_token}`
        };

        let realChatroomId = null;
        let channelSlug = chan.slug || chan.username;

        // 🔍 ADIM 1: ID AVI (V2 API Mobile Spoof ile)
        // Public V1 Users endpoint'i artık chatroom vermiyor. V2 Channels endpoint'i ise veriyor.
        if (channelSlug) {
            try {
                const v2Res = await axios.get(`https://kick.com/api/v2/channels/${channelSlug}`, { headers: MOBILE_HEADERS });
                if (v2Res.data && v2Res.data.chatroom) {
                    realChatroomId = v2Res.data.chatroom.id;
                    console.log(`[Chat ID] V2'den bulundu! Slug: ${channelSlug} -> ChatroomID: ${realChatroomId}`);
                }
            } catch (e) {
                console.error(`[Chat ID Error] V2 Sorgusu başarısız (${channelSlug}): ${e.response?.status}`);
            }
        }

        // 🔍 ADIM 2: YEDEK PLAN (Public V1 Users)
        if (!realChatroomId) {
            try {
                const who = await axios.get('https://api.kick.com/public/v1/users', { headers: HEADERS });
                const u = who.data?.data?.[0];
                if (u) {
                    if (u.chatroom) realChatroomId = u.chatroom.id;
                    else if (u.streamer_channel && u.streamer_channel.chatroom) realChatroomId = u.streamer_channel.chatroom.id;

                    // Eğer kullanıcı objesinde yoksa, user ID belki chatroom ID'dir diye umut ediyoruz (yanlış ama denemeye değer)
                    if (!channelSlug) channelSlug = u.slug || u.name;
                }
            } catch (e) { }
        }

        if (!realChatroomId) {
            console.error(`[Chat Fatal] ❌ Chatroom ID '${channelSlug}' için bulunamadı! 404/403 kaçınılmaz.`);
            // Son bir umut user_id deneyelim
            // return; // Devam etsin belki tutar
        }

        const targetId = realChatroomId || parseInt(broadcasterId);

        // 🛠️ ADIM 3: MESAJ GÖNDER (Önce V1, Sonra V2)
        try {
            // -- YÖNTEM A: RESMİ API (V1) --
            // Eğer gerçek Chatroom ID bulduysak bu %100 çalışır.
            if (realChatroomId) {
                await axios.post('https://api.kick.com/public/v1/chat-messages', {
                    chatroom_id: realChatroomId,
                    content: message,
                    type: "bot"
                }, { headers: HEADERS });
                console.log(`[Chat] ✅ MESAJ GÖNDERİLDİ! (V1) -> ${message}`);
                return;
            }

            // -- YÖNTEM B: DOĞRUDAN V2 (Fallback) --
            // ID bulamadıysak veya V1 hata verdiyse buraya düşeriz (ama V1'i try dışına aldık, neyse)
            throw new Error("ID yok, V2'ye geç");

        } catch (err) {
            console.warn(`[Chat Warn] V1 başarısız, V2 deneniyor... (${err.message})`);

            // -- YÖNTEM B: V2 MOBILE --
            try {
                await axios.post(`https://kick.com/api/v2/messages/send/${targetId}`,
                    { content: message, type: "bot" },
                    { headers: MOBILE_HEADERS }
                );
                console.log(`[Chat] ✅ MESAJ GÖNDERİLDİ! (V2 Fallback)`);
            } catch (err2) {
                console.error(`[Chat Error] V2 Fallback de başarısız: ${err2.response?.status} - ${JSON.stringify(err2.response?.data)}`);
            }
        }
    } catch (e) {
        console.error(`[Chat Global Error]:`, e.message);
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
        await db.ref('channels/' + broadcasterId).update({
            access_token: res.data.access_token,
            refresh_token: res.data.refresh_token,
            last_token_refresh: Date.now()
        });
        console.log(`[Token] ${broadcasterId} için token başarıyla yenilendi.`);
    } catch (e) {
        console.log(`[Token Error] ${broadcasterId}:`, e.message);
    }
}



// YENİ CHAT GÖNDERME FONKSİYONU (V6 - Header Hunter & Info Dump)
async function sendChatMessage(message, broadcasterId) {
    if (!message || !broadcasterId) return;
    try {
        const { KICK_CLIENT_ID } = process.env;
        const CLIENT_ID_TO_USE = KICK_CLIENT_ID || "01KDQNP2M930Y7YYNM62TVWJCP";

        const snap = await db.ref('channels/' + broadcasterId).once('value');
        const chan = snap.val();

        if (!chan || !chan.access_token) {
            console.error(`[Chat] ${broadcasterId} için token yok.`);
            return;
        }

        // 1. INFO DUMP: Token'ın kime ait olduğunu ve yetkilerini görelim.
        const BROWSER_HEADERS = {
            'Authorization': `Bearer ${chan.access_token}`,
            'X-Kick-Client-Id': CLIENT_ID_TO_USE,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };

        let realChatroomId = null;
        let channelSlug = chan.slug || chan.username || broadcasterId;

        try {
            // Kullanıcı bilgilerini ve Chatroom ID'yi Public API'den (Header taklidiyle) çek
            const who = await axios.get('https://api.kick.com/public/v1/users', { headers: BROWSER_HEADERS });
            const u = who.data?.data?.[0];
            if (u) {
                if (u.chatroom) realChatroomId = u.chatroom.id;
                console.log(`[Chat Debug] Token User: ${u.username} (ID: ${u.user_id}) | Chatroom: ${realChatroomId}`);
            }
        } catch (e) {
            console.error(`[Chat Debug] User Info Check Fail: ${e.response?.status}`);
        }

        // Eğer V1 Users API id vermediyse V2'den zorla al (önceki yöntem)
        if (!realChatroomId && channelSlug) {
            const v2Res = await axios.get(`https://kick.com/api/v2/channels/${channelSlug}`, { headers: { 'User-Agent': BROWSER_HEADERS['User-Agent'] } });
            if (v2Res.data?.chatroom) realChatroomId = v2Res.data.chatroom.id;
        }

        if (!realChatroomId) {
            console.error(`[Chat Fatal] Chatroom ID bulunamadı.`);
            return;
        }

        const targetId = realChatroomId;

        // 2. ENDPOINT SALDIRISI (Gelişmiş Headerlar ile)
        const trials = [
            // A. Standart Public V1 (Full Browser Taklidi)
            {
                name: "Public V1 (Browser)",
                url: 'https://api.kick.com/public/v1/chat-messages',
                body: { chatroom_id: targetId, content: message }, // content string, type yok
                headers: BROWSER_HEADERS
            },

            // B. Olası Public V2 (Belki V1 kapanmıştır?)
            {
                name: "Public V2 (Guess)",
                url: 'https://api.kick.com/public/v2/chat-messages',
                body: { chatroom_id: targetId, content: message },
                headers: BROWSER_HEADERS
            },

            // C. Kick Internal V2 (Mobile Payload, XSRF'siz Son Şans)
            {
                name: "Mobile V2",
                url: `https://kick.com/api/v2/messages/send/${targetId}`,
                body: { content: message, type: "message" },
                headers: {
                    'Authorization': `Bearer ${chan.access_token}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'User-Agent': "Kick/28.0.0 (iPhone; iOS 16.0; Scale/3.00)",
                    'X-Kick-Client-Id': CLIENT_ID_TO_USE
                }
            }
        ];

        let success = false;
        for (const t of trials) {
            try {
                const res = await axios.post(t.url, t.body, { headers: t.headers, timeout: 5000 });
                if (res.status >= 200 && res.status < 300) {
                    success = true;
                    console.log(`[Chat] ✅ MESAJ GÖNDERİLDİ! (${t.name})`);
                    break;
                }
            } catch (err) {
                const status = err.response?.status;
                const msg = err.response?.data?.message || JSON.stringify(err.response?.data);
                console.warn(`[Chat Debug] ${t.name} -> ${status} | ${msg}`);
            }
        }
        if (!success) console.error(`[Chat Fatal] V6 da çalışmadı. Scope veya API sorunu olabilir.`);

    } catch (e) {
        console.error(`[Chat Global Error]:`, e.message);
    }
}

async function timeoutUser(broadcasterId, targetUsername, duration) {
    const channelRef = await db.ref('channels/' + broadcasterId).once('value');
    const channelData = channelRef.val();
    if (!channelData) return { success: false, error: 'Kanal bulunamadÄ±' };

    try {
        let targetUserId = null;

        // YÃ–NTEM 0: VeritabanÄ±ndan bak (En garantisi)
        if (targetUsername) {
            const dbIdSnap = await db.ref('kick_ids/' + targetUsername.toLowerCase()).once('value');
            if (dbIdSnap.exists()) {
                targetUserId = dbIdSnap.val();
                console.log(`✅ ID Veritabanından bulundu: ${targetUsername} -> ${targetUserId}`);
            }
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
// 4. OFFICIAL KICK WEBHOOK HANDLER
// ---------------------------------------------------------
app.post('/webhook/kick', async (req, res) => {
    try {
        const payload = req.body;
        const headers = req.headers;

        // Kick Headers (Express handles lowercase)
        const eventType = headers['kick-event-type'] || payload.event || headers['kick-event'] || 'unknown';
        const eventId = headers['kick-event-id'] || 'no-id';

        // --- CHALLENGE / VERIFICATION ---
        if (payload.challenge) {
            console.log(`[Webhook] Challenge verification: ${payload.challenge}`);
            return res.status(200).send(payload.challenge);
        }

        // --- OK RESPONSE (Immediate) ---
        res.status(200).send('OK');

        // --- LOGGING ---
        console.log(`[Webhook] ${eventType} received.`);

        if (typeof logWebhookReceived === 'function') {
            logWebhookReceived({ event: eventType, sender: payload.sender });
        }

        // --- BROADCASTER DISCOVERY ---
        let broadcasterId =
            payload.broadcaster?.user_id ||
            payload.broadcaster_user_id ||
            (payload.data && payload.data.broadcaster?.user_id) ||
            null;

        if (!broadcasterId) {
            // chat.message.sent payload root identifies broadcaster
            if (payload.broadcaster && payload.broadcaster.user_id) {
                broadcasterId = payload.broadcaster.user_id;
            }
        }

        if (!broadcasterId) return;
        broadcasterId = String(broadcasterId);

        const channelRef = await db.ref('channels/' + broadcasterId).once('value');
        const channelData = channelRef.val();

        if (!channelData) {
            console.log(`❌ Kanal veritabanında yok: ${broadcasterId}`);
            return;
        }

        // Webhook Debug
        // console.log(`[Webhook] Olay: ${payload.event || 'Bilinmiyor'} (Kanal: ${broadcasterId})`);

        // --- ABONE ÖDÜLÜ SİSTEMİ ---
        const eventName = payload.event || payload.event_type || payload.type;
        const settings = channelData.settings || {};
        const subReward = parseInt(settings.sub_reward) || 5000;

        if (eventName === "channel.subscription.new" || eventName === "channel.subscription.renewal" || eventName === "subscription.new") {
            const subUser = event.username;
            if (subUser && subUser.toLowerCase() !== "botrix") {
                // Goal Bar Update
                await db.ref(`channels/${broadcasterId}/stats/subscribers`).transaction(val => (val || 0) + 1);

                let welcomeMsg = settings.sub_welcome_msg || `🎊 @{user} ABONE OLDU! Hoş geldin, hesabına {reward} 💰 bakiye eklendi! ✨`;
                welcomeMsg = welcomeMsg.replace('{user}', subUser).replace('{reward}', subReward.toLocaleString());

                await db.ref('users/' + subUser.toLowerCase()).transaction(u => {
                    if (!u) u = { balance: 1000, last_seen: Date.now(), last_channel: broadcasterId, created_at: Date.now() };
                    u.balance = (u.balance || 0) + subReward;
                    return u;
                });
                await addRecentActivity(broadcasterId, 'recent_joiners', { user: subUser, type: 'subscriber' });
                await sendChatMessage(welcomeMsg, broadcasterId);
            }
            return;
        }

        if (eventName === "channel.subscription.gifts" || eventName === "subscription.gifts") {
            const gifter = event.username;
            if (gifter && gifter.toLowerCase() === "botrix") return;
            const count = parseInt(event.total) || 1;
            const totalReward = subReward * count;
            if (gifter) {
                await db.ref('users/' + gifter.toLowerCase()).transaction(u => {
                    if (!u) u = { balance: 1000, last_seen: Date.now(), last_channel: broadcasterId, created_at: Date.now() };
                    u.balance = (u.balance || 0) + totalReward;
                    return u;
                });
                await addRecentActivity(broadcasterId, 'top_gifters', { user: gifter, count: count });
                await sendChatMessage(`🎁 @${gifter}, tam ${count} adet abonelik hediye etti! Cömertliğin için hesabına ${totalReward.toLocaleString()} 💰 bakiye eklendi! ✨`, broadcasterId);

                // Goal Bar Update
                await db.ref(`channels/${broadcasterId}/stats/subscribers`).transaction(val => (val || 0) + count);
            }
            return;
        }

        if (eventName === "channel.followed" || eventName === "channel.follow") {
            const follower = event.username || event.user_name || event.user?.username;
            if (follower && follower.toLowerCase() === "botrix") return;
            // Goal Bar Update
            await db.ref(`channels/${broadcasterId}/stats/followers`).transaction(val => (val || 0) + 1);
            await addRecentActivity(broadcasterId, 'recent_joiners', { user: follower, type: 'follower' });
            return;
        }

        // SLUG GÜNCELLEME (API için kritik)
        const currentSlug = payload.broadcaster?.channel_slug || payload.sender?.channel_slug;
        if (currentSlug && channelData.slug !== currentSlug) {
            await db.ref('channels/' + broadcasterId).update({ slug: currentSlug });
            channelData.slug = currentSlug;
            console.log(`🔄 Kanal slug güncellendi: ${currentSlug}`);
        }

        // =========================================================
        // MESAJ VE KULLANICI AYIKLAMA (KICK RESMİ API FORMATI)
        // =========================================================
        // chat.message.sent payload: { sender: { username, user_id, identity }, content, ... }
        const user = (
            payload.sender?.username ||
            payload.user?.username ||
            payload.username ||
            ""
        ).toLowerCase();

        const rawMsg = payload.content || payload.message || "";

        if (!user || user === "botrix" || user === "aloskegangbot") return;

        console.log(`[Webhook] 💬 @${user}: ${rawMsg}`);

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

        // Aktif kullanıcılar listesine ekle
        dbRecentUsers[user.toLowerCase()] = { last_seen: Date.now(), last_channel: broadcasterId };

        // KICK ID KAYDET (Susturma işlemleri için - Opsiyonel)
        if (payload.sender?.user_id) {
            await db.ref('kick_ids/' + user.toLowerCase()).set(payload.sender.user_id);
        }

        // --- ADMIN / MOD YETKİ KONTROLÜ (KICK RESMİ API FORMATI) ---
        // Kick API: sender.identity.badges = [{ type: "broadcaster" }, { type: "moderator" }, ...]
        const isAuthorized = payload.sender?.identity?.badges?.some(b =>
            b.type === 'broadcaster' || b.type === 'moderator'
        ) || user.toLowerCase() === "omegacyr";

        const reply = (msg) => sendChatMessage(msg, broadcasterId);

        // --- RIG KONTROLÜ ---
        const checkRig = () => {
            const r = riggedGambles[user.toLowerCase()];
            if (r) { delete riggedGambles[user.toLowerCase()]; return r; }
            return null;
        };

        // Komut aktif mi kontrolü (undefined = aktif, false = kapalı)
        const isEnabled = (cmd) => {
            if (!botMasterSwitch && cmd !== 'bot-kontrol') return false;
            return settings[cmd] !== false;
        };

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
        const userCooldownKey = `${broadcasterId}_${user.toLowerCase()}`;
        const now = Date.now();


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

        // --- MASTER SWITCH: Omegacyr özel kontrolü ---
        else if (user.toLowerCase() === 'omegacyr' && lowMsg.startsWith('!bot-kontrol ')) {
            const action = args[0]?.toLowerCase();
            if (action === 'aç' || action === 'ac' || action === 'aktif') {
                botMasterSwitch = true;
                await reply(`✅ BOT MODU: AKTİF. Tüm komutlar kullanıma açıldı.`);
            } else if (action === 'kapat' || action === 'devredışı') {
                botMasterSwitch = false;
                await reply(`⛔ BOT MODU: DEVRE DIŞI. Komutlar geçici olarak kapatıldı (Sadece !bot-kontrol çalışır).`);
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

        // AI RESİM ÜRETME (Sadece Mod/Broadcaster)
        else if (lowMsg.startsWith('!airesim ')) {
            if (!isAuthorized) return await reply(`@${user}, bu komutu sadece yayıncı ve moderatörler kullanabilir!`);

            const prompt = rawMsg.substring(9).trim(); // "!airesim " = 9 karakter
            if (!prompt || prompt.length < 3) {
                return await reply(`@${user}, kullanım: !airesim [resim açıklaması] - Örnek: !airesim güneş batarken deniz manzarası`);
            }

            await reply(`🎨 @${user}, resim üretiliyor... (Bu 30-60 saniye sürebilir)`);

            const imageId = `ai_${Date.now()}_${Math.random().toString(36).substring(7)}`;
            const filename = await generateAiImage(prompt, imageId);

            if (filename) {
                const baseUrl = process.env.BASE_URL || 'https://aloskegangbot-market.onrender.com';
                const imageUrl = `${baseUrl}/ai-images/${filename}`;
                const viewUrl = `${baseUrl}/ai-view/${imageId}`;

                tempAiImages[imageId] = {
                    filename,
                    prompt,
                    createdBy: user,
                    createdAt: Date.now()
                };

                await reply(`🖼️ @${user}, resmin hazır! Görüntüle (2 dk geçerli): ${viewUrl}`);
            } else {
                await reply(`@${user}, resim üretilemedi. Lütfen tekrar dene.`);
            }
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
        const wrSlot = settings.wr_slot || 30;
        const wrYazitura = settings.wr_yazitura || 50;
        const wrKutu = settings.wr_kutu || 40;
        const wrSoygun = settings.wr_soygun || 40;

        const multSlot3 = settings.mult_slot_3 || 5;
        const multSlot2 = settings.mult_slot_2 || 1.5;
        const multYT = settings.mult_yazitura || 2;
        const multKutu = settings.mult_kutu || 3;

        if (isEnabled('slot') && lowMsg.startsWith('!slot')) {
            const cost = Math.max(10, parseInt(args[0]) || 100);
            const snap = await userRef.once('value');
            let data = snap.val() || { balance: 1000 };

            const now = Date.now();
            const limitSlot = settings.limit_slot || 10;

            // Saatlik limit kontrolü
            if (now > (data.slot_reset || 0)) {
                data.slot_count = 0;
                data.slot_reset = now + 3600000;
            }
            if ((data.slot_count || 0) >= limitSlot) {
                return await reply(`@${user}, 🚨 Slot limitin doldu! (${limitSlot}/saat)`);
            }

            const isInf = data.is_infinite;
            if (!isInf && (data.balance || 0) < cost) return await reply(`@${user}, Yetersiz bakiye!`);
            await updateStats(user, 'g');

            if (!isInf) data.balance = (data.balance || 0) - cost;
            data.slot_count = (data.slot_count || 0) + 1;

            const rig = checkRig();
            const sym = ["🍋", "🍒", "🍇", "🔔", "💎", "7️⃣", "🍊", "🍓"];
            let s, mult;

            if (rig === 'win') {
                s = ["7️⃣", "7️⃣", "7️⃣"]; mult = multSlot3;
            } else if (rig === 'lose') {
                s = ["🍋", "🍒", "🍇"]; mult = 0;
            } else {
                const roll = Math.random() * 100;
                if (roll < wrSlot) {
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
                if (!isInf) data.balance = (data.balance || 0) + refund;
                await userRef.update(data);
                await reply(`🎰 | ${s[0]} | ${s[1]} | ${s[2]} | @${user} Kaybettin (%10 İade: +${refund})`);
            } else {
                if (!isInf) data.balance = (data.balance || 0) + prize;
                await userRef.update(data);
                await reply(`🎰 | ${s[0]} | ${s[1]} | ${s[2]} | @${user} KAZANDIN (+${prize.toLocaleString()}) 💰`);
            }
        }

        else if (isEnabled('yazitura') && lowMsg.startsWith('!yazitura')) {
            const cost = parseInt(args[0]);
            const pick = args[1]?.toLowerCase();
            if (isNaN(cost) || !['y', 't', 'yazı', 'tura'].includes(pick)) return await reply(`@${user}, Kullanım: !yazitura [miktar] [y/t]`);

            const snap = await userRef.once('value');
            let data = snap.val() || { balance: 1000 };

            const now = Date.now();
            const limitYT = settings.limit_yazitura || 20;

            // Saatlik limit
            if (now > (data.yt_reset || 0)) {
                data.yt_count = 0;
                data.yt_reset = now + 3600000;
            }
            if ((data.yt_count || 0) >= limitYT) {
                return await reply(`@${user}, 🚨 YazıTura limitin doldu! (${limitYT}/saat)`);
            }

            const isInf = data.is_infinite;
            if (!isInf && (data.balance || 0) < cost) return await reply(`@${user}, Bakiye yetersiz!`);
            await updateStats(user, 'g');

            if (!isInf) data.balance = (data.balance || 0) - cost;
            data.yt_count = (data.yt_count || 0) + 1;

            const rig = checkRig();
            const isYazi = ['y', 'yazı'].includes(pick);
            let win;

            if (rig === 'win') win = true;
            else if (rig === 'lose') win = false;
            else win = (Math.random() * 100) < wrYazitura;

            const resDisplay = win ? (isYazi ? 'YAZI' : 'TURA') : (isYazi ? 'TURA' : 'YAZI');
            if (win) {
                const prize = Math.floor(cost * multYT);
                if (!isInf) data.balance = (data.balance || 0) + prize;
                await userRef.update(data);
                await reply(`🪙 Para fırlatıldı... ${resDisplay}! @${user} KAZANDIN (+${prize.toLocaleString()})`);
            } else {
                const refund = Math.floor(cost * 0.1);
                if (!isInf) data.balance = (data.balance || 0) + refund;
                await userRef.update(data);
                await reply(`🪙 Para fırlatıldı... ${resDisplay}! @${user} Kaybettin (%10 İade: +${refund})`);
            }
        }

        else if (isEnabled('kutu') && lowMsg.startsWith('!kutu')) {
            const cost = parseInt(args[0]); const choice = parseInt(args[1]);
            if (isNaN(cost) || isNaN(choice) || choice < 1 || choice > 3) return await reply(`@${user}, Kullanım: !kutu [miktar] [1-3]`);

            const snap = await userRef.once('value');
            let data = snap.val() || { balance: 1000 };

            const now = Date.now();
            const limitKutu = settings.limit_kutu || 15;

            // Saatlik limit
            if (now > (data.kutu_reset || 0)) {
                data.kutu_count = 0;
                data.kutu_reset = now + 3600000;
            }
            if ((data.kutu_count || 0) >= limitKutu) {
                return await reply(`@${user}, 🚨 Kutu limitin doldu! (${limitKutu}/saat)`);
            }

            const isInf = data.is_infinite;
            if (!isInf && (data.balance || 0) < cost) return await reply(`@${user}, Bakiye yetersiz!`);
            await updateStats(user, 'g');

            if (!isInf) data.balance = (data.balance || 0) - cost;
            data.kutu_count = (data.kutu_count || 0) + 1;

            const rig = checkRig();
            let resultType;

            if (rig === 'win') resultType = 'odul';
            else if (rig === 'lose') resultType = 'bomba';
            else {
                if ((Math.random() * 100) < wrKutu) {
                    resultType = (Math.random() < 0.2) ? 'odul' : 'iade';
                } else {
                    resultType = 'bomba';
                }
            }

            if (resultType === 'odul') {
                const prize = Math.floor(cost * multKutu);
                if (!isInf) data.balance = (data.balance || 0) + prize;
                await reply(`📦 @${user} Kutu ${choice}: 🎉 BÜYÜK ÖDÜL! (+${prize.toLocaleString()})`);
            } else if (resultType === 'iade') {
                if (!isInf) data.balance = (data.balance || 0) + cost;
                await reply(`📦 @${user} Kutu ${choice}: 🔄 Para İade Edildi (+${cost.toLocaleString()})`);
            } else {
                const refund = Math.floor(cost * 0.1);
                if (!isInf) data.balance = (data.balance || 0) + refund;
                await reply(`📦 @${user} Kutu ${choice}: 💣 BOMBA! Kaybettin (%10 İade: +${refund})`);
            }
            await userRef.update(data);
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
                const now = Date.now();
                const hourAgo = now - 3600000;
                const limitSoygun = settings.limit_soygun || 3;
                heistHistory[broadcasterId] = (heistHistory[broadcasterId] || []).filter(ts => ts > hourAgo);

                if (heistHistory[broadcasterId].length >= limitSoygun) {
                    const nextAvailableTs = heistHistory[broadcasterId][0] + 3600000;
                    const nextAvailableMin = Math.ceil((nextAvailableTs - now) / 60000);
                    return await reply(`🚨 Bu kanal için soygun limiti doldu! (Saatte maks ${limitSoygun}). Yeni soygun için ~${nextAvailableMin} dk bekleyin.`);
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
                "Bir projende büyük başarı yakalamak üzeresin, pes etme.🏆",
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
                "İyimserliğini koru, evren senin için güzel şeyler hazırlıyor. ✨",
                // YENİ FALLAR
                "Yakında tanışacağın biri hayatını değiştirecek, gözlerini dört aç. 👀",
                "Geçmişte yaptığın bir iyilik bugün karşılığını bulacak. 🎯",
                "Rüyalarında gördüğün şeyler gerçek olabilir, not al! 📝",
                "Bu hafta içinde beklenmedik bir para kazancı var. 🤑",
                "Kariyer değişikliği düşünüyorsan tam zamanı. 💼",
                "Bugün aldığın her karar doğru çıkacak, güven kendine! ✅",
                "Romantik bir sürprizle karşılaşabilirsin, kalbin hazır mı? 💘",
                "Stresli günler sona eriyor, huzurlu bir dönem başlıyor. 🌈",
                "Uzun süredir ertelediğin o işi bugün bitireceksin. ⏰",
                "Bir kaybın telafi edilecek, üzülme! 🙏",
                "Yeni bir yetenek keşfedeceksin, sınırlarını zorla. 🎭",
                "Bugün sana gelen ilk mesaj çok önemli olabilir. 📬",
                "Hayatındaki olumsuz insanlardan uzaklaşma vakti. 🚶",
                "Bir yarışma veya çekilişte şansın yaver gidebilir. 🎰",
                "Sağlık sorunların düzelmeye başlıyor, morali bozma. 💚",
                "Evrendeki enerjiler senin için çalışıyor. 🌌",
                "Beklenmedik bir yerden iş teklifi gelebilir. 📋",
                "Eski bir aşktan haber alabilirsin, şaşırma! 💔➡️❤️"
            ];
            await reply(`🔮 @${user}, Falın: ${list[Math.floor(Math.random() * list.length)]}`);
        }

        // MOTİVASYON SÖZÜ
        else if (lowMsg === '!söz' || lowMsg === '!soz') {
            const sozler = [
                "Başarı, her gün tekrarlanan küçük çabaların toplamıdır. 💪",
                "Yenilgi, son değildir. Vazgeçmek, sonun ta kendisidir. 🔥",
                "Düşmeyen yürümez, yürümeyen koşamaz. 🏃",
                "Hayaller görmekten korkma, korkunç olan hayal görmemektir. ✨",
                "Bugün yapabileceğini yarına bırakma. ⏰",
                "Başarının sırrı, başlamaktır. 🚀",
                "Zorluklara gülerek meydan oku. 😄",
                "Her şampiyon bir zamanlar pes etmemeyi seçen biriydi. 🏆",
                "Kendine inan, geri kalanı zaten gelecek. 🌟",
                "Fırtınalar güçlü kaptanları yetiştirir. ⛵",
                "Başarı tesadüf değildir. 🎯",
                "Elinden gelenin en iyisini yap, gerisini bırak. 🙌",
                "Küçük adımlar büyük yolculuklar başlatır. 👣",
                "Seni durduracak tek kişi, sensin. 🚫",
                "Dün geçti, yarın belirsiz, bugün bir hediye. 🎁",
                "Hata yapmak, hiç denememekten iyidir. ✅",
                "Evreni keşfetmeden önce kendi içini keşfet. 🧘",
                "Büyük başarılar büyük cesaretler ister. 🦁",
                "Azim, yeteneği yener. 💎",
                "Her son, yeni bir başlangıçtır. 🌅",
                "Kendini geliştirmek, en iyi yatırımdır. 📈",
                "Rüzgar esmeyince yelken açılmaz. 🌬️",
                "Pozitif düşün, pozitif yaşa. ➕",
                "Karanlık, yıldızların parlaması içindir. ⭐",
                "Asla pes etme, mucize bir adım ötede. 🌈"
            ];
            await reply(`✍️ @${user}: ${sozler[Math.floor(Math.random() * sozler.length)]}`);
        }

        // SİHİRLİ 8 TOP
        else if (lowMsg.startsWith('!8ball ') || lowMsg.startsWith('!8top ')) {
            const cevaplar = [
                "Kesinlikle evet! ✅", "Evet. 👍", "Büyük ihtimalle evet. 🤔",
                "Belki... 🤷", "Emin değilim. 😶", "Tekrar sor. 🔄",
                "Hayır. 👎", "Kesinlikle hayır! ❌", "Şansını zorla! 🍀",
                "Görünüşe göre evet. 👀", "Şüpheli... 🕵️", "Olmaz! 🚫",
                "Buna güvenemem. 😬", "Olabilir, kim bilir? 🌀",
                "Yıldızlar olumlu diyor! ⭐", "Bugün değil. 📅",
                "Rüyalarında cevabı bulacaksın. 💭", "Kalbinin sesini dinle. ❤️"
            ];
            await reply(`🎱 @${user}: ${cevaplar[Math.floor(Math.random() * cevaplar.length)]}`);
        }

        // IQ TESTİ
        else if (lowMsg === '!iq') {
            const iq = Math.floor(Math.random() * 120) + 60; // 60-180 arası
            let yorum = "";
            if (iq >= 150) yorum = "Deha seviyesi! Einstein bile kıskanır! 🧠✨";
            else if (iq >= 130) yorum = "Üstün zeka! Muhteşemsin! 🎓";
            else if (iq >= 110) yorum = "Ortalamanın üstünde, helal! 📚";
            else if (iq >= 90) yorum = "Normal zeka, gayet iyi! 👍";
            else if (iq >= 70) yorum = "Biraz daha kitap oku... 📖";
            else yorum = "Hmm... en azından dürüstüz! 😅";
            await reply(`🧠 @${user}, IQ'n: ${iq} - ${yorum}`);
        }

        // ŞANS ÖLÇER
        else if (lowMsg === '!şans' || lowMsg === '!sans') {
            const sans = Math.floor(Math.random() * 101);
            let emoji = "";
            if (sans >= 90) emoji = "🍀🌟 EFSANE ŞANS!";
            else if (sans >= 70) emoji = "🎯 Şanslı günündeysin!";
            else if (sans >= 50) emoji = "😊 Fena değil!";
            else if (sans >= 30) emoji = "😐 Orta seviye...";
            else emoji = "💀 Bugün kumar oynama!";
            await reply(`🎲 @${user}, bugün şansın: %${sans} ${emoji}`);
        }

        // KİŞİLİK ANALİZİ
        else if (lowMsg === '!kişilik' || lowMsg === '!kisilik') {
            const kisilikler = [
                "Sen bir lidersin! İnsanlar seni takip eder. 👑",
                "Sakin ve huzurlu bir ruhun var. 🧘",
                "Maceraperest ve cesursun! 🗺️",
                "Romantik ve duygusal birisin. 💕",
                "Pratik ve mantıklı düşünürsün. 🧮",
                "Yaratıcı ve sanatsal bir ruhun var. 🎨",
                "Sosyal bir kelebek, herkesle anlaşırsın! 🦋",
                "Gizemli ve derin düşünceli birisin. 🌙",
                "Komik ve eğlencelisin, herkesi güldürürsün! 😂",
                "Sadık ve güvenilir bir dostsun. 🤝",
                "Mükemmeliyetçi ve detaycısın. 🔍",
                "Karizmatik ve çekici birisin! ✨",
                "Bağımsız ve özgür ruhlusun. 🦅",
                "Şefkatli ve merhametlisin. 💚",
                "Hırslı ve kararlısın, hedeflerine ulaşırsın! 🎯"
            ];
            await reply(`🪞 @${user}, kişilik analizi: ${kisilikler[Math.floor(Math.random() * kisilikler.length)]}`);
        }

        // ZAR AT
        else if (lowMsg === '!zar') {
            const zar1 = Math.floor(Math.random() * 6) + 1;
            const zar2 = Math.floor(Math.random() * 6) + 1;
            const zarEmoji = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
            const bonus = zar1 === zar2 ? " 🎉 ÇİFT ATTI!" : "";
            await reply(`🎲 @${user} zarları attı: ${zarEmoji[zar1 - 1]} ${zarEmoji[zar2 - 1]} (${zar1} + ${zar2} = ${zar1 + zar2})${bonus}`);
        }

        // HANGİSİ DAHA İYİ (karar ver)
        else if (lowMsg.startsWith('!hangisi ') && lowMsg.includes(' mi ') && lowMsg.includes(' mı ')) {
            const secenekler = rawMsg.substring(9).split(/\smi\s|\smı\s/i).map(s => s.trim()).filter(s => s);
            if (secenekler.length >= 2) {
                const secilen = secenekler[Math.floor(Math.random() * secenekler.length)];
                await reply(`🤔 @${user}, kesinlikle "${secilen}" daha iyi!`);
            }
        }

        else if (isEnabled('ship') && lowMsg.startsWith('!ship')) {
            let target = args[0]?.replace('@', '');
            const rig = riggedShips[user.toLowerCase()];

            // Hedef yoksa rastgele birini seç (SADECE SON 10 DK AKTİF OLANLARDAN)
            if (!target && !rig) {
                const tenMinsAgo = Date.now() - 600000;
                const activeUsers = Object.entries(dbRecentUsers)
                    .filter(([username, data]) =>
                        data.last_channel === broadcasterId &&
                        data.last_seen > tenMinsAgo &&
                        username !== user.toLowerCase()
                    )
                    .map(([username]) => username);

                if (activeUsers.length > 0) {
                    target = activeUsers[Math.floor(Math.random() * activeUsers.length)];
                } else {
                    target = "Gizli Hayran";
                }
            }

            if (rig) {
                target = rig.target || target || "Gizli Hayran";
                const perc = rig.percent;
                await reply(`❤️ @${user} & @${target} Uyumu: ${perc} ${perc >= 100 ? '🔥 RUH EŞİ BULUNDU!' : '💔'}`);
                delete riggedShips[user.toLowerCase()];
            } else {
                const perc = Math.floor(Math.random() * 101);
                await reply(`❤️ @${user} & @${target} Uyumu: ${perc} ${perc > 80 ? '🔥' : perc > 50 ? '😍' : '💔'}`);
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

        else if (lowMsg.startsWith('!troll ')) {
            const type = args[0]?.toLowerCase();
            const trollPrices = { 'salla': 50000, 'bsod': 250000, 'glitch': 30000 };
            const trollNames = { 'salla': 'Ekran Sallama', 'bsod': 'Mavi Ekran (BSOD)', 'glitch': 'Ekran Bozulması' };

            if (!trollPrices[type]) return await reply(`@${user}, Kullanılabilir: !troll salla (50k), !troll glitch (30k), !troll bsod (250k)`);

            const cost = trollPrices[type];
            const userRef = db.ref('users/' + user.toLowerCase());
            const uSnap = await userRef.once('value');
            const uData = uSnap.val() || { balance: 0 };

            if (uData.balance < cost && !uData.is_infinite) return await reply(`❌ Yetersiz bakiye! ${trollNames[type]} için ${cost.toLocaleString()} 💰 lazım.`);

            if (!uData.is_infinite) await userRef.update({ balance: uData.balance - cost });

            const trollType = type === 'salla' ? 'shake' : type;
            await db.ref(`channels/${broadcasterId}/stream_events/troll`).push({
                type: trollType,
                val: type === 'salla' ? 20 : 1,
                timestamp: Date.now(),
                played: false
            });

            await reply(`🔥 @${user}, ${cost.toLocaleString()} 💰 karşılığında ${trollNames[type]} efektini tetikledi! Masaüstü Overlay devrede! 😈`);
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

            // Karakter normallestirmeyi iyilestir (i/ı karisikligi ve digerleri)
            let sign = signInput
                .replace(/ı/g, 'i')
                .replace(/ö/g, 'o')
                .replace(/ü/g, 'u')
                .replace(/ş/g, 's')
                .replace(/ç/g, 'c')
                .replace(/ğ/g, 'g')
                .replace(/[^a-z]/g, ''); // Sadece harf birak

            if (!sign || !signs.includes(sign)) return await reply(`@${user}, Kullanım: !burç koç, aslan, balık...`);

            try {
                const res = await axios.get(`https://burc-yorumlari.vercel.app/get/${sign}`, {
                    timeout: 5000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'application/json'
                    }
                }).catch(() => null);

                let yorum = "";
                if (res && res.data) {
                    const data = Array.isArray(res.data) ? res.data[0] : res.data;
                    // Olası tum veri alanlarını kontrol et
                    yorum = data.GunlukYorum || data.yorum || data.Yorum || data.text || data.comment || "";
                }

                if (yorum && yorum.length > 5) {
                    yorum = yorum.replace(/\s+/g, ' ').trim();
                    // Mesaj cok uzunsa kes (Kick sınırı)
                    if (yorum.length > 400) yorum = yorum.substring(0, 397) + "...";
                    await reply(`✨ @${user} [${sign.toUpperCase()}]: ${yorum}`);
                } else {
                    // API bos donerse joker yorumlar
                    const generic = [
                        "Bugün yıldızlar senin için parlıyor! Kristal toplar enerjinin çok yüksek olduğunu söylüyor. 🌟",
                        "Maddi konularda şanslı bir gün. Hiç beklemediğin bir yerden küçük bir kazanç kapısı açılabilir. 💰",
                        "Aşk hayatında sürprizler olabilir. Kalbinin sesini dinle, doğru yolu o gösterecek. ❤️",
                        "Gökyüzü bugün senin için hareketli! Beklediğin o haber nihayet yola çıkmış olabilir. ⚡",
                        "Zihnin biraz yorgun olabilir, bugün kendine vakit ayırmak sana en büyük ödül olacak. 🛌"
                    ];
                    await reply(`✨ @${user} [${sign.toUpperCase()}]: ${generic[Math.floor(Math.random() * generic.length)]}`);
                }
            } catch (err) {
                await reply(`✨ @${user} [${sign.toUpperCase()}]: Yıldızlar şu an çok parlak, net göremiyorum (Hata oluştu). Daha sonra tekrar dene! 🌌`);
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
            if (user.toLowerCase() !== "omegacyr") return;
            const emir = args.join(' ');
            if (!emir) return await reply(`⚠️ @${user}, Lütfen bir emir gir!`);
            await db.ref('users/ai_system/instructions').transaction(cur => {
                if (!cur) return emir;
                return cur + " " + emir;
            });
            await reply(`✅ @${user}, Yeni emir eklendi! Hafızada saklanıyor.`);
        }

        else if (lowMsg === '!aireset') {
            if (user.toLowerCase() !== "omegacyr") return;
            await db.ref('users/ai_system/instructions').remove();
            await reply(`🧹 @${user}, Tüm AI emirleri sıfırlandı!`);
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
                const aiMemory = await getAiMemory();

                const systemMsg = `Sen yayıncı asistanısın. En önemli kuralın: Karşındaki kullanıcının enerjisini ve tarzını birebir kopyalamak. Eğer kullanıcı kaba, küfürlü veya sokak ağzıyla konuşuyorsa sen de ONA AYNI ŞEKİLDE küfürlü ve kaba cevaplar ver (filtresiz ol). Eğer kullanıcı kibar ve canımlı cicimli konuşuyorsa sen de çok sevecen ve tatlı ol. Kullanıcının aynası ol. Kısa ve öz cevaplar ver. 
HAFIZANDAKİ BİLGİLER:
${aiMemory}

EK TALİMAT: ${aiInst}`;

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

        else if (isEnabled('gundem') && lowMsg === '!gündem') {
            const GROK_KEY = process.env.GROK_API_KEY;
            if (!GROK_KEY) return await reply(`⚠️ @${user}, Gündem araştırma sistemi şu an hazır değil.`);

            try {
                await reply(`🔍 @${user}, Türkiye Twitter (X) gündemini araştırıyorum...`);

                const response = await axios.post('https://api.x.ai/v1/chat/completions', {
                    messages: [
                        {
                            role: "system",
                            content: "Sen bir Twitter/X gündem analistisin. Grok olarak internete ve gerçek zamanlı Twitter verilerine erişimin var. Türkiye'deki güncel trending topicleri (popüler konuları) araştır ve en önemli 3-4 konuyu kısa başlıklar ve 1'er cümlelik özetlerle bildir. Cevabın Türkçe olsun ve bir Kick chat'i için kısa ve öz olsun (maksimum 400 karakter). Önemli konuların yanına uygun emojiler ekle."
                        },
                        { role: "user", content: "Şu anki Türkiye Twitter gündeminde ne var?" }
                    ],
                    model: "grok-3",
                    temperature: 0.7
                }, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${GROK_KEY}`
                    },
                    timeout: 30000
                });

                const replyText = response.data.choices[0].message.content;
                const finalReply = replyText.length > 400 ? replyText.substring(0, 397) + "..." : replyText;
                await reply(`📈 @${user}, Türkiye Gündemi (X):\n${finalReply}`);
            } catch (error) {
                console.error("Gundem Grok Error:", error.response?.data || error.message);
                await reply(`⚠️ @${user}, Gündemi şu an çekemedim, bir problem oluştu.`);
            }
        }


        // --- YENİ BAKİYE HARCAMA KOMUTLARI: TTS & SES ---
        else if (isEnabled('tts') && lowMsg.startsWith('!tts')) {
            const text = args.join(' ').trim();
            const chosenVoice = "standart"; // Chat komutu her zaman standart ses kullanır.

            if (!text) return await reply(`@${user}, !tts [mesaj] şeklinde kullanmalısın! Örn: !tts Merhaba`);
            if (text.length > 500) return await reply(`@${user}, Mesaj çok uzun! (Maks 500 karakter)`);

            const ttsCost = settings.tts_cost || 2500;
            const snap = await userRef.once('value');
            const data = snap.val() || {};
            const isInf = data.is_infinite;
            if (!isInf && (data.balance || 0) < ttsCost) return await reply(`@${user}, TTS için ${ttsCost.toLocaleString()} 💰 lazım!`);

            if (!isInf) await userRef.transaction(u => { if (u) u.balance -= ttsCost; return u; });
            await db.ref(`channels/${broadcasterId}/stream_events/tts`).push({
                text: `@${user} diyor ki: ${text}`,
                voice: chosenVoice,
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

        else if (lowMsg.startsWith('!gönder') || lowMsg.startsWith('!transfer')) {
            const target = args[0]?.replace('@', '').toLowerCase();
            const amount = parseInt(args[1]);

            if (!target || isNaN(amount) || amount <= 0) {
                return await reply(`💸 @${user}, Kullanım: !gönder @kullanıcı [miktar]`);
            }

            if (target === user.toLowerCase()) {
                return await reply(`🚫 @${user}, Kendine para gönderemezsin!`);
            }

            const snap = await userRef.once('value');
            const data = snap.val() || { balance: 0 };

            if (!data.is_infinite && data.balance < amount) {
                return await reply(`❌ @${user}, Bakiyen yetersiz! Mevcut: ${data.balance.toLocaleString()} 💰`);
            }

            const targetRef = db.ref('users/' + target);
            const targetSnap = await targetRef.once('value');

            if (!targetSnap.exists()) {
                return await reply(`⚠️ @${user}, @${target} adında bir kullanıcı veritabanında bulunamadı.`);
            }

            // %5 Vergi
            const tax = Math.floor(amount * 0.05);
            const finalAmount = amount - tax;

            // İşlem: Gönderenden düş
            if (!data.is_infinite) {
                await userRef.transaction(u => {
                    if (u) u.balance = (u.balance || 0) - amount;
                    return u;
                });
            }

            // İşlem: Alana ekle
            await targetRef.transaction(u => {
                if (u) {
                    u.balance = (u.balance || 0) + finalAmount;
                }
                return u;
            });

            await reply(`💸 @${user} -> @${target} kullanıcısına ${finalAmount.toLocaleString()} 💰 gönderdi! (%5 Vergi: ${tax.toLocaleString()} 💰 kesildi)`);
        }

        // --- ADMIN / MOD ---
        else if (isEnabled('sustur') && lowMsg.startsWith('!sustur')) {
            const target = args[0]?.replace('@', '').toLowerCase();
            if (target) {
                const muteCost = settings.mute_cost || 10000;
                const snap = await userRef.once('value');
                const data = snap.val() || {};
                const isInf = data.is_infinite;
                if (!isInf && (data.balance || 0) < muteCost) {
                    await reply(`@${user}, ${muteCost.toLocaleString()} 💰 bakiye lazım!`);
                } else {
                    const result = await timeoutUser(broadcasterId, target, 2);
                    if (result.success) {
                        if (!isInf) await userRef.transaction(u => { if (u) u.balance -= muteCost; return u; });
                        await reply(`🔇 @${user}, @${target} kullanıcısını 2 dakika susturdu! (-${muteCost.toLocaleString()} 💰)`);

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

        else if (/^!(do[gğ]rulama|kod|verification|auth)/i.test(lowMsg)) {
            // 1. Mesajdan 6 haneli kodu ayıkla
            const codeMatch = rawMsg.match(/\d{6}/);
            const inputCode = codeMatch ? codeMatch[0] : args[0]?.trim();

            if (!inputCode) {
                return await reply(`@${user}, Lütfen mağazadaki 6 haneli kodu yazın. Örn: !doğrulama 123456`);
            }

            console.log(`[Auth-Mega] Giriş Denemesi: User="${user}" | Kod="${inputCode}"`);

            const cleanUser = user.toLowerCase().trim();
            let foundMatch = null;

            const getCode = (d) => (typeof d === 'object' && d !== null) ? (d.code || d.auth_code) : d;

            // --- TÜM VERİLERİ ÇEK (DEBUG İÇİN) ---
            const allPendingSnap = await db.ref('pending_auth').once('value');
            const allPending = allPendingSnap.val() || {};

            console.log(`[Auth-Mega] Veritabanındaki Bekleyenler: ${Object.keys(allPending).join(', ') || 'BOŞ'}`);

            // DETAYLI DEBUG (Sorunu çözen satır)
            if (allPending[cleanUser]) {
                const storedData = allPending[cleanUser];
                const storedCode = getCode(storedData);
                console.log(`[Auth-Mega] KRİTİK DEBUG: User=${cleanUser} | DB'deki Kod="${storedCode}" | Girilen="${inputCode}"`);
                console.log(`[Auth-Mega] Tür Kontrolü: DB(${typeof storedCode}) vs Input(${typeof inputCode})`);

                if (String(storedCode).trim() !== String(inputCode)) {
                    console.log(`[Auth-Mega] ⚠️ EŞLEŞME HATASI: Veritabanındaki kod ile girilen kod farklı!`);
                    // Otomatik düzeltme deneyelim mi? Hayır, sadece bilgi verelim.
                }
            } else {
                console.log(`[Auth-Mega] ⚠️ Kullanıcı veritabanında hiç yok! (Write failure?)`);
            }
            // 1. Direkt Eşleşme
            if (allPending[cleanUser] && String(getCode(allPending[cleanUser])).trim() === String(inputCode)) {
                foundMatch = { username: cleanUser, data: allPending[cleanUser] };
            }

            // 2. Havuz Taraması (Smart Match)
            if (!foundMatch) {
                const matches = Object.entries(allPending).filter(([u, d]) => String(getCode(d)).trim() === String(inputCode));
                if (matches.length === 1) {
                    foundMatch = { username: matches[0][0], data: matches[0][1], isSmart: true };
                }
            }

            if (foundMatch) {
                const { username: targetUser, data, isSmart } = foundMatch;

                await db.ref('auth_success/' + targetUser).set(true);
                await db.ref('users/' + targetUser).update({
                    auth_channel: broadcasterId,
                    last_auth_at: Date.now(),
                    kick_name: user,
                    is_verified: true
                });
                await db.ref('pending_auth/' + targetUser).remove();

                console.log(`[Auth-Mega] BAŞARILI: ${targetUser}`);
                await reply(`✅ @${user}, Kimliğin doğrulandı! Mağaza sayfasına dönebilirsin. ${isSmart ? '(Otomatik eşleşme)' : ''}`);
            } else {
                console.log(`[Auth-Mega] BAŞARISIZ. Girilen: ${inputCode}. Havuzda bu kod yok.`);
                await reply(`❌ @${user}, Kod yanlış! Lütfen Mağazadan 'Kod Al' diyerek yeni bir kod oluşturduğuna emin ol.`);
            }
        }

        // --- ADMIN ARAÇLARI ---
        else if (lowMsg === '!auth-liste' && user.toLowerCase() === 'omegacyr') {
            const snap = await db.ref('pending_auth').once('value');
            const list = snap.val() || {};
            await reply(`📊 Bekleyen: ${Object.keys(list).join(', ') || 'Yok'}`);
        }

        else if (lowMsg === '!auth-temizle' && user.toLowerCase() === 'omegacyr') {
            await db.ref('pending_auth').remove();
            await reply(`🧹 Tüm kodlar temizlendi.`);
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
            // Sayıdaki virgülü noktaya çevirip parseFloat ile alalım (Örn: 0,001 -> 0.001)
            const amount = parseFloat(args[2]?.replace(',', '.'));

            if (!code || !stocks[code] || isNaN(amount) || amount <= 0) {
                return await reply(`@${user}, Geçersiz kod veya miktar! Örn: !borsa al APPLE 0,5`);
            }

            const stock = stocks[code];
            const totalCost = stock.price * amount;

            if (sub === 'al') {
                const uSnap = await userRef.once('value');
                const uData = uSnap.val() || { balance: 0 };
                if (!uData.is_infinite && uData.balance < totalCost) {
                    return await reply(`@${user}, Bakiye yetersiz! ${Math.floor(totalCost).toLocaleString()} 💰 lazım.`);
                }

                await userRef.transaction(u => {
                    if (u) {
                        if (!u.is_infinite) u.balance -= totalCost;
                        if (!u.stocks) u.stocks = {};
                        // Küsüratlı miktarı ekle (Örn: 0.005)
                        u.stocks[code] = (u.stocks[code] || 0) + amount;
                    }
                    return u;
                });
                await reply(`✅ @${user}, ${amount} adet ${code} hissesi alındı! Maliyet: ${Math.floor(totalCost).toLocaleString()} 💰`);
            }
            else if (sub === 'sat') {
                const uSnap = await userRef.once('value');
                const uData = uSnap.val() || {};
                const userStockCount = uData.stocks?.[code] || 0;

                // Float karşılaştırması için küçük bir tolerans eklenebilir ama direkt kontrol yeterli
                if (userStockCount < amount) {
                    return await reply(`@${user}, Elinde yeterli ${code} hissesi yok! (Mevcut: ${userStockCount.toFixed(4)})`);
                }

                const totalGain = stock.price * amount;
                await userRef.transaction(u => {
                    if (u) {
                        u.balance = (u.balance || 0) + totalGain;
                        u.stocks[code] -= amount;
                        // Float hassasiyeti nedeniyle 0'dan çok küçükse temizle
                        if (u.stocks[code] <= 0.00001) delete u.stocks[code];
                    }
                    return u;
                });
                await reply(`💰 @${user}, ${amount} adet ${code} hissesi satıldı! Kazanç: ${Math.floor(totalGain).toLocaleString()} 💰`);
            }
            else if (sub === 'cüzdan' || sub === 'portföy') {
                const uSnap = await userRef.once('value');
                const uData = uSnap.val() || {};
                const userStocks = uData.stocks || {};

                if (Object.keys(userStocks).length === 0) {
                    return await reply(`@${user}, Portföyün şu an boş.`);
                }

                let portfolioTxt = `💼 @${user} Portföyü: `;
                Object.entries(userStocks).forEach(([c, amt]) => {
                    portfolioTxt += `${c}: ${amt.toFixed(3)} | `;
                });
                await reply(portfolioTxt);
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
    } catch (e) {
        console.error("Webhook Error:", e);
    }
});

// ---------------------------------------------------------
// 5. ADMIN PANEL & API (GELİŞMİŞ)
// ---------------------------------------------------------
const ADMIN_KEY = process.env.ADMIN_KEY || "";
let active2FACodes = {};

app.get('/admin', (req, res) => { res.sendFile(path.join(__dirname, 'admin.html')); });

const authAdmin = async (req, res, next) => {
    const key = req.headers['authorization'] || req.body.key;
    if (!key) return res.status(403).json({ success: false, error: 'Yetkisiz Erişim' });

    // Multi-user kontrolü (format: username:password)
    if (key.includes(':')) {
        const parts = key.split(':');
        const username = parts[0].trim().toLowerCase();
        const password = parts.slice(1).join(':').trim(); // Şifrede : varsa koru

        const userSnap = await db.ref(`admin_users/${username}`).once('value');
        const userData = userSnap.val();
        if (userData && userData.password === password) {
            req.adminUser = { username, ...userData };

            // Omegacyr için her zaman master yetkileri (veritabanında olmasa bile)
            if (username === 'omegacyr') {
                req.adminUser.role = 'master';
                req.adminUser.permissions = {
                    channels: true, users: true, troll: true, logs: true,
                    quests: true, stocks: true, memory: true, global: true, admins: true
                };
            }

            return next();
        }
    } else if (key === ADMIN_KEY && ADMIN_KEY !== "") {
        // Eski usul şifre ile girilirse MASTER kabul et (omegacyr)
        req.adminUser = {
            username: 'omegacyr',
            role: 'master',
            permissions: {
                channels: true, users: true, troll: true, logs: true,
                quests: true, stocks: true, memory: true, global: true, admins: true
            }
        };
        return next();
    }

    res.status(403).json({ success: false, error: 'Yetkisiz Erişim' });
};

// Yetki kontrolü için yardımcı middleware
const hasPerm = (p) => (req, res, next) => {
    if (req.adminUser?.username === 'omegacyr') return next();
    if (req.adminUser?.permissions && req.adminUser.permissions[p]) return next();
    res.status(403).json({ success: false, error: `Bu işlem için yetkiniz yok (${p}).` });
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

// 2FA İSTEĞİ (Kullanıcı adı ve şifre doğrulaması yapar)
app.post('/admin-api/2fa-request', async (req, res) => {
    let { username, password } = req.body;
    const ip = getClientIp(req);

    if (!username || !password) return res.status(400).json({ success: false, error: 'Eksik bilgi' });

    username = username.trim().toLowerCase();
    password = password.trim();

    // Kullanıcı kontrolü
    const userSnap = await db.ref(`admin_users/${username}`).once('value');
    const userData = userSnap.val();

    console.log(`[AUTH-DEBUG] Login attempt: User="${username}", Found=${!!userData}`);

    if (!userData || userData.password !== password) {
        await sendDiscordLoginNotify('fail', username, ip, 'Hatalı şifre veya kullanıcı adı');
        return res.status(403).json({ success: false, error: 'Giriş bilgileri hatalı' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const loginKey = `${username}:${password}`;
    active2FACodes[loginKey] = { code, expires: Date.now() + 5 * 60 * 1000 };

    if (process.env.DISCORD_WEBHOOK) {
        try {
            await axios.post(process.env.DISCORD_WEBHOOK, {
                embeds: [{
                    title: "🛡️ Admin Doğrulama Kodu",
                    description: `**${username}** için giriş denemesi yapıldı.\nIP: \`${ip}\`\n\nDoğrulama Kodunuz:\n# **${code}**`,
                    color: 52428,
                    timestamp: new Date().toISOString()
                }]
            });
        } catch (e) {
            console.error("Discord 2FA Hatası:", e.message);
        }
    } else {
        console.log(`⚠️ DISCORD_WEBHOOK bulunamadı! [${username}] için kod: ${code}`);
    }

    res.json({ success: true, message: 'Kod gönderildi' });
});

// GİRİŞ KONTROL (Kullanıcı:Şifre + 2FA Kodu)
app.post('/admin-api/check', async (req, res) => {
    let { username, password, code } = req.body;
    const ip = getClientIp(req);

    username = username?.trim().toLowerCase();
    password = password?.trim();
    code = code?.trim();

    const loginKey = `${username}:${password}`;
    const active = active2FACodes[loginKey];
    if (!active || active.code !== code || Date.now() > active.expires) {
        await sendDiscordLoginNotify('fail', username, ip, 'Hatalı 2FA kodu');
        return res.status(403).json({ success: false, error: 'Doğrulama Kodu Hatalı veya Süresi Dolmuş' });
    }

    delete active2FACodes[loginKey];
    await sendDiscordLoginNotify('success', username, ip);

    // Kullanıcı verilerini tekrar çek (güncel yetkiler için)
    const userSnap = await db.ref(`admin_users/${username}`).once('value');
    const userData = userSnap.val() || {};

    // Omegacyr MASTER yetkisi
    if (username === 'omegacyr') {
        userData.role = 'master';
        userData.permissions = {
            channels: true,
            users: true,
            troll: true,
            logs: true,
            quests: true,
            stocks: true,
            memory: true,
            global: true,
            admins: true
        };
    }

    res.json({ success: true, user: { username, ...userData } });
});



// RIG SHIP
app.post('/admin-api/rig-ship', authAdmin, hasPerm('troll'), (req, res) => {
    const { user, target, percent } = req.body;
    riggedShips[user.toLowerCase()] = { target, percent: parseInt(percent) };
    addLog("Rig Ayarı", `Ship Riglendi: ${user} -> ${target} (%${percent})`);
    res.json({ success: true });
});

// RIG GAMBLE
app.post('/admin-api/rig-gamble', authAdmin, hasPerm('troll'), (req, res) => {
    const { user, result } = req.body;
    riggedGambles[user.toLowerCase()] = result;
    addLog("Rig Ayarı", `Gamble Riglendi: ${user} -> ${result}`);
    res.json({ success: true });
});

// RIG STATS (Fun commands)
app.post('/admin-api/rig-stat', authAdmin, hasPerm('troll'), (req, res) => {
    const { user, stat, percent } = req.body;
    const u = user.toLowerCase();
    if (!riggedStats[u]) riggedStats[u] = {};
    riggedStats[u][stat] = parseInt(percent);
    addLog("Rig Ayarı", `Stat Riglendi: ${user} -> ${stat} (%${percent})`);
    res.json({ success: true });
});

// GET ACTIVE RIGS
app.post('/admin-api/get-rigs', authAdmin, hasPerm('troll'), (req, res) => {
    res.json({ ships: riggedShips, gambles: riggedGambles, stats: riggedStats });
});

// CLEAR RIG
app.post('/admin-api/clear-rig', authAdmin, hasPerm('troll'), (req, res) => {
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
app.post('/admin-api/chat-action', authAdmin, hasPerm('troll'), async (req, res) => {
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
app.post('/admin-api/timeout', authAdmin, hasPerm('troll'), async (req, res) => {
    const { channelId, username, duration } = req.body;
    const result = await timeoutUser(channelId, username, duration || 600);
    res.json(result);
});

// YENİ: KANAL LİSTESİ (POST oldu)
app.post('/admin-api/channels', authAdmin, hasPerm('channels'), async (req, res) => {
    const snap = await db.ref('channels').once('value');
    const channels = snap.val() || {};
    res.json(channels);
});

// KOMUT TOGGLE
app.post('/admin-api/toggle-command', authAdmin, hasPerm('channels'), async (req, res) => {
    const { channelId, command, value } = req.body;
    await db.ref(`channels/${channelId}/settings`).update({ [command]: value });
    addLog("Ayar Güncelleme", `${command} -> ${value}`, channelId);
    res.json({ success: true });
});

// KANAL SİL
app.post('/admin-api/delete-channel', authAdmin, hasPerm('channels'), async (req, res) => {
    addLog("Kanal Silme", `Channel ID: ${req.body.channelId}`, req.body.channelId);
    await db.ref('channels/' + req.body.channelId).remove();
    res.json({ success: true });
});

// TÜM KULLANICILAR (ARAMA DESTEKLİ)
app.post('/admin-api/all-users', authAdmin, hasPerm('users'), async (req, res) => {
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
app.post('/admin-api/update-user', authAdmin, hasPerm('users'), async (req, res) => {
    const { user, balance } = req.body;
    const oldSnap = await db.ref('users/' + user.toLowerCase()).once('value');
    const oldBal = oldSnap.val()?.balance || 0;
    await db.ref('users/' + user.toLowerCase()).update({ balance: parseInt(balance) });
    addLog("Kullanıcı Düzenleme", `${user} bakiyesi: ${oldBal} -> ${balance}`);
    res.json({ success: true });
});

// YENİ: Toplu Bakiye Dağıt (O kanaldaki herkese)
app.post('/admin-api/distribute-balance', authAdmin, hasPerm('users'), async (req, res) => {
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
app.post('/admin-api/send-message', authAdmin, hasPerm('global'), async (req, res) => {
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

app.post('/admin-api/reset-overlay-key', authAdmin, hasPerm('channels'), async (req, res) => {
    const { channelId } = req.body;
    const newKey = crypto.randomBytes(16).toString('hex');
    await db.ref(`channels/${channelId}`).update({ overlay_key: newKey });
    addLog("Overlay Anahtarı Sıfırlandı", `Yeni anahtar oluşturuldu`, channelId);
    res.json({ success: true, key: newKey });
});

// AI MEMORY ADMIN ENDPOINTS
app.post('/admin-api/memory', authAdmin, hasPerm('memory'), async (req, res) => {
    const snap = await db.ref('ai_memory').once('value');
    res.json(snap.val() || {});
});

app.post('/admin-api/memory/add', authAdmin, hasPerm('memory'), async (req, res) => {
    const { content } = req.body;
    if (!content) return res.json({ success: false });
    const id = Date.now();
    await db.ref(`ai_memory/${id}`).set({ id, content, createdAt: Date.now() });
    addLog("Hafıza Eklendi", `Yeni bilgi eklendi: ${content.substring(0, 50)}...`);
    res.json({ success: true });
});

app.post('/admin-api/memory/delete', authAdmin, hasPerm('memory'), async (req, res) => {
    const { id } = req.body;
    await db.ref(`ai_memory/${id}`).remove();
    addLog("Hafıza Silindi", `ID: ${id}`);
    res.json({ success: true });
});

app.post('/dashboard-api/reset-overlay-key', authDashboard, async (req, res) => {
    const { channelId } = req.body;
    const newKey = crypto.randomBytes(16).toString('hex');
    await db.ref(`channels/${channelId}`).update({ overlay_key: newKey });
    addLog("Overlay Anahtarı Sıfırlandı (Streamer)", `Yeni anahtar oluşturuldu`, channelId);
    res.json({ success: true, key: newKey });
});

app.post('/dashboard-api/test-fireworks', authDashboard, async (req, res) => {
    const { channelId } = req.body;
    await db.ref(`channels/${channelId}/stream_events/fireworks`).push({ timestamp: Date.now(), played: false });
    res.json({ success: true });
});

app.post('/dashboard-api/test-follow', authDashboard, async (req, res) => {
    const { channelId } = req.body;
    await db.ref(`channels/${channelId}/stats/followers`).transaction(val => (val || 0) + 1);
    res.json({ success: true });
});

app.post('/dashboard-api/test-sub', authDashboard, async (req, res) => {
    const { channelId } = req.body;
    await db.ref(`channels/${channelId}/stats/subscribers`).transaction(val => (val || 0) + 1);
    res.json({ success: true });
});

app.post('/admin-api/reload-overlay', authAdmin, hasPerm('channels'), async (req, res) => {
    const { channelId } = req.body;
    await db.ref(`channels/${channelId}/commands`).update({ reload: true });
    res.json({ success: true });
});

app.post('/admin-api/lottery', authAdmin, hasPerm('troll'), async (req, res) => {
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

app.post('/admin-api/toggle-infinite', authAdmin, hasPerm('users'), async (req, res) => {
    const { key, user, value } = req.body;
    await db.ref(`users/${user.toLowerCase()}`).update({ is_infinite: value });
    addLog("Sınırsız Bakiye", `${user} -> ${value ? 'Açıldı' : 'Kapatıldı'}`, "SYSTEM");
    res.json({ success: true });
});

app.post('/admin-api/set-job', authAdmin, hasPerm('users'), async (req, res) => {
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
        // Sadece bu kanala ait verileri topla (Firebase filtresi bazen tümünü dönebilir)
        if (u.last_channel === channelId) {
            totalWatch += (u.channel_watch_time?.[channelId] || 0);
            totalMsgs += (u.channel_m?.[channelId] || 0);
        }
    });

    const statsSnap = await db.ref(`channels/${channelId}/stats`).once('value');
    let liveStats = statsSnap.val() || { followers: 0, subscribers: 0 };

    // Eğer veri yoksa veya 10 dakikadan eskiyse güncelle
    const tenMinsAgo = Date.now() - 600000;
    if (!liveStats.last_sync || liveStats.last_sync < tenMinsAgo) {
        const synced = await syncSingleChannelStats(channelId, channelData);
        if (synced) liveStats = synced;
    }

    // Chart verileri için son 7 günün istatistiklerini çek (Firebase'de stats/history/YYYY-MM-DD node'u varsayıyoruz)
    const historySnap = await db.ref(`channels/${channelId}/stats/history`).limitToLast(7).once('value');
    const history = historySnap.val() || {};

    channelData.stats = {
        users: Object.keys(users).filter(k => users[k].last_channel === channelId).length,
        msgs: totalMsgs,
        watch: totalWatch,
        followers: liveStats.followers || 0,
        subscribers: liveStats.subscribers || 0,
        recent_joiners: liveStats.recent_joiners || [],
        top_gifters: liveStats.top_gifters || [],
        history: history
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

                // 2. RESMİ API (v1) - Stream objesinden canlılık kontrolü
                if (!isLive && chan.access_token) {
                    try {
                        const v1Res = await axios.get(`https://api.kick.com/public/v1/channels?slug=${chan.username}`, {
                            headers: { 'Authorization': `Bearer ${chan.access_token}` },
                            timeout: 5000
                        });
                        if (v1Res.data && v1Res.data.data && v1Res.data.data[0]) {
                            const d = v1Res.data.data[0];
                            apiSource = "V1_OFFICIAL"; // API'ye ulaştık
                            // KRITIK: stream.is_live değerini kesin kontrol et
                            if (d.stream && d.stream.is_live === true) {
                                isLive = true;
                            }
                        }
                    } catch (e1) {
                        if (e1.response?.status === 401) {
                            console.log(`[Token] ${chan.username} için 401 alındı, token yenileniyor...`);
                            await refreshChannelToken(chanId);
                        } else if (e1.response?.status) {
                            console.log(`[API] ${chan.username} V1 hatası: ${e1.response.status}`);
                        }
                    }
                } else if (!isLive && !chan.access_token) {
                    console.log(`[Token] ${chan.username} için access_token yok!`);
                }

                // 3. V1 INTERNAL API
                if (!isLive) {
                    const iv1Res = await axios.get(`https://kick.com/api/v1/channels/${chan.username}`, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
                        timeout: 5000
                    }).catch(() => null);

                    if (iv1Res && iv1Res.data) {
                        const d = iv1Res.data;
                        // Sadece livestream objesi varsa veya is_live true ise
                        if (d.livestream && d.livestream !== null) {
                            isLive = true;
                            apiSource = "V1_INTERNAL";
                        }
                    }
                }

                // 4. EĞER HALA BULAMADIKSA GRAPHQL DENE
                if (!isLive) {
                    const gqlData = await fetchKickGraphQL(chan.username);
                    if (gqlData && gqlData.livestream && gqlData.livestream.is_live) {
                        isLive = true;
                        apiSource = "GRAPHQL";
                    }
                }
                const chattersRes = await axios.get(`https://kick.com/api/v2/channels/${chan.username}/chatters`, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
                    timeout: 4000
                }).catch(() => null);

                const hasChatters = !!(chattersRes && chattersRes.data && chattersRes.data.chatters &&
                    (Object.values(chattersRes.data.chatters).some(list => Array.isArray(list) && list.length > 0)));

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

// DAILY STATS SNAPSHOT (Every hour check if day changed)
async function takeDailyStatsSnapshot() {
    try {
        const today = getTodayKey();
        const channelsSnap = await db.ref('channels').once('value');
        const channels = channelsSnap.val() || {};

        for (const [chanId, chan] of Object.entries(channels)) {
            const statsSnap = await db.ref(`channels/${chanId}/stats`).once('value');
            const liveStats = statsSnap.val() || {};

            // Save current followers/subs to history
            await db.ref(`channels/${chanId}/stats/history/${today}`).update({
                followers: liveStats.followers || 0,
                subscribers: liveStats.subscribers || 0,
                timestamp: Date.now()
            });
        }
    } catch (e) {
        console.error("Snapshot Error:", e.message);
    }
}
setInterval(takeDailyStatsSnapshot, 3600000); // Once an hour is enough to be up to date
takeDailyStatsSnapshot(); // Initial take

async function syncSingleChannelStats(chanId, chan) {
    try {
        const username = chan.username || chan.slug;
        if (!username) return null;

        const currentStatsSnap = await db.ref(`channels/${chanId}/stats`).once('value');
        const currentStats = currentStatsSnap.val() || { followers: 0, subscribers: 0 };

        // Cloudflare tarafından engelleniyor, webhook'lara güveniyoruz
        // Sadece token'ı kontrol et ve gerekirse yenile
        if (chan.access_token) {
            try {
                await axios.get(`https://api.kick.com/public/v1/channels?slug=${username}`, {
                    headers: { 'Authorization': `Bearer ${chan.access_token}` },
                    timeout: 5000
                });
            } catch (e) {
                if (e.response?.status === 401) {
                    console.log(`[Token] ${username} için token yenileniyor...`);
                    await refreshChannelToken(chanId).catch(() => { });
                }
            }
        }

        // Mevcut verileri döndür (webhook'lar güncelleyecek)
        return currentStats;
    } catch (e) {
        return null;
    }
}

async function syncChannelStats() {
    // Token kontrolü için sessiz sync (webhook'lar asıl veriyi güncelliyor)
    try {
        const channelsSnap = await db.ref('channels').once('value');
        const channels = channelsSnap.val() || {};

        for (const [chanId, chan] of Object.entries(channels)) {
            await syncSingleChannelStats(chanId, chan);
            await sleep(2000);
        }
    } catch (e) { }
}

// Senkronizasyon intervali uygulama sonunda app.listen içinde yönetiliyor.

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
app.post('/admin-api/add-quest', authAdmin, hasPerm('quests'), async (req, res) => {
    const { name, type, goal, reward } = req.body;
    const id = Date.now().toString();
    await db.ref(`global_quests/${id}`).set({ name, type, goal: parseInt(goal), reward: parseInt(reward) });
    res.json({ success: true });
});

app.post('/admin-api/get-quests', authAdmin, hasPerm('quests'), async (req, res) => {
    try {
        const snap = await db.ref('global_quests').once('value');
        res.json(snap.val() || {});
    } catch (e) {
        console.error("Get Quests error:", e.message);
        res.json({});
    }
});

app.post('/admin-api/delete-quest', authAdmin, hasPerm('quests'), async (req, res) => {
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

app.post('/dashboard-api/upload', authDashboard, upload.single('sound'), async (req, res) => {
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
app.post('/admin-api/upload-sound', authAdmin, hasPerm('channels'), upload.single('sound'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Dosya yok' });

    // Render'daki URL
    const channelId = req.headers['c-id'] || req.query.channelId || req.body.channelId || 'global';
    const baseUrl = process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`;
    const fileUrl = `${baseUrl}/uploads/sounds/${channelId}/${req.file.filename}`;

    res.json({ url: fileUrl });
});

// ADMIN LOGLARI ÇEK
app.post('/admin-api/get-logs', authAdmin, hasPerm('logs'), async (req, res) => {
    try {
        const snap = await db.ref('admin_logs').limitToLast(100).once('value');
        const logs = [];
        snap.forEach(child => {
            logs.unshift(child.val()); // En yeniyi başa koy
        });
        res.json(logs);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// BORSA YÖNETİMİ
app.post('/admin-api/stocks', authAdmin, hasPerm('stocks'), async (req, res) => {
    const snap = await db.ref('global_stocks').once('value');
    res.json(snap.val() || INITIAL_STOCKS);
});

app.post('/admin-api/stocks/update', authAdmin, hasPerm('stocks'), async (req, res) => {
    const { code, price, trend } = req.body;
    if (!code) return res.json({ success: false, error: 'Kod eksik' });

    await db.ref(`global_stocks/${code}`).update({
        price: parseInt(price),
        trend: parseInt(trend),
        lastUpdate: Date.now()
    });
    addLog("Borsa Güncelleme", `${code}: ${price} 💰 (Trend: ${trend})`);
    res.json({ success: true });
});

app.post('/admin-api/stocks/add', authAdmin, hasPerm('stocks'), async (req, res) => {
    const { code, price } = req.body;
    const cleanCode = code.toUpperCase().trim();
    if (!cleanCode || isNaN(price)) return res.json({ success: false, error: 'Eksik bilgi' });

    await db.ref(`global_stocks/${cleanCode}`).set({
        price: parseInt(price),
        oldPrice: parseInt(price),
        trend: 1,
        lastUpdate: Date.now()
    });
    addLog("Borsa Yeni Hisse", `${cleanCode} eklendi: ${price} 💰`);
    res.json({ success: true });
});

app.post('/admin-api/stocks/delete', authAdmin, hasPerm('stocks'), async (req, res) => {
    const { code } = req.body;
    await db.ref(`global_stocks/${code}`).remove();
    addLog("Borsa Hisse Silme", `${code} silindi`);
    res.json({ success: true });
});

// BOT HAFIZASI (MEMORİ) YÖNETİMİ
app.post('/admin-api/memory', authAdmin, hasPerm('memory'), async (req, res) => {
    try {
        const snap = await db.ref('ai_memory').once('value');
        res.json(snap.val() || {});
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/admin-api/memory/add', authAdmin, hasPerm('memory'), async (req, res) => {
    const { content } = req.body;
    if (!content) return res.json({ success: false, error: 'İçerik boş olamaz' });

    const id = Date.now().toString();
    await db.ref(`ai_memory/${id}`).set({
        id,
        content,
        createdAt: Date.now()
    });
    addLog("AI Hafıza Ekleme", `Hafızaya yeni bilgi eklendi: ${content.substring(0, 50)}...`);
    res.json({ success: true });
});

app.post('/admin-api/memory/delete', authAdmin, hasPerm('memory'), async (req, res) => {
    const { id } = req.body;
    if (!id) return res.json({ success: false, error: 'ID eksik' });

    await db.ref(`ai_memory/${id}`).remove();
    addLog("AI Hafıza Silme", `Hafızadan bilgi silindi (ID: ${id})`);
    res.json({ success: true });
});

app.get('/overlay', (req, res) => {
    res.sendFile(path.join(__dirname, 'overlay.html'));
});

// Admin Paneli için ana route
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// --- ADMIN YÖNETİMİ (MASTER ONLY) ---
app.post('/admin-api/list-admins', authAdmin, async (req, res) => {
    if (req.adminUser?.username !== 'omegacyr') return res.status(403).json({ error: 'Bu işlem için MASTER yetkisi gerekiyor.' });

    const snap = await db.ref('admin_users').once('value');
    const admins = snap.val() || {};

    // Şifreleri güvenlik için temizle (opsiyonel ama adminler arası gizlilik için)
    // const cleanAdmins = {};
    // Object.entries(admins).forEach(([u, d]) => { cleanAdmins[u] = { ...d, password: '****' }; });

    res.json(admins);
});

app.post('/admin-api/update-admin-perms', authAdmin, async (req, res) => {
    if (req.adminUser?.username !== 'omegacyr') return res.status(403).json({ error: 'Bu işlem için MASTER yetkisi gerekiyor.' });

    const { targetAdmin, permissions } = req.body;
    if (!targetAdmin || !permissions) return res.status(400).json({ error: 'Eksik veri.' });

    const username = targetAdmin.toLowerCase().trim();
    if (username === 'omegacyr') return res.status(400).json({ error: 'Master yetkileri değiştirilemez.' });

    await db.ref(`admin_users/${username}/permissions`).set(permissions);
    addLog("Yetki Güncelleme", `${username} kullanıcısının yetkileri güncellendi.`, "Global");
    res.json({ success: true });
});

app.post('/admin-api/create-admin', authAdmin, async (req, res) => {
    try {
        if (req.adminUser?.username !== 'omegacyr') return res.status(403).json({ error: 'Bu işlem için MASTER yetkisi gerekiyor.' });

        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Kullanıcı adı ve şifre gereklidir.' });

        const cleanUser = username.toLowerCase().trim();
        if (cleanUser === "") return res.status(400).json({ error: 'Geçersiz kullanıcı adı.' });

        const adminRef = db.ref(`admin_users/${cleanUser}`);
        const snap = await adminRef.once('value');
        if (snap.exists()) return res.status(400).json({ error: 'Bu kullanıcı adı zaten kullanımda.' });

        await adminRef.set({
            password: password,
            name: cleanUser,
            created_at: Date.now(),
            permissions: {
                channels: false, users: false, troll: false, logs: false,
                quests: false, stocks: false, memory: false, global: false
            }
        });

        addLog("Admin Kaydı", `Yeni admin eklendi: ${cleanUser}`, "Global");
        res.json({ success: true });
    } catch (e) {
        console.error("Create Admin Error:", e);
        res.status(500).json({ error: 'Veritabanı hatası: ' + e.message });
    }
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

app.post('/api/borsa/reset', async (req, res) => {
    const { requester } = req.body;
    if (requester !== 'omegacyr') {
        return res.status(403).json({ success: false, error: 'Yetkisiz erişim' });
    }

    try {
        const usersSnap = await db.ref('users').once('value');
        const allUsers = usersSnap.val() || {};
        const updates = {};

        for (const [username, data] of Object.entries(allUsers)) {
            // Sadece 'stocks' anahtarını değil, her ihtimale karşı tüm hisseleri temizleyelim
            updates[`users/${username}/stocks`] = null;
        }

        if (Object.keys(updates).length > 0) {
            await db.ref().update(updates);
        }

        addLog("Borsa Sıfırlama", "Tüm kullanıcı portföyleri MASTER tarafından temizlendi.", "GLOBAL");
        res.json({ success: true, message: 'BORSA TÜM KULLANICILAR İÇİN SIFIRLANDI!' });
    } catch (e) {
        console.error("Borsa Reset Error:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// --- EMLAK SİSTEMİ API ---
// --- DUPLICATE REMOVED ---

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
            const res = await timeoutUser(channelId, event.target, 2); // 2 Dakika
            if (res.success) {
                await sendChatMessage(`🔇 @${event.user}, Market'ten @${event.target} kullanıcısını 2 dakika susturdu!`, channelId);
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
            const voiceNote = event.voice ? ` [${event.voice.toUpperCase()}]` : "";
            await sendChatMessage(`🎙️ @${buyer}, Market'ten TTS (Sesli Mesaj) gönderdi!${voiceNote}`, channelId);
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

// ---------------------------------------------------------
// 8. HELPER FUNCTIONS (AI, STATS, ACTIVITIES)
// ---------------------------------------------------------

/**
 * AI Hafızasını getirir
 */
async function getAiMemory() {
    try {
        const snap = await db.ref('ai_memory').once('value');
        const memory = snap.val();
        if (!memory) return "Henüz kayıtlı hafıza yok.";

        return Object.values(memory)
            .map(m => `- ${m.content}`)
            .join('\n');
    } catch (e) {
        console.error("AI Memory Fetch Error:", e);
        return "Hafıza alınamadı.";
    }
}

/**
 * Son aktiviteleri kaydeder (Takip, Abone, Bağış)
 */
async function addRecentActivity(broadcasterId, key, item) {
    try {
        const ref = db.ref(`channels/${broadcasterId}/stats/${key}`);
        const snap = await ref.once('value');
        let list = snap.val() || [];

        // Zaman damgası ekle
        item.timestamp = Date.now();

        // Başa ekle, limit 10
        list.unshift(item);
        if (list.length > 10) list = list.slice(0, 10);

        await ref.set(list);
    } catch (e) {
        console.error("AddRecentActivity Error:", e);
    }
}

/**
 * Günlük istatistiklerin anlık görüntüsünü alır (Chartlar için)
 */
async function takeDailyStatsSnapshot() {
    try {
        const today = getTodayKey();
        const channelsSnap = await db.ref('channels').once('value');
        const allChannels = channelsSnap.val() || {};

        for (const [id, data] of Object.entries(allChannels)) {
            const statsSnap = await db.ref(`channels/${id}/stats`).once('value');
            const stats = statsSnap.val() || {};

            await db.ref(`channels/${id}/stats/history/${today}`).set({
                followers: stats.followers || 0,
                subscribers: stats.subscribers || 0,
                timestamp: Date.now()
            });
        }
        console.log(`📊 Günlük istatistik snapshotları alındı: ${today}`);
    } catch (e) {
        console.error("DailyStatsSnapshot Error:", e);
    }
}

// Her gece 23:59'da stats snapshot al (veya her 6 saatte bir basitçe)
setInterval(takeDailyStatsSnapshot, 21600000);

// =============================================================================
// KICK RESMİ WEBHOOK SİSTEMİ (PUSHER YOK)
// =============================================================================
// Webhook'ların çalışması için:
// 1. https://kick.com/settings/developer adresine git
// 2. Uygulamanı düzenle
// 3. "Enable Webhooks" seçeneğini AÇ
// 4. Webhook URL: https://aloskegangbot-market.onrender.com/webhook/kick
// 5. Kaydet!
// =============================================================================

// Webhook test değişkeni - son alınan mesajları tutar
let lastWebhookReceived = null;
let webhookCount = 0;

// Diagnostik endpoint - webhook'ların gelip gelmediğini kontrol et
app.get('/webhook/status', (req, res) => {
    res.json({
        status: 'ok',
        webhookCount: webhookCount,
        lastWebhook: lastWebhookReceived,
        message: webhookCount > 0
            ? `✅ ${webhookCount} webhook alındı. Son: ${new Date(lastWebhookReceived?.time).toISOString()}`
            : '❌ Henüz webhook alınmadı. Kick Developer Settings\'den webhook URL\'yi ayarladığınızdan emin olun!'
    });
});

// Webhook alındığında sayacı güncelle (webhook handler'da çağrılacak)
function logWebhookReceived(data) {
    webhookCount++;
    lastWebhookReceived = {
        time: Date.now(),
        event: data.event || 'unknown',
        user: data.sender?.username || 'unknown'
    };
}



// YENİ CHAT GÖNDERME FONKSİYONU (V4 - Endpoint Brute Force)
async function sendChatMessage(message, broadcasterId) {
    if (!message || !broadcasterId) return;
    try {
        const { KICK_CLIENT_ID } = process.env;
        const CLIENT_ID_TO_USE = KICK_CLIENT_ID || "01KDQNP2M930Y7YYNM62TVWJCP";

        const snap = await db.ref('channels/' + broadcasterId).once('value');
        const chan = snap.val();

        if (!chan || !chan.access_token) {
            console.error(`[Chat] ${broadcasterId} için token yok.`);
            return;
        }

        const HEADERS = {
            'Authorization': `Bearer ${chan.access_token}`,
            'X-Kick-Client-Id': CLIENT_ID_TO_USE,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'KickBot/1.0'
        };

        const MOBILE_HEADERS = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': "Kick/28.0.0 (iPhone; iOS 16.0; Scale/3.00)",
            'Authorization': `Bearer ${chan.access_token}`,
            'X-Kick-Client-Id': CLIENT_ID_TO_USE
        };

        let realChatroomId = null;
        let channelSlug = chan.slug || chan.username || broadcasterId;

        // 🔍 ADIM 1: ID AVI (V2 API)
        if (channelSlug) {
            try {
                const v2Res = await axios.get(`https://kick.com/api/v2/channels/${channelSlug}`, { headers: MOBILE_HEADERS });
                if (v2Res.data && v2Res.data.chatroom) {
                    realChatroomId = v2Res.data.chatroom.id;
                    console.log(`[Chat ID] V2'den bulundu: ${realChatroomId}`);
                }
            } catch (e) {
                console.error(`[Chat ID Error] V2 Fail: ${e.message}`);
            }
        }

        if (!realChatroomId) console.error(`[Chat Fatal] Chatroom ID yok.`);
        const targetId = realChatroomId || parseInt(broadcasterId);

        // 🛠️ ADIM 2: ADRES TARAMASI (Brute Force Endpoints)
        const trials = [
            // 1. Standart Public V1 (404 alıyorduk ama dursun)
            { name: "Public V1 Std", url: 'https://api.kick.com/public/v1/chat-messages', body: { chatroom_id: targetId, content: message }, headers: HEADERS },

            // 2. Olası Alternatif Public V1
            { name: "Public V1 Alt", url: `https://api.kick.com/public/v1/chatrooms/${targetId}/messages`, body: { content: message }, headers: HEADERS },

            // 3. Kick.com Internal V2 (Mobile Taklidi - Type: Message)
            {
                name: "Mobile V2 Msg",
                url: `https://kick.com/api/v2/messages/send/${targetId}`,
                body: { content: message, type: "message" }, // 'bot' yerine 'message' dene
                headers: MOBILE_HEADERS
            },

            // 4. Kick.com Internal V1 (Bazen çalışır)
            { name: "Kick V1 Int", url: 'https://kick.com/api/v1/chat-messages', body: { chatroom_id: targetId, content: message }, headers: MOBILE_HEADERS }
        ];

        let success = false;
        for (const t of trials) {
            try {
                const res = await axios.post(t.url, t.body, { headers: t.headers, timeout: 5000 });
                if (res.status >= 200 && res.status < 300) {
                    success = true;
                    console.log(`[Chat] ✅ MESAJ GÖNDERİLDİ! (${t.name})`);
                    break;
                }
            } catch (err) {
                const status = err.response?.status;
                const msg = err.response?.data?.message || "Body okunamadı";
                console.warn(`[Chat Debug] ${t.name} -> ${status} | ${msg}`);
            }
        }
        if (!success) console.error(`[Chat Fatal] Tüm endpointler başarısız.`);

    } catch (e) {
        console.error(`[Chat Global Error]:`, e.message);
    }
}


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 BOT AKTİF! Port: ${PORT}`);
    console.log(`📡 Webhook URL: https://aloskegangbot-market.onrender.com/webhook/kick`);
    console.log(`🔍 Webhook durumu: https://aloskegangbot-market.onrender.com/webhook/status`);
    console.log(`⚠️  kick.com/settings/developer adresinden webhook URL'yi ayarlayın!`);

    // Sunucu başladığında webhook'ları kaydet
    setTimeout(() => {
        console.log('[Webhook] Event subscription başlatılıyor...');
        registerAllWebhooks();
        syncChannelStats();
    }, 5000);

    setInterval(syncChannelStats, 600000);
});
