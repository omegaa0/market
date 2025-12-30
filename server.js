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

// BOT GLOBAL DEĞİŞKENLER
const activeDuels = {};
let currentHeist = null;
let activePiyango = null;
let activePrediction = null;

// PKCE YARDIMCILARI
function base64UrlEncode(str) { return str.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''); }
function generatePKCE() {
    const verifier = base64UrlEncode(crypto.randomBytes(32));
    const challenge = base64UrlEncode(crypto.createHash('sha256').update(verifier).digest());
    return { verifier, challenge };
}

// ---------------------------------------------------------
// 2. AUTH ENDPOINTS
// ---------------------------------------------------------
app.get('/login', async (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const { verifier, challenge } = generatePKCE();
    await db.ref('temp_auth/' + state).set({ verifier, createdAt: Date.now() });
    const scopes = "chat:write events:subscribe user:read channel:read";
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
        const { access_token, refresh_token } = response.data;
        await db.ref('bot_tokens').set({ access_token, refresh_token, updatedAt: Date.now() });
        res.send("<body style='background:#111;color:lime;text-align:center;padding-top:100px;font-family:sans-serif;'><h1>✅ BAŞARILI!</h1><p>Bot sisteme bağlandı.</p></body>");
    } catch (e) { res.status(500).send("Hata: " + e.message); }
});

// ---------------------------------------------------------
// 3. MESAJ MOTORU
// ---------------------------------------------------------
async function sendChatMessage(content) {
    const snap = await db.ref('bot_tokens').once('value');
    if (!snap.val()) return;
    try {
        await axios.post(`https://api.kick.com/public/v1/chat`, { content, type: "bot" }, {
            headers: { 'Authorization': `Bearer ${snap.val().access_token}` }
        });
    } catch (e) {
        if (e.response?.status === 401) {
            await refreshMyToken();
            return sendChatMessage(content);
        }
    }
}

async function refreshMyToken() {
    const snap = await db.ref('bot_tokens').once('value');
    if (!snap.val()) return;
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', snap.val().refresh_token);
    params.append('client_id', KICK_CLIENT_ID);
    params.append('client_secret', KICK_CLIENT_SECRET);
    const res = await axios.post('https://id.kick.com/oauth/token', params);
    await db.ref('bot_tokens').update({ access_token: res.data.access_token, refresh_token: res.data.refresh_token });
}

