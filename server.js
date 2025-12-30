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

// PKCE YARDIMCILARI
function base64UrlEncode(str) {
    return str.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function generatePKCE() {
    const verifier = base64UrlEncode(crypto.randomBytes(32));
    const challenge = base64UrlEncode(crypto.createHash('sha256').update(verifier).digest());
    return { verifier, challenge };
}

// 4. LOGIN (Giriş Başlatma)
app.get('/login', async (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const { verifier, challenge } = generatePKCE();
    await db.ref('temp_auth/' + state).set({ verifier, createdAt: Date.now() });

    const scopes = "chat:write events:subscribe user:read channel:read";
    const authUrl = `https://id.kick.com/oauth/authorize?client_id=${KICK_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`;

    res.redirect(authUrl);
});

// 5. CALLBACK (Garantili Token Takası)
app.get('/auth/kick/callback', async (req, res) => {
    const { code, state, error } = req.query;
    if (error) return res.status(400).send(`Kick Hatası (Giriş Yapılamadı): ${error}`);

    const tempAuth = (await db.ref('temp_auth/' + state).once('value')).val();
    if (!tempAuth) return res.status(400).send("Oturum süresi dolmuş. Lütfen /login adresine tekrar gidin.");

    try {
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('code', code);
        params.append('client_id', KICK_CLIENT_ID);
        params.append('client_secret', KICK_CLIENT_SECRET); // Şifre burada
        params.append('redirect_uri', REDIRECT_URI);
        params.append('code_verifier', tempAuth.verifier);

        const response = await axios.post('https://id.kick.com/oauth/token', params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const { access_token, refresh_token } = response.data;
        await db.ref('bot_tokens').set({ access_token, refresh_token, updatedAt: Date.now() });
        await db.ref('temp_auth/' + state).remove();

        res.send("<h1 style='color:green'>✅ BAŞARILI!</h1><p>Bot sisteme bağlandı. Chat komutlarını deneyebilirsin.</p>");
    } catch (e) {
        // HATA DETAYINI EKRENA BASALIM (invalid_client buradan gelecek)
        const errorDetail = e.response?.data || e.message;
        console.error("TOKEN HATASI:", errorDetail);
        res.status(500).json({
            hata: "Kick kimliği doğrulamadı (invalid_client).",
            detay: errorDetail,
            ipucu: "Lütfen Render'daki CLIENT_SECRET'ı kontrol edin. Eğer şifre yeniyse, Kick sisteminin tanıması için 15-20 dk geçmesi gerekebilir."
        });
    }
});

// 6. MESAJ GÖNDERME
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
    const tokenData = snap.val();
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', tokenData.refresh_token);
    params.append('client_id', KICK_CLIENT_ID);
    params.append('client_secret', KICK_CLIENT_SECRET);
    const res = await axios.post('https://id.kick.com/oauth/token', params);
    await db.ref('bot_tokens').update({ access_token: res.data.access_token, refresh_token: res.data.refresh_token });
}

// 7. WEBHOOK
app.post('/kick/webhook', async (req, res) => {
    const event = req.body;
    if (event.type === 'chat.message.sent') {
        const user = event.data.sender.username;
        const msg = event.data.content;
        if (msg.toLowerCase().startsWith('!selam')) await sendChatMessage(`Aleyküm selam @${user}! 👋`);
    }
    res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Bot Sunucusu Aktif! Port: ${PORT}`));
