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
let currentHeist = null;
let activePiyango = null;
let activePrediction = null;

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

        // Kanalı ayrı olarak kaydet
        await db.ref('channels/' + bid).set({
            access_token: response.data.access_token,
            refresh_token: response.data.refresh_token,
            username: userData.name.toLowerCase(),
            broadcaster_id: bid,
            updatedAt: Date.now(),
            settings: { // Varsayılan hepsi açık
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

// ---------------------------------------------------------
// 4. WEBHOOK (KOMUTLAR & OTO KAYIT)
// ---------------------------------------------------------
app.post('/kick/webhook', async (req, res) => {
    res.status(200).send('OK');
    const payload = req.body;
    const event = payload.data || payload;

    // Hangi kanaldan geldi?
    const broadcasterId = event.broadcaster_user_id;
    const channelRef = await db.ref('channels/' + broadcasterId).once('value');
    const channelData = channelRef.val();

    // Eğer bu kanalı tanımıyorsak işlem yapma
    if (!channelData) return;

    const settings = channelData.settings || {};
    const user = event.sender?.username;
    const rawMsg = event.content;

    if (!user || !rawMsg) return;
    if (user.toLowerCase() === "aloskegangbot") return;

    const lowMsg = rawMsg.trim().toLowerCase();
    const args = rawMsg.trim().split(/\s+/).slice(1);
    const userRef = db.ref('users/' + user.toLowerCase());

    // --- OTOMATİK KAYIT ---
    const userSnap = await userRef.once('value');
    if (!userSnap.exists()) await userRef.set({ balance: 1000, created_at: Date.now() });

    // --- ADMIN / MOD YETKİ KONTROLÜ ---
    const isAuthorized = event.sender?.identity?.badges?.some(b => b.type === 'broadcaster' || b.type === 'moderator') || user.toLowerCase() === "omegacyr";

    const reply = (msg) => sendChatMessage(msg, broadcasterId);

    // --- KOMUTLAR ---
    const selamWords = ['sa', 'sea', 'selam', 'slm', 'selamun aleyküm', 'selamünaleyküm'];
    if (selamWords.includes(lowMsg)) {
        await reply(`Aleyküm selam @${user}! Hoş geldin. 👋`);
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

    // --- RIGGED GAMBLE KONTROLÜ ---
    const checkRig = () => {
        const r = riggedGambles[user.toLowerCase()];
        if (r) { delete riggedGambles[user.toLowerCase()]; return r; } // Kullandıktan sonra sil
        return null;
    };

    // --- OYUNLAR (AYAR KONTROLLÜ) ---
    else if (settings.slot !== false && lowMsg.startsWith('!slot')) {
        const cost = Math.max(10, parseInt(args[0]) || 100);
        const snap = await userRef.once('value');
        const data = snap.val() || { balance: 1000, slot_count: 0, slot_reset: 0 };
        const now = Date.now();

        if (now > data.slot_reset) { data.slot_count = 0; data.slot_reset = now + 3600000; }
        if (data.slot_count >= 10) return await reply(`@${user}, 🚨 Slot limitin doldu! (10/saat)`);
        if ((data.balance || 0) < cost) return await reply(`@${user}, Yetersiz bakiye!`);

        data.balance -= cost; data.slot_count++;

        const rig = checkRig();
        const sym = ["🍒", "🍋", "🍇", "🔔", "💎", "7️⃣", "🍉", "🍀"];
        let s, mult;

        if (rig === 'win') {
            s = ["7️⃣", "7️⃣", "7️⃣"]; mult = 5; // Zorla Kazan
        } else if (rig === 'lose') {
            s = ["🍒", "🍋", "🍇"]; mult = 0; // Zorla Kaybet
        } else {
            s = [sym[Math.floor(Math.random() * 8)], sym[Math.floor(Math.random() * 8)], sym[Math.floor(Math.random() * 8)]];
            mult = (s[0] === s[1] && s[1] === s[2]) ? 5 : (s[0] === s[1] || s[1] === s[2] || s[0] === s[2]) ? 1.5 : 0;
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
            await reply(`🎰 | ${s[0]} | ${s[1]} | ${s[2]} | @${user} KAZANDIN (+${prize}) 💰`);
        }
    }

    else if (settings.yazitura !== false && lowMsg.startsWith('!yazitura')) {
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
            const res = Math.random() < 0.5 ? 'yazı' : 'tura';
            win = (isYazi && res === 'yazı') || (!isYazi && res === 'tura');
        }

        const resDisplay = win ? (isYazi ? 'YAZI' : 'TURA') : (isYazi ? 'TURA' : 'YAZI'); // Sonucu uydur

        if (win) {
            data.balance += cost * 2;
            await reply(`🪙 Para fırlatıldı... ${resDisplay}! @${user} KAZANDIN (+${cost * 2})`);
        } else {
            const refund = Math.floor(cost * 0.1);
            data.balance += refund;
            await reply(`🪙 Para fırlatıldı... ${resDisplay}! @${user} Kaybettin (%10 İade: +${refund})`);
        }
        await userRef.update({ balance: data.balance });
    }

    else if (settings.kutu !== false && lowMsg.startsWith('!kutu')) {
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
            const boxes = ['odul', 'iade', 'bomba'];
            resultType = boxes[Math.floor(Math.random() * boxes.length)];
        }

        if (resultType === 'odul') {
            const prize = cost * 3;
            data.balance += prize;
            await reply(`📦 @${user} Kutu ${choice}: 🎉 BÜYÜK ÖDÜL! (+${prize})`);
        } else if (resultType === 'iade') {
            data.balance += cost;
            await reply(`📦 @${user} Kutu ${choice}: 🔄 Parab İade Edildi (+${cost})`);
        } else { // Bomba
            const refund = Math.floor(cost * 0.1);
            data.balance += refund;
            await reply(`📦 @${user} Kutu ${choice}: 💣 BOMBA! Kaybettin (%10 İade: +${refund})`);
        }
        await userRef.update({ balance: data.balance });
    }

    else if (settings.duello !== false && lowMsg.startsWith('!duello')) {
        const target = args[0]?.replace('@', '').toLowerCase();
        const amt = parseInt(args[1]);
        if (!target || isNaN(amt)) return await reply(`@${user}, Kullanım: !duello @target [miktar]`);
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

    else if (settings.soygun !== false && lowMsg === '!soygun') {
        if (!currentHeist) {
            currentHeist = { p: [user], start: Date.now(), channel: broadcasterId };
            await reply(`🚨 SOYGUN! Katılmak için !soygun yazın! (90sn)`);
            setTimeout(async () => {
                const h = currentHeist; currentHeist = null;
                if (!h || h.p.length < 3) return await reply(`❌ Soygun İptal: Yetersiz katılımcı.`);
                if (Math.random() < 0.4) {
                    const share = Math.floor((15000 + Math.random() * 10000) / h.p.length);
                    for (let p of h.p) await db.ref('users/' + p.toLowerCase()).transaction(u => { if (u) u.balance += share; return u; });
                    await reply(`💥 BANKA PATLADI! Herkese +${share} 💰 dağıtıldı! 🔥`);
                } else await reply(`🚔 POLİS BASKINI! Soygun başarısız. 👮‍♂️`);
            }, 90000);
        } else if (currentHeist && currentHeist.channel === broadcasterId && !currentHeist.p.includes(user)) {
            currentHeist.p.push(user); await reply(`@${user} ekibe katıldı!`);
        }
    }

    // --- SOSYAL & DİĞER ---
    else if (settings.fal !== false && lowMsg === '!fal') {
        const list = ["Geleceğin parlak.", "Yakında güzel haber var.", "Dikkatli ol!", "Aşk kapıda."];
        await reply(`🔮 @${user}, Falın: ${list[Math.floor(Math.random() * list.length)]}`);
    }
    else if (settings.ship !== false && lowMsg.startsWith('!ship')) {
        // Hedef belirlenmediyse hata ver
        let target = args[0]?.replace('@', '');

        // --- RIGGED SHIP LOGIC ---
        const rig = riggedShips[user.toLowerCase()];
        if (rig) {
            target = rig.target || target || "Gizli Hayran"; // Eğer hedef yoksa rig hedefini kullan
            const perc = rig.percent;
            await reply(`❤️ @${user} & @${target} Uyumu: %${perc} ${perc >= 100 ? '🔥 RUH EŞİ BULUNDU!' : '💔'}`);
            delete riggedShips[user.toLowerCase()]; // Bir kerelik kullan
        } else {
            if (!target) return await reply(`@${user}, Kiminle shipleneceksin? (!ship @biri)`);
            const perc = Math.floor(Math.random() * 101);
            await reply(`❤️ @${user} & @${target} Uyumu: %${perc} ${perc > 80 ? '🔥' : perc > 50 ? '😏' : '💔'}`);
        }
    }

    else if (settings.zenginler !== false && lowMsg === '!zenginler') {
        const snap = await db.ref('users').once('value');
        const sorted = Object.entries(snap.val() || {}).sort((a, b) => (b[1].balance || 0) - (a[1].balance || 0)).slice(0, 5);
        let txt = "🏆 EN ZENGİNLER: ";
        sorted.forEach((u, i) => txt += `${i + 1}. ${u[0]} (${u[1].balance}) | `);
        await reply(txt);
    }

    else if (settings.hava !== false && lowMsg.startsWith('!hava')) {
        const city = args.join(' '); // "New York" gibi boşluklu şehirler için
        if (city.toLowerCase() === "kürdistan") {
            return await reply("Aponunda kürdistanında amına çaktım 🇹🇷");
        }
        try {
            const geo = await axios.get(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=tr&format=json`);
            if (geo.data.results) {
                const { latitude, longitude, name } = geo.data.results[0];
                const weather = await axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`);

                const w = weather.data.current_weather;
                const code = w.weathercode;
                let cond = "Açık"; let emoji = "☀️";

                // WMO Kodları Basitleştirilmiş
                if (code >= 1 && code <= 3) { cond = "Bulutlu"; emoji = "☁️"; }
                else if (code >= 45 && code <= 48) { cond = "Sisli"; emoji = "🌫️"; }
                else if (code >= 51 && code <= 67) { cond = "Yağmurlu"; emoji = "🌧️"; }
                else if (code >= 71 && code <= 77) { cond = "Karlı"; emoji = "❄️"; }
                else if (code >= 95) { cond = "Fırtına"; emoji = "⛈️"; }

                await reply(`🌍 ${name}: ${w.temperature}°C ${cond} ${emoji} | Rüzgar: ${w.windspeed} km/s`);
            } else { await reply(`❌ Şehir yok: ${city}`); }
        } catch (e) { console.log(e); }
    }

    else if (lowMsg === '!söz' && settings.soz !== false) {
        const list = ["Mesafe iyidir, kimin nerede durduğunu hatırlatır.", "Zirveye tek başına çıkılır.", "Kurduğun hayali başkası yaşar.", "Giden gitmiştir."];
        await reply(`✍️ @${user}: ${list[Math.floor(Math.random() * list.length)]}`);
    }

    else if (lowMsg === '!efkar' && settings.fal !== false) {
        const p = Math.floor(Math.random() * 101);
        await reply(`🚬 @${user} Efkar Seviyesi: %${p} ${p > 70 ? '😭🚬' : '🍷'}`);
    }

    // KICK API TIMEOUT FONKSİYONU
    async function timeoutUser(broadcasterId, username, duration) {
        const channelRef = await db.ref('channels/' + broadcasterId).once('value');
        const data = channelRef.val();
        if (!data) return;

        try {
            // Kullanıcı ID'sini bulmak gerekiyor (Username -> ID)
            const uRes = await axios.get(`https://api.kick.com/public/v1/users/${username}`, {
                headers: { 'Authorization': `Bearer ${data.access_token}` }
            });
            const userId = uRes.data?.user_id; // Veya direkt data.id (API yapısına göre değişebilir, user_id genelde doğru)
            if (!userId) return false;

            // Ban Endpoint (Timeout da buradan veriliyor)
            await axios.post(`https://api.kick.com/public/v1/channels/${broadcasterId}/bans`, {
                banned_user_id: parseInt(userId),
                duration: duration, // Saniye cinsinden
                reason: "Bot !sustur komutu",
                permanent: false
            }, { headers: { 'Authorization': `Bearer ${data.access_token}`, 'Content-Type': 'application/json' } });
            return true;
        } catch (e) {
            console.log("Timeout Error:", e.response?.data || e.message);
            return false;
        }
    }

// ...

    // --- ADMIN / MOD ---
    else if (lowMsg.startsWith('!sustur')) {
        const target = args[0]?.replace('@', '').toLowerCase();
        if (!target) return;
        const snap = await userRef.once('value');
        if ((snap.val()?.balance || 0) < 10000) return await reply(`@${user}, 10.000 💰 bakiye lazım!`);

        const success = await timeoutUser(broadcasterId, target, 600); // 600 sn = 10 dk

        if (success) {
            await userRef.transaction(u => { if (u) u.balance -= 10000; return u; });
            await reply(`🔇 @${user}, @${target} kullanıcısını 10 dakika susturdu! (-10.000 💰)`);
        } else {
            await reply(`❌ İşlem başarısız! (Kullanıcı bulunamadı veya yetki yok)`);
        }
    }

    else if (lowMsg.startsWith('!tahmin') || lowMsg.startsWith('!oyla') || lowMsg.startsWith('!sonuç') || lowMsg.startsWith('!piyango')) {
        // ... Tahmin / Piyango (Aynı kalacak) ...
        if (lowMsg.startsWith('!tahmin') && isAuthorized) {
            activePrediction = { q: args.join(' '), v1: 0, v2: 0, voters: {}, channel: broadcasterId };
            await reply(`📊 TAHMİN: ${args.join(' ')} | !oyla 1 veya !oyla 2`);
        }
        else if (lowMsg.startsWith('!oyla') && activePrediction && activePrediction.channel === broadcasterId) {
            if (activePrediction.voters[user]) return;
            const pick = args[0];
            if (pick === '1' || pick === '2') {
                activePrediction[pick === '1' ? 'v1' : 'v2']++;
                activePrediction.voters[user] = pick;
                await reply(`🗳️ @${user} oy kullandı.`);
            }
        }
        else if (lowMsg.startsWith('!sonuç') && activePrediction && activePrediction.channel === broadcasterId && isAuthorized) {
            await reply(`📊 SONUÇ: Evet: ${activePrediction.v1} - Hayır: ${activePrediction.v2}`);
            activePrediction = null;
        }
        else if (lowMsg.startsWith('!piyango')) {
            const sub = args[0];
            if (sub === 'başla' && isAuthorized) {
                activePiyango = { p: [], cost: parseInt(args[1]) || 500, pool: 0, channel: broadcasterId };
                await reply(`🎰 PİYANGO! Giriş: ${activePiyango.cost} 💰 | !piyango katıl`);
            }
            else if (sub === 'katıl' && activePiyango && activePiyango.channel === broadcasterId) {
                if (activePiyango.p.includes(user)) return;
                const d = (await userRef.once('value')).val() || { balance: 0 };
                if (d.balance < activePiyango.cost) return await reply('Bakiye yetersiz.');
                await userRef.update({ balance: d.balance - activePiyango.cost });
                activePiyango.p.push(user); activePiyango.pool += activePiyango.cost;
                await reply(`🎟️ @${user} katıldı! Havuz: ${activePiyango.pool}`);
            }
            else if (sub === 'bitir' && activePiyango && activePiyango.channel === broadcasterId && isAuthorized) {
                if (!activePiyango.p.length) { activePiyango = null; return await reply('Katılım yok.'); }
                const win = activePiyango.p[Math.floor(Math.random() * activePiyango.p.length)];
                await db.ref('users/' + win).transaction(u => { if (u) u.balance += activePiyango.pool; return u; });
                await reply(`🎉 KAZANAN: @${win} (+${activePiyango.pool})`);
                activePiyango = null;
            }
        }
    }

    else if (lowMsg === '!komutlar') {
        const available = Object.keys(settings).filter(k => settings[k] === true).map(k => "!" + k).join(', ');
        await reply(`Aktif Komutlar: ${available}, !bakiye, !günlük, (sa/as)`);
    }
});

// ---------------------------------------------------------
// 5. ADMIN PANEL & API (GELİŞMİŞ)
// ---------------------------------------------------------
const ADMIN_KEY = process.env.ADMIN_KEY || "Aloske123!";

app.get('/admin', (req, res) => { res.sendFile(path.join(__dirname, 'admin.html')); });

const authAdmin = (req, res, next) => {
    const key = req.headers['authorization'] || req.body.key;
    if (key === ADMIN_KEY) return next();
    res.status(403).json({ success: false, error: 'Yetkisiz Erişim' });
};

// ... Eski API'ler ...
app.post('/admin-api/check', authAdmin, (req, res) => res.json({ success: true }));

// ---------------------------------------------------------
// 5. ADMIN PANEL API (YENİLER)
// ---------------------------------------------------------

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

// CHAT AKSİYONLARI
app.post('/admin-api/chat-action', authAdmin, async (req, res) => {
    const { action, channelId } = req.body;
    if (action === 'clear') {
        await sendChatMessage('/clear', channelId);
    } else if (action === 'slow') {
        await sendChatMessage('/slow 10', channelId);
    } else if (action === 'slowoff') {
        await sendChatMessage('/slow off', channelId);
    }
    res.json({ success: true });
});

// YENİ: KANAL LİSTESİ
app.get('/admin-api/channels', authAdmin, async (req, res) => {
    const snap = await db.ref('channels').once('value');
    const channels = snap.val() || {};
    res.json(channels);
});

// YENİ: KANAL AYARI GÜNCELLE
app.post('/admin-api/toggle-command', authAdmin, async (req, res) => {
    const { channelId, command, value } = req.body;
    await db.ref(`channels/${channelId}/settings`).update({ [command]: value });
    res.json({ success: true });
});

// YENİ: KANAL SİL (LOGOUT)
app.post('/admin-api/delete-channel', authAdmin, async (req, res) => {
    await db.ref('channels/' + req.body.channelId).remove();
    res.json({ success: true });
});

// YENİ: TÜM KULLANICILAR (TABLO İÇİN)
app.get('/admin-api/all-users', authAdmin, async (req, res) => {
    const snap = await db.ref('users').limitToFirst(100).once('value'); // İlk 100 kullanıcı (performans için)
    res.json(snap.val() || {});
});

// ... Diğer user update endpointleri aynı kalabilir ...
app.post('/admin-api/update-user', authAdmin, async (req, res) => {
    const { user, balance } = req.body;
    await db.ref('users/' + user.toLowerCase()).update({ balance: parseInt(balance) });
    res.json({ success: true });
});

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'shop.html')); });
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 MASTER FINAL (MULTI-CHANNEL) AKTIF!`));
