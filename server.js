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
const BROADCASTER_ID = process.env.KICK_BROADCASTER_ID;
const REDIRECT_URI = "https://aloskegangbot-market.onrender.com/auth/kick/callback";

// PKCE YARDIMCILARI
function base64UrlEncode(str) { return str.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''); }
function generatePKCE() {
    const verifier = base64UrlEncode(crypto.randomBytes(32));
    const challenge = base64UrlEncode(crypto.createHash('sha256').update(verifier).digest());
    return { verifier, challenge };
}

// ---------------------------------------------------------
// 2. AUTH & OTOMATİK ABONELİK
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

        // Bot Tokenlarını Kaydet
        await db.ref('bot_tokens').set({ access_token, refresh_token, updatedAt: Date.now() });

        // 🔥 KRİTİK: KICK'E ABONE OL (Dinlemeye başla)
        await subscribeToChat(access_token);

        res.send("<body style='background:#111;color:lime;text-align:center;padding-top:100px;font-family:sans-serif;'><h1>✅ BAŞARILI!</h1><p>Bot kanalını dinlemeye başladı. Chat'e !selam yazarak test et!</p></body>");
    } catch (e) { res.status(500).send("Hata: " + e.message); }
});

// Kick'e "Beni bu kanala abone yap" emri gönderir
async function subscribeToChat(token) {
    try {
        await axios.post('https://api.kick.com/public/v1/events/subscriptions', {
            broadcaster_user_id: parseInt(BROADCASTER_ID),
            events: [
                { name: "chat.message.sent", version: 1 }
            ],
            method: "webhook"
        }, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        console.log("✅ Kick Chat aboneliği başarıyla oluşturuldu!");
    } catch (e) {
        console.error("Abonelik Hatası:", e.response?.data || e.message);
    }
}

// ---------------------------------------------------------
// 3. MESAJ MOTORU
// ---------------------------------------------------------
async function sendChatMessage(content) {
    const snap = await db.ref('bot_tokens').once('value');
    if (!snap.val()) return;
    try {
        await axios.post(`https://api.kick.com/public/v1/chat`, {
            content: content,
            type: "user", // Kendi hesabınla mesaj atmak için 'user' kalmalı
            broadcaster_user_id: parseInt(BROADCASTER_ID)
        }, {
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
// 4. WEBHOOK (DİNLEYİCİ)
// ---------------------------------------------------------
app.post('/kick/webhook', async (req, res) => {
    const event = req.body;
    res.status(200).send('OK');

    // Kick chat mesajı gönderdiğinde buraya düşer
    if (event.type === 'chat.message.sent') {
        const user = event.data.sender.username;
        const msg = event.data.content.trim().toLowerCase();

        console.log(`📩 Yeni Mesaj (${user}): ${msg}`);

        if (msg === '!selam' || msg === 'sa') {
            await sendChatMessage(`Aleyküm selam @${user}! Hoş geldin reis. 🦾`);
        }
        else if (msg === '!bakiye') {
            const snap = await db.ref('users/' + user.toLowerCase()).once('value');
            const balance = snap.val()?.balance || 1000;
            await sendChatMessage(`@${user}, Bakiyeniz: ${balance.toLocaleString()} 💰`);
        }
    }
});

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'shop.html')); });
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Bot Dinleyici Aktif!`));
