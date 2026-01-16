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

// Sadece gerekli dosyaları public yapıyoruz
const publicFiles = ['shop.js', 'shop.css', 'admin.html', 'dashboard.html', 'shop.html', 'overlay.html', 'goals.html', 'horse-race.html'];
publicFiles.forEach(file => {
    app.get(`/${file}`, (req, res) => res.sendFile(path.join(__dirname, file)));
});

// GÖRSELLERİ VE GIFLERİ KÖK DİZİNDEN SERV ET
app.get('/:filename', (req, res, next) => {
    const ext = path.extname(req.params.filename).toLowerCase();
    if (['.gif', '.png', '.jpg', '.jpeg', '.webp', '.ico'].includes(ext)) {
        const filePath = path.join(__dirname, req.params.filename);
        if (fs.existsSync(filePath)) {
            return res.sendFile(filePath);
        }
    }
    next();
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
const upload = multer({ storage: storage });

const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    databaseURL: process.env.FIREBASE_DB_URL
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const KICK_CLIENT_ID = process.env.KICK_CLIENT_ID || "01KDQNP2M930Y7YYNM62TVWJCP";
const KICK_CLIENT_SECRET = process.env.KICK_CLIENT_SECRET;

// EĞİTİM SİSTEMİ
const EDUCATION = {
    0: "Cahil",
    1: "İlkokul",
    2: "Ortaokul",
    3: "Lise",
    4: "Üniversite",
    5: "Yüksek Lisans",
    6: "Doktora",
    7: "Profesör"
};
const EDU_XP = [0, 2500, 5000, 10000, 25000, 40000, 75000, 200000]; // XP eşikleri (düşürüldü)

const pendingDuels = {};
const activePredictions = {};
const JOBS = {
    // SEVİYE 0: CAHİL (GEREKSİNİM YOK / 50 - 1.000 💰)
    "İşsiz": { reward: 0, icon: "👤", req_edu: 0, req_item: null },
    "Dilenci": { reward: 300, icon: "🪣", req_edu: 0, req_item: "Yırtık Karton", price: 50 },
    "Mendil Satıcısı": { reward: 350, icon: "🧻", req_edu: 0, req_item: "Mendil Paketi", price: 100 },
    "Su Satıcısı": { reward: 400, icon: "💧", req_edu: 0, req_item: "Su Kolisi", price: 150 },
    "Seyyar Satıcı": { reward: 450, icon: "🥒", req_edu: 0, req_item: "El Arabası", price: 250 },
    "Pazarcı": { reward: 500, icon: "🍋", req_edu: 0, req_item: "Pazar Tezgahı", price: 400 },
    "Sokak Müzisyeni": { reward: 550, icon: "🎸", req_edu: 0, req_item: "Gitar", price: 500 },
    "Kağıt Toplayıcı": { reward: 600, icon: "🥡", req_edu: 0, req_item: "Çekçek", price: 600 },
    "Simitçi": { reward: 650, icon: "🥯", req_edu: 0, req_item: "Simit Tepsisi", price: 750 },
    "Broşürcü": { reward: 700, icon: "📄", req_edu: 0, req_item: "El İlanları", price: 850 },
    "Boyacı": { reward: 750, icon: "👞", req_edu: 0, req_item: "Boya Sandığı", price: 1000 },
    "Oto Yıkamacı": { reward: 800, icon: "🧽", req_edu: 0, req_item: "Sünger", price: 1200 },
    "Hamal": { reward: 850, icon: "🏋️", req_edu: 0, req_item: "Sırtlık", price: 1500 },
    "Çöpçü": { reward: 900, icon: "🧹", req_edu: 0, req_item: "Süpürge", price: 1800 },
    "Bulaşıkçı": { reward: 1000, icon: "🍽️", req_edu: 0, req_item: "Eldiven", price: 2000 },
    "Amele": { reward: 1100, icon: "🧱", req_edu: 0, req_item: "Baret", price: 2200 },
    "Çiftçi": { reward: 1150, icon: "🚜", req_edu: 0, req_item: "Çapa", price: 2500 },
    "Balıkçı": { reward: 1200, icon: "🎣", req_edu: 0, req_item: "Olta", price: 3000 },

    // SEVİYE 1: İLKOKUL (2.500 - 10.000 💰)
    "Tezgahtar": { reward: 2000, icon: "🏷️", req_edu: 1, req_item: "Yazar Kasa", price: 4000 },
    "Bekçi": { reward: 2150, icon: "🔦", req_edu: 1, req_item: "Fener", price: 5000 },
    "Vale": { reward: 2300, icon: "🔑", req_edu: 1, req_item: "Vale Kartı", price: 5500 },
    "Bahçıvan": { reward: 2450, icon: "🌻", req_edu: 1, req_item: "Budama Makası", price: 6000 },
    "Garaj Sorumlusu": { reward: 2600, icon: "🅿️", req_edu: 1, req_item: "Düdük", price: 6500 },
    "Depocu": { reward: 2800, icon: "📦", req_edu: 1, req_item: "Transpalet", price: 7000 },
    "Kurye": { reward: 3000, icon: "🛵", req_edu: 1, req_item: "Eski Motor", price: 8000 },
    "Market Görevlisi": { reward: 3200, icon: "🏪", req_edu: 1, req_item: "Maket Bıçağı", price: 8500 },
    "Benzinci": { reward: 3400, icon: "⛽", req_edu: 1, req_item: "Pompa", price: 9000 },
    "Şoför": { reward: 3600, icon: "🚕", req_edu: 1, req_item: "Taksi Plakası", price: 10000 },
    "Kasiyer": { reward: 3800, icon: "💵", req_edu: 1, req_item: "Barkod Okuyucu", price: 12000 },
    "Tabelacı": { reward: 4000, icon: "🏗️", req_edu: 1, req_item: "Fırça Seti", price: 13000 },
    "Terzi": { reward: 4250, icon: "🧵", req_edu: 1, req_item: "Dikiş Makinesi", price: 14000 },

    // SEVİYE 2: ORTAOKUL (15.000 - 40.000 💰)
    "Güvenlik": { reward: 4750, icon: "👮", req_edu: 2, req_item: "Telsiz", price: 18000 },
    "Bodyguard": { reward: 5000, icon: "🕶️", req_edu: 2, req_item: "Kulaklık", price: 20000 },
    "Garson": { reward: 5250, icon: "☕", req_edu: 2, req_item: "Önlük", price: 22000 },
    "Makyaj Artisti": { reward: 5500, icon: "💄", req_edu: 2, req_item: "Makyaj Çantası", price: 25000 },
    "Kuaför": { reward: 5750, icon: "💇", req_edu: 2, req_item: "Fön Makinesi", price: 28000 },
    "Tattoo Artisti": { reward: 6000, icon: "✒️", req_edu: 2, req_item: "Dövme Makinesi", price: 30000 },
    "Berber": { reward: 6250, icon: "✂️", req_edu: 2, req_item: "Makas Seti", price: 32000 },
    "Fitness Eğitmeni": { reward: 6500, icon: "💪", req_edu: 2, req_item: "Halter", price: 35000 },
    "Barista": { reward: 6750, icon: "☕️", req_edu: 2, req_item: "Kahve Makinesi", price: 38000 },
    "DJ": { reward: 7000, icon: "🎧", req_edu: 2, req_item: "DJ Setup", price: 40000 },
    "Fotoğrafçı": { reward: 7250, icon: "📸", req_edu: 2, req_item: "Kamera", price: 45000 },
    "Youtuber": { reward: 7500, icon: "▶️", req_edu: 2, req_item: "Yayıncı Ekipmanı", price: 50000 },
    "Cankurtaran": { reward: 8000, icon: "🆘", req_edu: 2, req_item: "Can Simidi", price: 55000 },

    // SEVİYE 3: LİSE (60.000 - 150.000 💰)
    "Elektrikçi": { reward: 10000, icon: "⚡", req_edu: 3, req_item: "Kontrol Kalemi", price: 70000 },
    "Tesisatçı": { reward: 10400, icon: "🚰", req_edu: 3, req_item: "İngiliz Anahtarı", price: 75000 },
    "Marangoz": { reward: 10800, icon: "🪚", req_edu: 3, req_item: "Testere", price: 80000 },
    "Hemşire": { reward: 11200, icon: "💉", req_edu: 3, req_item: "Şırınga", price: 85000 },
    "Sekreter": { reward: 11600, icon: "📞", req_edu: 3, req_item: "Telefon", price: 90000 },
    "Kütüphaneci": { reward: 12100, icon: "📚", req_edu: 3, req_item: "Barkod Okuyucu", price: 95000 },
    "Tamirci": { reward: 12600, icon: "🔧", req_edu: 3, req_item: "Alet Çantası", price: 100000 },
    "Laborant": { reward: 13100, icon: "🔬", req_edu: 3, req_item: "Tüp", price: 110000 },
    "Tıbbi Laboratuvar": { reward: 13600, icon: "🧪", req_edu: 3, req_item: "Mikrosantrifüj", price: 120000 },
    "Aşçı": { reward: 14100, icon: "👨‍🍳", req_edu: 3, req_item: "Aşçı Bıçağı", price: 125000 },
    "Kabin Memuru": { reward: 14600, icon: "💁", req_edu: 3, req_item: "Uçuş Kartı", price: 130000 },
    "İtfaiyeci": { reward: 15100, icon: "🚒", req_edu: 3, req_item: "Yangın Tüpü", price: 140000 },
    "Gümrük Memuru": { reward: 15600, icon: "🛂", req_edu: 3, req_item: "Mühür", price: 150000 },
    "Polis": { reward: 16100, icon: "👮‍♂️", req_edu: 3, req_item: "Silah Ruhsatı", price: 180000 },
    "Grafiker": { reward: 16500, icon: "🎨", req_edu: 3, req_item: "Çizim Tableti", price: 200000 },
    "Emlakçı": { reward: 16900, icon: "🏠", req_edu: 3, req_item: "Ajanda", price: 220000 },
    "Dalgıç": { reward: 17200, icon: "🤿", req_edu: 3, req_item: "Oksijen Tüpü", price: 240000 },
    "Kaynakçı": { reward: 17500, icon: "👨‍🏭", req_edu: 3, req_item: "Kaynak Maskesi", price: 250000 },

    // SEVİYE 4: ÜNİVERSİTE (300.000 - 1.000.000 💰)
    "Bankacı": { reward: 21000, icon: "🏦", req_edu: 4, req_item: "Hesap Makinesi", price: 350000 },
    "Arkeolog": { reward: 21500, icon: "🏺", req_edu: 4, req_item: "Fırça", price: 370000 },
    "Muhasebeci": { reward: 22000, icon: "📉", req_edu: 4, req_item: "Mali Mühür", price: 400000 },
    "Sosyolog": { reward: 22500, icon: "👥", req_edu: 4, req_item: "Anket Formu", price: 420000 },
    "Öğretmen": { reward: 23000, icon: "👨‍🏫", req_edu: 4, req_item: "Kitap Seti", price: 450000 },
    "Psikolojik Danışman": { reward: 23500, icon: "🗣️", req_edu: 4, req_item: "Not Defteri", price: 480000 },
    "Gazeteci": { reward: 24000, icon: "📰", req_edu: 4, req_item: "Mikrofon", price: 500000 },
    "Yatırım Uzmanı": { reward: 24500, icon: "📈", req_edu: 4, req_item: "Borsa Ekranı", price: 550000 },
    "Editör": { reward: 25000, icon: "✍️", req_edu: 4, req_item: "Laptop", price: 600000 },
    "Yazılımcı": { reward: 25500, icon: "💻", req_edu: 4, req_item: "Yazılım Lisansı", price: 750000 },
    "Mimar": { reward: 26000, icon: "📐", req_edu: 4, req_item: "Çizim Masası", price: 850000 },
    "Mühendis": { reward: 26500, icon: "👷", req_edu: 4, req_item: "Mühendislik Diploması", price: 1000000 },
    "Avukat": { reward: 27000, icon: "⚖️", req_edu: 4, req_item: "Cübbe", price: 1200000 },
    "Diyetisyen": { reward: 27500, icon: "🥗", req_edu: 4, req_item: "Diyet Listesi", price: 1400000 },
    "Denetçi": { reward: 28000, icon: "📝", req_edu: 4, req_item: "Audit Dosyası", price: 1600000 },
    "Biyolog": { reward: 29000, icon: "🌿", req_edu: 4, req_item: "Petri Kabı", price: 1800000 },

    // SEVİYE 5: YÜKSEK LİSANS (2.000.000 - 8.000.000 💰)
    "Psikolog": { reward: 37500, icon: "🧠", req_edu: 5, req_item: "Terapi Koltuğu", price: 2500000 },
    "Veri Bilimci": { reward: 38500, icon: "📊", req_edu: 5, req_item: "Süper Bilgisayar", price: 2800000 },
    "Eczacı": { reward: 39500, icon: "💊", req_edu: 5, req_item: "Laboratuvar Önlüğü", price: 3000000 },
    "Yapay Zeka Mühendisi": { reward: 40500, icon: "🤖", req_edu: 5, req_item: "GPU Server", price: 3500000 },
    "Veteriner": { reward: 41500, icon: "🐾", req_edu: 5, req_item: "Stetoskop", price: 4000000 },
    "Genetik Mühendisi": { reward: 42500, icon: "🧬", req_edu: 5, req_item: "DNA Kiti", price: 5000000 },
    "Doktor": { reward: 44000, icon: "🩺", req_edu: 5, req_item: "Tıp Diploması", price: 8000000 },
    "Diş Hekimi": { reward: 45000, icon: "🦷", req_edu: 5, req_item: "Dişçi Koltuğu", price: 9000000 },
    "Başhekim": { reward: 46000, icon: "🏥", req_edu: 5, req_item: "Başhekim Kaşesi", price: 10000000 },
    "Pilot": { reward: 47000, icon: "✈️", req_edu: 5, req_item: "Pilot Lisansı", price: 2500000 },
    "Savcı": { reward: 48000, icon: "🏛️", req_edu: 5, req_item: "Kanun Kitabı", price: 3000000 },
    "Hakim": { reward: 49000, icon: "🔨", req_edu: 5, req_item: "Tokmak", price: 3500000 },
    "Uçuş Mühendisi": { reward: 49500, icon: "🛫", req_edu: 5, req_item: "Uçuş Manueli", price: 4000000 },
    "Siber Güvenlik Uzmanı": { reward: 50000, icon: "🛡️", req_edu: 5, req_item: "Şifreleme Kartı", price: 5000000 },

    // SEVİYE 6: DOKTORA (30.000.000 - 100.000.000 💰)
    "Cerrah": { reward: 75000, icon: "🏥", req_edu: 6, req_item: "Neşter", price: 7500000 },
    "Rektör": { reward: 80000, icon: "🎓", req_edu: 6, req_item: "Rektörlük Mührü", price: 8500000 },
    "Büyükelçi": { reward: 85000, icon: "🌍", req_edu: 6, req_item: "Diplomat Pasaportu", price: 10000000 },
    "Orkestra Şefi": { reward: 90000, icon: "🎼", req_edu: 6, req_item: "Baton", price: 12500000 },
    "Bilim İnsanı": { reward: 100000, icon: "🧪", req_edu: 6, req_item: "Mikroskop", price: 15000000 },
    "Yönetmen": { reward: 110000, icon: "🎬", req_edu: 6, req_item: "Klaket", price: 20000000 },
    "Nükleer Fizikçi": { reward: 115000, icon: "⚛️", req_edu: 6, req_item: "Radyasyon Ölçer", price: 25000000 },
    "Uzay Mühendisi": { reward: 125000, icon: "🛰️", req_edu: 6, req_item: "Uydu Alıcısı", price: 35000000 },

    // SEVİYE 7: PROFESÖR (250.000.000 - 2.000.000.000 💰)
    "Astronot": { reward: 175000, icon: "🚀", req_edu: 7, req_item: "Uzay Mekiği Bileti", price: 40000000 },
    "CEO": { reward: 190000, icon: "👔", req_edu: 7, req_item: "Şirket Hissesi", price: 50000000 },
    "Milletvekili": { reward: 205000, icon: "🏛️", req_edu: 7, req_item: "Mazbata", price: 60000000 },
    "Devlet Başkanı": { reward: 220000, icon: "👑", req_edu: 7, req_item: "Kral Tacı", price: 75000000 },
    "Dünya Bankası Başkanı": { reward: 235000, icon: "💸", req_edu: 7, req_item: "Altın Kasa", price: 85000000 },
    "Kripto Kralı": { reward: 250000, icon: "💎", req_edu: 7, req_item: "Soğuk Cüzdan", price: 100000000 }
};

const PROFILE_CUSTOMIZATIONS = {
    colors: [
        { id: "gold", name: "Altın Sarısı", color: "#FFD700", price: 50000, type: "name" },
        { id: "neon", name: "Neon Yeşil", color: "#39FF14", price: 30000, type: "name" },
        { id: "ruby", name: "Yakut Kırmızısı", color: "#E0115F", price: 40000, type: "name" },
        { id: "royal", name: "Kraliyet Mavisi", color: "#4169E1", price: 40000, type: "name" },
        { id: "violet", name: "Lavanta Moru", color: "#EE82EE", price: 35000, type: "name" }
    ],
    backgrounds: [
        { id: "dark_glass", name: "Karanlık Cam", style: "background: rgba(10,10,10,0.85); backdrop-filter: blur(20px);", price: 25000 },
        { id: "midnight", name: "Gece Mavisi", style: "background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);", price: 100000 },
        { id: "toxic", name: "Toksik Radyasyon", style: "background: radial-gradient(circle at center, #1a4a1a 0%, #0a0a0a 100%);", price: 150000 },
        { id: "sunset", name: "Gün Batımı", style: "background: linear-gradient(45deg, #ee0979, #ff6a00); opacity: 0.9;", price: 200000 },
        { id: "cyber", name: "Siber Punk", style: "background: linear-gradient(135deg, #00d2ff 0%, #3a7bd5 100%); border-color: #00d2ff;", price: 300000 },
        { id: "rainbow", name: "Gökkuşağı (Hareketli)", style: "background: linear-gradient(-45deg, #ee7752, #e73c7e, #23a6d5, #23d5ab); background-size: 400% 400%; animation: gradient 15s ease infinite;", price: 500000 }
    ]
};

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
            // Hiç admin yoksa oluştur (Sadece ilk kurulumda çalışır)
            await adminRef.set(defaultAdmins);
            console.log("✅ Admin tablosu ilk kez oluşturuldu.");
        } else {
            console.log("✅ Mevcut admin verileri korundu. (Deploy/Restart sırasında sıfırlanmadı)");
        }
    } catch (e) {
        console.error("Admin Users Init Error:", e.message);
    }
}
initAdminUsers();

// Global Cooldown Takibi
const userGlobalCooldowns = {};

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