// ---------------------------------------------------------
// 4. WEBHOOK (KOMUTLAR)
// ---------------------------------------------------------
app.post('/kick/webhook', async (req, res) => {
    const event = req.body;
    res.status(200).send('OK');

    if (event.type === 'chat.message.sent') {
        const user = event.data.sender.username;
        const msg = event.data.content.trim();
        const lowMsg = msg.toLowerCase();
        const args = msg.split(/\s+/).slice(1);
        const userRef = db.ref('users/' + user.toLowerCase());

        // !selam
        if (lowMsg === 'sa' || lowMsg === 'sea' || lowMsg.includes('selam')) {
            await sendChatMessage(`Aleyküm selam @${user}! Hoş geldin reis. 👋`);
        }

        // !komutlar
        else if (lowMsg === '!komutlar') {
            await sendChatMessage(`🎮 Komutlar: !günlük, !bakiye, !slot [mikt], !yazitura [mikt] [y/t], !kutu [mikt] [1-3], !soygun, !duello [@isi] [mikt], !market, !fal, !efkar, !hava [şehir]`);
        }

        // !bakiye
        else if (lowMsg === '!bakiye') {
            const uData = (await userRef.once('value')).val() || { balance: 1000 };
            await sendChatMessage(`@${user}, Bakiyeniz: ${uData.balance.toLocaleString()} 💰`);
        }

        // !günlük
        else if (lowMsg === '!günlük') {
            const uData = (await userRef.once('value')).val() || { balance: 1000 };
            const now = Date.now();
            if (uData.lastDaily && (now - uData.lastDaily) < 86400000) {
                const diff = 86400000 - (now - uData.lastDaily);
                return await sendChatMessage(`@${user}, ⏳ Yarın dön! Kalan: ${Math.floor(diff / 3600000)}s.`);
            }
            uData.balance = (uData.balance || 0) + 500;
            uData.lastDaily = now;
            await userRef.set(uData);
            await sendChatMessage(`@${user}, Günlük ödülün verildi! +500 💰`);
        }

        // !slot [mikt]
        else if (lowMsg.startsWith('!slot')) {
            const cost = parseInt(args[0]) || 100;
            const uData = (await userRef.once('value')).val() || { balance: 1000 };
            if (uData.balance < cost) return await sendChatMessage(`@${user}, Yetersiz bakiye!`);
            uData.balance -= cost;
            const sym = ["🍒", "🍋", "🍇", "🔔", "💎", "7️⃣", "🍉", "🍀"];
            const resSlot = [sym[Math.floor(Math.random() * 8)], sym[Math.floor(Math.random() * 8)], sym[Math.floor(Math.random() * 8)]];
            let prize = (resSlot[0] === resSlot[1] && resSlot[1] === resSlot[2]) ? cost * 5 : (resSlot[0] === resSlot[1] || resSlot[1] === resSlot[2] || resSlot[0] === resSlot[2]) ? cost * 1.5 : 0;
            if (prize === 0) uData.balance += Math.floor(cost * 0.1); // İade
            uData.balance += Math.floor(prize);
            await userRef.set(uData);
            await sendChatMessage(`🎰 | ${resSlot.join('|')} | @${user} ${prize > 0 ? `KAZANDIN! (+${Math.floor(prize)} 💰)` : `Kaybettin. (+${Math.floor(cost * 0.1)} İade)`}`);
        }

        // !yazitura [mikt] [y/t]
        else if (lowMsg.startsWith('!yazitura')) {
            const miktar = parseInt(args[0]); const secim = args[1]?.toLowerCase();
            if (isNaN(miktar) || !secim) return await sendChatMessage(`@${user}, !yazitura [miktar] [y/t]`);
            const uData = (await userRef.once('value')).val() || { balance: 1000 };
            if (uData.balance < miktar) return await sendChatMessage(`@${user}, Yetersiz bakiye!`);
            uData.balance -= miktar;
            const result = Math.random() < 0.5 ? "yazı" : "tura";
            if (secim.includes(result[0])) {
                uData.balance += miktar * 2;
                await sendChatMessage(`🪙 ${result.toUpperCase()}! @${user} kazandın! +${miktar * 2} 💰`);
            } else {
                uData.balance += Math.floor(miktar * 0.1);
                await sendChatMessage(`🪙 ${result.toUpperCase()}! @${user} kaybettin. (+${Math.floor(miktar * 0.1)} İade)`);
            }
            await userRef.set(uData);
        }

        // !soygun
        else if (lowMsg === '!soygun') {
            const now = Date.now();
            if (!currentHeist) {
                currentHeist = { participants: [user], startTime: now };
                await sendChatMessage(`🚨 SOYGUN BAŞLADI! 🚨 @${user} banka kapısında. Katılmak için !soygun yaz! (90sn)`);
                setTimeout(async () => {
                    const heist = currentHeist;
                    currentHeist = null;
                    if (heist.participants.length < 3) return await sendChatMessage(`❌ Soygun İptal: Yeterli ekip toplanamadı (Min 3).`);
                    const win = Math.random() < 0.4;
                    if (win) {
                        const total = 10000 + Math.floor(Math.random() * 10000);
                        const share = Math.floor(total / heist.participants.length);
                        for (let p of heist.participants) {
                            await db.ref('users/' + p.toLowerCase()).transaction(c => {
                                if (c) c.balance += share; return c;
                            });
                        }
                        await sendChatMessage(`💥 BANKAYI PATLATTIK! Toplam ${total} 💰 ganimet paylaşıldı. Herkese +${share} 💰! 🔥`);
                    } else {
                        await sendChatMessage(`👮‍♂️ POLİS BASKINI! Herkes kaçsın! Soygun başarısız oldu... 🚔`);
                    }
                }, 90000);
            } else {
                if (!currentHeist.participants.includes(user)) {
                    currentHeist.participants.push(user);
                    await sendChatMessage(`@${user} ekibe katıldı! (Toplam: ${currentHeist.participants.length})`);
                }
            }
        }

        // !duello
        else if (lowMsg.startsWith('!duello')) {
            const target = args[0]?.replace('@', '').toLowerCase();
            const amt = parseInt(args[1]);
            if (!target || isNaN(amt)) return await sendChatMessage(`@${user}, !duello @isim [miktar]`);
            activeDuels[target] = { challenger: user, amount: amt, expire: Date.now() + 60000 };
            await sendChatMessage(`⚔️ @${target}, @${user} sana meydan okudu (${amt} 💰)! Kabul için: !kabul`);
        }
        else if (lowMsg === '!kabul') {
            const duel = activeDuels[user.toLowerCase()];
            if (!duel || Date.now() > duel.expire) return;
            delete activeDuels[user.toLowerCase()];
            const winner = Math.random() < 0.5 ? duel.challenger : user;
            const loser = winner === user ? duel.challenger : user;
            await db.ref('users/' + winner.toLowerCase()).transaction(u => { if (u) u.balance += duel.amount; return u; });
            await db.ref('users/' + loser.toLowerCase()).transaction(u => { if (u) u.balance -= duel.amount; return u; });
            await sendChatMessage(`🏆 @${winner} düelloyu kazandı ve ${duel.amount} 💰 kazandı! @${loser} yere serildi. ⚔️`);
        }

        // !fal
        else if (lowMsg === '!fal') {
            const fallar = ["Hayırlı bir iş için yola çıkacaksın.", "Parasal sıkıntıların bitiyor.", "Gözü olan birinden nazar değmiş.", "Beklediğin o mesaj bu akşam gelecek."];
            await sendChatMessage(`🔮 @${user}, Falın: ${fallar[Math.floor(Math.random() * fallar.length)]}`);
        }

        // !hava [şehir]
        else if (lowMsg.startsWith('!hava')) {
            const sehir = args[0] || "Istanbul";
            try {
                const geo = await axios.get(`https://geocoding-api.open-meteo.com/v1/search?name=${sehir}&count=1&language=tr&format=json`);
                if (!geo.data.results) return;
                const { latitude, longitude, name } = geo.data.results[0];
                const weather = await axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`);
                await sendChatMessage(`☁️ ${name}: ${weather.data.current_weather.temperature}°C | Rüzgar: ${weather.data.current_weather.windspeed}km/s`);
            } catch (e) { }
        }

        // !market
        else if (lowMsg === '!market') {
            await sendChatMessage(`🛒 @${user}, Mağazamız: https://aloskegangbot-market.onrender.com/`);
        }
    }
});

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'shop.html')); });
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 MASTER BOT v16.0 YAYINDA!`));
