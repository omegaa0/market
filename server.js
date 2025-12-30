require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const path = require('path');
const crypto = require('crypto');
const firebase = require('firebase/compat/app');
require('firebase/compat/database');

const app = express();
app.use(express.static(__dirname));
app.use(bodyParser.json());

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

// GLOBAL STATES
const activeDuels = {};
const channelHeists = {};
const channelLotteries = {};
const channelPredictions = {};
const heistHistory = {}; // { broadcasterId: [timestamp1, timestamp2] }
const riggedGambles = {};
const riggedShips = {};

// PKCE
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
    const scopes = "chat:write events:subscribe user:read channel:read moderation:ban";
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

        // KanalÄ± ayrÄ± olarak kaydet
        await db.ref('channels/' + bid).set({
            access_token: response.data.access_token,
            refresh_token: response.data.refresh_token,
            username: userData.name.toLowerCase(),
            broadcaster_id: bid,
            updatedAt: Date.now(),
            settings: { // VarsayÄ±lan hepsi aÃ§Ä±k
                slot: true, yazitura: true, kutu: true,
                duello: true, soygun: true, fal: true,
                ship: true, hava: true, soz: true, zenginler: true
            }
        });

        await subscribeToChat(response.data.access_token, bid);
        res.send(`<body style='background:#111;color:lime;text-align:center;padding-top:100px;'><h1>✅ ${userData.name} KANALI EKLENDİ!</h1></body>`);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