// --- MIDDLEWARE DEFINITIONS ---
const ADMIN_KEY_PRE = process.env.ADMIN_KEY || "";

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
    } else if (key === ADMIN_KEY_PRE && ADMIN_KEY_PRE !== "") {
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

// GLOBAL STATES
const activeDuels = {};
const channelHeists = {};
const channelLotteries = {};
const channelPredictions = {};
const heistHistory = {}; // { broadcasterId: [timestamp1, timestamp2] }
const activeBanZaman = {}; // Otomatik Banlama { username: { limit: 10, duration: 1, count: 0 } }
const riggedGambles = {};
const riggedShips = {};
const riggedStats = {};
const horseRaces = {};
const activeRR = {};
const dbRecentUsers = {}; // Aktif kullanıcıları takip etmek için
let botMasterSwitch = true; // Omegacyr için master switch


// --- GLOBAL BORSA SİSTEMİ ---
const INITIAL_STOCKS = {
    "APPLE": { name: "Apple Inc.", price: 5000, trend: 1, history: [], volatility: 0.02, drift: 0.0001 },
    "BITCOIN": { name: "Bitcoin", price: 45000, trend: 1, history: [], volatility: 0.08, drift: 0.0005 },
    "GOLD": { name: "Altın (Ons)", price: 2500, trend: -1, history: [], volatility: 0.12, drift: 0.0003 },
    "SILVER": { name: "Gümüş", price: 850, trend: 1, history: [], volatility: 0.06, drift: 0.0002 },
    "PLATINUM": { name: "Platin", price: 3200, trend: 1, history: [], volatility: 0.09, drift: 0.0002 },
    "KICK": { name: "Kick Streaming", price: 100, trend: 1, history: [], volatility: 0.15, drift: 0.001 },
    "ETHER": { name: "Ethereum", price: 15000, trend: -1, history: [], volatility: 0.06, drift: 0.0004 },
    "TESLA": { name: "Tesla", price: 7500, trend: 1, history: [], volatility: 0.05, drift: 0.0003 },
    "NVIDIA": { name: "NVIDIA Corp.", price: 12000, trend: 1, history: [], volatility: 0.04, drift: 0.0006 },
    "GOOGLE": { name: "Alphabet (Google)", price: 6200, trend: -1, history: [], volatility: 0.02, drift: 0.0002 },
    "AMAZON": { name: "Amazon", price: 5800, trend: 1, history: [], volatility: 0.02, drift: 0.0002 },
    "OMEGA": { name: "Omega Holding", price: 1000, trend: 1, history: [], volatility: 0.15, drift: 0.0008 }
};

let currentMarketCycle = "NORMAL";
let cycleDuration = 0;
let nextNewsTimeMemory = 0; // Bellek içi haber zamanlayıcı (Firebase race condition önlemi)

// ... (existing constants)

// Borsa güncelleme (Concurrency Lock ile)
let isUpdatingStocks = false;

// 100+ News Templates (Simplified for brevity in source view but fully expanded in execution)
const NEWS_TEMPLATES = {
    GOOD: [
        "{coin} CEO'su yeni bir devrim niteliğinde ürün duyurdu!",
        "{coin} yıllık kâr rekoru kırdığını açıkladı.",
        "Ünlü yatırımcılar {coin} toplamaya başladı.",
        "{coin} rakiplerini geride bırakarak pazar liderliğine oynuyor.",
        "Hükümetten {coin} için vergi teşviği kararı çıktı.",
        "{coin}, büyük bir teknoloji deviyle ortaklık imzaladı.",
        "Analistler {coin} için 'AL' tavsiyesini güçlü bir şekilde yineliyor.",
        "{coin} borsada günün en çok kazandıranı oldu.",
        "Yapay zeka analizleri {coin} için büyük bir ralli öngörüyor.",
        "{coin} Asya pazarında büyük bir genişleme başlattı.",
        "{coin} yeni patent başvurularıyla inovasyon ödülü aldı.",
        "Sosyal medyada {coin} çılgınlığı başladı, trendlerde 1 numara!",
        "{coin} temettü oranlarını artıracağını duyurdu.",
        "{coin} sürdürülebilirlik raporuyla çevrecilerden tam not aldı.",
        "Büyük bir banka {coin} rezervlerini artırdı.",
        "{coin} blockchain teknolojisine yatırım yapacağını açıkladı.",
        "{coin} uzay madenciliği projesi ses getirdi.",
        "{coin} kuantum bilgisayar yarışında öne geçti.",
        "{coin} hisseleri 52 haftanın zirvesini gördü.",
        "Elon Musk {coin} hakkında olumlu bir tweet attı 🚀",
        "{coin} yeni veri merkezi yatırımını duyurdu.",
        "{coin} oyun sektörüne dev bir giriş yaptı.",
        "{coin} rakiplerinden kritik bir yönetici transfer etti.",
        "{coin} için açılan dava lehte sonuçlandı.",
        "{coin} global pazarda %20 büyüme kaydetti.",
        "{coin} çalışanlarına rekor prim dağıttı, motivasyon yüksek.",
        "{coin} savunma sanayi ihalesini kazandı.",
        "{coin} sağlık teknolojilerinde çığır açtı.",
        "{coin} otonom sürüş yazılımını tanıttı.",
        "{coin} yenilenebilir enerji atılımı yaptı.",
        "{coin} hisseleri açığa satışçıları ters köşeye yatırdı.",
        "{coin} 4. çeyrek beklentilerini aştı.",
        "{coin} yeni bir satın alma ile gücüne güç kattı.",
        "{coin} marka değerini %50 artırdı.",
        "{coin} reklam kampanyası viral oldu.",
        "{coin} Hollywood filmlerine sponsor oldu.",
        "{coin} Espor dünyasında ana sponsor oldu.",
        "{coin} METAVERSE evreninde arsa satışına başladı.",
        "{coin} NFT koleksiyonu saniyeler içinde tükendi.",
        "{coin} mobil uygulaması indirme rekorları kırdı.",
        "{coin} bulut bilişimde pazar payını artırdı.",
        "{coin} siber güvenlik yatırımlarını ikiye katladı.",
        "{coin} 6G teknolojisi için çalışmalara başladı.",
        "{coin} biyoteknoloji laboratuvarını açtı.",
        "{coin} robotik kodlama yarışması düzenliyor.",
        "{coin} eğitim vakfı kurdu, prestiji arttı.",
        "{coin} sanat dünyasına dev destek sağladı.",
        "{coin} Formula 1 takımına sponsor oldu.",
        "{coin} Super Bowl reklamıyla herkesi şaşırttı.",
        "{coin} Ay'a roket gönderme projesine dahil oldu.",
        "Kripto balinaları {coin} cüzdanlarına çekiyor.",
        "{coin} merkeziyetsiz finansa (DeFi) entegre oldu.",
        "{coin} yeni bir kıta üzerinde operasyon başlattı.",
        "{coin} sürdürülebilir enerji projeleri için fon topladı.",
        "Dünyaca ünlü bir milyarder {coin} hissesi aldığını doğruladı.",
        "{coin} yapay zeka entegrasyonu sayesinde verimliliği %200 artırdı.",
        "Analistlerin favorisi {coin}, yıl sonu hedeflerini ikiye katladı.",
        "{coin} kendi mikroçip üretim tesisini açtı.",
        "{coin} yeni yazılım güncellemesiyle hızı %500 artırdı.",
        "Devlet fonları {coin} için devasa bir yatırım paketi açıkladı.",
        "{coin} dijital ödeme sistemlerinde küresel standart haline geldi."
    ],
    BAD: [
        "{coin} CEO'su hakkında yolsuzluk soruşturması açıldı.",
        "{coin} vergi kaçırma iddialarıyla gündemde.",
        "{coin} fabrikasında büyük bir yangın çıktı.",
        "{coin} üretim hatası nedeniyle milyonlarca ürününü geri çağırdı.",
        "Hackerlar {coin} veritabanına sızdı, veriler çalındı.",
        "{coin} dev bir rekabet cezası yedi.",
        "Analistler {coin} için 'SAT' tavsiyesi verdi.",
        "{coin} beklenmedik şekilde zarar açıkladı.",
        "{coin} en büyük ortağını kaybetti.",
        "{coin} hisseleri serbest düşüşte!",
        "{coin} enerji maliyetleri kârını eritti.",
        "{coin} döviz kurundaki dalgalanmadan büyük darbe aldı.",
        "{coin} jeopolitik riskler nedeniyle operasyonlarını durdurdu.",
        "{coin} lisansı iptal edilme riskiyle karşı karşıya.",
        "{coin} mağazalarını kapatma kararı aldı.",
        "{coin} işten çıkarma yapacağını duyurdu.",
        "{coin} temettü dağıtmayacağını açıkladı.",
        "{coin} büyüme hedeflerini aşağı yönlü revize etti.",
        "{coin} bilançosunda usulsüzlük tespit edildi.",
        "{coin} CEO'su canlı yayında gaf yaptı, hisseler çakıldı.",
        "{coin} ürünlerinde sağlığa zararlı madde bulundu.",
        "{coin} veri gizliliği ihlali nedeniyle ceza aldı.",
        "{coin} patent davasını kaybetti.",
        "Balinalar {coin} satıp çıkıyor.",
        "{coin} rug-pull şüphesiye panik yarattı.",
        "{coin} ayı piyasasının en büyük kurbanı oldu.",
        "{coin} üretim hattında grev başladı.",
        "{coin} tedarik zinciri sorunları nedeniyle üretimi durdurdu.",
        "{coin} hakkında kara para aklama iddiaları ortaya atıldı.",
        "{coin} büyük bir siber saldırıya uğradı, veriler çalındı.",
        "{coin} CFO'su istifa etti.",
        "{coin} vergi kaçırma suçlamasıyla karşı karşıya.",
        "{coin} ürünleri güvenlik gerekçesiyle toplatılıyor.",
        "{coin} rekabet kurumu tarafından soruşturma başlatıldı.",
        "{coin} en büyük müşterisini kaybetti.",
        "{coin} kredi notu düşürüldü.",
        "{coin} iflas koruma başvurusunda bulunabilir söylentisi çıktı.",
        "{coin} teknik analizde 'Death Cross' formasyonu oluştu.",
        "{coin} hisseleri taban fiyata geriledi.",
        "{coin} kullanıcı verilerini izinsiz sattığı ortaya çıktı.",
        "{coin} çevre kirliliğine neden olduğu için ceza yedi.",
        "{coin} fabrikasında yangın çıktı.",
        "{coin} yeni ürün lansmanı fiyaskoyla sonuçlandı.",
        "{coin} sosyal medyada boykot kampanyası başlatıldı.",
        "{coin} en büyük ortağı hisselerini sattı.",
        "{coin} bankalar kredi vermeyi durdurdu.",
        "{coin} borsadan çıkarılma (delist) uyarısı aldı.",
        "{coin} yapay zeka projesi başarısız oldu.",
        "{coin} otonom araç projesini iptal etti.",
        "{coin} sanal evren (metaverse) yatırımları zarar yazdı.",
        "{coin} çalışanlarına mobbing uyguladığı iddia ediliyor.",
        "{coin} sahte bilanço düzenlemekle suçlanıyor.",
        "{coin} yatırımcılarını yanılttığı gerekçesiyle dava açıldı.",
        "{coin} merkez ofisine baskın düzenlendi.",
        "{coin} hisselerinde manipülasyon yapıldığı tespit edildi.",
        "{coin} küresel ekonomik durgunluktan en çok etkilenen şirket oldu.",
        "{coin} sunucuları global bir kesinti yaşadı, erişim yok.",
        "Yatırımcılar {coin} ofisinin önünde protesto düzenliyor.",
        "{coin} CEO'sunun gizli ses kayıtları sızdırıldı!",
        "{coin} veritabanı şifreleri Dark Web'de satışa çıktı.",
        "Merkez bankası {coin} işlemlerine kısıtlama getirdi.",
        "{coin} yeni genel müdürü görevi kabul etmedi, belirsizlik hakim.",
        "Gümrük kısıtlamaları {coin} ihracatını durma noktasına getirdi.",
        "{coin} hisselerinde gece vakti %40'lık bir ani çöküş yaşandı.",
        "{coin} projesinden sorumlu ekip topluca istifa etti!"
    ]
};

function getRandomStockNews(name, type) {
    const list = NEWS_TEMPLATES[type] || NEWS_TEMPLATES.GOOD;
    const template = list[Math.floor(Math.random() * list.length)];
    return template.replace(/{coin}/g, name);
}

// HELPER: Günlük Limit Kontrolü (%25-50)
function applyDailyLimit(code, newPrice, dailyStartPrice) {
    if (!dailyStartPrice || dailyStartPrice <= 0) return newPrice;
    const maxChangeLimit = 25 + (code.charCodeAt(0) % 26); // 25-50%
    const maxPrice = Math.floor(dailyStartPrice * (1 + maxChangeLimit / 100));
    const minPrice = Math.ceil(dailyStartPrice * (1 - maxChangeLimit / 100));

    if (newPrice > maxPrice) return maxPrice;
    if (newPrice < minPrice) return Math.max(1, minPrice);
    return Math.max(1, newPrice);
}

// ADMIN API: STOCKS RENAME CODE
app.post('/admin-api/stocks/rename', authAdmin, hasPerm('stocks'), async (req, res) => {
    const { oldCode, newCode, newName } = req.body;
    if (!oldCode || !newCode) return res.json({ success: false, error: 'Eksik bilgi' });

    const cleanOld = oldCode.toUpperCase().trim();
    const cleanNew = newCode.toUpperCase().trim();

    try {
        const snap = await db.ref(`global_stocks/${cleanOld}`).once('value');
        if (!snap.exists()) return res.json({ success: false, error: 'Hisse bulunamadı' });

        const oldData = snap.val();

        // Check if new code exists
        const newSnap = await db.ref(`global_stocks/${cleanNew}`).once('value');
        if (newSnap.exists()) return res.json({ success: false, error: 'Yeni kod zaten kullanımda!' });

        // Create new entry
        const newData = { ...oldData };
        if (newName) newData.name = newName;
        // Keep history and other critical data

        await db.ref(`global_stocks/${cleanNew}`).set(newData);
        await db.ref(`global_stocks/${cleanOld}`).remove();

        addLog("Borsa İsim Değişikliği", `${cleanOld} -> ${cleanNew} olarak değiştirildi.`);
        res.json({ success: true, message: "Kodu başarıyla değiştirildi." });

    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

app.post('/admin-api/trigger-news', authAdmin, hasPerm('stocks'), async (req, res) => {
    try {
        const stockRef = db.ref('global_stocks');
        const snap = await stockRef.once('value');
        let stocks = snap.val();
        if (!stocks) return res.json({ success: false, error: 'Borsa boş' });

        const codes = Object.keys(stocks);
        const target = codes[Math.floor(Math.random() * codes.length)];
        const newsType = Math.random() > 0.5 ? 'GOOD' : 'BAD';
        const percent = (Math.random() * 0.15) + 0.10;
        const impact = newsType === 'GOOD' ? (1 + percent) : (1 - percent);

        const currentDailyStart = stocks[target].daily_start_price || stocks[target].price;
        const currentDailyDate = stocks[target].daily_start_date || new Date().toISOString().split('T')[0];

        const rawNewPrice = Math.round(stocks[target].price * impact);
        stocks[target].price = applyDailyLimit(target, rawNewPrice, currentDailyStart);

        await db.ref('global_news').push({
            text: newsMsg,
            timestamp: Date.now(),
            type: newsType
        });

        await stockRef.child(target).update({
            price: stocks[target].price,
            trend: impact > 1 ? 1 : -1,
            daily_start_price: currentDailyStart,
            daily_start_date: currentDailyDate
        });

        addLog("Admin Haber Tetikleme", `Haber: ${newsMsg} (${target})`);
        res.json({ success: true, message: newsMsg });

    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

async function updateGlobalStocks() {
    if (isUpdatingStocks) return;
    isUpdatingStocks = true;

    try {
        const stockRef = db.ref('global_stocks');
        const snap = await stockRef.once('value');
        let stocks = snap.val();

        if (!stocks || !stocks["APPLE"]) {
            console.log("⚠️ Borsa verisi bulunamadı, başlangıç değerleri yükleniyor...");
            stocks = JSON.parse(JSON.stringify(INITIAL_STOCKS));
            for (let code in stocks) {
                let h = [];
                let p = stocks[code].price;
                for (let i = 0; i < 24; i++) {
                    p = Math.round(p * (1 + (Math.random() * 0.04 - 0.02)));
                    h.push(p);
                }
                stocks[code].history = h;
            }
        }

        const metaRef = db.ref('market_meta');
        const metaSnap = await metaRef.once('value');
        let meta = metaSnap.val();

        if (meta) {
            currentMarketCycle = meta.cycle || "NORMAL";
            cycleDuration = meta.duration || 0;
        }

        if (cycleDuration <= 0) {
            // Ağırlıklı piyasa döngüsü seçimi - STAGNANT (Durgun/Yatay) %65 olasılıkla
            const weightedCycles = [
                { cycle: "STAGNANT", weight: 70 },  // %65 - Durgun piyasa (en sık)
                { cycle: "NORMAL", weight: 15 },    // %20 - Normal piyasa
                { cycle: "BULLISH", weight: 8 },    // %8  - Boğa piyasası
                { cycle: "BEARISH", weight: 5 },    // %5  - Ayı piyasası
                { cycle: "VOLATILE", weight: 2 }    // %2  - Volatil piyasa (nadir)
            ];
            const totalWeight = weightedCycles.reduce((sum, c) => sum + c.weight, 0);
            let random = Math.random() * totalWeight;
            for (const item of weightedCycles) {
                if (random < item.weight) {
                    currentMarketCycle = item.cycle;
                    break;
                }
                random -= item.weight;
            }
            cycleDuration = Math.floor(Math.random() * 300) + 300;
            console.log(`🔄 Yeni Piyasa Döngüsü: ${currentMarketCycle} (${cycleDuration} tik)`);
        }
        cycleDuration--;
        await metaRef.update({ cycle: currentMarketCycle, duration: cycleDuration });

        // VOLATILITY REDUCED (Daha sakin piyasa)
        const cycleMultipliers = {
            "BULLISH": { drift: 0.0001, vol: 0.5 },
            "BEARISH": { drift: -0.0003, vol: 0.8 },
            "VOLATILE": { drift: 0, vol: 1.5 },
            "STAGNANT": { drift: 0, vol: 0.1 },
            "CRASH": { drift: -0.002, vol: 2.0 },
            "NORMAL": { drift: 0.00002, vol: 0.4 }
        };

        const effects = cycleMultipliers[currentMarketCycle] || cycleMultipliers["NORMAL"];

        // NEWS GENERATION LOGIC - 30-60 dakikada bir haber üret
        // Önce bellek içi kontrolü yap (Firebase race condition önlemi)
        const now = Date.now();

        // Bellek değişkeni sıfırsa Firebase'den oku (sunucu yeni başlamış)
        if (nextNewsTimeMemory === 0) {
            try {
                const newsMetaSnap = await db.ref('market_meta/nextNewsTime').once('value');
                nextNewsTimeMemory = newsMetaSnap.val() || 0;
                console.log(`📰 Haber zamanlayıcı yüklendi: ${nextNewsTimeMemory > 0 ? new Date(nextNewsTimeMemory).toLocaleTimeString() : 'Henüz ayarlanmamış'}`);
            } catch (e) {
                console.error("Haber meta okuma hatası:", e.message);
            }
        }

        // Sadece hedef zaman geçtiyse haber üret
        if (now >= nextNewsTimeMemory) {
            const codes = Object.keys(stocks);

            // 1-3 hisse etkilensin (kümeleme etkisi)
            const numTargets = Math.floor(Math.random() * 3) + 1;
            const shuffled = codes.sort(() => 0.5 - Math.random());
            const targets = shuffled.slice(0, Math.min(numTargets, codes.length));

            const newsType = Math.random() > 0.5 ? 'GOOD' : 'BAD';

            // Her hedef hisse için farklı etki (çok büyük: %50-75)
            for (const target of targets) {
                const percent = (Math.random() * 0.25) + 0.50; // %50-%75 arası etki
                const impact = newsType === 'GOOD' ? (1 + percent) : (1 - percent);
                stocks[target].price = Math.round(stocks[target].price * impact);
            }

            const mainTarget = targets[0];
            const newsMsg = getRandomStockNews(stocks[mainTarget].name || mainTarget, newsType);

            // Sonraki haber zamanı: 30-60 dakikada bir
            const minWait = 30 * 60 * 1000; // 30 dakika
            const maxWait = 60 * 60 * 1000; // 60 dakika
            const waitTime = minWait + Math.random() * (maxWait - minWait);
            const newNextNewsTime = now + waitTime;

            // ÖNCE belleği güncelle (anında etkili)
            nextNewsTimeMemory = newNextNewsTime;

            // Sonra Firebase'e yaz (async, ama artık önemli değil)
            await db.ref('global_news').push({
                text: newsMsg,
                timestamp: now,
                type: newsType
            });

            await db.ref('market_meta').update({
                lastNewsTime: now,
                nextNewsTime: newNextNewsTime
            });

            const minutesUntilNext = Math.round(waitTime / 60000);
            const nextTime = new Date(newNextNewsTime).toLocaleTimeString('tr-TR');
            console.log(`📰 PİYASA HABERİ: ${newsMsg}`);
            console.log(`   ⏰ Sonraki haber: ${nextTime} (${minutesUntilNext} dakika sonra)`);
        }

        for (const [code, data] of Object.entries(stocks)) {
            // ANTI-INFLATION LOGIC
            const oldPrice = data.price || 100;
            let extraDrift = 0;

            if (oldPrice > 5000000) {
                extraDrift = -0.05; // -5% per tick if over 5M
            } else if (oldPrice > 1000000) {
                extraDrift = -0.01; // -1% if over 1M
            } else if (oldPrice > 250000) {
                extraDrift = -0.002;
            }

            // META DATA RECOVERY
            let baseData = INITIAL_STOCKS[code];
            if (!baseData) {
                const n = (data.name || code).toUpperCase();
                let fVol = 0.15;
                let fDrift = 0.0004;

                if (n.includes("ALTIN") || n.includes("GOLD")) { fVol = 0.22; fDrift = 0.0006; }
                else if (n.includes("PLATIN") || n.includes("PLATINUM")) { fVol = 0.20; fDrift = 0.0005; }
                else if (n.includes("GÜMÜŞ") || n.includes("SILVER")) { fVol = 0.18; fDrift = 0.0004; }
                else if (n.includes("COIN") || n.includes("TOKEN") || n.includes("BITCOIN") || n.includes("CRYPTO")) { fVol = 0.25; fDrift = 0.0015; }
                else if (n.includes("TESLA") || n.includes("NVIDIA") || n.includes("TECH")) { fVol = 0.16; fDrift = 0.0006; }

                baseData = { price: data.price || 100, volatility: fVol, drift: fDrift, name: code };
            }

            const startPrice = baseData.price || 100;
            let vol = Math.max(data.volatility || 0, baseData.volatility, 0.10);
            let drift = (data.drift !== undefined && data.drift !== 0) ? data.drift : baseData.drift;

            if (Math.abs(drift) < 0.0003) drift = 0.0004;

            // Apply market effects
            vol = vol * effects.vol;
            drift = drift + effects.drift + extraDrift;

            const effectiveStartPrice = (baseData.price === 100 && oldPrice > 500) ? oldPrice : baseData.price;

            if (oldPrice > effectiveStartPrice * 3) drift -= 0.0005;
            else if (oldPrice < effectiveStartPrice * 0.3) drift += 0.0005;

            const epsilon = Math.random() * 2 - 1;
            const changePercent = (drift * 0.5) + (vol * epsilon * 0.25);

            let newPrice = Math.round(oldPrice * (1 + changePercent));
            if (newPrice < 1) newPrice = 1;

            // ---------------------------------------------------------
            // GÜNLÜK ARTIŞ SINIRI (%100-250)
            // ---------------------------------------------------------
            const today = new Date().toISOString().split('T')[0];
            let dailyStartPrice = data.daily_start_price || oldPrice;
            let dailyStartDate = data.daily_start_date || '';

            // Yeni gün mü?
            if (dailyStartDate !== today) {
                dailyStartPrice = oldPrice;
                dailyStartDate = today;
            }

            // ---------------------------------------------------------
            // GÜNLÜK ARTIŞ SINIRI (%25-50) - Helper ile
            // ---------------------------------------------------------
            newPrice = applyDailyLimit(code, newPrice, dailyStartPrice);

            if (!data.name && baseData.name) data.name = baseData.name;
            if (!data.history) data.history = [];

            const finalVol = Math.max(baseData.volatility, 0.10);
            const finalDrift = Math.abs(baseData.drift) >= 0.0003 ? baseData.drift : 0.0004;

            stocks[code] = {
                ...data,
                price: newPrice,
                oldPrice: oldPrice,
                trend: newPrice > oldPrice ? 1 : (newPrice < oldPrice ? -1 : (data.trend || 1)),
                lastUpdate: Date.now(),
                marketStatus: currentMarketCycle,
                volatility: finalVol,
                drift: finalDrift,
                // Günlük takip verilerini kaydet
                daily_start_price: dailyStartPrice,
                daily_start_date: dailyStartDate
            };
        }

        await stockRef.set(stocks);
    } catch (e) {
        console.error("Borsa Update Error:", e.message);
    } finally {
        isUpdatingStocks = false;
    }
}

// ... (saveHourlyStockHistory logic remains similar)

// --- ADMIN API UPDATES ---

// ADMIN RESİM YÜKLEME (Market Görseli için)
app.post('/admin-api/upload-image', authAdmin, hasPerm('troll'), upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Dosya yok' });
    const channelId = req.headers['c-id'] || 'global';
    const baseUrl = process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`;
    const fileUrl = `${baseUrl}/uploads/sounds/${channelId}/${req.file.filename}`; // Keeping in same dir logic for simplicity or create images dir
    res.json({ url: fileUrl });
});

app.post('/admin-api/stocks/update', authAdmin, hasPerm('stocks'), async (req, res) => {
    const { code, price, trend, name } = req.body;
    if (!code) return res.json({ success: false, error: 'Kod eksik' });

    const updateData = {
        price: parseInt(price),
        trend: parseInt(trend),
        lastUpdate: Date.now()
    };
    if (name) updateData.name = name;

    await db.ref(`global_stocks/${code}`).update(updateData);
    addLog("Borsa Güncelleme", `${code}: ${price} 💰`);
    res.json({ success: true });
});

app.post('/admin-api/stocks/add', authAdmin, hasPerm('stocks'), async (req, res) => {
    const { code, price, name } = req.body;
    const cleanCode = code.toUpperCase().trim();
    if (!cleanCode || isNaN(price)) return res.json({ success: false, error: 'Eksik bilgi' });

    // Initialize with history array to ensure graph works immediately
    const startHistory = [];
    const basePrice = parseInt(price);
    for (let i = 0; i < 48; i++) startHistory.push(basePrice);

    // Volatility ve drift değerleri - yeni hisseler dinamik hareket etsin
    const volatility = 0.15; // %15 volatilite (yüksek hareket)
    const drift = 0.0005;    // Hafif yukarı eğilim

    await db.ref(`global_stocks/${cleanCode}`).set({
        name: name || cleanCode,
        price: basePrice,
        oldPrice: basePrice,
        trend: 1,
        lastUpdate: Date.now(),
        history: startHistory,
        volatility: volatility,  // YENİ: Volatilite eklendi
        drift: drift             // YENİ: Drift eklendi
    });
    addLog("Borsa Yeni Hisse", `${cleanCode} eklendi: ${price} 💰 (vol: ${volatility}, drift: ${drift})`);
    res.json({ success: true });
});

app.post('/admin-api/add-news', authAdmin, hasPerm('stocks'), async (req, res) => {
    const { code, text, type, impact } = req.body;
    if (!text || !type) return res.status(400).json({ error: "Eksik bilgi" });

    // 1. Haberi Kaydet
    await db.ref('global_news').push({
        text,
        type, // GOOD or BAD
        timestamp: Date.now(),
        relatedStock: code || 'GLOBAL'
    });

    // 2. Hisse fiyatına etki uygula
    // Eğer spesifik bir hisse kodu girilmişse o hisseyi etkile
    // Impact sıfır veya belirtilmemişse, haber türüne göre otomatik %10-15 etki uygula
    const cleanCode = code ? code.toUpperCase().trim() : '';

    if (cleanCode && cleanCode !== 'GLOBAL') {
        const stockRef = db.ref(`global_stocks/${cleanCode}`);
        const s = (await stockRef.once('value')).val();
        if (s) {
            let effectiveImpact = parseInt(impact) || 0;

            // Eğer impact 0 ise otomatik hesapla (haber türüne göre)
            if (effectiveImpact === 0) {
                // %50 ile %75 arasında rastgele etki
                const randomImpact = 50 + Math.random() * 25;
                effectiveImpact = type === 'GOOD' ? randomImpact : -randomImpact;
            } else {
                // Manuel girilen impact'ı haber türüne göre işaretle
                effectiveImpact = type === 'GOOD' ? Math.abs(effectiveImpact) : -Math.abs(effectiveImpact);
            }

            const multiplier = 1 + (effectiveImpact / 100);
            const rawNewPrice = Math.round(s.price * multiplier);

            // Limit on news
            const dailyStart = s.daily_start_price || s.oldPrice || s.price;
            const dailyDate = s.daily_start_date || new Date().toISOString().split('T')[0]; // Ensure date is set
            const newPrice = applyDailyLimit(cleanCode, rawNewPrice, dailyStart);

            const trend = effectiveImpact > 0 ? 1 : -1;

            await stockRef.update({
                price: newPrice,
                trend: trend,
                lastUpdate: Date.now(),
                daily_start_price: dailyStart,
                daily_start_date: dailyDate
            });

            console.log(`📰 HABER ETKİSİ: ${cleanCode} fiyatı ${s.price} -> ${newPrice} (${effectiveImpact > 0 ? '+' : ''}${effectiveImpact.toFixed(1)}%)`);
        }
    }

    addLog("Borsa Haber", `${code || 'Global'}: ${text} (${type})`);
    res.json({ success: true });
});

// ... (rest of the file)

// EMLAK ŞEHİRLERİ (Source of Truth with Coords)
const EMLAK_CITIES = [
    { "id": "ADANA", "name": "Adana", "x": 50, "y": 81 },
    { "id": "ADIYAMAN", "name": "Adıyaman", "x": 66, "y": 72 },
    { "id": "AFYONKARAHISAR", "name": "Afyon", "x": 25, "y": 53 },
    { "id": "AGRI", "name": "Ağrı", "x": 91, "y": 38 },
    { "id": "AMASYA", "name": "Amasya", "x": 53, "y": 23 },
    { "id": "ANKARA", "name": "Ankara", "x": 38, "y": 34 },
    { "id": "ANTALYA", "name": "Antalya", "x": 26, "y": 83 },
    { "id": "ARTVIN", "name": "Artvin", "x": 84, "y": 15 },
    { "id": "AYDIN", "name": "Aydın", "x": 11, "y": 68 },
    { "id": "BALIKESIR", "name": "Balıkesir", "x": 12, "y": 39 },
    { "id": "BILECIK", "name": "Bilecik", "x": 23, "y": 31 },
    { "id": "BINGOL", "name": "Bingöl", "x": 77, "y": 51 },
    { "id": "BITLIS", "name": "Bitlis", "x": 86, "y": 59 },
    { "id": "BOLU", "name": "Bolu", "x": 31, "y": 22 },
    { "id": "BURDUR", "name": "Burdur", "x": 24, "y": 70 },
    { "id": "BURSA", "name": "Bursa", "x": 18, "y": 30 },
    { "id": "CANAKKALE", "name": "Çanakkale", "x": 4, "y": 31 },
    { "id": "CANKIRI", "name": "Çankırı", "x": 42, "y": 24 },
    { "id": "CORUM", "name": "Çorum", "x": 49, "y": 25 },
    { "id": "DENIZLI", "name": "Denizli", "x": 18, "y": 69 },
    { "id": "DIYARBAKIR", "name": "Diyarbakır", "x": 76, "y": 66 },
    { "id": "EDIRNE", "name": "Edirne", "x": 5, "y": 7 },
    { "id": "ELAZIG", "name": "Elazığ", "x": 71, "y": 54 },
    { "id": "ERZINCAN", "name": "Erzincan", "x": 72, "y": 37 },
    { "id": "ERZURUM", "name": "Erzurum", "x": 81, "y": 35 },
    { "id": "ESKISEHIR", "name": "Eskişehir", "x": 25, "y": 37 },
    { "id": "GAZIANTEP", "name": "Gaziantep", "x": 61, "y": 80 },
    { "id": "GIRESUN", "name": "Giresun", "x": 66, "y": 19 },
    { "id": "GUMUSHANE", "name": "Gümüşhane", "x": 72, "y": 26 },
    { "id": "HAKKARI", "name": "Hakkari", "x": 94, "y": 72 },
    { "id": "HATAY", "name": "Hatay", "x": 55, "y": 94 },
    { "id": "ISPARTA", "name": "Isparta", "x": 26, "y": 69 },
    { "id": "MERSIN", "name": "Mersin", "x": 47, "y": 84 },
    { "id": "ISTANBUL", "name": "İstanbul", "x": 17, "y": 17 },
    { "id": "IZMIR", "name": "İzmir", "x": 8, "y": 58 },
    { "id": "KARS", "name": "Kars", "x": 91, "y": 24 },
    { "id": "KASTAMONU", "name": "Kastamonu", "x": 42, "y": 12 },
    { "id": "KAYSERI", "name": "Kayseri", "x": 52, "y": 48 },
    { "id": "KIRKLARELI", "name": "Kırklareli", "x": 8, "y": 6 },
    { "id": "KIRSEHIR", "name": "Kırşehir", "x": 44, "y": 47 },
    { "id": "KOCAELI", "name": "Kocaeli", "x": 22, "y": 21 },
    { "id": "KONYA", "name": "Konya", "x": 36, "y": 67 },
    { "id": "KUTAHYA", "name": "Kütahya", "x": 23, "y": 43 },
    { "id": "MALATYA", "name": "Malatya", "x": 66, "y": 60 },
    { "id": "MANISA", "name": "Manisa", "x": 9, "y": 55 },
    { "id": "KAHRAMANMARAS", "name": "Kahramanmaraş", "x": 59, "y": 72 },
    { "id": "MARDIN", "name": "Mardin", "x": 79, "y": 76 },
    { "id": "MUGLA", "name": "Muğla", "x": 14, "y": 78 },
    { "id": "MUS", "name": "Muş", "x": 83, "y": 54 },
    { "id": "NEVSEHIR", "name": "Nevşehir", "x": 47, "y": 55 },
    { "id": "NIGDE", "name": "Niğde", "x": 47, "y": 66 },
    { "id": "ORDU", "name": "Ordu", "x": 64, "y": 18 },
    { "id": "RIZE", "name": "Rize", "x": 78, "y": 17 },
    { "id": "SAKARYA", "name": "Sakarya", "x": 25, "y": 21 },
    { "id": "SAMSUN", "name": "Samsun", "x": 56, "y": 13 },
    { "id": "SIIRT", "name": "Siirt", "x": 85, "y": 66 },
    { "id": "SINOP", "name": "Sinop", "x": 50, "y": 1 },
    { "id": "SIVAS", "name": "Sivas", "x": 59, "y": 37 },
    { "id": "TEKIRDAG", "name": "Tekirdağ", "x": 10, "y": 18 },
    { "id": "TOKAT", "name": "Tokat", "x": 57, "y": 28 },
    { "id": "TRABZON", "name": "Trabzon", "x": 73, "y": 17 },
    { "id": "TUNCELI", "name": "Tunceli", "x": 72, "y": 48 },
    { "id": "SANLIURFA", "name": "Şanlıurfa", "x": 69, "y": 78 },
    { "id": "USAK", "name": "Uşak", "x": 20, "y": 54 },
    { "id": "VAN", "name": "Van", "x": 92, "y": 57 },
    { "id": "YOZGAT", "name": "Yozgat", "x": 48, "y": 36 },
    { "id": "ZONGULDAK", "name": "Zonguldak", "x": 32, "y": 10 },
    { "id": "AKSARAY", "name": "Aksaray", "x": 44, "y": 59 },
    { "id": "BAYBURT", "name": "Bayburt", "x": 76, "y": 29 },
    { "id": "KARAMAN", "name": "Karaman", "x": 39, "y": 78 },
    { "id": "KIRIKKALE", "name": "Kırıkkale", "x": 41, "y": 36 },
    { "id": "BATMAN", "name": "Batman", "x": 81, "y": 67 },
    { "id": "SIRNAK", "name": "Şırnak", "x": 88, "y": 73 },
    { "id": "BARTIN", "name": "Bartın", "x": 35, "y": 7 },
    { "id": "ARDAHAN", "name": "Ardahan", "x": 89, "y": 16 },
    { "id": "IGDIR", "name": "Iğdır", "x": 96, "y": 35 },
    { "id": "YALOVA", "name": "Yalova", "x": 19, "y": 23 },
    { "id": "KARABUK", "name": "Karabük", "x": 36, "y": 14 },
    { "id": "KILIS", "name": "Kilis", "x": 60, "y": 86 },
    { "id": "OSMANIYE", "name": "Osmaniye", "x": 55, "y": 80 },
    { "id": "DUZCE", "name": "Düzce", "x": 29, "y": 20 }
];

const REAL_ESTATE_TYPES = [
    // KONUTLAR (Kira Geliri)
    { name: "1+1 Daire", minPrice: 650000, maxPrice: 950000, minInc: 800, maxInc: 1500, category: "residence", icon: "house-user" },
    { name: "2+1 Daire", minPrice: 1200000, maxPrice: 1800000, minInc: 1600, maxInc: 2800, category: "residence", icon: "house" },
    { name: "3+1 Lüks Daire", minPrice: 2000000, maxPrice: 3500000, minInc: 3000, maxInc: 6000, category: "residence", icon: "building" },
    { name: "Rezidans Katı", minPrice: 5000000, maxPrice: 9000000, minInc: 7000, maxInc: 14000, category: "residence", icon: "hotel" },

    // DÜKKANLAR (Kira Getirmez - İleride İşletme Olacak)
    { name: "Küçük Dükkan", minPrice: 500000, maxPrice: 1500000, minInc: 0, maxInc: 0, category: "shop", icon: "store" },
    { name: "Orta Boy Dükkan", minPrice: 2000000, maxPrice: 5000000, minInc: 0, maxInc: 0, category: "shop", icon: "store" },
    { name: "Büyük Mağaza", minPrice: 10000000, maxPrice: 25000000, minInc: 0, maxInc: 0, category: "shop", icon: "building-columns" },

    // ARAZİLER (Tek Tip: Arazi)
    { name: "Küçük Arazi", minPrice: 250000, maxPrice: 1500000, minInc: 0, maxInc: 0, category: "land", icon: "map" },
    { name: "Orta Boy Arazi", minPrice: 2000000, maxPrice: 8000000, minInc: 0, maxInc: 0, category: "land", icon: "map" },
    { name: "Büyük Arazi", minPrice: 10000000, maxPrice: 50000000, minInc: 0, maxInc: 0, category: "land", icon: "map" }
];

// ... (RPG_WEAPONS ve RPG_ARMORS aynı kalabilir)

async function getCityMarket(cityId) {
    try {
        const marketRef = db.ref(`real_estate_market/${cityId}`);
        const snap = await marketRef.once('value');
        let data = snap.val();

        if (!data) {
            data = [];
            // Toplam hedef: 75 ile 250 arası
            const targetCount = Math.floor(Math.random() * (250 - 75 + 1)) + 75;

            // Minimum kotalar
            const minLand = 10;
            const minShop = 40;
            const minResidence = 25;

            // Kategorilere göre tipleri filtrele
            const lands = REAL_ESTATE_TYPES.filter(t => t.category === 'land');
            const shops = REAL_ESTATE_TYPES.filter(t => t.category === 'shop');
            const residences = REAL_ESTATE_TYPES.filter(t => t.category === 'residence');

            let currentCount = 0;

            // Yardımcı fonksiyon: Mülk Ekle
            const addProperty = (typeList) => {
                const tpl = typeList[Math.floor(Math.random() * typeList.length)];

                // Fiyat
                let price = Math.floor(tpl.minPrice + Math.random() * (tpl.maxPrice - tpl.minPrice));

                // Gelir
                let income = 0;
                if (tpl.maxInc > 0) {
                    income = Math.floor(tpl.minInc + Math.random() * (tpl.maxInc - tpl.minInc));
                }

                // İsimlendirme: Araziler hep "Arazi", diğerleri normal
                let finalName = `${cityId} ${tpl.name}`;
                if (tpl.category === 'land') {
                    finalName = `${cityId} Arazisi`;
                }

                data.push({
                    id: `${cityId.toLowerCase()}_${currentCount + 1}`,
                    name: finalName,
                    price: price,
                    income: income,
                    owner: null,
                    category: tpl.category,
                    icon: tpl.icon,
                    tier: tpl.name // Orijinal tip adını (Küçük, Orta vb.) sakla ama gösterme
                });
                currentCount++;
            };

            // 1. Kotaları Doldur
            for (let i = 0; i < minLand; i++) addProperty(lands);
            for (let i = 0; i < minShop; i++) addProperty(shops);
            for (let i = 0; i < minResidence; i++) addProperty(residences);

            // 2. Kalanı Rastgele Doldur
            while (currentCount < targetCount) {
                const randomCat = Math.random();
                if (randomCat < 0.2) addProperty(lands);       // %20 ihtimalle arazi
                else if (randomCat < 0.6) addProperty(shops);  // %40 ihtimalle dükkan
                else addProperty(residences);                 // %40 ihtimalle konut
            }

            // Karıştır (Shuffle) ki hepsi peş peşe gelmesin
            data.sort(() => Math.random() - 0.5);

            // ID'leri yeniden sırala
            data = data.map((item, idx) => ({ ...item, id: `${cityId.toLowerCase()}_${idx + 1}` }));

            await marketRef.set(data);
        }
        return data;
    } catch (e) {
        console.error(`City Market Error (${cityId}):`, e.message);
        return [];
    }
}



// Borsa Saatlik Geçmiş Kaydı
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
            if (history.length > 48) history.shift(); // Son 48 saat
            updates[`${code}/history`] = history;
        }
        await stockRef.update(updates);
        console.log(`📈 Borsa saatlik geçmiş güncellendi.`);
    } catch (e) { console.error("Hourly History Error:", e.message); }
}
setInterval(saveHourlyStockHistory, 3600000); // 1 Saat

// Borsa güncelleme (Her 2 saniyede bir)
setInterval(updateGlobalStocks, 2000);
updateGlobalStocks(); // İlk çalıştırma

// Sunucu başladığında tüm hisselerin volatilite değerlerini düzelt
async function fixStockVolatility() {
    try {
        const stockRef = db.ref('global_stocks');
        const snap = await stockRef.once('value');
        const stocks = snap.val();
        if (!stocks) return;

        const updates = {};
        let fixedCount = 0;

        for (const [code, data] of Object.entries(stocks)) {
            const currentVol = data.volatility || 0;
            const currentDrift = data.drift || 0;

            // Minimum değerler - YÜKSELTİLDİ
            const minVol = 0.10;
            const minDrift = 0.0004;

            // İsme göre özel volatilite değerleri - YÜKSELTİLDİ
            const n = (data.name || code).toUpperCase();
            let targetVol = minVol;
            let targetDrift = minDrift;

            if (n.includes("ALTIN") || n.includes("GOLD")) { targetVol = 0.22; targetDrift = 0.0006; }
            else if (n.includes("PLATIN") || n.includes("PLATINUM")) { targetVol = 0.20; targetDrift = 0.0005; }
            else if (n.includes("GÜMÜŞ") || n.includes("SILVER")) { targetVol = 0.18; targetDrift = 0.0004; }
            else if (n.includes("COIN") || n.includes("TOKEN") || n.includes("BITCOIN")) { targetVol = 0.25; targetDrift = 0.0015; }
            else if (n.includes("ETHEREUM") || n.includes("ETHER")) { targetVol = 0.22; targetDrift = 0.001; }
            else if (n.includes("TESLA") || n.includes("NVIDIA")) { targetVol = 0.16; targetDrift = 0.0006; }
            else if (INITIAL_STOCKS[code]) {
                targetVol = Math.max(INITIAL_STOCKS[code].volatility || minVol, minVol);
                targetDrift = Math.max(INITIAL_STOCKS[code].drift || minDrift, minDrift);
            } else {
                targetVol = 0.15; // Yeni hisseler için varsayılan yüksek volatilite
                targetDrift = 0.0004;
            }

            // Düşük değerleri düzelt
            if (currentVol < targetVol || Math.abs(currentDrift) < Math.abs(targetDrift)) {
                updates[`${code}/volatility`] = Math.max(currentVol, targetVol);
                updates[`${code}/drift`] = Math.abs(currentDrift) >= Math.abs(targetDrift) ? currentDrift : targetDrift;
                fixedCount++;
                console.log(`🔧 ${code}: volatilite ${currentVol.toFixed(3)} -> ${Math.max(currentVol, targetVol).toFixed(3)}`);
            }
        }

        if (Object.keys(updates).length > 0) {
            await stockRef.update(updates);
            console.log(`✅ ${fixedCount} hissenin volatilite değerleri düzeltildi.`);
        } else {
            console.log(`✅ Tüm hisselerin volatilite değerleri zaten düzgün.`);
        }
    } catch (e) {
        console.error("Volatilite düzeltme hatası:", e.message);
    }
}

// Sunucu başladığında volatiliteleri düzelt
setTimeout(fixStockVolatility, 3000);

app.post('/api/borsa/fix-costs', async (req, res) => {
    if (req.body.requester !== 'omegacyr') return res.status(403).json({ success: false, error: 'Yetkisiz Erişim' });
    try {
        const stocksSnap = await db.ref('global_stocks').once('value');
        const stocks = stocksSnap.val() || {};

        const usersSnap = await db.ref('users').once('value');
        const users = usersSnap.val() || {};

        const updates = {};
        let count = 0;

        for (const [uid, u] of Object.entries(users)) {
            if (!u.stocks) continue;
            for (const [code, amount] of Object.entries(u.stocks)) {
                // Check if cost is missing or invalid (0) but user has stock
                const cost = u.stock_costs ? u.stock_costs[code] : 0;

                if ((!cost || cost <= 0) && amount > 0) {
                    const currentPrice = stocks[code]?.price || 1000; // Fallback price
                    const estimatedCost = Math.ceil(amount * currentPrice);
                    updates[`users/${uid}/stock_costs/${code}`] = estimatedCost;
                    count++;
                }
            }
        }

        if (Object.keys(updates).length > 0) {
            await db.ref().update(updates);
        }

        res.json({ success: true, message: `${count} adet eksik maliyet verisi onarıldı.` });
    } catch (e) {
        console.error("Fix Costs Error:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/borsa/reset', async (req, res) => {
    if (req.body.requester !== 'omegacyr') return res.status(403).json({ success: false, error: 'Yetkisiz Erişim' });
    try {
        console.log(`🚨 BORSA SIFIRLAMA BAŞLATILDI (omegacyr tarafından)`);
        const usersSnap = await db.ref('users').once('value');
        const users = usersSnap.val() || {};

        const updates = {};
        for (const username in users) {
            if (users[username].stocks || users[username].stock_costs) {
                updates[`users/${username}/stocks`] = null;
                updates[`users/${username}/stock_costs`] = null;
            }
        }

        if (Object.keys(updates).length > 0) {
            await db.ref().update(updates);
        }

        res.json({ success: true, message: "Tüm kullanıcıların borsa portföyleri başarıyla sıfırlandı." });
    } catch (e) {
        console.error("Borsa Reset Error:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// BORSA ALIM İŞLEMİ (Server-Side Secure)
app.post('/api/borsa/buy', async (req, res) => {
    try {
        let { username, code, amount } = req.body;
        amount = parseFloat(amount);
        if (!username || !code || isNaN(amount) || amount <= 0) return res.status(400).json({ success: false, error: "Geçersiz miktar veya parametre." });

        // 1. Güncel Hisse Fiyatını Çek
        const stockSnap = await db.ref(`global_stocks/${code}`).once('value');
        const stockData = stockSnap.val();
        if (!stockData) return res.status(404).json({ success: false, error: "Hisse bulunamadı." });

        const currentPrice = stockData.price;
        const totalCost = Math.ceil(currentPrice * amount);

        // 2. Kullanıcı Bakiyesini Kontrol Et
        const userRef = db.ref(`users/${username}`);
        await userRef.transaction(user => {
            if (user) {
                if (!user.is_infinite && (user.balance || 0) < totalCost) {
                    return; // Abort transaction (return undefined implicitly cancels specific updates if properly handled, but here user is not modified so it returns null/undefined which signals 'no change' but not 'failure' to the callback in all SDKs. Ideally we check in callback.)
                }

                if (!user.is_infinite) {
                    user.balance = (user.balance || 0) - totalCost;
                }

                if (!user.stocks) user.stocks = {};
                if (!user.stock_costs) user.stock_costs = {};

                // BACKFILL
                if ((user.stocks[code] || 0) > 0 && (user.stock_costs[code] || 0) <= 0) {
                    user.stock_costs[code] = (user.stocks[code] * currentPrice);
                }

                user.stock_costs[code] = (user.stock_costs[code] || 0) + totalCost;
                user.stocks[code] = (user.stocks[code] || 0) + amount;
            }
            return user;
        }, (error, committed, snapshot) => {
            if (error) {
                res.status(500).json({ success: false, error: "İşlem hatası." });
            } else if (!committed) {
                res.status(400).json({ success: false, error: "Bakiye yetersiz veya işlem iptal edildi." });
            } else {
                // Double check if balance was actually deducted? No, committed is true only if transaction succeeded.
                // But wait, if I return 'undefined' from transaction update function, committed is usually false.
                // Let's verify: if I return user (modified), committed is true.
                // If I enter the insufficient balance block, I return nothing (undefined). 
                // So committed will be false. Perfect.
                res.json({ success: true, message: `${amount} adet ${code} alındı.`, newBalance: snapshot.val().balance });
            }
        });

    } catch (e) {
        console.error("Borsa Buy Error:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// BORSA SATIŞ İŞLEMİ (Server-Side Secure)
app.post('/api/borsa/sell', async (req, res) => {
    try {
        let { username, code, amount } = req.body;
        amount = parseFloat(amount);
        if (!username || !code || isNaN(amount) || amount <= 0) return res.status(400).json({ success: false, error: "Geçersiz miktar veya parametre." });

        // 1. Güncel Hisse Fiyatını Çek
        const stockSnap = await db.ref(`global_stocks/${code}`).once('value');
        const stockData = stockSnap.val();
        if (!stockData) return res.status(404).json({ success: false, error: "Hisse bulunamadı." });

        const currentPrice = stockData.price;
        const grossTotal = currentPrice * amount;
        const commission = Math.floor(grossTotal * 0.10);
        const netTotal = Math.floor(grossTotal - commission);

        // 2. Kullanıcı İşlemi
        const userRef = db.ref(`users/${username}`);
        await userRef.transaction(user => {
            if (user) {
                if (!user.stocks || (user.stocks[code] || 0) < amount) {
                    return; // Abort
                }

                const oldQty = user.stocks[code];
                const newQty = oldQty - amount;

                user.balance = (user.balance || 0) + netTotal;

                if (!user.stock_costs) user.stock_costs = {};
                const oldCost = user.stock_costs[code] || 0;

                if (newQty <= 0.00000001) {
                    delete user.stocks[code];
                    delete user.stock_costs[code];
                } else {
                    user.stocks[code] = newQty;
                    user.stock_costs[code] = oldCost * (newQty / oldQty);
                }
            }
            return user;
        }, (error, committed, snapshot) => {
            if (error) {
                res.status(500).json({ success: false, error: "İşlem hatası." });
            } else if (!committed) {
                res.status(400).json({ success: false, error: "Yetersiz hisse senedi." });
            } else {
                res.json({ success: true, message: `${amount} adet ${code} satıldı.`, newBalance: snapshot.val().balance });
            }
        });

    } catch (e) {
        console.error("Borsa Sell Error:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/admin-api/stocks/cycle', authAdmin, hasPerm('stocks'), async (req, res) => {
    try {
        const { cycle } = req.body;
        // Geçerli döngüler: BULLISH, BEARISH, VOLATILE, STAGNANT, NORMAL, CRASH
        currentMarketCycle = cycle;
        cycleDuration = 600; // Manual set edildiğinde 20 dakika (1200 / 2sn = 600 tik) boyunca sürsün

        await db.ref('market_meta').update({ cycle: currentMarketCycle, duration: cycleDuration });
        console.log(`🚨 Admin tarafından piyasa döngüsü değiştirildi: ${cycle}`);

        res.json({ success: true, message: `Piyasa modu ${cycle} olarak ayarlandı.` });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// --- ANNOUNCEMENT SYSTEM (New) ---
app.post('/admin-api/announcements/set', authAdmin, hasPerm('announcement'), async (req, res) => {
    try {
        const { text, type } = req.body;
        if (!text) return res.status(400).json({ error: "Mesaj boş" });

        const id = Date.now().toString();
        await db.ref('announcements/' + id).set({
            id,
            text,
            type: type || 'info',
            timestamp: Date.now()
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/admin-api/announcements/delete', authAdmin, hasPerm('announcement'), async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: "ID eksik" });
        await db.ref('announcements/' + id).remove();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/announcements', async (req, res) => {
    try {
        const snap = await db.ref('announcements').limitToLast(15).once('value');
        const data = snap.val() || {};
        const sorted = Object.values(data).sort((a, b) => b.timestamp - a.timestamp);
        res.json(sorted);
    } catch (e) {
        res.json([]);
    }
});

// Sync older devlog to announcements name for compatibility if needed
app.get('/api/devlog', async (req, res) => {
    const snap = await db.ref('announcements').limitToLast(10).once('value');
    const data = snap.val() || {};
    res.json(Object.values(data).map(d => ({ version: "DUYURU", date: new Date(d.timestamp).toLocaleDateString(), text: d.text })));
});

app.post('/admin-api/remove-property', async (req, res) => {
    try {
        const { username, propertyId } = req.body;
        if (!username || !propertyId) return res.json({ success: false, error: "Eksik veri" });

        const cleanUser = username.toLowerCase();
        const userRef = db.ref('users/' + cleanUser);

        // 1. Remove from user profile
        const userSnap = await userRef.once('value');
        const userData = userSnap.val();
        if (!userData || !userData.properties) return res.json({ success: false, error: "Mülk bulunamadı" });

        const updatedProps = userData.properties.filter(p => p.id !== propertyId);
        await userRef.child('properties').set(updatedProps);

        // 2. Sync with global market
        const marketRef = db.ref('real_estate_market');
        const marketSnap = await marketRef.once('value');
        const marketData = marketSnap.val();

        if (marketData) {
            let found = false;
            for (const cityId in marketData) {
                const props = marketData[cityId];
                if (Array.isArray(props)) {
                    const idx = props.findIndex(p => p.id === propertyId);
                    if (idx !== -1) {
                        delete props[idx].owner;
                        delete props[idx].ownerName;
                        delete props[idx].purchaseTime;
                        found = true;
                    }
                } else if (typeof props === 'object') {
                    for (const pid in props) {
                        if (props[pid].id === propertyId) {
                            delete props[pid].owner;
                            delete props[pid].ownerName;
                            delete props[pid].purchaseTime;
                            found = true;
                        }
                    }
                }
                if (found) break;
            }
            if (found) await marketRef.set(marketData);
        }

        res.json({ success: true, message: "Mülk başarıyla kaldırıldı." });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// HARİTA PROXY (Bağlantı Sorunlarını Aşmak İçin)
app.get('/api/map/turkey', (req, res) => {
    const mapPath = path.join(__dirname, 'turkey_map_local.svg');
    if (fs.existsSync(mapPath)) {
        res.setHeader('Content-Type', 'image/svg+xml');
        res.sendFile(mapPath);
    } else {
        // Fallback (dosya yoksa)
        res.redirect('https://cdn.pixabay.com/photo/2013/07/12/12/48/turkey-146313_1280.png');
    }
});

app.post('/api/emlak/reset', async (req, res) => {
    // Manual Auth Check to allow 'omegacyr' bypass from Shop without Key
    const { requester, key } = req.body;
    let isAdmin = false;

    if (requester === 'omegacyr') {
        isAdmin = true;
    } else {
        // Fallback to standard admin check (Mock logic or check DB)
        if (key && key === process.env.ADMIN_KEY) isAdmin = true;
    }

    if (!isAdmin) return res.status(403).json({ success: false, error: "Yetkisiz işlem!" });

    try {
        console.log(`🚨 EMLAK PİYASASI SIFIRLAMA BAŞLATILDI (${requester || 'Admin'} tarafından)`);

        // 1. Market Verilerini Çek ve Sadece Sahipleri Temizle (Binaları silme!)
        const marketRef = db.ref('real_estate_market');
        const marketSnap = await marketRef.once('value');
        const marketData = marketSnap.val();

        if (marketData) {
            // Traverse all cities and properties
            for (const cityId in marketData) {
                const properties = marketData[cityId];
                if (Array.isArray(properties)) {
                    properties.forEach(p => {
                        if (p.owner) delete p.owner;
                        if (p.ownerName) delete p.ownerName;
                        if (p.purchaseTime) delete p.purchaseTime;
                    });
                } else if (typeof properties === 'object') {
                    for (const pid in properties) {
                        const p = properties[pid];
                        if (p.owner) delete p.owner;
                        if (p.ownerName) delete p.ownerName;
                        if (p.purchaseTime) delete p.purchaseTime;
                    }
                }
            }
            // Güncellenmiş (temizlenmiş) veriyi geri yükle
            await marketRef.set(marketData);
        } else {
            // Eğer market yoksa komple silinsin (Fallback)
            await db.ref('real_estate_market').remove();
        }

        // 2. Tüm kullanıcıların sahip olduğu mülkleri sil
        const usersSnap = await db.ref('users').once('value');
        const users = usersSnap.val() || {};
        const updates = {};
        for (const username in users) {
            if (users[username].properties) {
                updates[`users/${username}/properties`] = null;
            }
        }
        if (Object.keys(updates).length > 0) {
            await db.ref().update(updates);
        }

        res.json({ success: true, message: "Emlak piyasası sıfırlandı: Tüm mülk sahiplikleri kaldırıldı, binalar satışa hazır." });
    } catch (e) {
        console.error("Emlak Reset Error:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// EMLAK API ENDPOINT (Eksik olduğu için frontend hata veriyordu)
app.get('/api/real-estate/properties/:cityId', async (req, res) => {
    try {
        const cityId = req.params.cityId.toUpperCase();
        const market = await getCityMarket(cityId); // getCityMarket zaten tanımlı ve çalışıyor
        res.json(market);
    } catch (e) {
        console.error(`Emlak API Hatası (${req.params.cityId}):`, e.message);
        res.status(500).json([]);
    }
});

// EMLAK SATIN ALMA ENDPOINT
app.post('/api/real-estate/buy', async (req, res) => {
    try {
        const { username, cityId, propertyId } = req.body;

        const userRef = db.ref('users/' + username);
        const userSnap = await userRef.once('value');
        if (!userSnap.exists()) return res.json({ success: false, error: "Kullanıcı bulunamadı." });
        const user = userSnap.val();

        // Şehir pazarını çek
        const marketRef = db.ref(`real_estate_market/${cityId}`);
        const marketSnap = await marketRef.once('value');
        let market = marketSnap.val();

        if (!market) return res.json({ success: false, error: "Şehir verisi bulunamadı." });

        // Mülkü bul
        const propertyIndex = market.findIndex(p => p.id === propertyId);
        if (propertyIndex === -1) return res.json({ success: false, error: "Mülk bulunamadı." });
        const property = market[propertyIndex];

        if (property.owner) return res.json({ success: false, error: "Bu mülk zaten sahipli." });

        // Omega'nın Kartı (is_infinite) kontrolü
        if (!user.is_infinite && (user.balance || 0) < property.price) {
            return res.json({ success: false, error: "Yetersiz bakiye." });
        }

        // İşlemi Gerçekleştir
        const newBalance = user.is_infinite ? (user.balance || 0) : ((user.balance || 0) - property.price);

        // Kullanıcıya mülkü ekle
        const userProps = user.properties || [];
        userProps.push({
            id: property.id,
            cityId: cityId,
            name: property.name,
            income: property.income,
            category: property.category, // type yerine category kullanıyoruz
            icon: property.icon,
            purchasedAt: Date.now()
        });

        // Veritabanını güncelle
        const updateData = { properties: userProps };
        if (!user.is_infinite) {
            updateData.balance = newBalance;
        }
        await userRef.update(updateData);

        // Market verisini güncelle (Sahiplik)
        await marketRef.child(propertyIndex).update({ owner: username });

        console.log(`[Emlak] ${username}, ${property.name} mülkünü satın aldı. Fiyat: ${property.price}`);
        res.json({ success: true, message: `${property.name} başarıyla satın alındı!` });

    } catch (e) {
        console.error("Buy Error:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

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

// ---------------------------------------------------------
// GÜNLÜK VERGİ SİSTEMİ (Progressive Tax System)
// ---------------------------------------------------------
/**
 * Vergi oranları:
 * - Bakiye vergisi: %0.5 (100K altı) - %2.0 (50M üstü) artan oranlı
 * - Emlak vergisi: Günlük gelirin %10'u
 * - Hisse vergisi: Piyasa değerinin %0.3'ü
 */

function getTodayDateKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function calculateBalanceTax(balance) {
    // Artan oranlı vergi - çok parası olandan çok daha fazla alınır
    // 15 kademe: %1 ile %8 arasında
    if (balance <= 0) return 0;

    // Düşük bakiye kademeleri
    if (balance < 10000) return Math.floor(balance * 0.01);          // %1.0 (10K altı)
    if (balance < 25000) return Math.floor(balance * 0.012);         // %1.2
    if (balance < 50000) return Math.floor(balance * 0.015);         // %1.5
    if (balance < 100000) return Math.floor(balance * 0.018);        // %1.8

    // Orta bakiye kademeleri (250K+) - Zengin Vergisi (Hafifletildi)
    if (balance < 250000) return Math.floor(balance * 0.02);         // %2.0
    if (balance < 500000) return Math.floor(balance * 0.03);         // %3.0 (5'ten inildi)
    if (balance < 1000000) return Math.floor(balance * 0.04);        // %4.0 (6'dan inildi)

    // Yüksek bakiye kademeleri
    if (balance < 2500000) return Math.floor(balance * 0.05);        // %5.0 (7'den inildi)
    if (balance < 5000000) return Math.floor(balance * 0.06);        // %6.0 (8'den inildi)
    if (balance < 10000000) return Math.floor(balance * 0.07);       // %7.0 (9'dan inildi)

    // Çok yüksek bakiye kademeleri (Zenginler)
    if (balance < 25000000) return Math.floor(balance * 0.08);       // %8.0 (10'dan inildi)
    if (balance < 100000000) return Math.floor(balance * 0.10);      // %10.0 (12'den inildi)

    // Ultra zenginler
    if (balance < 250000000) return Math.floor(balance * 0.12);      // %12.0 (14'ten inildi)
    return Math.floor(balance * 0.13);                                // %13.0 (15'ten inildi - Maksimum)
}

function calculatePropertyTax(properties) {
    if (!properties || !Array.isArray(properties)) return 0;
    let totalDailyIncome = 0;
    properties.forEach(p => {
        totalDailyIncome += (p.income || 0);
    });
    // Günlük gelirin %10'u
    return Math.floor(totalDailyIncome * 0.10);
}

async function calculateStockTax(stocks, globalStocks) {
    if (!stocks || Object.keys(stocks).length === 0) return 0;
    let totalValue = 0;
    for (const [code, amount] of Object.entries(stocks)) {
        if (!amount || amount <= 0) continue;
        const currentPrice = globalStocks?.[code]?.price || 0;
        totalValue += (currentPrice * amount);
    }
    // Piyasa değerinin %0.3'ü
    return Math.floor(totalValue * 0.003);
}

async function collectDailyTaxes() {
    const todayKey = getTodayDateKey();

    try {
        // Firebase'den son vergi günü kontrolü
        const taxMetaSnap = await db.ref('tax_system/last_collection').once('value');
        const lastCollectionDate = taxMetaSnap.val();

        // Bugün zaten vergi toplandıysa çık
        if (lastCollectionDate === todayKey) {
            console.log(`[Vergi] Bugün (${todayKey}) için vergi zaten toplandı.`);
            return;
        }

        console.log(`[Vergi] 💰 Günlük vergi toplama başlatılıyor... (${todayKey})`);

        // Global stock fiyatlarını bir kez çek
        const stocksSnap = await db.ref('global_stocks').once('value');
        const globalStocks = stocksSnap.val() || {};

        // Tüm kullanıcıları çek
        const usersSnap = await db.ref('users').once('value');
        const users = usersSnap.val() || {};

        let totalCollected = 0;
        let taxedUsers = 0;
        const taxDetails = [];

        for (const [username, userData] of Object.entries(users)) {
            // Omega'nın Kartı (is_infinite) ve admin kullanıcıları vergi dışı bırak
            if (userData.is_infinite || userData.is_admin) continue;

            const balance = userData.balance || 0;
            const properties = userData.properties || [];
            const stocks = userData.stocks || {};

            // Minimum bakiye kontrolü (1000 altı vergi almayalım)
            if (balance < 1000) continue;

            // Vergi hesapla
            const balanceTax = calculateBalanceTax(balance);
            const propertyTax = calculatePropertyTax(properties);
            const stockTax = await calculateStockTax(stocks, globalStocks);

            const totalTax = balanceTax + propertyTax + stockTax;

            // Vergi 0 ise atla
            if (totalTax <= 0) continue;

            // Maksimum vergi: Bakiyenin %50'si (koruma mekanizması)
            const maxTax = Math.floor(balance * 0.50);
            const finalTax = Math.min(totalTax, maxTax);

            // Veritabanını güncelle
            await db.ref(`users/${username}`).transaction(u => {
                if (u) {
                    u.balance = Math.max(0, (u.balance || 0) - finalTax);

                    // Vergi geçmişi kaydet
                    if (!u.tax_history) u.tax_history = {};
                    u.tax_history[todayKey] = {
                        balance_tax: balanceTax,
                        property_tax: propertyTax,
                        stock_tax: stockTax,
                        total: finalTax,
                        timestamp: Date.now()
                    };

                    // Son vergi tarihi
                    u.last_tax_date = todayKey;
                }
                return u;
            });

            totalCollected += finalTax;
            taxedUsers++;

            // Detay kaydet (ilk 10 büyük vergi)
            if (taxDetails.length < 10) {
                taxDetails.push({ user: username, tax: finalTax });
            }
        }

        // Son toplama tarihini Firebase'e kaydet
        await db.ref('tax_system').update({
            last_collection: todayKey,
            last_collection_timestamp: Date.now(),
            last_total: totalCollected,
            last_user_count: taxedUsers
        });

        // Vergi havuzuna ekle (opsiyonel - ödül sistemi için kullanılabilir)
        await db.ref('tax_system/pool').transaction(pool => {
            return (pool || 0) + totalCollected;
        });

        console.log(`[Vergi] ✅ Günlük vergi toplama tamamlandı!`);
        console.log(`   💰 Toplam: ${totalCollected.toLocaleString()} 💰`);
        console.log(`   👥 Vergilendirilen: ${taxedUsers} kullanıcı`);

        // Admin log
        addLog("Günlük Vergi", `${taxedUsers} kullanıcıdan toplam ${totalCollected.toLocaleString()} 💰 vergi toplandı.`);

    } catch (e) {
        console.error("[Vergi] Hata:", e.message);
    }
}

// Vergi kontrolü - Her saat başı kontrol et (ancak günde bir kez çalışır)
setInterval(collectDailyTaxes, 3600000); // 1 saat

// Sunucu başlatıldığında da kontrol et (ancak son toplama tarihine göre çalışır)
setTimeout(collectDailyTaxes, 30000); // 30 saniye sonra kontrol

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
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            },
            timeout: 5000
        });
        return res.data;
    } catch (e) {
        return null;
    }
}

// Robust PFP Fetcher with Fallbacks
async function getKickPFP(username) {
    if (!username || username === "Misafir" || username === "Kick Kanalı") return null;
    const slug = username.toLowerCase().trim();

    // 1. Try Official Public API V1
    try {
        const h = { 'Accept': 'application/json', 'User-Agent': 'KickBot/1.0' };
        if (process.env.KICK_CLIENT_ID) h['X-Kick-Client-Id'] = process.env.KICK_CLIENT_ID;
        const res = await axios.get(`https://api.kick.com/public/v1/channels/${slug}`, { headers: h, timeout: 4000 });
        const pfp = res.data?.data?.user?.profile_pic;
        if (pfp) return pfp;
    } catch (e) { }

    // 2. Try V2 API (Mobile Spoof)
    try {
        const res = await axios.get(`https://kick.com/api/v2/channels/${slug}`, {
            headers: { 'User-Agent': 'Kick/28.0.0 (iPhone; iOS 16.0; Scale/3.00)', 'Accept': 'application/json' },
            timeout: 4000
        });
        if (res.data && res.data.user && res.data.user.profile_pic) return res.data.user.profile_pic;
    } catch (e) { }

    // 2. Try V1 API
    try {
        const res = await axios.get(`https://kick.com/api/v1/channels/${username}`, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
            timeout: 3000
        });
        if (res.data && res.data.user && res.data.user.profile_pic) return res.data.user.profile_pic;
    } catch (e) { }

    // 3. Try Internal GraphQL (Most reliable)
    try {
        const query = `query Channel($slug: String!) {
            channel(slug: $slug) {
                user { profile_pic }
            }
        }`;
        const gqlRes = await axios.post('https://kick.com/api/internal/v1/graphql', {
            query,
            variables: { slug: username.toLowerCase() }
        }, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 5000
        });
        const pfp = gqlRes.data?.data?.channel?.user?.profile_pic;
        if (pfp) return pfp;
    } catch (e) { }

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

// --- RPG MARKET API ---
app.post('/api/rpg/buy', async (req, res) => {
    const { username, type, code } = req.body;
    if (!username || !type || !code) return res.json({ success: false, error: "Eksik bilgi!" });

    try {
        const item = type === 'weapon' ? RPG_WEAPONS[code] : RPG_ARMORS[code];
        if (!item) return res.json({ success: false, error: "Eşya bulunamadı!" });

        const userRef = db.ref(`users/${username.toLowerCase()}`);
        const snap = await userRef.once('value');
        const user = snap.val();
        if (!user) return res.json({ success: false, error: "Kullanıcı bulunamadı!" });

        await userRef.transaction(u => {
            if (!u) return u;
            const rpg = u.rpg || { level: 1, hp: 100, xp: 0, str: 5, def: 0, weapon: 'yumruk', armor: 'tisort', inventory: [] };
            if (!rpg.inventory) rpg.inventory = [];

            const owned = rpg.inventory.includes(code);

            if (owned) {
                // Sadece kuşan
                if (type === 'weapon') rpg.weapon = code;
                else rpg.armor = code;
            } else {
                // Satın al ve kuşan
                if (!u.is_infinite && (u.balance || 0) < item.price) {
                    throw new Error("Yetersiz bakiye!"); // Transaction içinde error fırlatmak abort eder mi? Hayır, callback dışına atmalıyız ama burada return null yaparsak abort eder.
                    // En iyisi bakiye kontrolünü yukarıda yapmak ama transaction safe olmaz.
                    // Transaction içinde yapalım.
                }

                if (!u.is_infinite) u.balance = (u.balance || 0) - item.price;
                if ((u.balance || 0) < 0) return; // Abort if somehow negative (sanity check)

                rpg.inventory.push(code);
                if (type === 'weapon') rpg.weapon = code;
                else rpg.armor = code;
            }

            u.rpg = rpg;
            return u;
        });

        // Transaction sonucu başarılıysa buraya gelir (hata fırlatmadıysak).
        // Ancak transaction abort edildiyse (return undefined) success false dönmeliyiz.
        // Firebase Admin SDK transaction sonucu döner.
        // Basitlik adina yukarida transaction sonucunu kontrol etmek daha iyi olurdu ama
        // şimdilik balance kontrolü failed ise transaction null döner (abort).

        // Tekrar okuyup kontrol edelim (basit yöntem)
        const updatedSnap = await userRef.once('value');
        const updatedUser = updatedSnap.val();

        // Basit kontrol: Eşya alındı mı?
        const hasItem = updatedUser.rpg?.inventory?.includes(code);
        if (hasItem) {
            res.json({ success: true, message: `${item.name} kuşandın!` });
        } else {
            res.json({ success: false, error: "Bakiye yetersiz veya işlem başarısız!" });
        }

    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// --- PROFILE CUSTOMIZATION API ---
app.post('/api/customization/buy', async (req, res) => {
    const { username, type, id } = req.body;
    if (!username || !type || !id) return res.json({ success: false, error: "Eksik bilgi!" });

    try {
        let item = null;
        if (type === 'color') item = PROFILE_CUSTOMIZATIONS.colors.find(c => c.id === id);
        else if (type === 'bg') item = PROFILE_CUSTOMIZATIONS.backgrounds.find(b => b.id === id);

        if (!item) return res.json({ success: false, error: "Özelleştirme bulunamadı!" });

        const userRef = db.ref(`users/${username.toLowerCase()}`);

        let errorMsg = null;

        await userRef.transaction(u => {
            if (!u) return u;
            if (!u.is_infinite && (u.balance || 0) < item.price) {
                // Yetersiz bakiye
                return; // Abort
            }
            if (!u.is_infinite) u.balance -= item.price;

            if (type === 'color') u.name_color = id;
            if (type === 'bg') u.profile_bg = id;

            return u;
        }, (error, committed, snapshot) => {
            if (error) {
                errorMsg = "Sunucu hatası";
            } else if (!committed) {
                errorMsg = "Bakiye yetersiz!";
            }
        });

        if (errorMsg) return res.json({ success: false, error: errorMsg });

        res.json({ success: true, message: "Profil başarıyla güncellendi!" });

    } catch (e) {
        console.error("Customization Error:", e);
        res.json({ success: false, error: e.message });
    }
});

// --- SECURITY: SESSION VERIFICATION MIDDLEWARE ---
const verifySession = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ success: false, error: "Yetkisiz Erişim (Token Yok)" });

    // Accept Bearer token or direct token
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const username = req.body.username; // All secure endpoints MUST send username in body

    if (!username) return res.status(400).json({ success: false, error: "Kullanıcı adı eksik" });

    try {
        const userSnap = await db.ref(`users/${username.toLowerCase()}`).once('value');
        const userData = userSnap.val();

        if (!userData || !userData.session_token) {
            return res.status(403).json({ success: false, error: "Oturum geçersiz. Lütfen tekrar giriş yapın." });
        }

        if (userData.session_token !== token) {
            return res.status(403).json({ success: false, error: "Oturum süresi dolmuş veya geçersiz token." });
        }

        req.user = userData; // Attach user data to request
        next();
    } catch (e) {
        console.error("Session Verify Error:", e);
        return res.status(500).json({ success: false, error: "Sunucu doğrulama hatası" });
    }
};

// --- GENERIC MARKET BUY (TTS, SOUND, MUTE, SR) ---
app.post('/api/market/buy', verifySession, async (req, res) => {
    const { username, channelId, type, data } = req.body;
    if (!username || !channelId || !type) return res.json({ success: false, error: "Eksik bilgi!" });

    try {
        const chanRef = db.ref(`channels/${channelId}`);
        const chanSnap = await chanRef.once('value');
        const channel = chanSnap.val();
        if (!channel) return res.json({ success: false, error: "Kanal bulunamadı!" });

        const settings = channel.settings || {};

        let price = 0;
        let eventPath = "";
        let eventPayload = {};

        // 1. Fiyat ve Payload Belirleme
        if (type === 'tts') {
            price = parseInt(settings.tts_price || 500);
            const { text, voice } = data || {};
            if (!text) return res.json({ success: false, error: "Mesaj boş olamaz!" });
            if (text.length > 500) return res.json({ success: false, error: "Mesaj çok uzun!" });

            eventPath = "tts";

            // ELEVENLABS VOICE MAPPING
            const elevenVoices = {
                'aleyna': 'EXAVITQu4vr4xnSDxMaL', // Bella (Sample)
                'riza': 'ErXwobaYiN019PkySvjV', // Antoni (Sample)
                'czn': 'TxGEqnHWrfWFTfGW9XjX', // Josh (Sample)
                'polat': 'ODq5zmih8GrVes37Dizd', // Patrick (Sample)
                'ezel': 'VR6AewGX3KQ9Gs3uJ1G5',  // Adam (Sample)
                'azeri': 'Lcf765pS20Ga8unf7fXf'   // Domi (Multilingual Support)
            };

            let audioUrl = null;
            let isEleven = false;

            if (elevenVoices[voice]) {
                isEleven = true;

                // --- ABONELİK KONTROLÜ (ELEVENLABS İÇİN) ---
                const uSnap = await db.ref(`users/${username.toLowerCase()}`).once('value');
                const uData = uSnap.val() || {};
                const badges = uData.badges || [];

                // Badge yapısını esnek kontrol et (obje veya string olabilir)
                const isSubscriber = badges.some(b => {
                    const badgeType = typeof b === 'string' ? b : (b.type || b.badge_type || '');
                    return ['subscriber', 'founder', 'vip', 'moderator', 'broadcaster', 'sub_gifter', 'og', 'abone'].includes(badgeType.toLowerCase());
                }) || uData.is_subscriber === true || uData.isSubscriber === true;

                // Ayrıca admin veya is_infinite olanlar da kullanabilsin
                const canUseElevenLabs = isSubscriber || uData.is_admin === true || uData.is_infinite === true || username.toLowerCase() === 'omegacyr';

                if (!canUseElevenLabs) {
                    return res.json({ success: false, error: "Bu ses sadece ABONELERE özeldir! 💎" });
                }

                try {
                    // ElevenLabs API Call
                    const elevenKey = process.env.ELEVENLABS_API_KEY;

                    if (!elevenKey || elevenKey.includes('sk_73928')) {
                        console.error("ElevenLabs API Key Hatası: Anahtar eksik veya varsayılan değerde!");
                        throw new Error("Anahtar bulunamadı.");
                    }

                    const voiceId = elevenVoices[voice];

                    const ttsResp = await axios.post(
                        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
                        {
                            text: text,
                            model_id: "eleven_multilingual_v2",
                            voice_settings: { stability: 0.5, similarity_boost: 0.8 }
                        },
                        {
                            headers: {
                                'xi-api-key': elevenKey,
                                'Content-Type': 'application/json'
                            },
                            responseType: 'arraybuffer'
                        }
                    );

                    // Convert to Base64 to serve directly via Firebase
                    const base64Audio = Buffer.from(ttsResp.data).toString('base64');
                    audioUrl = `data:audio/mpeg;base64,${base64Audio}`;
                } catch (err) {
                    console.error(`ElevenLabs Error [Voice: ${voice}]:`, err.message);
                    if (err.response) {
                        const errText = err.response.data ? (err.response.data.toString() || 'binary') : 'no-data';
                        console.error("ElevenLabs API Response Error:", errText);
                    }
                    isEleven = false;
                }
            }

            eventPayload = {
                text: `@${username} diyor ki: ${text}`,
                voice: voice || "standart",
                audioUrl: audioUrl, // New field for ElevenLabs
                isEleven: isEleven,
                played: false, notified: false, source: "market", timestamp: Date.now(), broadcasterId: channelId
            };
        }
        else if (type === 'sound') {
            const { trigger } = data || {};
            const sound = settings.custom_sounds?.[trigger];
            if (!sound) return res.json({ success: false, error: "Ses bulunamadı!" });

            price = parseInt(sound.price || 100);
            eventPath = "sound";
            eventPayload = {
                soundId: trigger, url: sound.url, volume: sound.volume || 100, duration: sound.duration || 0,
                buyer: username, source: "market",
                played: false, notified: false, timestamp: Date.now(), broadcasterId: channelId
            };
        }
        else if (type === 'mute') {
            price = parseInt(settings.mute_price || 5000);
            let { target } = data || {};
            if (!target) return res.json({ success: false, error: "Hedef kullanıcı belirtilmedi!" });
            target = target.replace('@', '').toLowerCase().trim();

            eventPath = "mute";
            eventPayload = {
                user: username, target: target, timestamp: Date.now(), broadcasterId: channelId
            };

            // Mute sayacını da burada güncelleyebiliriz veya event listener yapabilir
            await db.ref(`users/${target}/bans/${channelId}`).transaction(c => (c || 0) + 1);
        }
        else if (type === 'sr') {
            price = parseInt(settings.sr_price || 100);
            const { url } = data || {};
            if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
                return res.json({ success: false, error: "Geçersiz YouTube linki!" });
            }

            eventPath = "song_requests";
            eventPayload = {
                query: url, user: username, source: "market",
                played: false, timestamp: Date.now(), broadcasterId: channelId
            };
        }
        else {
            return res.json({ success: false, error: "Geçersiz işlem tipi!" });
        }

        // 2. Bakiye Kontrolü ve Düşümü
        const userRef = db.ref(`users/${username.toLowerCase()}`);
        let errorMsg = null;

        await userRef.transaction(u => {
            if (!u) return u;
            if (!u.is_infinite && (u.balance || 0) < price) {
                // Yetersiz bakiye - Abort
                return;
            }
            if (!u.is_infinite) u.balance -= price;
            return u;
        }, (error, committed, snapshot) => {
            if (error) errorMsg = "Sunucu hatası";
            else if (!committed) errorMsg = "Bakiye yetersiz! ❌";
        });

        if (errorMsg) return res.json({ success: false, error: errorMsg });

        // 3. Event Push
        if (eventPath) {
            await db.ref(`channels/${channelId}/stream_events/${eventPath}`).push(eventPayload);
        }

        res.json({ success: true, message: "İşlem Başarılı! 🚀" });

    } catch (e) {
        console.error("Market Buy Error:", e);
        res.json({ success: false, error: e.message });
    }
});

// --- JOB APPLICATION API ---
app.post('/api/jobs/apply', verifySession, async (req, res) => {
    const { username, jobName } = req.body;
    if (!username || !jobName) return res.json({ success: false, error: "Eksik bilgi!" });

    try {
        const job = JOBS[jobName];
        if (!job) return res.json({ success: false, error: "Meslek bulunamadı!" });

        const userRef = db.ref(`users/${username.toLowerCase()}`);
        let errorMsg = null;
        let successMsg = "";

        await userRef.transaction(u => {
            if (!u) return u;

            // 1. Eğitim Kontrolü
            if ((u.edu || 0) < job.req_edu) return;

            // 2. Eşya Kontrolü
            const hasItem = u.items && u.items[job.req_item];

            if (hasItem) {
                // Sadece meslek değiş
                u.job = jobName;
                successMsg = `${jobName} mesleğine geçiş yaptın! ✅`;
                return u;
            } else {
                // Eşya satın al ve meslek değiş
                if (!u.is_infinite && (u.balance || 0) < job.price) {
                    return; // Abort - Insufficient funds
                }

                if (!u.is_infinite) u.balance -= job.price;
                if (!u.items) u.items = {};
                u.items[job.req_item] = true;
                u.job = jobName;
                successMsg = `${jobName} olarak işe başladın! Hayırlı olsun. 🚀`;
                return u;
            }
        }, (error, committed, snapshot) => {
            if (error) {
                errorMsg = "Sunucu hatası";
            }
        });

        if (!errorMsg && !successMsg) {
            const snap = await userRef.once('value');
            const u = snap.val();
            if ((u.edu || 0) < job.req_edu) {
                return res.json({ success: false, error: "Eğitim seviyen yetersiz!" });
            }
            if (!u.items || !u.items[job.req_item]) {
                if (!u.is_infinite && (u.balance || 0) < job.price) {
                    return res.json({ success: false, error: "Bakiye yetersiz!" });
                }
            }
            return res.json({ success: false, error: "İşlem gerçekleştirilemedi." });
        }

        if (errorMsg) return res.json({ success: false, error: errorMsg });

        res.json({ success: true, message: successMsg });

    } catch (e) {
        console.error("Job Apply Error:", e);
        res.json({ success: false, error: e.message });
    }
});

// ---------------------------------------------------------
// PROXY: KICK PROFILE PIC (CORS BYPASS)
// ---------------------------------------------------------
app.get('/api/kick/pfp/:username', async (req, res) => {
    try {
        const username = req.params.username.toLowerCase();
        let pfp = await getKickPFP(username);

        if (!pfp) {
            // Placeholder fallback to avoid 404s
            pfp = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=05ea6a&color=000&bold=true`;
        }

        return res.json({ pfp: pfp });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ---------------------------------------------------------
// BORSA RESET (ONLY FOR OMEGACYRA)
// ---------------------------------------------------------
// ---------------------------------------------------------
// FORCE LOGOUT ALL USERS (SESSION TERMINATION)
// ---------------------------------------------------------
app.post('/api/market/reset-users', authAdmin, async (req, res) => {
    // Only 'omegacyr' (Master Admin)
    if (!req.adminUser || req.adminUser.username !== 'omegacyr') {
        return res.status(403).json({ success: false, error: "Yetkisiz işlem! Sadece Omegacyr yapabilir." });
    }

    try {
        console.log("!!! FORCE LOGOUT SIGNAL (Requester: omegacyr) !!!");

        // Sadece timestamp'i güncelle, istemciler bunu dinleyip çıkış yapacak
        const timestamp = Date.now();
        await db.ref('system/force_logout').set(timestamp);

        addLog("Sistem", "Tüm kullanıcılar hesaplarından çıkış yaptırıldı (Force Logout).", "Global");

        res.json({ success: true, message: "Tüm kullanıcıların oturumu kapatılıyor (Logout Signal Sent)!" });
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
        // Suppress 405 errors (Method Not Allowed) as they are expected for some endpoints/headers
        if (!e.message.includes('405')) {
            console.error(`Kick GraphQL Error (${slug}):`, e.message);
        }
        return null;
    }
}

// (Duplicate syncChannelStats removed)

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

// 🔑 UYGULAMA (APP/BOT) TOKENI ALMA - Bot Kimliği İçin Gerekli
let cachedAppToken = null;
let appTokenExpires = 0;

async function getAppAccessToken() {
    const { KICK_CLIENT_ID, KICK_CLIENT_SECRET } = process.env;
    const CLIENT_ID = KICK_CLIENT_ID || "01KDQNP2M930Y7YYNM62TVWJCP";
    const CLIENT_SECRET = KICK_CLIENT_SECRET;

    if (cachedAppToken && Date.now() < appTokenExpires) return cachedAppToken;

    try {
        const params = new URLSearchParams();
        params.append('grant_type', 'client_credentials');
        params.append('client_id', CLIENT_ID);
        params.append('client_secret', CLIENT_SECRET);
        params.append('scope', 'chat:write');

        const response = await axios.post('https://id.kick.com/oauth/token', params);
        if (response.data.access_token) {
            cachedAppToken = response.data.access_token;
            appTokenExpires = Date.now() + (response.data.expires_in * 1000) - 60000;
            console.log("[Auth] Uygulama (Bot) Tokenı başarıyla alındı.");
            return cachedAppToken;
        }
    } catch (e) {
        // console.error("[Auth Error] App Token alınamadı:", e.response?.data || e.message);
    }
    return null;
}




// KİCK BOT KİMLİĞİ İLE GÖNDERİM (V10 - Developer Bot Mode)
async function sendChatMessage(message, broadcasterId) {
    if (!message || !broadcasterId) return;

    try {
        const { KICK_CLIENT_ID } = process.env;
        const CLIENT_ID = KICK_CLIENT_ID || "01KDQNP2M930Y7YYNM62TVWJCP";

        // 1. ADIM: Botun kendi token'ını al (Client Credentials)
        // Eğer bu başarısız olursa yayıncı token'ına fallback yaparız.
        let botToken = await getAppAccessToken();

        const snap = await db.ref('channels/' + broadcasterId).once('value');
        const chan = snap.val();

        // Eğer bot token'ı yoksa yayıncı token'ını kullan (Eski usul)
        const finalToken = botToken || chan?.access_token;

        if (!finalToken) {
            console.error(`[Chat] ${broadcasterId} için hiçbir token bulunamadı.`);
            return;
        }

        const channelSlug = chan?.slug || chan?.username || broadcasterId;
        console.log(`[Chat Debug] V10 (Bot Kimliği) Başlatılıyor... Kanal: ${channelSlug}`);

        const HEADERS = {
            'Authorization': `Bearer ${finalToken}`,
            'X-Kick-Client-Id': CLIENT_ID,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'KickBot/1.0'
        };

        // 2. ADIM: Broadcaster User ID Alınması
        let numericBroadcasterId = null;
        try {
            // Token kimin olursa olsun, kanal bilgisini çekmek için headers kullanabiliriz
            const chanRes = await axios.get(`https://api.kick.com/public/v1/channels/${channelSlug}`, { headers: HEADERS });
            if (chanRes.data && chanRes.data.data) {
                numericBroadcasterId = chanRes.data.data.user_id || chanRes.data.data.id;
            }
        } catch (e) {
            numericBroadcasterId = parseInt(broadcasterId);
        }

        if (!numericBroadcasterId) return;

        // 3. ADIM: Mesaj Gönderimi (RESMİ BOT ENDPOINT)
        const trials = [
            {
                name: "Official Bot Flow",
                url: 'https://api.kick.com/public/v1/chat',
                body: {
                    type: "bot", // Bot hesabıyla yazması için "bot" tipi kritik!
                    broadcaster_user_id: numericBroadcasterId,
                    content: message
                }
            },
            {
                name: "Bot acting as User",
                url: 'https://api.kick.com/public/v1/chat',
                body: {
                    type: "user",
                    broadcaster_user_id: numericBroadcasterId,
                    content: message
                }
            }
        ];

        let success = false;
        for (const t of trials) {
            try {
                const res = await axios.post(t.url, t.body, { headers: HEADERS });
                if (res.status >= 200 && res.status < 300) {
                    success = true;
                    console.log(`[Chat] ✅ MESAJ GÖNDERİLDİ! (${t.name}) - Bot hesabı kullanıldı.`);
                    break;
                }
            } catch (err) {
                console.warn(`[Chat Debug] ${t.name} -> ${err.response?.status}`);
            }
        }

        if (!success) console.error("[Chat Fatal] Bot kimliğiyle gönderim başarısız.");

    } catch (e) {
        console.error(`[Chat Error]:`, e.message);
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
        // console.log(`[Webhook] ${eventType} received.`);

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
            const subUser = payload.user?.username || payload.username || (payload.data && payload.data.username);
            if (subUser && subUser.toLowerCase() !== "botrix") {
                // Goal Bar Update
                await db.ref(`channels/${broadcasterId}/stats/subscribers`).transaction(val => (val || 0) + 1);

                let welcomeMsg = settings.sub_welcome_msg || `🎊 @{user} ABONE OLDU! Hoş geldin, hesabına {reward} 💰 bakiye eklendi! ✨`;
                welcomeMsg = welcomeMsg.replace('{user}', subUser).replace('{reward}', subReward.toLocaleString());

                await db.ref('users/' + subUser.toLowerCase()).transaction(u => {
                    if (!u) u = { balance: 1000, last_seen: Date.now(), last_channel: broadcasterId, created_at: Date.now() };
                    u.balance = (u.balance || 0) + subReward;
                    u.is_subscriber = true;
                    return u;
                });
                await addRecentActivity(broadcasterId, 'recent_joiners', { user: subUser, type: 'subscriber' });
                await sendChatMessage(welcomeMsg, broadcasterId);
            }
            return;
        }

        if (eventName === "channel.subscription.gifts" || eventName === "subscription.gifts") {
            const gifter = payload.user?.username || payload.username || (payload.data && payload.data.username);
            if (gifter && gifter.toLowerCase() === "botrix") return;
            const count = parseInt(payload.total || (payload.data && payload.data.total)) || 1;
            const totalReward = subReward * count;
            if (gifter) {
                await db.ref('users/' + gifter.toLowerCase()).transaction(u => {
                    if (!u) u = { balance: 1000, last_seen: Date.now(), last_channel: broadcasterId, created_at: Date.now() };
                    u.balance = (u.balance || 0) + totalReward;
                    u.is_subscriber = true; // Gift atan da muhtemelen abone veya destekçidir
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
            const follower = payload.user?.username || payload.username || (payload.data && payload.data.username);
            if (follower && follower.toLowerCase() === "botrix") return;
            // Goal Bar Update
            await db.ref(`channels/${broadcasterId}/stats/followers`).transaction(val => (val || 0) + 1);
            await addRecentActivity(broadcasterId, 'recent_joiners', { user: follower, type: 'follower' });
            return;
        }

        // --- YAYIN DURUMU BİLDİRİMİ (Discord) ---
        if (eventName === "livestream.status.updated") {
            // Payload yapısı: data.livestream veya direkt livestream
            const livestream = (payload.data && payload.data.livestream) || payload.livestream;

            if (livestream) {
                const isLive = livestream.is_live; // true = online, false = offline
                const streamTitle = livestream.session_title || "Yayında!";
                const category = (livestream.categories && livestream.categories[0] && livestream.categories[0].name) || "Genel";
                const thumbnail = livestream.thumbnail?.url || "";

                // Discord Webhook Belirle (Kanal Ayarı > Global Env)
                const targetWebhook = (channelData.settings && channelData.settings.discord_webhook_url) || process.env.DISCORD_WEBHOOK;

                if (targetWebhook) {
                    try {
                        const embedColor = isLive ? 5238290 : 2829099; // Yeşil / Gri
                        const statusText = isLive ? "🔴 YAYIN BAŞLADI!" : "⚫ YAYIN SONLANDI";
                        const desc = isLive
                            ? `**${streamTitle}**\n\n📺 **Kategori:** ${category}\n🔗 [Yayına Git](https://kick.com/${channelData.slug || broadcasterId})`
                            : `Yayın sona erdi. İzleyen herkese teşekkürler! 👋`;

                        // Send Discord Message
                        await axios.post(targetWebhook, {
                            username: "Kick Bot Bildirim",
                            avatar_url: "https://kick.com/favicon.ico",
                            embeds: [{
                                title: statusText,
                                description: desc,
                                color: embedColor,
                                thumbnail: { url: channelData.profile_pic || "https://kick.com/favicon.ico" },
                                image: (isLive && thumbnail) ? { url: thumbnail } : undefined,
                                footer: { text: `Kick Kanalı: ${channelData.username || broadcasterId}` },
                                timestamp: new Date().toISOString()
                            }]
                        });
                        console.log(`[Webhook] 🔔 Discord bildirimi (${isLive ? 'LIVE' : 'OFFLINE'}) -> ${targetWebhook === process.env.DISCORD_WEBHOOK ? 'Global' : 'Custom'}`);
                    } catch (e) {
                        console.error("[Webhook] Discord Error:", e.message);
                    }
                }

                // DB Update (Stream Status)
                await db.ref(`channels/${broadcasterId}/stream_status`).update({
                    is_live: isLive,
                    title: streamTitle,
                    category: category,
                    last_update: Date.now()
                });
            }
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

        // --- CHAT LOGGING FOR AI SUMMARY ---
        if (!rawMsg.startsWith('!')) {
            const chatLogRef = db.ref(`channels/${broadcasterId}/chat_log`);
            chatLogRef.push({
                user: payload.sender?.username || user,
                message: rawMsg,
                timestamp: Date.now()
            });

            // Keep only last 200 messages
            chatLogRef.once('value', snap => {
                if (snap.numChildren() > 200) {
                    const keys = Object.keys(snap.val());
                    chatLogRef.child(keys[0]).remove();
                }
            });
        }

        // console.log(`[Webhook] 💬 @${user}: ${rawMsg}`);

        const lowMsg = rawMsg.trim().toLowerCase();
        const args = rawMsg.trim().split(/\s+/).slice(1);

        // --- GLOBAL COOLDOWN (5 Saniye) ---
        if (rawMsg.startsWith('!')) {
            const now = Date.now();
            if (user !== 'omegacyr' && userGlobalCooldowns[user] && now < userGlobalCooldowns[user]) {
                return; // Sessizce işlem yapma
            }
            userGlobalCooldowns[user] = now + 5000;
        }

        // --- BAN ZAMAN KONTROLÜ ---
        if (activeBanZaman[user]) {
            const bz = activeBanZaman[user];
            bz.count++;
            if (bz.count >= bz.limit) {
                bz.count = 0; // Sayacı sıfırla
                await timeoutUser(broadcasterId, user, bz.duration);
                // Bilgi mesajı atmıyoruz, sessizce banlıyor. İstenirse eklenebilir.
                // await reply(`@${user}, ÇOK KONUŞTUN! (${bz.limit} mesaj limiti doldu -> ${bz.duration} dk ban)`);
            }
        }


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
                    quests: { [today]: { m: 1, g: 0, d: 0, w: 0, claimed: {} } },
                    xp: 1, edu: 0 // Yeni kullanıcı XP
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

                // XP VE EĞİTİM GÜNCELLEME
                u.xp = (u.xp || 0) + 1;
                const currentEdu = u.edu || 0;
                // Bir sonraki seviye var mı ve XP yetti mi?
                if (currentEdu < 7 && u.xp >= EDU_XP[currentEdu + 1]) {
                    u.edu = currentEdu + 1;
                }

                // BADGE VE ABONELİK DURUMUNU GÜNCELLE
                const incomingBadges = payload.sender?.identity?.badges || [];
                u.badges = incomingBadges;

                const isSub = incomingBadges.some(b => {
                    const type = (b.type || b).toLowerCase();
                    return ['subscriber', 'founder', 'vip', 'sub_gifter', 'og', 'moderator', 'broadcaster', 'abone'].includes(type);
                });
                if (isSub) u.is_subscriber = true;

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

        // --- BAN ZAMAN (MODERASYON) ---
        else if (lowMsg.startsWith('!ban-zaman ')) {
            if (!isAuthorized) return;
            const target = args[0]?.replace('@', '').toLowerCase();
            const msgLimit = parseInt(args[1]);
            const banDuration = parseInt(args[2]);

            if (!target || isNaN(msgLimit) || isNaN(banDuration)) {
                return await reply(`@${user}, Kullanım: !ban-zaman @kullanıcı [mesaj_sayisi] [ban_dk] (Örn: !ban-zaman @ali 10 1 -> Her 10 mesajda 1 dk ban)`);
            }

            if (msgLimit <= 0) {
                delete activeBanZaman[target];
                return await reply(`✅ @${target} üzerindeki otomatik ban kaldırıldı.`);
            }

            activeBanZaman[target] = { limit: msgLimit, duration: banDuration, count: 0 };
            await reply(`🚨 @${target} işaretlendi! Her ${msgLimit} mesajda bir ${banDuration} dakika banlanacak.`);
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
            const data = snap.val() || { balance: 1000, last_work: 0, job: "İşsiz", xp: 0, edu: 0, items: {} };
            const now = Date.now();

            const jobName = data.job || "İşsiz";
            const job = JOBS[jobName] || JOBS["İşsiz"];

            // 1. İşsizlik Kontrolü
            if (jobName === "İşsiz") return await reply(`@${user}, Şu an işsizsin! Markete git ve bir meslek eşyası satın alarak işe başla. (Örn: Süpürge -> Çöpçü)`);

            // 2. Şart Kontrolleri (Kovulma Durumları)
            // Eşya Kontrolü
            if (job.req_item && (!data.items || !data.items[job.req_item])) {
                await userRef.update({ job: "İşsiz" });
                return await reply(`@${user}, 🚨 Meslek gereksinimin eksik (${job.req_item}) olduğu için kovuldun!`);
            }
            // Eğitim Kontrolü
            if ((data.edu || 0) < job.req_edu) {
                await userRef.update({ job: "İşsiz" });
                return await reply(`@${user}, 🚨 Eğitim seviyen yetersiz (${EDUCATION[job.req_edu]} gerekli) olduğu için kovuldun!`);
            }

            // 3. Cooldown Kontrolü (24 Saat)
            const cooldown = 86400000;
            const lastWork = data.last_work || 0;

            if (now - lastWork < cooldown) {
                const diff = cooldown - (now - lastWork);
                const hours = Math.floor(diff / 3600000);
                const mins = Math.ceil((diff % 3600000) / 60000);
                return await reply(`@${user}, ⏳ Tekrar çalışmak için ${hours > 0 ? hours + ' saat ' : ''}${mins} dakika beklemelisin.`);
            }

            // --- MESAİ BAŞLATMA ---
            const reward = job.reward;

            // Cooldown'ı hemen başlat (Spam engelleme için)
            await userRef.update({ last_work: now });

            await reply(`👷 @${user}, ${job.icon} ${jobName} olarak mesain başladı! 15 dakika sonra mesain bitecek ve ${reward.toLocaleString()} 💰 bakiyene otomatik yüklenecektir. İyi çalışmalar!`);

            // 15 Dakika (15 * 60 * 1000 ms) sonra ödülü ver
            setTimeout(async () => {
                try {
                    const currentSnap = await userRef.once('value');
                    const currentData = currentSnap.val() || {};

                    // ÖDÜLLER VE XP HESABI
                    let currentXP = (currentData.xp || 0) + 5;
                    let currentEdu = currentData.edu || 0;
                    let eduUp = false;

                    if (currentEdu < 7 && currentXP >= EDU_XP[currentEdu + 1]) {
                        currentEdu++;
                        eduUp = true;
                    }

                    // Bakiyeyi güncelle (Atomic transaction önerilir ama basitlik için set/update de olur)
                    await userRef.transaction(u => {
                        if (u) {
                            if (!u.is_infinite) u.balance = (u.balance || 0) + reward;
                            u.xp = currentXP;
                            u.edu = currentEdu;
                        }
                        return u;
                    });

                    let finishMsg = `✅ @${user}, mesain bitti! ${reward.toLocaleString()} 💰 ve +5 XP hesabına eklendi.`;
                    if (eduUp) finishMsg += ` 🎓 TEBRİKLER! Seviye atladın: ${EDUCATION[currentEdu]}`;

                    await sendChatMessage(finishMsg, broadcasterId);
                } catch (e) {
                    console.error("Shift Timer Error:", e);
                }
            }, 15 * 60 * 1000);
        }

        else if (lowMsg === '!meslek-bilgi' || lowMsg === '!kariyer') {
            const snap = await userRef.once('value');
            const data = snap.val() || { xp: 0, edu: 0 };
            const eduLevel = data.edu || 0;
            const xp = data.xp || 0;
            const nextXp = EDU_XP[eduLevel + 1] || "Maks";

            await reply(`🎓 @${user} | Eğitim: ${EDUCATION[eduLevel]} | XP: ${xp}/${nextXp} | Meslek: ${data.job || "İşsiz"}`);
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

        if (isEnabled('slot') && lowMsg.startsWith('!çevir')) {
            const cost = parseInt(args[0]);
            if (isNaN(cost) || cost < 10 || !isFinite(cost)) return await reply(`@${user}, En az 10 💰 ile oynayabilirsin!`);
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
            if (isNaN(cost) || cost <= 0 || !isFinite(cost) || !['y', 't', 'yazı', 'tura'].includes(pick)) return await reply(`@${user}, Kullanım: !yazitura [miktar] [y/t]`);

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
                "Eski bir aşktan haber alabilirsin, şaşırma! 💔➡️❤️",
                // DAHA FAZLA FAL - USER ISTEGI
                "Bugün sakarlık peşini bırakmayabilir, dikkat et! 🍌",
                "Bir bardak kahve tüm sorunlarını çözemez ama iyi bir başlangıçtır. ☕",
                "Yıldızlar senin için dans ediyor, bu enerjiyi boşa harcama! 💃",
                "Beklediğin kargo sandığından daha erken gelecek! 📦",
                "Bir sırrını paylaşacağın kişi seni çok şaşırtacak. 🤐",
                "Bugün mavi giymek sana şans getirecek. 💙",
                "E-postalarını kontrol et, önemli bir fırsat orada gizli olabilir. 📧",
                "Bir kitaptan okuyacağın rastgele bir cümle sana yol gösterecek. 📖",
                "Eski bir fotoğraf albümü bugün seni duygulandırabilir. 📸",
                "Rüyalar alemi bu gece sana önemli mesajlar verecek. 🌙",
                "Bir sokak hayvanı bugün sana şans getirecek, onu sev! 🐈",
                "Telefonun şarjına dikkat et, en lazım olduğu anda bitebilir! 🔋",
                "Bugün duyacağın bir şarkı seni geçmişe götürecek. 🎵",
                "Yeteneklerini sergilemekten korkma, sahne senin! 🎤",
                "Bir tartışmadan kaçınmak bugün sana huzur getirecek. ☮️",
                "Bugün yediklerine biraz daha dikkat et, miden hassas olabilir. 🍏",
                "Akşam saatlerinde sürpriz bir misafir kapını çalabilir. 🚪",
                "Biraz daha gülümse, dünya seninle daha güzel! 😊",
                "Bugün şanslı sayın 7, onu aklında tut. 7️⃣",
                "Gözlüklerini sil, dünyayı daha net görmen gereken bir gün. 👓"
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

        // ŞARKI ÖNERİSİ
        else if (lowMsg === '!şarkı-öner' || lowMsg === '!sarkı-oner' || lowMsg === '!şarkıöner' || lowMsg === '!sarkioner') {
            const terms = ["türkçe pop", "türkçe rock", "türkçe rap", "arabesk", "türk sanat müziği", "anadolu rock", "türkçe hit", "türkçe nostalji", "türkçe 90lar", "türkçe 2000ler", "müslüm gürses", "sezen aksu", "tarkan", "ezhel", "ceza", "barış manço"];
            const randomTerm = terms[Math.floor(Math.random() * terms.length)];

            await reply(`🔎 @${user} için "${randomTerm}" kategorisinde şarkı aranıyor... 🎵`);

            try {
                const res = await axios.get('https://itunes.apple.com/search', {
                    params: {
                        term: randomTerm,
                        country: 'TR',
                        media: 'music',
                        limit: 100
                    },
                    timeout: 5000
                });

                if (res.data && res.data.results && res.data.results.length > 0) {
                    const songs = res.data.results;
                    const randomSong = songs[Math.floor(Math.random() * songs.length)];
                    const artist = randomSong.artistName;
                    const track = randomSong.trackName;
                    const link = randomSong.trackViewUrl || "";

                    await reply(`🎵 @${user}, Sana Önerim: ${artist} - ${track} 🎧\n${link}`);
                } else {
                    await reply(`⚠️ @${user}, Şarkı bulamadım. Tekrar dene!`);
                }
            } catch (err) {
                console.error("Song Fetch Error:", err.message);
                await reply(`⚠️ @${user}, Şarkı servisine ulaşılamadı.`);
            }
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

        // IRK TESTİ
        else if (lowMsg === '!ırk' || lowMsg === '!irk') {
            const races = [
                { n: "Türk", e: "🇹🇷" }, { n: "Kürt", e: "" }, { n: "Laz", e: "🌊" },
                { n: "Çerkes", e: "⚔️" }, { n: "Arap", e: "🌴" }, { n: "Yunan", e: "🏛️" },
                { n: "Ermeni", e: "🇦🇲" }, { n: "Azeri", e: "🇦🇿" }, { n: "Alman", e: "🍺" },
                { n: "İngiliz", e: "☕" }, { n: "İtalyan", e: "🍕" }, { n: "Fransız", e: "🥖" },
                { n: "Rus", e: "❄️" }, { n: "Çinli", e: "🏮" }, { n: "Japon", e: "🍣" },
                { n: "Amerikalı", e: "🍔" }
            ];

            // 3 rastgele ırk seç ve % dağıt
            let remaining = 100;
            const selected = [];
            const shuffled = races.sort(() => 0.5 - Math.random());

            for (let i = 0; i < 3; i++) {
                const perc = i === 2 ? remaining : Math.floor(Math.random() * (remaining - (2 - i)));
                if (perc > 0) selected.push(`${shuffled[i].e} %${perc} ${shuffled[i].n}`);
                remaining -= perc;
                if (remaining <= 0) break;
            }

            await reply(`🧬 @${user}, genetik analizin tamamlandı: ${selected.join(' | ')}`);
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
            const shipQuotes = [
                "Aşk, iki bedende yaşayan tek bir ruhtur.",
                "Seninle her şeye varım ben.",
                "Gözlerinin içinde kaybolmak istiyorum.",
                "Dünyanın en güzel manzarası senin gülüşün.",
                "Sen benim en güzel rüyam, en tatlı gerçeğimsin.",
                "Kalbim sadece senin için atıyor.",
                "Seni sevmek, nefes almak kadar doğal.",
                "Aşkın matematiği yok, sen varsın.",
                "Ruh eşim, hayat arkadaşım...",
                "Seninle geçen her saniye, ömre bedel.",
                "Bir bakışınla dünyamı aydınlatıyorsun.",
                "Aşk tesadüfleri sever, biz en güzel tesadüfüz.",
                "Sen varsan, her şey tamam.",
                "Gözlerin gözlerime değince felaketim olurdu, ağlardım.",
                "Beni güzel hatırla, bunlar son satırlar... Şaka şaka, sonsuza kadar beraberiz!",
                "Seninle yaşlanmak istiyorum, seninle çocuklaşmak.",
                "Gülüşün, şehrin bütün ışıklarından daha parlak.",
                "Sen benim gökyüzümsün, ben senin uçurtman.",
                "Aşk bir yolculuksa, son durağım sensin.",
                "Seni her gördüğümde kalbim ilk günkü gibi çarpıyor.",
                "Sen benim en sevdiğim şarkısın, hiç bıkmadan dinlediğim.",
                "Gözlerin diyorum, oturup bir ömür izlenir.",
                "Sen, benim hayata tutunma sebebimsin.",
                "Seni sevmek, güneşe dokunmak gibi; sıcak ve vazgeçilmez.",
                "Bütün şairler seni anlatmış sanki, bütün şiirler senin için.",
                "Seninle olmak, evin yolunu bulmak gibi.",
                "Kalbimdeki en güzel yer sana ayrıldı.",
                "Sensiz geçen bir gün, yaşanmamış bir gündür.",
                "Sen benim için bir mucizesin.",
                "Seni düşünmek bile yüzümü güldürmeye yetiyor.",
                "Benim en güzel hikayem sensin.",
                "Ellerin ellerimde oldukça, her zorluğun üstesinden gelirim.",
                "Sen benim huzur limanımsın.",
                "Aşkın adı sen, soyadı biz olsun.",
                "Seni seviyorum, dünden daha çok, yarından daha az.",
                "Gözlerin deniz, ben içinde bir balık; kaybolmuşum, bulma beni.",
                "Seninle susmak bile güzel, konuşmayı sen düşün.",
                "Hayatımın en güzel 'iyiki'sisin.",
                "Sen varsan, her mevsim bahar.",
                "Seni bulmak, hazine bulmaktan daha değerli."
            ];
            const randomQuote = shipQuotes[Math.floor(Math.random() * shipQuotes.length)];
            let target = null; // Kullanıcının seçmesine izin verme, hep rastgele olsun
            const rig = riggedShips[user.toLowerCase()];

            // ÖZEL EŞLEŞTİRME: omegacyr <-> iiremkk
            if (user === 'omegacyr') target = 'iiremkk';
            else if (user === 'iiremkk') target = 'omegacyr';

            // Hedef yoksa rastgele birini seç (SADECE SON 10 DK AKTİF OLANLARDAN)
            if (!target && !rig) {
                const tenMinsAgo = Date.now() - 600000;
                const activeUsers = Object.entries(dbRecentUsers)
                    .filter(([username, data]) =>
                        data.last_channel === broadcasterId &&
                        data.last_seen > tenMinsAgo &&
                        username !== user.toLowerCase() &&
                        username !== 'omegacyr' && // Başkalarının shipinde çıkmasınlar
                        username !== 'iiremkk'     // Başkalarının shipinde çıkmasınlar
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
                await reply(`❤️ @${user} & @${target} ❤️\n💌 ${randomQuote}`);
                delete riggedShips[user.toLowerCase()];
            } else {
                await reply(`❤️ @${user} & @${target} ❤️\n💌 ${randomQuote}`);
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
                "Başka birinin ışığını söndürmek, senin ışığını daha parlak yapmaz.",
                "Hayat bir yankıdır; ne gönderirsen o geri gelir.",
                // DAHA FAZLA SÖZ - USER ISTEGI
                "Gittiğin yola inandıysan, attığın adımlardan korkma.",
                "Deniz sakin olduğu zaman dümeni herkes tutar. 🌊",
                "Bir gün değil, her gün istersen olur.",
                "Kaybetmekten korkma; bir şeyi kazanman için bazı şeyleri kaybetmen gerekir.",
                "Yıldızlara ulaşamazsan, göğe yükselmiş olursun.",
                "Her şey vaktini bekler; ne gül vaktinden önce açar, ne güneş vaktinden önce doğar. - Mevlana",
                "Cesaret, korkuya rağmen devam edebilmektir. 🦁",
                "Dün akıllıydım, dünyayı değiştirmek istedim. Bugün bilgeyim, kendimi değiştiriyorum. - Mevlana",
                "Başlamak için mükemmel olmak zorunda değilsin, ama mükemmel olmak için başlamak zorundasın.",
                "En uzun yolculuklar bile tek bir adımla başlar.",
                "Sessizlik en güçlü çığlıktır. 🤫",
                "Kuşlar gibi uçmayı, balıklar gibi yüzmeyi öğrendik; ama bu arada çok basit bir sanatı unuttuk: İnsan gibi yaşamayı. - Martin Luther King",
                "Hayallerinin peşinden git, bir gün yorulup seni bekleyecekler.",
                "Zirveye çıkarken rastladığın insanlara iyi davran, çünkü inerken onlarla tekrar karşılaşacaksın.",
                "Fırtınalar ağaçların köklerini daha derine salmasını sağlar.",
                "Kendi ışığına güvenen, başkasının parlamasından rahatsız olmaz.",
                "Hayat, fırtınanın geçmesini beklemek değil, yağmurda dans etmeyi öğrenmektir. ☔",
                "Gülümsemek, iki insan arasındaki en kısa mesafedir. 😊",
                // ATATÜRK SÖZLERİ
                "Hayatta en hakiki mürşit ilimdir. - Mustafa Kemal Atatürk 🇹🇷",
                "Egemenlik, kayıtsız şartsız milletindir. - Mustafa Kemal Atatürk 🇹🇷",
                "Yurtta sulh, cihanda sulh. - Mustafa Kemal Atatürk 🇹🇷",
                "Ne mutlu Türk'üm diyene! - Mustafa Kemal Atatürk 🇹🇷",
                "İstikbal göklerdedir. - Mustafa Kemal Atatürk ✈️",
                "Beni görmek demek mutlaka yüzümü görmek demek değildir. Benim fikirlerimi, benim duygularımı anlıyorsanız ve hissediyorsanız bu kafidir. - Mustafa Kemal Atatürk",
                "Öğretmenler! Yeni nesil sizin eseriniz olacaktır. - Mustafa Kemal Atatürk 📚",
                "Ey yükselen yeni nesil! İstikbal sizsiniz. Cumhuriyeti biz kurduk, onu yükseltecek ve yaşatacak sizsiniz. - Mustafa Kemal Atatürk",
                "Türk milleti çalışkandır, Türk milleti zekidir. - Mustafa Kemal Atatürk",
                "Sanatsız kalan bir milletin hayat damarlarından biri kopmuş demektir. - Mustafa Kemal Atatürk 🎨",
                "Bir ulusun asker ordusu ne kadar güçlü olursa olsun, kazandığı zaferler ne kadar yüce olursa olsun, bir ulus ilim ordusuna sahip değilse, savaş meydanlarında kazanılmış zaferlerin sonu olacaktır. - Mustafa Kemal Atatürk",
                "Dünyada her şey için, medeniyet için, hayat için, başarı için, en hakiki mürşit ilimdir, fendir. - Mustafa Kemal Atatürk"
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
            const isSub = payload.sender?.identity?.badges?.some(b => b.type === 'subscriber' || b.type === 'broadcaster' || b.type === 'moderator' || b.type === 'founder') || user.toLowerCase() === "omegacyr";
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



        // --- AI CHAT ÖZETİ (Pollinations AI - Ücretsiz) ---
        else if (isEnabled('ai') && (lowMsg === '!ozet' || lowMsg === '!özet')) {
            // Cooldown kontrol (1 dakika)
            if (selamCooldowns[`ozet_${broadcasterId}`] && Date.now() - selamCooldowns[`ozet_${broadcasterId}`] < 60000) {
                return; // Sessiz cooldown
            }
            selamCooldowns[`ozet_${broadcasterId}`] = Date.now();

            await reply(`📝 @${user}, biraz bekle, chat defterini karıştırıp özet çıkarıyorum...`);

            try {
                const logsSnap = await db.ref(`channels/${broadcasterId}/chat_log`).limitToLast(60).once('value');
                const logs = logsSnap.val();
                if (!logs) return await reply("Henüz özetlenecek kadar konuşma yok.");

                let chatText = "";
                Object.values(logs).forEach(l => {
                    // Bot mesajlarını ve komutları filtrele
                    if (l.user.toLowerCase() !== 'aloskegangbot' && !l.message.startsWith('!')) {
                        chatText += `${l.user}: ${l.message}\n`;
                    }
                });

                if (chatText.length < 50) return await reply("Chat çok sessiz, özetleyecek bir şey bulamadım.");

                // Prompt oluştur
                const prompt = `Sen çılgın ve eğlenceli bir Twitch/Kick moderatörüsün. Aşağıdaki chat konuşmalarını oku ve neler konuşulduğunu 2-3 cümleyle, esprili bir dille, Türkçe olarak özetle. Dedikoduları kaçırma. Konuşmalar:\n${chatText}`;

                // AI İsteği (Pollinations.ai Text API - Ücretsiz)
                const aiRes = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`);

                if (aiRes.data) {
                    const summary = aiRes.data.toString().substring(0, 450); // Chat limiti
                    await reply(`📋 CHAT ÖZETİ: ${summary}`);
                } else {
                    await reply("Özet çıkarırken kalemimin ucu kırıldı. Tekrar dene.");
                }

            } catch (e) {
                console.error("AI Summary Error:", e.message);
                await reply("Beynim yandı, şu an özetleyemiyorum.");
            }
        }

        else if (isEnabled('ai') && lowMsg === '!ozet-sıfırla') {
            if (user.toLowerCase() !== "omegacyr" && !isAuthorized) return await reply(`🤫 @${user}, Bu komut sadece yetkililere özeldir!`);
            await db.ref(`channels/${broadcasterId}/chat_log`).remove();
            await reply(`🗑️ @${user}, Chat özet hafızası sıfırlandı!`);
        }

        else if (isEnabled('gundem') && lowMsg === '!gündem') {
            try {
                await reply(`🔍 @${user}, Gündem taranıyor...`);
                // BBC TR RSS Fetch
                const rssRes = await axios.get('http://feeds.bbci.co.uk/turkce/rss.xml', {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 5000
                });

                const xml = rssRes.data;
                const allItems = [];
                // Extract all titles (up to 15)
                const itemRegex = /<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>[\s\S]*?<\/item>/g;
                let match;
                while ((match = itemRegex.exec(xml)) !== null && allItems.length < 15) {
                    allItems.push(match[1]); // CDATA content
                }

                if (allItems.length === 0) {
                    const fallbackRegex = /<title>(?!<!\[CDATA\[)(.*?)<\/title>/g;
                    let fbMatch;
                    let count = 0;
                    while ((fbMatch = fallbackRegex.exec(xml)) !== null && allItems.length < 15) {
                        if (count > 0) { // Skip first title (Channel Name)
                            allItems.push(fbMatch[1]);
                        }
                        count++;
                    }
                }

                if (allItems.length > 0) {
                    // Randomly select 3 items from allItems
                    const selected = [];
                    const countToSelect = Math.min(allItems.length, 3);
                    const tempItems = [...allItems];

                    for (let i = 0; i < countToSelect; i++) {
                        const randomIndex = Math.floor(Math.random() * tempItems.length);
                        selected.push(tempItems[randomIndex]);
                        tempItems.splice(randomIndex, 1);
                    }

                    const summary = selected.join(" | ");
                    await reply(`📈 Gündemden Seçmeler: ${summary}`);
                } else {
                    await reply(`⚠️ @${user}, Şu an güncel haber çekilemedi.`);
                }
            } catch (error) {
                console.error("Gundem RSS Error:", error.message);
                await reply(`⚠️ @${user}, Haber kaynağına ulaşılamadı.`);
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

            // DÜZELTME: Overlay 'sound' yolunu dinliyor, 'soundId' değil 'sound' bekliyor
            // (server.js'den gelen düzeltme: custom_sound YANLIŞTI, overlay.html sound dinliyor)
            await db.ref(`channels/${broadcasterId}/stream_events/sound`).push({
                sound: soundTrigger, // Overlay HTML'de 'Sound' -> 'sound' property beklentisi olabilir veya 'url'
                // Overlay logic: if (data.sound) playSound(data.sound)
                // Wait, overlay.html logic (step 945):
                // if (data.sound) { playSound('custom', data.sound); }
                // So property MUST be 'sound'. Key is 'sound'
                sound: soundTrigger,
                url: sound.url,
                volume: sound.volume || 100,
                duration: sound.duration || 0,
                played: false,
                timestamp: Date.now(),
                broadcasterId: broadcasterId
            });
            await reply(`🎵 @${user}, !ses ${soundTrigger} komutu ile ses çaldı! (-${soundCost.toLocaleString()} 💰)`);
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

        // --- RPG KARAKTER KOMUTLARI ---
        else if (lowMsg === '!karakter') {
            const uSnap = await userRef.once('value');
            const uData = uSnap.val() || {};
            const rpg = uData.rpg || { level: 1, hp: 100, xp: 0, str: 5, def: 0 };
            const w = RPG_WEAPONS[rpg.weapon] || RPG_WEAPONS["yumruk"];
            const a = RPG_ARMORS[rpg.armor] || RPG_ARMORS["tisort"];

            await reply(`👤 @${user} [BATTLE STATS]\n❤️ HP: ${rpg.hp + (a.hp || 0)} | ⚔️ STR: ${rpg.str} (+${w.dmg}) | 🛡️ DEF: ${rpg.def} (+${a.def})\n🗡️ Silah: ${w.name} | 🧥 Zırh: ${a.name}`);
        }
        else if (lowMsg === '!duello') {
            await reply(`⚔️ @${user}, Chrome uzantısı ile görsel düello çok yakında! Şimdilik marketten eşya topla.`);
        }

        // --- MODERASYON: TRANSFER YASAKLA ---
        else if (lowMsg.startsWith('!transfer-yasakla ')) {
            if (!isAuthorized) return;
            const target = args[0]?.replace('@', '').toLowerCase().trim();
            if (!target) return await reply(`@${user}, Kullanım: !transfer-yasakla @kullanıcı`);

            const targetRef = db.ref('users/' + target);
            const snap = await targetRef.once('value');
            if (!snap.exists()) return await reply(`@${user}, @${target} adında bir kullanıcı bulunamadı.`);

            const currentData = snap.val() || {};
            const isBanned = currentData.transfer_banned || false;
            const newStatus = !isBanned;

            await targetRef.update({ transfer_banned: newStatus });
            await reply(`🚫 @${target} için transfer özelliği ${newStatus ? 'YASAKLANDI' : 'AÇILDI'}! ✅`);
        }

        else if (lowMsg.startsWith('!gönder') || lowMsg.startsWith('!transfer') || lowMsg.startsWith('!hediye')) {
            const target = args[0]?.replace('@', '').toLowerCase();
            const amount = parseInt(args[1]);

            if (!target || isNaN(amount) || amount <= 0 || !isFinite(amount)) {
                return await reply(`💸 @${user}, Kullanım: !hediye @kullanıcı [miktar]`);
            }

            if (target === user.toLowerCase()) {
                return await reply(`🚫 @${user}, Kendine para gönderemezsin!`);
            }

            // GÖNDEREN KONTROLÜ
            const snap = await userRef.once('value');
            const data = snap.val() || { balance: 0 };

            if (data.transfer_banned) {
                return await reply(`🚫 @${user}, Transfer yapman yasaklanmış! Para gönderemezsin.`);
            }

            if (!data.is_infinite && data.balance < amount) {
                return await reply(`❌ @${user}, Bakiyen yetersiz! Mevcut: ${data.balance.toLocaleString()} 💰`);
            }

            // ALICI KONTROLÜ
            const targetRef = db.ref('users/' + target);
            const targetSnap = await targetRef.once('value');

            if (!targetSnap.exists()) {
                return await reply(`⚠️ @${user}, @${target} adında bir kullanıcı veritabanında bulunamadı.`);
            }

            const targetData = targetSnap.val() || {};
            if (targetData.transfer_banned) {
                return await reply(`🚫 @${user}, @${target} kullanıcısının transferi yasaklanmış! Ona para gönderemezsin.`);
            }

            const finalAmount = amount;

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

            await reply(`💸 @${user} -> @${target} kullanıcısına ${finalAmount.toLocaleString()} 💰 gönderdi!`);
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

                // --- SECURE TOKEN GENERATION ---
                const sessionToken = crypto.randomBytes(16).toString('hex');
                // Store token in auth_success so client can read it ONCE
                await db.ref('auth_success/' + targetUser).set({
                    success: true,
                    token: sessionToken,
                    timestamp: Date.now()
                });

                // Also store in user record for server verification later
                await db.ref('users/' + targetUser).update({
                    auth_channel: broadcasterId,
                    last_auth_at: Date.now(),
                    session_token: sessionToken, // CRITICAL: Server-side validation key
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

        else if (lowMsg.startsWith('!duello')) {
            const opponentName = args[0]?.replace('@', '').toLowerCase().trim();
            if (!opponentName) return await reply(`@${user}, Kimi düelloya davet ediyorsun? Örnek: !duello @ahmet`);

            if (opponentName === user.toLowerCase()) return await reply(`@${user}, Kendinle savaşamazsın.`);

            const wager = args[1] ? parseInt(args[1]) : 0;

            // Kullanıcıların verilerini çek
            const p1Snap = await db.ref('users/' + user).once('value');
            const p2Snap = await db.ref('users/' + opponentName).once('value');

            if (!p2Snap.exists()) return await reply(`@${user}, ${opponentName} adlı kullanıcı bulunamadı.`);

            const p1Data = p1Snap.val() || { balance: 0 };
            const p2Data = p2Snap.val() || { balance: 0 };

            if (!isNaN(wager) && wager > 0) {
                if (!p1Data.is_infinite && (p1Data.balance || 0) < wager) return await reply(`@${user}, Yetersiz bakiye!`);
                if (!p2Data.is_infinite && (p2Data.balance || 0) < wager) return await reply(`@${user}, @${opponentName} kullanıcısının bakiyesi yetersiz!`);

                pendingDuels[opponentName] = { challenger: user, amount: wager, expires: Date.now() + 30000 };
                await reply(`⚔️ @${user}, @${opponentName} ile ${wager} 💰 duello istiyor! Kabul etmek için !kabul yaz.`);
            } else {
                await reply(`⚔️ @${user} 🆚 @${opponentName}... Düello başladı!`);
                setTimeout(async () => {
                    const winner = Math.random() < 0.5 ? user : opponentName;
                    const loser = winner === user ? opponentName : user;
                }, 2500);
            }
        }

        else if (lowMsg === '!kabul') {
            const pending = pendingDuels[user];
            if (!pending || Date.now() > pending.expires) {
                return await reply(`@${user}, Şu an sana gelen aktif bir düello isteği yok.`);
            }

            const { challenger, amount } = pending;
            delete pendingDuels[user];

            const p1Snap = await db.ref('users/' + challenger).once('value');
            const p2Snap = await db.ref('users/' + user).once('value');
            const p1Data = p1Snap.val() || {};
            const p2Data = p2Snap.val() || {};

            if (!p1Data.is_infinite && (p1Data.balance || 0) < amount) return await reply(`@${user}, @${challenger} bakiyesi yetersiz olduğu için düello iptal!`);
            if (!p2Data.is_infinite && (p2Data.balance || 0) < amount) return await reply(`@${user}, Bakiyen yetersiz!`);

            await reply(`⚔️ DÜELLO KABUL EDİLDİ! @${challenger} 🆚 @${user} (${amount} 💰 Masada!)`);

            setTimeout(async () => {
                const winnerName = Math.random() < 0.5 ? challenger : user;
                const loserName = winnerName === challenger ? user : challenger;

                await db.ref('users/' + loserName).transaction(u => {
                    if (u && !u.is_infinite) u.balance -= amount;
                    return u;
                });

                await db.ref('users/' + winnerName).transaction(u => {
                    if (u) u.balance = (parseInt(u.balance) || 0) + amount;
                    return u;
                });

                await reply(`🏆 KAZANAN: @${winnerName}! (+${amount} 💰)\n💀 @${loserName} kaybetti (-${amount} 💰).`);
            }, 2500);
        }

        // --- TAHMİN SİSTEMİ (!tahmin) ---
        else if (lowMsg.startsWith('!tahmin ')) {
            if (!isAuthorized) return;

            // Format: !tahmin Soru? | Seçenek 1 | Seçenek 2
            const parts = rawMsg.substring(8).split('|').map(s => s.trim());
            if (parts.length < 3) return await reply(`@${user}, Kullanım: !tahmin Soru? | Seçenek 1 | Seçenek 2`);

            const question = parts[0];
            const options = parts.slice(1);

            if (activePredictions[broadcasterId]) {
                return await reply(`@${user}, Zaten aktif bir tahmin var! Önce onu bitirmelisin: !tahmin-bitir [no]`);
            }

            activePredictions[broadcasterId] = {
                question,
                options,
                bets: {}, // optionIndex: [{user, amount}]
                totalPool: 0,
                optionPools: {}, // optionIndex: totalAmount
                createdBy: user,
                createdAt: Date.now()
            };

            options.forEach((opt, idx) => {
                activePredictions[broadcasterId].bets[idx + 1] = [];
                activePredictions[broadcasterId].optionPools[idx + 1] = 0;
            });

            let optText = options.map((opt, i) => `[${i + 1}] ${opt}`).join(' | ');
            await reply(`📊 TAHMİN BAŞLADI: "${question}" ➜ Seçenekler: ${optText} ✅ Katılmak için: !oyla [no] [miktar]`);
        }

        else if (lowMsg.startsWith('!oyla ')) {
            const pred = activePredictions[broadcasterId];
            if (!pred) return await reply(`@${user}, Şu an aktif bir tahmin yok.`);

            const optNo = parseInt(args[0]);
            const amount = parseInt(args[1]);

            if (isNaN(optNo) || isNaN(amount) || amount < 10) {
                return await reply(`@${user}, Kullanım: !oyla [seçenek_no] [miktar] (Min: 10 💰)`);
            }

            if (!pred.bets[optNo]) {
                return await reply(`@${user}, Geçersiz seçenek numarası!`);
            }

            // Bakiye kontrolü
            const snap = await userRef.once('value');
            const data = snap.val() || {};
            if (!data.is_infinite && (data.balance || 0) < amount) {
                return await reply(`@${user}, Yetersiz bakiye! 💰`);
            }

            // Bakiyeyi düş ve bahsi ekle
            if (!data.is_infinite) {
                await userRef.child('balance').transaction(b => (b || 0) - amount);
            }

            // Bahsi kaydet
            pred.bets[optNo].push({ user: user.toLowerCase(), amount });
            pred.optionPools[optNo] += amount;
            pred.totalPool += amount;

            await reply(`✅ @${user}, ${amount.toLocaleString()} 💰 ile [${optNo}] "${pred.options[optNo - 1]}" tarafına katıldın!`);
        }

        else if (lowMsg.startsWith('!tahmin-bitir ')) {
            if (!isAuthorized) return;
            const pred = activePredictions[broadcasterId];
            if (!pred) return await reply(`@${user}, Aktif bir tahmin yok.`);

            const winnerNo = parseInt(args[0]);
            if (isNaN(winnerNo) || !pred.options[winnerNo - 1]) {
                return await reply(`@${user}, Lütfen kazanan seçeneği belirt: !tahmin-bitir [no]`);
            }

            const winners = pred.bets[winnerNo] || [];
            const winnerPool = pred.optionPools[winnerNo] || 0;
            const totalPool = pred.totalPool;

            if (winners.length === 0) {
                await reply(`📊 Tahmin Bitti! "${pred.question}" | Kazanan: [${winnerNo}] ${pred.options[winnerNo - 1]}. Kazanan tarafta kimse yok, havuz (${totalPool.toLocaleString()} 💰) yandı! 🔥`);
                delete activePredictions[broadcasterId];
                return;
            }

            // Dağıtım - Kazananlara (kendi yatırdıkları + havuzun geri kalanı hisseleri oranında)
            for (const bet of winners) {
                // Adil Dağıtım: Havuzdaki toplam parayı, kazananlar paylarına göre bölüşür.
                const share = (bet.amount / winnerPool) * totalPool;
                const winAmt = Math.floor(share);

                await db.ref(`users/${bet.user}/balance`).transaction(b => (b || 0) + winAmt);
            }

            await reply(`🎉 Tahmin Bitti! "${pred.question}" | Kazanan: [${winnerNo}] ${pred.options[winnerNo - 1]}. Toplam ${winners.length} kişi ödülü paylaştı! Havuz: ${totalPool.toLocaleString()} 💰 🏆`);
            delete activePredictions[broadcasterId];
        }

        else if (lowMsg === '!tahmin-iptal') {
            if (!isAuthorized) return;
            const pred = activePredictions[broadcasterId];
            if (!pred) return;

            // İade
            for (const optNo in pred.bets) {
                for (const bet of pred.bets[optNo]) {
                    await db.ref(`users/${bet.user}/balance`).transaction(b => (b || 0) + bet.amount);
                }
            }

            await reply(`🚫 Tahmin iptal edildi, tüm bakiyeler iade edildi.`);
            delete activePredictions[broadcasterId];
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
                        u.stocks[code] = (u.stocks[code] || 0) + amount;

                        // Maliyet takibi (Ortalama maliyet için)
                        if (!u.stock_costs) u.stock_costs = {};
                        u.stock_costs[code] = (u.stock_costs[code] || 0) + totalCost;
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

                // %10 KOMİSYON UYGULAMASI
                const rawGain = stock.price * amount;
                const commission = rawGain * 0.10;
                const totalGain = rawGain - commission;

                await userRef.transaction(u => {
                    if (u) {
                        u.balance = (u.balance || 0) + totalGain;

                        // Maliyet düşme (Ortalamayı korumak için)
                        if (u.stocks[code] && u.stock_costs && u.stock_costs[code]) {
                            const avgCost = u.stock_costs[code] / u.stocks[code];
                            const reducedCost = avgCost * amount;
                            u.stock_costs[code] -= reducedCost;
                            if (u.stock_costs[code] < 0) u.stock_costs[code] = 0;
                        }

                        u.stocks[code] -= amount;
                        // Float hassasiyeti nedeniyle 0'dan çok küçükse temizle
                        if (u.stocks[code] <= 0.00001) {
                            delete u.stocks[code];
                            if (u.stock_costs) delete u.stock_costs[code];
                        }
                    }
                    return u;
                });
                await reply(`💰 @${user}, ${amount} adet ${code} hissesi satıldı! Kazanç: ${Math.floor(totalGain).toLocaleString()} 💰 (Komisyon: ${Math.floor(commission).toLocaleString()} 💰)`);
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
            await reply(`📊 @${user} Verilerin:\n🕒 İzleme: ${watchTime} dakika\n💬 Mesaj: ${messageCount}`);
        }

        else if (lowMsg === '!vergi') {
            // 1. Fetch User Data & Stocks
            const uSnap = await userRef.once('value');
            const uData = uSnap.val() || { balance: 0 };
            const sSnap = await db.ref('global_stocks').once('value');
            const stocks = sSnap.val() || {};

            // 2. Use SHARED Calculation Logic
            // Note: These functions must be defined in the scope (which they are, at root level)
            const balanceTax = calculateBalanceTax(uData.balance || 0);
            const propertyTax = calculatePropertyTax(uData.properties || []);
            const stockTax = await calculateStockTax(uData.stocks || {}, stocks);

            const totalTax = balanceTax + propertyTax + stockTax;

            // 3. Safety Cap (%50)
            const maxTax = Math.floor((uData.balance || 0) * 0.50);
            const finalTax = Math.min(totalTax, maxTax);

            let details = [];
            if (balanceTax > 0) details.push(`💰 Nakit V.: ${balanceTax.toLocaleString()}`);
            if (propertyTax > 0) details.push(`🏠 Emlak V.: ${propertyTax.toLocaleString()}`);
            if (stockTax > 0) details.push(`📈 Borsa V.: ${stockTax.toLocaleString()}`);

            if (finalTax > 0) {
                let msg = `💸 @${user}, Günlük Vergi Borcun: ${finalTax.toLocaleString()} 💰`;
                if (details.length > 0) msg += `\n📊 Detay: ${details.join(' + ')}`;
                if (totalTax > finalTax) msg += `\n(⚠️ Vergi koruması aktif: %50 sınır)`;
                await reply(msg);
            } else {
                await reply(`💸 @${user}, Şu an vergi borcun yok. Temizsin!`);
            }
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


// ADD STOCK
app.post('/admin-api/stocks/add', authAdmin, hasPerm('stocks'), async (req, res) => {
    const { code, name, price } = req.body;
    await db.ref(`global_stocks/${code}`).set({
        name,
        price: parseFloat(price),
        trend: 0,
        history: [parseFloat(price)]
    });
    addLog("Borsa", `Hisse Eklendi: ${code} - ${price}`);
    res.json({ success: true });
});

// ADD NEWS
app.post('/admin-api/add-news', authAdmin, hasPerm('stocks'), async (req, res) => {
    const { code, text, type, impact } = req.body;
    const impactVal = parseInt(impact) || 0;

    // 1. Add News to Ticker
    await db.ref('global_news').push({
        text,
        type, // 'good', 'bad', 'info'
        timestamp: Date.now()
    });

    // 2. Apply Impact to Stock Price
    if (code && code !== 'GENEL' && impactVal !== 0) {
        const ref = db.ref(`global_stocks/${code}`);
        const snap = await ref.once('value');
        if (snap.exists()) {
            const stock = snap.val();
            let newPrice = stock.price + (stock.price * (impactVal / 100));
            if (newPrice < 0.01) newPrice = 0.01;

            await ref.update({
                price: newPrice,
                trend: impactVal > 0 ? 1 : (impactVal < 0 ? -1 : 0)
            });

            // Add history
            const histRef = db.ref(`global_stocks/${code}/history`);
            const hSnap = await histRef.once('value');
            let history = hSnap.val() || [];
            history.push(newPrice);
            if (history.length > 20) history.shift();
            await histRef.set(history);
        }
    }

    addLog("Borsa Haber", `Haber: ${text} (Etki: %${impactVal})`);
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

// Public Stocks Endpoint (for shop calculator)
app.get('/api/stocks/list', async (req, res) => {
    try {
        const snap = await db.ref('global_stocks').once('value');
        res.json(snap.val() || {});
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
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

app.post('/admin-api/toggle-command', authAdmin, hasPerm('channels'), async (req, res) => {
    const { channelId, command, value } = req.body;
    try {
        await db.ref(`channels/${channelId}/settings`).update({ [command]: value });
        // Log, sensitive datayı gizle (uzunsa)
        const valStr = String(value).length > 50 ? String(value).substring(0, 50) + "..." : value;
        addLog("Ayar Değişimi", `${channelId} -> ${command}: ${valStr}`, channelId);
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, error: e.message });
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
    const bots = ['aloskegangbot', 'botrix'];

    const filteredUsers = Object.entries(users).filter(([k, u]) => !bots.includes(k.toLowerCase()) && u.last_channel === channelId);

    filteredUsers.forEach(([k, u]) => {
        totalWatch += (u.channel_watch_time?.[channelId] || 0);
        totalMsgs += (u.channel_m?.[channelId] || 0);
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
        users: filteredUsers.length,
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
            .map(([name, data]) => ({ name, balance: data.balance || 0 }))
            .filter(u => !['aloskegangbot', 'botrix'].includes(u.name.toLowerCase())) // BOTLARI GİZLE
            .sort((a, b) => (b.balance || 0) - (a.balance || 0))
            .slice(0, 25); // İLK 25

        res.json(sorted);
    } catch (e) {
        console.error("Leaderboard Error:", e.message);
        res.json([]);
    }
});

// --- YENİ: KULLANICI PROFİL API (RULE BYPASS) ---
app.get('/api/user/:username', async (req, res) => {
    try {
        const username = req.params.username.toLowerCase();

        // --- PRIVACY CHECK ---
        // If client sends a token, we can validate it matches the requested user
        const authHeader = req.headers['authorization'];
        let isSelf = false;

        if (authHeader) {
            const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
            const uSnap = await db.ref(`users/${username}`).once('value');
            const uData = uSnap.val();
            if (uData && uData.session_token === token) {
                isSelf = true;
            }
        }

        // Server-side read is secure and bypasses client rules
        const snap = await db.ref('users/' + username).once('value');
        const data = snap.val();

        if (!data) return res.status(404).json({ error: "Kullanıcı bulunamadı" });

        const safeData = { ...data };
        if (!isSelf) {
            delete safeData.session_token; // Never expose token to others
            delete safeData.email; // If exists
        }

        // --- GANG RANK INJECTION ---
        if (data.gang) {
            const gangSnap = await db.ref(`gangs/${data.gang}`).once('value');
            const gang = gangSnap.val();
            if (gang && gang.members && gang.members[username]) {
                safeData.gangRank = gang.members[username].rank;
            }
        }

        return res.json(safeData);
    } catch (e) {
        console.error("User API Error:", e.message);
        return res.status(500).json({ error: "Sunucu hatası" });
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

        // 1. Fetch Latest Data via GraphQL (Most Reliable for Live Status)
        const gql = await fetchKickGraphQL(username);

        // Fallback or additional checks could go here, but GraphQL is usually sufficient for Live/Followers

        if (gql) {
            const statsRef = db.ref(`channels/${chanId}/stats`);
            const currentStatsSnap = await statsRef.once('value');
            const currentStats = currentStatsSnap.val() || { followers: 0, subscribers: 0, is_live: false };

            const wasLive = currentStats.is_live || false;
            const isLive = gql.livestream && gql.livestream.is_live;

            // 2. DISCORD NOTIFICATION LOGIC
            if (isLive && !wasLive) {
                console.log(`🎥 ${username} yayına girdi! Bildirim gönderiliyor...`);
                // Check settings for webhook
                const settingsSnap = await db.ref(`channels/${chanId}/settings`).once('value');
                const settings = settingsSnap.val() || {};
                const webhookUrl = settings.discord_live_webhook;

                if (webhookUrl) {
                    try {
                        const streamTitle = gql.livestream.session_title || "Yayındayım!";
                        const streamGame = gql.livestream.categories?.[0]?.name || "Just Chatting";
                        const thumbUrl = gql.livestream.thumbnail?.url || "https://kick.com/favicon.ico";

                        await axios.post(webhookUrl, {
                            content: `@everyone ${username} KICK'TE YAYINDA! 🔴\nhttps://kick.com/${username}`,
                            embeds: [{
                                title: streamTitle,
                                url: `https://kick.com/${username}`,
                                color: 5763719, // Kick Greenish
                                fields: [
                                    { name: "Oyun/Kategori", value: streamGame, inline: true }
                                ],
                                image: { url: thumbUrl },
                                timestamp: new Date().toISOString()
                            }]
                        });
                        addLog("Discord Bildirim", `Yayın başladı bildirimi gönderildi.`, chanId);
                    } catch (err) {
                        console.error(`Webhook Error (${username}):`, err.message);
                        addLog("Discord Hata", `Webhook hatası: ${err.message}`, chanId);
                    }
                }
            }

            // 3. UPDATE DB
            const updates = {
                last_sync: Date.now(),
                followers: gql.followersCount || currentStats.followers,
                // Keep sub count if not available in Public API (GraphQL might have it)
                subscribers: currentStats.subscribers
            };

            if (gql.livestream) {
                updates.viewers = gql.livestream.viewer_count || 0;
                updates.is_live = gql.livestream.is_live;
                // Session ID track could be useful to prevent duplicate notifies
            } else {
                updates.is_live = false;
                updates.viewers = 0;
            }

            await statsRef.update(updates);
            return { ...currentStats, ...updates };
        } else {
            // API Failure Fallback: Try to refresh token if 401 suspected, or just return null
            if (chan.access_token) {
                await refreshChannelToken(chanId).catch(() => { });
            }
        }
        return null;
    } catch (e) {
        console.error("Sync Single Stats Error:", e.message);
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

app.post('/api/borsa/reset', authAdmin, async (req, res) => {
    // Only 'omegacyr' (Master Admin) can reset the market
    if (!req.adminUser || req.adminUser.username !== 'omegacyr') {
        return res.status(403).json({ success: false, error: 'Bu işlem için MASTER yetkisi gerekiyor.' });
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

app.post('/admin-api/all-users', authAdmin, async (req, res) => {
    const { search } = req.body;
    try {
        let snap;
        if (search) {
            const cleanSearch = search.toLowerCase();
            // Try prefix search
            snap = await db.ref('users').orderByKey().startAt(cleanSearch).endAt(cleanSearch + "\uf8ff").limitToFirst(50).once('value');
        } else {
            // Default: Fetch last 500 created/active users to prevent overload
            // Getting all might verify crash the server if DB is huge
            snap = await db.ref('users').limitToLast(500).once('value');
        }
        res.json(snap.val() || {});
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


// 1. GET JOBS (Admin Panel Sync)
app.post('/admin-api/get-jobs', authAdmin, hasPerm('users'), (req, res) => {
    res.json(Object.keys(JOBS));
});

// 2. ASSIGN REAL ESTATE (Admin)
// City Indexes: 0:IST, 1:ANK, 2:IZM, 3:ANT
// Prop Types (Custom): 0-12 matching indices in shop.js logic
// Emlak Şehir Listesi API (Admin Panel İçin)
app.get('/api/real-estate/cities', (req, res) => {
    res.json(EMLAK_CITIES);
});

// Admin Panel Mülk Atama (Gerçek Piyasayla Senkron)
app.post('/admin-api/assign-property', authAdmin, hasPerm('users'), async (req, res) => {
    const { user, cityId, propertyId } = req.body;

    if (!user || !cityId || !propertyId) return res.json({ success: false, error: 'Eksik veri' });

    try {
        const cityName = EMLAK_CITIES.find(c => c.id === cityId.toUpperCase())?.name || cityId;

        // Piyasayı oku
        const marketRef = db.ref(`real_estate_market/${cityId.toUpperCase()}`);
        const snap = await marketRef.once('value');
        let market = snap.val();

        // Pazar yoksa oluştur
        if (!market) market = await getCityMarket(cityId.toUpperCase());

        const propIndex = market.findIndex(p => p.id === propertyId);
        if (propIndex === -1) return res.json({ success: false, error: 'Mülk bulunamadı' });

        const prop = market[propIndex];
        if (prop.owner) return res.json({ success: false, error: `Bu mülk zaten @${prop.owner} kullanıcısında!` });

        // 1. Pazarda sahipliği güncelle
        market[propIndex].owner = user.toLowerCase();
        await marketRef.set(market);

        // 2. Kullanıcıya ekle
        const userRef = db.ref(`users/${user.toLowerCase()}`);
        await userRef.transaction(u => {
            if (u) {
                if (!u.properties) u.properties = [];
                u.properties.push({ ...prop, city: cityId.toUpperCase(), boughtAt: Date.now() });
            }
            return u;
        });

        addLog("Emlak Atama", `${user} kullanıcısına ${cityName} şehrinde ${prop.name} atandı.`);
        res.json({ success: true, message: 'Mülk başarıyla atandı!' });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// --- GANG SYSTEM --- (Step 883: Initial Implementation)
const GANG_CREATE_COST = 1000000;

// VALID CITIES FOR GANG BASES (Server-Side Validation)
const VALID_CITIES = new Set([
    "ADANA", "ADIYAMAN", "AFYONKARAHISAR", "AGRI", "AMASYA", "ANKARA", "ANTALYA", "ARTVIN", "AYDIN", "BALIKESIR",
    "BILECIK", "BINGOL", "BITLIS", "BOLU", "BURDUR", "BURSA", "CANAKKALE", "CANKIRI", "CORUM", "DENIZLI", "DIYARBAKIR",
    "EDIRNE", "ELAZIG", "ERZINCAN", "ERZURUM", "ESKISEHIR", "GAZIANTEP", "GIRESUN", "GUMUSHANE", "HAKKARI", "HATAY",
    "ISPARTA", "MERSIN", "ISTANBUL", "IZMIR", "KARS", "KASTAMONU", "KAYSERI", "KIRKLARELI", "KIRSEHIR", "KOCAELI",
    "KONYA", "KUTAHYA", "MALATYA", "MANISA", "KAHRAMANMARAS", "MARDIN", "MUGLA", "MUS", "NEVSEHIR", "NIGDE", "ORDU",
    "RIZE", "SAKARYA", "SAMSUN", "SIIRT", "SINOP", "SIVAS", "TEKIRDAG", "TOKAT", "TRABZON", "TUNCELI", "SANLIURFA",
    "USAK", "VAN", "YOZGAT", "ZONGULDAK", "AKSARAY", "BAYBURT", "KARAMAN", "KIRIKKALE", "BATMAN", "SIRNAK", "BARTIN",
    "ARDAHAN", "IGDIR", "YALOVA", "KARABUK", "KILIS", "OSMANIYE", "DUZCE"
]);

// 1. CREATE GANG
app.post('/api/gang/create', async (req, res) => {
    try {
        const { username, name, tag, baseCity } = req.body;
        // Validation
        if (!username || !name || !tag || !baseCity) return res.json({ success: false, error: 'Eksik bilgi!' });

        // --- SECURITY: CITY VALIDATION ---
        if (!VALID_CITIES.has(baseCity)) return res.json({ success: false, error: 'Geçersiz veya desteklenmeyen şehir!' });

        if (tag.length < 3 || tag.length > 4) return res.json({ success: false, error: 'Etiket 3-4 harf olmalı' });
        if (name.length < 4 || name.length > 20) return res.json({ success: false, error: 'İsim 4-20 harf arasında olmalı' });

        const cleanUser = username.toLowerCase();

        // --- SECURITY: USE TRANSACTION FOR CREATION TO PREVENT RACE CONDITIONS ---
        // We need to check balance AND create gang atomically IF possible, or lock.
        // For simplicity with Firebase and high-level logic, we will check balance carefully.

        const userRef = db.ref('users/' + cleanUser);
        const userSnap = await userRef.once('value');
        const user = userSnap.val();

        if (!user) return res.json({ success: false, error: 'Kullanıcı bulunamadı!' });

        const isInf = user.is_infinite === true;

        if (!isInf) {
            // Transaction on User Balance to ensure they have funds and lock it
            const transactionResult = await userRef.child('balance').transaction((currentBalance) => {
                if (currentBalance === null) return currentBalance;
                if (currentBalance < GANG_CREATE_COST) return;
                return (currentBalance || 0) - GANG_CREATE_COST;
            });

            if (!transactionResult.committed) {
                return res.json({ success: false, error: 'Yetersiz bakiye veya işlem hatası.' });
            }
        }

        try {
            const userData = user; // Already fetched
            if (userData.gang) {
                // User already in gang! REFUND and Abort (if not infinite)
                if (!isInf) await userRef.child('balance').transaction(val => (val || 0) + GANG_CREATE_COST);
                return res.json({ success: false, error: 'Zaten bir çetedesin!' });
            }

            // Check name uniqueness
            const gangsSnap = await db.ref('gangs').once('value');
            const gangs = gangsSnap.val() || {};
            const exists = Object.values(gangs).some(g => g.name.toLowerCase() === name.toLowerCase() || g.tag.toLowerCase() === tag.toLowerCase());

            if (exists) {
                // Refund (if not infinite)
                if (!isInf) await userRef.child('balance').transaction(val => (val || 0) + GANG_CREATE_COST);
                return res.json({ success: false, error: 'Bu isim veya etiket zaten kullanılıyor!' });
            }

            const gangId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

            const newGang = {
                id: gangId,
                name: name,
                tag: tag.toUpperCase(),
                baseCity: baseCity,
                leader: cleanUser,
                balance: 0,
                level: 1,
                members: {
                    [cleanUser]: { rank: 'leader', joinedAt: Date.now() }
                },
                memberCount: 1,
                createdAt: Date.now()
            };

            const updates = {};
            updates[`gangs/${gangId}`] = newGang;
            updates[`users/${cleanUser}/gang`] = gangId;
            updates[`users/${cleanUser}/gang_rank`] = 'leader';

            await db.ref().update(updates);
            addLog("Çete Kuruldu", `${cleanUser} tarafından [${tag}] ${name} kuruldu.`, "GLOBAL");

            res.json({ success: true, gang: newGang });

        } catch (innerError) {
            // Fatal Error -> Try Refund
            await userRef.child('balance').transaction(val => (val || 0) + GANG_CREATE_COST);
            throw innerError;
        }

    } catch (e) {
        console.error("Gang Create Error:", e);
        res.json({ success: false, error: 'Sunucu hatası' });
    }
});

// 4. LIST GANGS
app.get('/api/gang/list', async (req, res) => {
    try {
        const snap = await db.ref('gangs').once('value');
        const gangs = snap.val() || {};
        const list = Object.values(gangs).map(g => ({
            id: g.id,
            name: g.name,
            tag: g.tag,
            leader: g.leader,
            memberCount: g.members ? Object.keys(g.members).length : 0,
            baseCity: g.baseCity,
            level: g.level || 1
        })).sort((a, b) => b.memberCount - a.memberCount);

        res.json({ success: true, gangs: list });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// 5. JOIN REQUEST GANG (Request Basis)
app.post('/api/gang/join', async (req, res) => {
    try {
        const { username, gangId } = req.body;
        if (!username || !gangId) return res.json({ success: false, error: "Eksik bilgi" });

        const cleanUser = username.toLowerCase();
        const userRef = db.ref('users/' + cleanUser);
        const gangRef = db.ref('gangs/' + gangId);

        const userSnap = await userRef.once('value');
        const userD = userSnap.val();
        if (!userD) return res.json({ success: false, error: "Kullanıcı yok" });
        if (userD.gang) return res.json({ success: false, error: "Zaten bir çetedesin!" });

        const gangSnap = await gangRef.once('value');
        if (!gangSnap.exists()) return res.json({ success: false, error: "Çete bulunamadı" });

        // Check if already requested
        const reqSnap = await gangRef.child('requests').child(cleanUser).once('value');
        if (reqSnap.exists()) return res.json({ success: false, error: "Zaten katılım isteği göndermişsin. Onaylanması bekleniyor." });

        // Add to requests
        await gangRef.child('requests').child(cleanUser).set({
            requestedAt: Date.now()
        });

        res.json({ success: true, message: "Katılım isteği gönderildi! Lider veya Sağ Kol onayladığında katılacaksın." });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// 5b. PROCESS GANG REQUEST (Approve/Reject)
app.post('/api/gang/process-request', async (req, res) => {
    try {
        const { requester, targetUser, action, gangId } = req.body; // action: 'approve' or 'reject'
        console.log(`🔄 Gang Request: ${action} for ${targetUser} by ${requester} in ${gangId}`);

        if (!requester || !targetUser || !action || !gangId) {
            console.log("❌ Eksik veri:", { requester, targetUser, action, gangId });
            return res.json({ success: false, error: "Eksik veri" });
        }

        const gangRef = db.ref('gangs/' + gangId);
        const gangSnap = await gangRef.once('value');
        const gang = gangSnap.val();
        if (!gang) {
            console.log("❌ Çete bulunamadı:", gangId);
            return res.json({ success: false, error: "Çete bulunamadı" });
        }

        // 1. Check permission (Leader or Right Hand)
        const cleanRequester = requester.toLowerCase();
        const staff = gang.members[cleanRequester];
        console.log(`📋 Yetki kontrolü: ${cleanRequester}, rank: ${staff?.rank}`);

        if (!staff || (staff.rank !== 'leader' && staff.rank !== 'officer')) {
            return res.json({ success: false, error: "Bu işlem için yetkin yok! (Sadece Lider veya Sağ Kol)" });
        }

        const cleanTarget = targetUser.toLowerCase();

        if (action === 'approve') {
            // Check if target still exists and is not in another gang
            const targetUserRef = db.ref('users/' + cleanTarget);
            const targetUserSnap = await targetUserRef.once('value');
            const targetUserData = targetUserSnap.val();

            if (!targetUserData) {
                console.log("❌ Kullanıcı bulunamadı:", cleanTarget);
                return res.json({ success: false, error: "Kullanıcı bulunamadı" });
            }
            if (targetUserData.gang) {
                // If they joined another gang while waiting, remove request
                await gangRef.child('requests').child(cleanTarget).remove();
                console.log("❌ Kullanıcı zaten başka çetede:", targetUserData.gang);
                return res.json({ success: false, error: "Bu kullanıcı zaten başka bir çeteye katılmış." });
            }

            // --- LEVEL & CAPACITY CHECK ---
            const currentLevel = gang.level || 1;
            const capacities = { 1: 10, 2: 15, 3: 25, 4: 50, 5: 100 }; // Level 1 starts with 10 now
            const maxMembers = capacities[currentLevel] || 10;
            // Count current members safely
            const memberCount = gang.members ? Object.keys(gang.members).length : 0;

            if (memberCount >= maxMembers) {
                return res.json({ success: false, error: `Çete dolu! Seviye ${currentLevel} kapasitesi: ${maxMembers}. Kasa menüsünden seviye yükseltmelisiniz.` });
            }

            // JOIN LOGIC
            console.log(`✅ ${cleanTarget} çeteye ekleniyor...`);

            // A. Remove from requests
            await gangRef.child('requests').child(cleanTarget).remove();
            console.log("   ➤ Request silindi");

            // B. Add to members
            // Firebase keys cannot store '.', so we might need a safe key if username has dot.
            // Assuming cleanTarget is safe for now (as it is used in users/{cleanTarget}).
            await gangRef.child('members').child(cleanTarget).set({
                rank: 'member',
                joinedAt: Date.now()
            });
            console.log("   ➤ Members'a eklendi");

            // UPDATE MEMBER COUNT explicitly
            const currentMembersSnap = await gangRef.child('members').once('value');
            const cnt = currentMembersSnap.numChildren();
            await gangRef.child('memberCount').set(cnt);

            // C. Update user profile
            await targetUserRef.child('gang').set(gangId);
            await targetUserRef.child('gang_rank').set('member'); // Explicitly set rank
            console.log("   ➤ Kullanıcı profili güncellendi");

            res.json({ success: true, message: `${targetUser} çeteye dahil edildi!`, newMemberCount: cnt });
        } else {
            // Reject logic
            await gangRef.child('requests').child(cleanTarget).remove();
            console.log(`🚫 ${cleanTarget} isteği reddedildi`);
            res.json({ success: true, message: "İstek reddedildi." });
        }
    } catch (e) {
        console.error("Gang Process Error:", e);
        res.json({ success: false, error: e.message });
    }
});

// 6. GANG BANK & UPGRADE
app.post('/api/gang/deposit', async (req, res) => {
    try {
        const { username, amount, gangId } = req.body;
        const amt = parseInt(amount);
        if (isNaN(amt) || amt <= 0) return res.json({ success: false, error: "Geçersiz miktar" });

        const cleanUser = username.toLowerCase();
        const userRef = db.ref('users/' + cleanUser);
        const gangRef = db.ref('gangs/' + gangId);

        // Transaction for safety
        await userRef.child('balance').transaction(bal => {
            if ((bal || 0) < amt) return; // Abort
            return (bal || 0) - amt;
        }, async (error, committed, snapshot) => {
            if (error) return res.json({ success: false, error: "Sunucu hatası" });
            if (!committed) return res.json({ success: false, error: "Yetersiz bakiye!" });

            // Add to gang
            await gangRef.child('balance').transaction(b => (b || 0) + amt);

            res.json({ success: true, message: `${amt.toLocaleString()} 💰 kasaya yatırıldı!` });
        });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

app.post('/api/gang/upgrade', async (req, res) => {
    try {
        const { username, gangId } = req.body;
        const gangRef = db.ref('gangs/' + gangId);
        const gangSnap = await gangRef.once('value');
        const gang = gangSnap.val();

        if (!gang) return res.json({ success: false, error: "Çete bulunamadı" });

        // Permission (Leader only)
        if (gang.members[username.toLowerCase()]?.rank !== 'leader') {
            return res.json({ success: false, error: "Sadece lider seviye yükseltebilir!" });
        }

        const currentLevel = gang.level || 1;
        // COSTS: Lvl 1->2 (1M), 2->3 (5M), 3->4 (25M), 4->5 (100M)
        const costs = { 1: 1000000, 2: 5000000, 3: 25000000, 4: 100000000 };
        const nextLevel = currentLevel + 1;
        const cost = costs[currentLevel];

        if (!cost) return res.json({ success: false, error: "Zaten maksimum seviyedesiniz!" });

        if ((gang.balance || 0) < cost) {
            return res.json({ success: false, error: `Yetersiz kasa bakiyesi! Seviye ${nextLevel} için ${cost.toLocaleString()} 💰 var, ${cost.toLocaleString()} 💰 gerekiyor.` });
        }

        // Apply Upgrade with transaction for safety
        await gangRef.transaction(g => {
            if (!g) return g;
            if ((g.balance || 0) < cost) return; // double check
            g.balance -= cost;
            g.level = (g.level || 1) + 1;
            return g;
        }, (error, committed, snapshot) => {
            if (error || !committed) return res.json({ success: false, error: "İşlem sırasında hata oluştu veya bakiye yetersiz." });
            res.json({ success: true, message: `TEBRİKLER! Çete Seviyesi ${nextLevel} oldu! Yeni kapasite ve özellikler aktif.` });
        });

    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// --- IMMEDIATE STOCK FIX (One-time run on server restart/update) ---
(async function enforceStockLimitsNow() {
    try {
        console.log("🔧 Stock Limits Enforcement Started...");
        const stockRef = db.ref('global_stocks');
        const snap = await stockRef.once('value');
        const stocks = snap.val();
        if (!stocks) return;

        const updates = {};
        for (const [code, data] of Object.entries(stocks)) {
            const maxChangeLimit = 25 + (code.charCodeAt(0) % 26); // 25-50%
            let dailyStartPrice = data.daily_start_price;

            // If no daily start, assume current is start (can't fix what we don't know), 
            // BUT if price is suspiciously high/low vs oldPrice, we might want to stabilize.
            // For now, only clamp if we have a baseline.
            if (!dailyStartPrice) continue;

            let newPrice = data.price;
            const currentChange = ((newPrice - dailyStartPrice) / dailyStartPrice) * 100;

            if (currentChange > maxChangeLimit) {
                newPrice = Math.floor(dailyStartPrice * (1 + maxChangeLimit / 100));
                updates[`${code}/price`] = newPrice;
                updates[`${code}/trend`] = 1; // It's still 'up' technically, just capped
                console.log(`📉 Clamping ${code}: ${data.price} -> ${newPrice} (Max +${maxChangeLimit}%)`);
            } else if (currentChange < -maxChangeLimit) {
                newPrice = Math.ceil(dailyStartPrice * (1 - maxChangeLimit / 100));
                updates[`${code}/price`] = newPrice;
                updates[`${code}/trend`] = -1;
                console.log(`📈 Clamping ${code}: ${data.price} -> ${newPrice} (Max -${maxChangeLimit}%)`);
            }
        }

        if (Object.keys(updates).length > 0) {
            await stockRef.update(updates);
            console.log("✅ All stocks clamped to daily limits.");
        }
    } catch (e) { console.error("Stock Fix Error:", e); }
})();

// 6. GET GANG INFO
app.post('/api/gang/info', async (req, res) => {
    try {
        const { gangId } = req.body;
        if (!gangId) return res.json({ success: false });

        const snap = await db.ref(`gangs/${gangId}`).once('value');
        const gang = snap.val();

        if (!gang) return res.json({ success: false, error: 'Çete bulunamadı' });
        res.json({ success: true, gang });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// 3. GANG ACTION: DONATE (Kasa)
app.post('/api/gang/donate', async (req, res) => {
    try {
        const { username, amount } = req.body;
        const amt = parseInt(amount);
        if (isNaN(amt) || amt <= 0) return res.json({ success: false, error: 'Geçersiz miktar' });

        const cleanUser = username.toLowerCase();

        // --- SECURITY & RACE CONDITION FIX ---
        const userRef = db.ref(`users/${cleanUser}`);

        // 1. First, verify user is in a gang (Snapshot read)
        const userSnap = await userRef.once('value');
        const u = userSnap.val();
        if (!u || !u.gang) return res.json({ success: false, error: 'Bir çeteye üye değilsin.' });

        const gangRef = db.ref(`gangs/${u.gang}`);

        // 2. Transaction on User Balance (DEDUCT)
        const tx = await userRef.child('balance').transaction((current) => {
            if (current === null) return current;
            if (current < amt) return; // Abort if insufficient
            return current - amt;
        });

        if (tx.committed) {
            // 3. If successful, add to Gang Balance (ADD)
            // Even if this fails (rare), the money is burned (economy sink), which is safer than infinite money glich.
            await gangRef.child('balance').transaction((val) => (val || 0) + amt);

            const newBalance = tx.snapshot.val();
            res.json({ success: true, newBalance: newBalance });
        } else {
            return res.json({ success: false, error: 'Yetersiz bakiye veya işlem çakışması.' });
        }

    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// 4. GANG ACTION: KICK MEMBER
// 5c. PROMOTE/DEMOTE MEMBER
app.post('/api/gang/promote', async (req, res) => {
    try {
        const { requester, targetUser, newRank, gangId } = req.body;
        if (!requester || !targetUser || !newRank || !gangId) return res.json({ success: false, error: "Eksik veri" });

        const gangRef = db.ref('gangs/' + gangId);
        const gangSnap = await gangRef.once('value');
        const gang = gangSnap.val();
        if (!gang) return res.json({ success: false, error: "Çete bulunamadı" });

        // Only Leader can promote/demote
        if (gang.leader.toLowerCase() !== requester.toLowerCase()) {
            return res.json({ success: false, error: "Sadece çete lideri rütbe değiştirebilir!" });
        }

        const cleanTarget = targetUser.toLowerCase();
        if (!gang.members[cleanTarget]) return res.json({ success: false, error: "Kullanıcı bu çetede değil" });
        if (cleanTarget === requester.toLowerCase()) return res.json({ success: false, error: "Kendi rütbeni değiştiremezsin" });

        // Update rank
        await gangRef.child('members').child(cleanTarget).child('rank').set(newRank);

        res.json({ success: true, message: `${targetUser} yeni rütbesi: ${newRank === 'officer' ? 'Sağ Kol' : 'Üye'}` });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

app.post('/api/gang/kick', async (req, res) => {
    try {
        const { requester, target, gangId } = req.body;
        if (!requester || !target || !gangId) return res.json({ success: false, error: "Eksik veri" });

        const gangRef = db.ref('gangs/' + gangId);
        const snap = await gangRef.once('value');
        const gang = snap.val();

        if (!gang) return res.json({ success: false, error: "Çete bulunamadı" });

        const cleanReq = requester.toLowerCase();
        const cleanTarget = target.toLowerCase();

        const reqMemberData = gang.members[cleanReq];
        const targetMemberData = gang.members[cleanTarget];

        if (!reqMemberData) return res.json({ success: false, error: "Yetkisiz işlem" });
        if (!targetMemberData) return res.json({ success: false, error: "Kullanıcı çetede değil" });

        // Rank Check
        let canKick = false;
        if (reqMemberData.rank === 'leader' && cleanReq !== cleanTarget) canKick = true;
        if (reqMemberData.rank === 'officer' && targetMemberData.rank === 'member') canKick = true;

        if (!canKick) return res.json({ success: false, error: "Bu kullanıcıyı atmaya yetkin yok!" });

        // Kick Process
        await gangRef.child('members').child(cleanTarget).remove();
        await db.ref('users/' + cleanTarget).child('gang').remove();

        // UPDATE MEMBER COUNT explicitly
        const currentMembersSnap = await gangRef.child('members').once('value');
        const cnt = currentMembersSnap.numChildren();
        await gangRef.child('memberCount').set(cnt);

        res.json({ success: true, message: "Kullanıcı çeteden atıldı." });

    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

app.post('/api/gang/leave', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.json({ success: false, error: "Eksik veri" });

        const cleanUser = username.toLowerCase();
        const userRef = db.ref('users/' + cleanUser);
        const userSnap = await userRef.once('value');
        const userData = userSnap.val();

        if (!userData || !userData.gang) return res.json({ success: false, error: "Zaten bir çetede değilsin" });

        const gangId = userData.gang;
        const gangRef = db.ref('gangs/' + gangId);
        const gangSnap = await gangRef.once('value');
        const gang = gangSnap.val();

        if (!gang) {
            // Clean up stale gang reference
            await userRef.child('gang').remove();
            return res.json({ success: true, message: "Geçersiz çete referansı temizlendi." });
        }

        const myMemberData = gang.members?.[cleanUser];
        if (!myMemberData) {
            await userRef.child('gang').remove();
            return res.json({ success: true, message: "Çete kaydı zaten silinmiş." });
        }

        if (myMemberData.rank === 'leader') {
            // DISBAND GANG (If leader leaves, gang is gone)
            const members = Object.keys(gang.members || {});
            const updates = {};
            members.forEach(m => {
                updates[`users/${m}/gang`] = null;
            });
            updates[`gangs/${gangId}`] = null;
            await db.ref().update(updates);
            return res.json({ success: true, message: "Çete lideri ayrıldığı için çete feshedildi." });
        } else {
            // REGULAR LEAVE
            await gangRef.child('members').child(cleanUser).remove();
            await userRef.child('gang').remove();

            // UPDATE MEMBER COUNT explicitly
            const currentMembersSnap = await gangRef.child('members').once('value');
            const cnt = currentMembersSnap.numChildren();
            await gangRef.child('memberCount').set(cnt);

            return res.json({ success: true, message: "Çeteden ayrıldın." });
        }


    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

app.post('/admin-api/remove-property', authAdmin, hasPerm('users'), async (req, res) => {
    const { user, index } = req.body;
    if (!user || index === undefined) return res.status(400).json({ error: "Eksik bilgi" });

    try {
        const cleanUser = user.toLowerCase();
        const ref = db.ref(`users/${cleanUser}/properties`);
        const snap = await ref.once('value');
        let properties = snap.val() || [];

        if (!Array.isArray(properties) && typeof properties === 'object') {
            properties = Object.values(properties);
        }

        if (index >= 0 && index < properties.length) {
            const removed = properties.splice(index, 1)[0]; // Get the removed item
            await ref.set(properties); // Update user props

            // SYNC WITH GLOBAL MARKET
            if (removed && removed.city && removed.id) {
                // Find city key
                const mapEn = { "İstanbul": "ISTANBUL", "Ankara": "ANKARA", "İzmir": "IZMIR", "Antalya": "ANTALYA", "Bursa": "BURSA" };
                const cityId = mapEn[removed.city] || removed.city.toUpperCase();

                const marketCityRef = db.ref(`real_estate_market/${cityId}`);
                const marketSnap = await marketCityRef.once('value');
                if (marketSnap.exists()) {
                    const marketProps = marketSnap.val();
                    // marketProps can be object or array
                    let targetKey = null;
                    for (const key in marketProps) {
                        if (marketProps[key].id === removed.id) {
                            targetKey = key;
                            break;
                        }
                    }

                    if (targetKey !== null) {
                        await marketCityRef.child(targetKey).child('owner').remove();
                        await marketCityRef.child(targetKey).child('ownerName').remove();
                        await marketCityRef.child(targetKey).child('purchaseTime').remove();
                        console.log(`[Admin] Mülk marketten de düşürüldü: ${cityId}/${removed.id}`);
                    }
                }
            }

            addLog("Emlak Silme", `${user} kullanıcısından ${removed?.name || 'Mülk'} silindi ve marketten boşa çıkarıldı.`);
            res.json({ success: true });
        } else {
            res.status(400).json({ error: "Geçersiz indeks" });
        }
    } catch (e) {
        console.error("Remove Property Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Arka plan görevleri (Mute, TTS, Ses bildirimleri)

// ---------------------------------------------------------
// 7. BACKGROUND EVENT LISTENERS (SHOP MUTE ETC)
// ---------------------------------------------------------
// --- DUPLICATE PREVENTION ---
const processedWebhooks = new Set();
setInterval(() => processedWebhooks.clear(), 300000); // 5 dakikada bir temizle

db.ref('channels').on('child_added', (snapshot) => {
    const channelId = snapshot.key;
    // Market Susturma (Mute) Dinleyicisi
    db.ref(`channels/${channelId}/stream_events/mute`).on('child_added', async (snap) => {
        const event = snap.val();
        if (event && !event.executed) {
            // Idempotency Check
            if (processedWebhooks.has(snap.key)) return;
            processedWebhooks.add(snap.key);

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
            // Idempotency Check
            if (processedWebhooks.has(snap.key)) return;
            processedWebhooks.add(snap.key);

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
            // Idempotency Check
            if (processedWebhooks.has(snap.key)) return;
            processedWebhooks.add(snap.key);

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

app.post('/admin-api/all-users', authAdmin, async (req, res) => {
    const { search } = req.body;
    try {
        let ref = db.ref('users');
        let query = ref.orderByKey();

        if (search) {
            query = query.startAt(search).endAt(search + "\uf8ff");
        } else {
            query = query.limitToFirst(500);
        }

        const snap = await query.once('value');
        const users = snap.val() || {};
        res.json(users);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

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




// Not: Duplicate 'sendChatMessage' kaldırıldı. Dosyanın üst kısmındaki V9 versiyonu kullanılmaktadır.



// ---------------------------------------------------------
// DEVLOG / DUYURU YÖNETİMİ API'leri (Admin Panel)
// ---------------------------------------------------------
app.get('/admin-api/devlogs', authAdmin, async (req, res) => {
    try {
        const snap = await db.ref('devlogs').orderByChild('timestamp').limitToLast(50).once('value');
        const devlogs = snap.val() || {};
        const list = Object.entries(devlogs).map(([id, d]) => ({ id, ...d })).sort((a, b) => b.timestamp - a.timestamp);
        res.json({ success: true, devlogs: list });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

app.post('/admin-api/devlog/add', authAdmin, async (req, res) => {
    try {
        const { text, type } = req.body;
        if (!text) return res.json({ success: false, error: "Metin gerekli" });

        const newDevlog = {
            text,
            type: type || 'GÜNCELLEME',
            timestamp: Date.now(),
            addedBy: req.adminUser.username
        };

        await db.ref('devlogs').push(newDevlog);

        // Sadece son 20 devlog tut
        const snap = await db.ref('devlogs').once('value');
        const all = snap.val() || {};
        const keys = Object.keys(all);
        if (keys.length > 20) {
            const sortedKeys = keys.sort((a, b) => all[a].timestamp - all[b].timestamp);
            const toRemove = sortedKeys.slice(0, keys.length - 20);
            const updates = {};
            toRemove.forEach(k => updates[k] = null);
            await db.ref('devlogs').update(updates);
        }

        addLog("Devlog Eklendi", `${req.adminUser.username}: ${text.substring(0, 50)}...`);
        res.json({ success: true, message: "Duyuru eklendi!" });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

app.post('/admin-api/devlog/delete', authAdmin, async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) return res.json({ success: false, error: "ID gerekli" });

        await db.ref(`devlogs/${id}`).remove();
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// ---------------------------------------------------------
// MANUEL PİYASA HABERİ API'leri (Admin Panel)
// ---------------------------------------------------------
app.get('/admin-api/news/templates', authAdmin, async (req, res) => {
    try {
        // Tüm haber şablonlarını döndür
        const templates = {
            GOOD: NEWS_TEMPLATES.GOOD.slice(0, 30), // İlk 30
            BAD: NEWS_TEMPLATES.BAD.slice(0, 30)
        };
        res.json({ success: true, templates });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

app.post('/admin-api/news/send', authAdmin, async (req, res) => {
    try {
        const { text, type } = req.body;
        if (!text || !type) return res.json({ success: false, error: "Metin ve tip gerekli" });

        // Stock kodlarını bul ve rastgele seç
        const stockSnap = await db.ref('global_stocks').once('value');
        const stocks = stockSnap.val() || {};
        const stockCodes = Object.keys(stocks);
        const randomCoin = stockCodes[Math.floor(Math.random() * stockCodes.length)] || 'ALTIN';

        // {coin} placeholder'ını değiştir
        const finalText = text.replace(/\{coin\}/g, randomCoin);

        await db.ref('global_news').push({
            text: finalText,
            timestamp: Date.now(),
            type: type.toUpperCase()
        });

        addLog("Manuel Haber", `${req.adminUser.username}: [${type}] ${finalText.substring(0, 50)}...`);
        res.json({ success: true, message: `Haber yayınlandı: ${finalText.substring(0, 50)}...` });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

app.post('/admin-api/news/send-custom', authAdmin, async (req, res) => {
    try {
        const { text, type, coin } = req.body;
        if (!text || !type) return res.json({ success: false, error: "Metin ve tip gerekli" });

        // Coin'i metindeki {coin}'e yerleştir
        let finalText = text;
        if (coin) {
            finalText = text.replace(/\{coin\}/g, coin);
        }

        await db.ref('global_news').push({
            text: finalText,
            timestamp: Date.now(),
            type: type.toUpperCase()
        });

        addLog("Özel Haber", `${req.adminUser.username}: [${type}] ${finalText.substring(0, 50)}...`);
        res.json({ success: true, message: `Haber yayınlandı!` });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// --- SERVER START ---
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

    setInterval(syncChannelStats, 60000);
});