async function subscribeToChat(token, broadcasterId) {
    try {
        await axios.post('https://api.kick.com/public/v1/events/subscriptions', {
            broadcaster_user_id: parseInt(broadcasterId),
            events: [{ name: "chat.message.sent", version: 1 }],
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

        // YÃ¶ntem 2: Public v1 channels endpoint
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
        console.log(`⚠️ API başarısız. Chat komutu deneniyor: /timeout @${targetUsername} ${duration}`);
        try {
            await sendChatMessage(`/timeout @${targetUsername} ${duration}`, broadcasterId);
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
    res.status(200).send('OK');
    const payload = req.body;
    const event = payload.data || payload;

    // Robust Broadcaster ID Discovery
    let broadcasterId =
        event.broadcaster_user_id ||
        payload.broadcaster_user_id ||
        event.broadcaster?.user_id ||
        event.broadcaster?.id ||
        payload.broadcaster?.user_id ||
        payload.broadcaster?.id ||
        event.channel?.user_id ||
        event.channel?.id ||
        payload.channel?.user_id ||
        payload.channel?.id ||
        event.chatroom_id ||
        payload.chatroom_id;

    if (!broadcasterId) return;
    broadcasterId = String(broadcasterId); // String'e çevir ki cooldown objesi şaşmasın

    const channelRef = await db.ref('channels/' + broadcasterId).once('value');
    const channelData = channelRef.val();

    if (!channelData) {
        console.log(`❌ Kanal veritabanında yok: ${broadcasterId}`);
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

    // --- OTOMATİK KAYIT & AKTİFLİK TAKİBİ ---
    const userSnap = await userRef.once('value');
    if (!userSnap.exists()) {
        await userRef.set({ balance: 1000, last_seen: Date.now(), created_at: Date.now() });
    } else {
        await userRef.update({ last_seen: Date.now() });
    }

    // KICK ID KAYDET (Susturma işlemleri için)
    if (event.sender?.user_id) {
        await db.ref('kick_ids/' + user.toLowerCase()).set(event.sender.user_id);
    }

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

    // --- KOMUT ZİNCİRİ ---
    // SELAM - Sadece tam kelime olarak geçiyorsa cevap ver (ve cooldown)
    const selamRegex = /\b(sa|sea|selam|selamlar|slm|selamün aleyküm|selamünaleyküm)\b/i;
    const selamCooldowns = global.selamCooldowns || (global.selamCooldowns = {});
    const userCooldownKey = `${broadcasterId}_${user.toLowerCase()}`;
    const now = Date.now();

    if (selamRegex.test(lowMsg) && !lowMsg.startsWith('!') && !lowMsg.includes('aleyküm')) {
        // Aynı kullanıcıya 60 saniye içinde tekrar cevap verme
        if (!selamCooldowns[userCooldownKey] || now - selamCooldowns[userCooldownKey] > 60000) {
            selamCooldowns[userCooldownKey] = now;
            await reply(`Aleyküm selam @${user}! Hoş geldin. 👋`);
        }
    }

    else if (lowMsg === '!bakiye') {
        const snap = await userRef.once('value');
        await reply(`@${user}, Bakiyeniz: ${(snap.val()?.balance || 0).toLocaleString()} 💰`);
    }

    else if (lowMsg === '!günlük') {
        const snap = await userRef.once('value');
        const data = snap.val() || { balance: 1000, lastDaily: 0 };
        const now = Date.now();
        if (now - data.lastDaily < 86400000) {
            const diff = 86400000 - (now - data.lastDaily);
            const hours = Math.floor(diff / 3600000);
            return await reply(`@${user}, ⏳ Günlük ödül için ${hours} saat beklemelisin.`);
        }
        data.balance = (data.balance || 0) + 500; data.lastDaily = now;
        await userRef.set(data);
        await reply(`🎁 @${user}, +500 💰 eklendi! ✅`);
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

        if (now > data.slot_reset) { data.slot_count = 0; data.slot_reset = now + 3600000; }
        if (data.slot_count >= 5) return await reply(`@${user}, 🚨 Slot limitin doldu! (5/saat)`);
        if (data.balance < cost) return await reply(`@${user}, Yetersiz bakiye!`);

        data.balance -= cost;
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
            data.balance += refund;
            await userRef.update(data);
            await reply(`🎰 | ${s[0]} | ${s[1]} | ${s[2]} | @${user} Kaybettin (%10 İade: +${refund})`);
        } else {
            data.balance += prize;
            await userRef.update(data);
            await reply(`🎰 | ${s[0]} | ${s[1]} | ${s[2]} | @${user} KAZANDIN (+${prize.toLocaleString()}) 💰`);
        }
    }

    else if (isEnabled('yazitura') && lowMsg.startsWith('!yazitura')) {
        const cost = parseInt(args[0]);
        const pick = args[1]?.toLowerCase();
        if (isNaN(cost) || !['y', 't', 'yazı', 'tura'].includes(pick)) return await reply(`@${user}, Kullanım: !yazitura [miktar] [y/t]`);
        const snap = await userRef.once('value');
        const data = snap.val() || { balance: 0 };
        if (data.balance < cost) return await reply(`@${user}, Bakiye yetersiz!`);

        data.balance -= cost;
        const rig = checkRig();
        const isYazi = pick.startsWith('y');
        let win;

        if (rig === 'win') win = true;
        else if (rig === 'lose') win = false;
        else {
            // WinRate kontrolü (YAZI TURA)
            const roll = Math.random() * 100;
            if (roll < wrYazitura) {
                // Kazanması lazım - Seçtiği gelir
                win = true;
            } else {
                // Kaybetmesi lazım - Seçtiğinin tersi gelir
                win = false;
            }
        }

        const resDisplay = win ? (isYazi ? 'YAZI' : 'TURA') : (isYazi ? 'TURA' : 'YAZI');
        if (win) {
            const prize = Math.floor(cost * multYT);
            data.balance += prize;
            await reply(`🪙 Para fırlatıldı... ${resDisplay}! @${user} KAZANDIN (+${prize.toLocaleString()})`);
        } else {
            const refund = Math.floor(cost * 0.1);
            data.balance += refund;
            await reply(`🪙 Para fırlatıldı... ${resDisplay}! @${user} Kaybettin (%10 İade: +${refund})`);
        }
        await userRef.update({ balance: data.balance });
    }

    else if (isEnabled('kutu') && lowMsg.startsWith('!kutu')) {
        const cost = parseInt(args[0]); const choice = parseInt(args[1]);
        if (isNaN(cost) || isNaN(choice) || choice < 1 || choice > 3) return await reply(`@${user}, Kullanım: !kutu [miktar] [1-3]`);
        const snap = await userRef.once('value');
        const data = snap.val() || { balance: 0 };
        if (data.balance < cost) return await reply(`@${user}, Bakiye yetersiz!`);

        data.balance -= cost;
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

    else if (isEnabled('duello') && lowMsg.startsWith('!duello')) {
        const target = args[0]?.replace('@', '').toLowerCase();
        const amt = parseInt(args[1]);
        if (!target || isNaN(amt)) return await reply(`@${user}, Kullanım: !duello @target [miktar]`);

        const snap = await userRef.once('value');
        const userData = snap.val() || { balance: 0 };
        if (userData.balance < amt) return await reply('Bakiye yetersiz.');

        const targetSnap = await db.ref('users/' + target).once('value');
        if (!targetSnap.exists() || targetSnap.val().balance < amt) return await reply('Rakibin bakiyesi yetersiz.');

        activeDuels[target] = { challenger: user, amount: amt, expire: Date.now() + 60000, channel: broadcasterId };
        await reply(`⚔️ @${target}, @${user} sana ${amt} 💰 karşılığında meydan okudu! Kabul için: !kabul`);
    }

    else if (lowMsg === '!kabul') {
        const d = activeDuels[user.toLowerCase()];
        if (!d || Date.now() > d.expire || d.channel !== broadcasterId) return;
        delete activeDuels[user.toLowerCase()];
        const winner = Math.random() < 0.5 ? d.challenger : user;
        const loser = winner === user ? d.challenger : user;
        await db.ref('users/' + winner.toLowerCase()).transaction(u => { if (u) u.balance += d.amount; return u; });
        await db.ref('users/' + loser.toLowerCase()).transaction(u => { if (u) u.balance -= d.amount; return u; });
        await reply(`🏆 @${winner} düelloyu kazandı ve ${d.amount} 💰 kaptı! ⚔️`);
    }

    else if (isEnabled('soygun') && lowMsg === '!soygun') {
        const h = channelHeists[broadcasterId];
        if (!h) {
            // Cooldown kontrolü: Saatte 2 kere
            const now = Date.now();
            const hourAgo = now - 3600000;
            heistHistory[broadcasterId] = (heistHistory[broadcasterId] || []).filter(ts => ts > hourAgo);

            if (heistHistory[broadcasterId].length >= 2) {
                const nextAvailableTs = heistHistory[broadcasterId][0] + 3600000;
                const nextAvailableMin = Math.ceil((nextAvailableTs - now) / 60000);
                return await reply(`🚨 Bu kanal için soygun limiti doldu! (Saatte maks 2). Yeni soygun için ~${nextAvailableMin} dk bekleyin.`);
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
                    for (let pName of activeH.p) {
                        await db.ref('users/' + pName.toLowerCase()).transaction(u => {
                            if (!u) u = { balance: 0 };
                            u.balance = (u.balance || 0) + share;
                            return u;
                        });
                    }
                    await reply(`💥 BANKA PATLADI! Ekip toplam ${totalPot.toLocaleString()} 💰 kaptı! Kişi başı: +${share.toLocaleString()} 💰`);
                } else {
                    await reply(`🚔 POLİS BASKINI! Soygun başarısız, herkes dağılsın! 👮‍♂️`);
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
            "Eskiden gelen bir borç veya alacak bugün kapanabilir. 💳"
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
        const sorted = Object.entries(snap.val() || {}).sort((a, b) => (b[1].balance || 0) - (a[1].balance || 0)).slice(0, 5);
        let txt = "🏆 EN ZENGİNLER: ";
        sorted.forEach((u, i) => txt += `${i + 1}. ${u[0]} (${u[1].balance.toLocaleString()}) | `);
        await reply(txt);
    }

    else if (settings.hava !== false && lowMsg.startsWith('!hava')) {
        const city = args.join(' ');
        if (city.toLowerCase() === "kürdistan") {
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
            "Hayat bir kitaptır, gezmeyenler sadece bir sayfasını okur."
        ];
        await reply(`✍️ @${user}: ${list[Math.floor(Math.random() * list.length)]}`);
    }

    else if (isEnabled('fal') && lowMsg === '!efkar') {
        const p = Math.floor(Math.random() * 101);
        await reply(`🚬 @${user} Efkar Seviyesi: %${p} ${p > 70 ? '😩🚬' : '🍷'}`);
    }

    // --- YENİ BAKİYE HARCAMA KOMUTLARI: TTS & SES ---
    else if (lowMsg.startsWith('!tts')) {
        const text = args.join(' ');
        if (!text) return await reply(`@${user}, !tts [mesaj] şeklinde kullanmalısın!`);
        if (text.length > 100) return await reply(`@${user}, Mesaj çok uzun! (Maks 100 karakter)`);

        const snap = await userRef.once('value');
        if ((snap.val()?.balance || 0) < 2500) return await reply(`@${user}, TTS için 2.500 💰 lazım!`);

        await userRef.transaction(u => { if (u) u.balance -= 2500; return u; });
        await db.ref('stream_events/tts').push({ text: `@${user} diyor ki: ${text}`, played: false, timestamp: Date.now() });
        await reply(`🎙️ @${user}, Mesajın yayına gönderildi! (-2,500 💰)`);
    }

    else if (lowMsg.startsWith('!ses')) {
        const soundId = args[0]?.toLowerCase();
        const sounds = ["alkis", "gol", "korku", "gulme"];
        if (!soundId || !sounds.includes(soundId)) return await reply(`@${user}, Geçersiz ses! Mevcutlar: ${sounds.join(', ')}`);

        const snap = await userRef.once('value');
        if ((snap.val()?.balance || 0) < 1000) return await reply(`@${user}, Ses efekti için 1.000 💰 lazım!`);

        await userRef.transaction(u => { if (u) u.balance -= 1000; return u; });
        await db.ref('stream_events/sound').push({ soundId, played: false, timestamp: Date.now() });
        await reply(`🎵 @${user}, ${soundId} sesi çalınıyor! (-1,000 💰)`);
    }

    else if (lowMsg === '!sesler') {
        await reply(`🔊 Mevcut Sesler: alkis, gol, korku, gulme (!ses [ad] ile kullanabilirsin)`);
    }

    // --- ADMIN / MOD ---
    else if (lowMsg.startsWith('!sustur')) {
        const target = args[0]?.replace('@', '').toLowerCase();
        if (target) {
            const snap = await userRef.once('value');
            if ((snap.val()?.balance || 0) < 10000) {
                await reply(`@${user}, 10.000 💰 bakiye lazım!`);
            } else {
                const result = await timeoutUser(broadcasterId, target, 600);
                if (result.success) {
                    await userRef.transaction(u => { if (u) u.balance -= 10000; return u; });
                    await reply(`🔇 @${user}, @${target} kullanıcısını 10 dakika susturdu! (-10.000 💰)`);

                    // BAN Ä°STATÄ°STÄ°ÄÄ° (Target kullanÄ±cÄ±sÄ±nÄ±n ban sayÄ±sÄ±nÄ± artÄ±r)
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

    else if (lowMsg.startsWith('!doğrulama') || lowMsg.startsWith('!kod')) {
        console.log(`🔍 Doğrulama denemesi: ${user} - Kod: ${args[0]}`);
        const code = args[0];
        if (!code) return await reply(`@${user}, Lütfen mağazadaki 6 haneli kodu yazın. Örn: !doğrulama 123456`);

        const cleanUser = user.toLowerCase().trim();
        const pendingSnap = await db.ref('pending_auth/' + cleanUser).once('value');
        const pending = pendingSnap.val();

        if (pending && String(pending.code) === String(code)) {
            await db.ref('auth_success/' + cleanUser).set(true);
            await db.ref('pending_auth/' + cleanUser).remove();
            await reply(`✅ @${user}, Kimliğin doğrulandı! Mağaza sayfasına geri dönebilirsin. 🛍️`);
        } else {
            console.log(`❌ Doğrulama başarısız. Beklenen: ${pending?.code}, Gelen: ${code}`);
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

    else if (lowMsg === '!komutlar') {
        const toggleable = ['slot', 'yazitura', 'kutu', 'duello', 'soygun', 'fal', 'ship', 'hava', 'zenginler', 'soz'];
        const enabled = toggleable.filter(k => settings[k] !== false).map(k => "!" + k);
        const fixed = ['!bakiye', '!günlük', '!sustur', '!efkar'];
        await reply(`📋 Komutlar: ${[...enabled, ...fixed].join(', ')}`);
    }
});

// ---------------------------------------------------------
// 5. ADMIN PANEL & API (GELİŞMİŞ)
// ---------------------------------------------------------
const ADMIN_KEY = process.env.ADMIN_KEY || "";

app.get('/admin', (req, res) => { res.sendFile(path.join(__dirname, 'admin.html')); });

const authAdmin = (req, res, next) => {
    const key = req.headers['authorization'] || req.body.key;
    if (key === ADMIN_KEY) return next();
    res.status(403).json({ success: false, error: 'Yetkisiz Erişim' });
};

// ... Eski API'ler ...
app.post('/admin-api/check', authAdmin, (req, res) => res.json({ success: true }));



// RIG SHIP
app.post('/admin-api/rig-ship', authAdmin, (req, res) => {
    const { user, target, percent } = req.body;
    riggedShips[user.toLowerCase()] = { target, percent: parseInt(percent) };
    res.json({ success: true });
});

// RIG GAMBLE
app.post('/admin-api/rig-gamble', authAdmin, (req, res) => {
    const { user, result } = req.body; // result: 'win' veya 'lose'
    riggedGambles[user.toLowerCase()] = result;
    res.json({ success: true });
});

// CHAT AKSİYONLARI (API tabanlı moderasyon)
app.post('/admin-api/chat-action', authAdmin, async (req, res) => {
    const { action, channelId } = req.body;

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
    res.json({ success: true });
});

// KANAL SİL
app.post('/admin-api/delete-channel', authAdmin, async (req, res) => {
    await db.ref('channels/' + req.body.channelId).remove();
    res.json({ success: true });
});

// TÜM KULLANICILAR
app.post('/admin-api/all-users', authAdmin, async (req, res) => {
    const snap = await db.ref('users').limitToFirst(100).once('value');
    res.json(snap.val() || {});
});

// KULLANICI GÜNCELLE
app.post('/admin-api/update-user', authAdmin, async (req, res) => {
    const { user, balance } = req.body;
    await db.ref('users/' + user.toLowerCase()).update({ balance: parseInt(balance) });
    res.json({ success: true });
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

app.get('/overlay', (req, res) => { res.sendFile(path.join(__dirname, 'overlay.html')); });

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'shop.html')); });

// ---------------------------------------------------------
// 6. PASSIVE INCOME (10 DK İZLEME ÖDÜLÜ)
// ---------------------------------------------------------
setInterval(async () => {
    console.log("💰 Pasif bakiye dağıtımı başlıyor...");
    const tenMinsAgo = Date.now() - (10 * 60 * 1000);
    const usersSnap = await db.ref('users').once('value');
    const allUsers = usersSnap.val() || {};

    let rewardedCount = 0;
    for (const [username, data] of Object.entries(allUsers)) {
        if (data.last_seen && data.last_seen > tenMinsAgo) {
            await db.ref('users/' + username).transaction(u => {
                if (u) u.balance = (u.balance || 0) + 100;
                return u;
            });
            rewardedCount++;
        }
    }
    console.log(`✅ ${rewardedCount} aktif kullanıcıya 100 💰 dağıtıldı.`);
}, 10 * 60 * 1000); // 10 Dakikada bir

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 MASTER FINAL (MULTI-CHANNEL) AKTIF!`));
