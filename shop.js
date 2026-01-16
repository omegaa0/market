// shop.js - Dynamic Channel Market Implementation
const firebaseConfig = {
    apiKey: "AIzaSyCfAiqV9H8I8pyusMyDyxSbjJ6a3unQaR8",
    authDomain: "kickbot-market.firebaseapp.com",
    databaseURL: "https://kickbot-market-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "kickbot-market",
    storageBucket: "kickbot-market.firebasestorage.app",
    messagingSenderId: "301464297024",
    appId: "1:301464297024:web:7cdf849aa950b8ba0649a5"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// EĞİTİM & MESLEK VERİLERİ (SERVER İLE SENKRON)
const EDUCATION = {
    0: "Cahil", 1: "İlkokul", 2: "Ortaokul", 3: "Lise",
    4: "Üniversite", 5: "Yüksek Lisans", 6: "Doktora", 7: "Profesör"
};
const EDU_XP = [0, 2500, 5000, 10000, 25000, 40000, 75000, 200000]; // Düşürüldü

// --- RPG CONSTANTS ---
const RPG_WEAPONS = {
    "yumruk": { name: "Çıplak El", dmg: 5, price: 0, icon: "✊" },
    "sopa": { name: "Tahta Sopa", dmg: 12, price: 5000, icon: "🪵" },
    "bicak": { name: "Paslı Bıçak", dmg: 20, price: 15000, icon: "🔪" },
    "kilic": { name: "Demir Kılıç", dmg: 35, price: 50000, icon: "⚔️" },
    "balta": { name: "Savaş Baltası", dmg: 55, price: 120000, icon: "🪓" },
    "katana": { name: "Katana", dmg: 80, price: 300000, icon: "🗡️" },
    "lazer": { name: "Lazer Tabancası", dmg: 150, price: 1000000, icon: "🔫" }
};

const RPG_ARMORS = {
    "tisort": { name: "Yırtık Tişört", def: 0, hp: 0, price: 0, icon: "👕" },
    "deri": { name: "Deri Ceket", def: 5, hp: 50, price: 7500, icon: "🧥" },
    "yelek": { name: "Çelik Yelek", def: 15, hp: 150, price: 40000, icon: "🦺" },
    "zirh": { name: "Şövalye Zırhı", def: 30, hp: 400, price: 150000, icon: "🛡️" },
    "nano": { name: "Nano Suit", def: 60, hp: 1000, price: 500000, icon: "🤖" },
    "kral": { name: "Kraliyet Zırhı", def: 100, hp: 2500, price: 2000000, icon: "👑" }
};

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

// Global Variables
let currentUser = null;
let currentChannelId = null;
const FREE_COMMANDS = [
    { cmd: "!market", desc: "Market linkini sohbete atar." },
    { cmd: "!bakiye", desc: "Mevcut paranızı gösterir." },
    { cmd: "!yazitura <miktar> <y/t>", desc: "Yazı tura atar (x2 kazanç)." },
    { cmd: "!slot <miktar>", desc: "Slot makinesini çevirir." },
    { cmd: "!kutu <miktar> <1-3>", desc: "Kutu açma oyunu (1, 2 veya 3)." },
    { cmd: "!zenginler", desc: "En zengin ilk 5 kişiyi listeler." },
    { cmd: "!transfer @kisi <miktar>", desc: "Arkadaşına para gönderir." },
    { cmd: "!duello @kisi <miktar>", desc: "Bahisli düello teklif eder." },
    { cmd: "!kabul", desc: "Gelen düello teklifini kabul eder." },
    { cmd: "!reddet", desc: "Gelen düello teklifini reddeder." },
    { cmd: "!rusruleti @kisi <miktar>", desc: "Rus ruleti teklif eder (timeout riski)." },
    { cmd: "!ruskabul", desc: "Rus ruleti teklifini kabul eder." },
    { cmd: "!soygun", desc: "Kanalda soygun başlatır veya katıl." },
    { cmd: "!profil", desc: "Detaylı profilinizi gösterir." },
    { cmd: "!meslek", desc: "Mevcut mesleğinizi gösterir." },
    { cmd: "!calis", desc: "Çalışıp maaş alırsınız (30dk süre)." },
    { cmd: "!fal", desc: "Günün falına bakar." },
    { cmd: "!burç <burç>", desc: "Günlük burç yorumu." },
    { cmd: "!efkar", desc: "Efkar seviyenizi ölçer." },
    { cmd: "!söz", desc: "Günün sözünü paylaşır." },
    { cmd: "!şarkıöner", desc: "Rastgele şarkı önerir." },
    { cmd: "!8top <soru>", desc: "Sihirli 8 top cevaplar." },
    { cmd: "!iq", desc: "IQ seviyenizi ölçer." },
    { cmd: "!şans", desc: "Günlük şans ölçer." },
    { cmd: "!kişilik", desc: "Kişilik analizi yapar." },
    { cmd: "!zar", desc: "İki zar atar." },
    { cmd: "!ırk", desc: "Genetik ırk analizi." },
    { cmd: "!ship <ops:kisi>", desc: "Aşk uyumu ölçer." },
    { cmd: "!hava <şehir>", desc: "Hava durumunu gösterir." },
    { cmd: "!troll <salla/bsod/glitch>", desc: "Yayıncıyı troller (Ücretli)." },
    { cmd: "!hangisi <A> mı <B> mi", desc: "Bot bir seçim yapar." }
];

let currentPreview = null;
let currentPreviewTimeout = null;

function renderFreeCommands() {
    const container = document.getElementById('commands-grid');
    if (!container) return;
    container.innerHTML = "";

    FREE_COMMANDS.forEach(fc => {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.style.padding = "15px";
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <code style="color:var(--primary); font-weight:bold; font-size:0.95rem;">${fc.cmd}</code>
            </div>
            <p style="margin:8px 0 0 0; color:#aaa; font-size:0.85rem;">${fc.desc}</p>
        `;
        container.appendChild(card);
    });
}

// Devlog/Duyuru sistemini yükle
async function loadDevlogs() {
    const container = document.getElementById('devlog-content');
    if (!container) return;

    try {
        const res = await fetch('/api/announcements');
        const devlogs = await res.json();

        if (!devlogs || devlogs.length === 0) {
            container.innerHTML = '<div style="color:#666; font-size:0.8rem;">Henüz duyuru yok.</div>';
            return;
        }

        container.innerHTML = '';

        devlogs.slice(0, 10).forEach(log => {
            const date = new Date(log.timestamp);
            const dateStr = date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });

            const typeClass = `badge-${log.type || 'info'}`;
            const item = document.createElement('div');
            item.className = `announcement-item ${typeClass}`;
            // Inline styles removed, handled by shop.css

            item.innerHTML = `
                <div class="ann-header">
                    <span class="ann-type">${(log.type || 'info')}</span>
                    <span class="ann-date">${dateStr}</span>
                </div>
                <div class="ann-text">${log.text}</div>
            `;
            container.appendChild(item);
        });
    } catch (e) {
        console.error("Devlog yükleme hatası:", e);
        container.innerHTML = '<div style="color:#666; font-size:0.8rem;">Duyurular yüklenemedi.</div>';
    }
}

function init() {
    console.log("Market initialized");
    const savedUser = localStorage.getItem('aloskegang_user');
    renderFreeCommands();
    loadDevlogs(); // Duyuruları yükle

    if (savedUser) {
        login(savedUser);
    } else {
        showAuth();
    }

    const genBtn = document.getElementById('generate-code-btn');
    if (genBtn) {
        // Remove old listeners to be safe (though not strictly possible easily without reference, but init runs once usually)
        genBtn.replaceWith(genBtn.cloneNode(true));
        document.getElementById('generate-code-btn').addEventListener('click', startAuth);
    }

    const backBtn = document.getElementById('back-btn');
    if (backBtn) backBtn.addEventListener('click', showAuth);

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    // FORCE LOGOUT LISTENER
    db.ref('system/force_logout').on('value', (snap) => {
        const serverTs = snap.val();
        if (!serverTs) return;

        const localTs = localStorage.getItem('last_processed_logout') || 0;

        // Eğer sunucudaki logout emri, benim son işlemimden (veya girişimden) yeniyse
        if (serverTs > localTs) {
            console.log("FORCE LOGOUT RECEIVED");
            localStorage.setItem('last_processed_logout', serverTs);
            if (currentUser) {
                logout();
                showToast("Admin tarafından çıkış yaptırıldı.", "warning");
            }
        }
    });
    // ... (init function ends)
}

window.addEventListener('DOMContentLoaded', init);

function showAuth() {
    const authContainer = document.getElementById('auth-container');
    const mainContent = document.getElementById('main-content');
    const step1 = document.getElementById('step-1');
    const step2 = document.getElementById('step-2');

    if (authContainer) authContainer.classList.remove('hidden');
    if (mainContent) mainContent.classList.add('hidden');
    if (step1) step1.classList.remove('hidden');
    if (step2) step2.classList.add('hidden');
    db.ref('pending_auth').off();
}

function startAuth() {
    const usernameInput = document.getElementById('username-input');
    const user = usernameInput.value.toLowerCase().trim();
    if (user.length < 3) return showToast("Geçersiz kullanıcı adı!", "error");

    // Özel karakter kontrolü
    if (/[.#$\[\]]/.test(user)) return showToast("Kullanıcı adı geçersiz karakterler içeriyor!", "error");

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    const codeDisplay = document.getElementById('auth-code');
    const cmdExample = document.getElementById('cmd-example');
    const step1 = document.getElementById('step-1');
    const step2 = document.getElementById('step-2');

    // UI'yi hemen güncelle ki kullanıcı beklediğini anlasın
    if (codeDisplay) codeDisplay.innerText = code;
    if (cmdExample) cmdExample.innerText = `!doğrulama ${code}`;
    if (step1) step1.classList.add('hidden');
    if (step2) step2.classList.remove('hidden');

    showToast("Kod oluşturuldu, kaydediliyor...", "success");

    db.ref('pending_auth/' + user).set({ code, timestamp: Date.now() })
        .then(() => {
            console.log(`[Shop] Auth code WRITE commanded for ${user}: ${code}`);

            // Onay bekleyen dinleyiciyi kur
            db.ref('auth_success/' + user).off(); // Eski varsa temizle
            db.ref('auth_success/' + user).on('value', (snap) => {
                const result = snap.val();
                if (result) {
                    // Check if it's the new object format with token or legacy boolean
                    if (result.token) {
                        localStorage.setItem('aloskegang_token', result.token);
                    }

                    db.ref('auth_success/' + user).remove();
                    db.ref('auth_success/' + user).off();
                    login(user);
                    showToast("Giriş Başarılı! Hoş geldin.", "success");
                }
            });
        })
        .catch(err => {
            console.error("Auth Firebase Error:", err);
            showToast("Bağlantı hatası! Firebase yetkilerini kontrol edin.", "error");
            // Hata varsa geri dön
            if (step1) step1.classList.remove('hidden');
            if (step2) step2.classList.add('hidden');
        });
}

function getTodayKey() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
}

// Helper to fetch user data securely (Cache > DB > API)
async function getUserData() {
    // 1. Try Cache
    if (lastUserData) return lastUserData;
    if (!currentUser) return {};

    // 2. Try DB
    try {
        const snap = await db.ref('users/' + currentUser).once('value');
        const val = snap.val();
        if (val) return val;
    } catch (e) { }

    // 3. Try API
    try {
        const res = await fetch('/api/user/' + currentUser, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('aloskegang_token')}` }
        });
        const data = await res.json();
        if (data && !data.error) return data;
    } catch (e) { }

    return {};
}

async function fetchKickPFP(username) {
    try {
        const pfpImg = document.getElementById('user-pfp');
        const pfpFallback = document.getElementById('user-pfp-fallback');

        const res = await fetch(`/api/kick/pfp/${username}`);
        if (!res.ok) throw new Error("PFP API error");
        const data = await res.json();

        if (data.pfp) {
            if (pfpImg) {
                pfpImg.src = data.pfp;
                pfpImg.onload = () => {
                    pfpImg.style.display = 'block';
                    if (pfpFallback) pfpFallback.style.display = 'none';
                };
            }
        }
    } catch (e) {
        // Fallback remains
    }
}

// ... (FREE_COMMANDS array kept as is, skipping lines for brevity if using replace_file_content smartly, but here I replace the init block mostly)

// ...

function login(user) {
    currentUser = user;
    localStorage.setItem('aloskegang_user', user);

    // Set login/processed time to now to avoid immediate logout from old signals
    if (!localStorage.getItem('last_processed_logout')) {
        localStorage.setItem('last_processed_logout', Date.now());
    }
    // Alternatively, always updating on login might be safer to ensure fresh session ignores old signals
    localStorage.setItem('last_processed_logout', Date.now());

    const authContainer = document.getElementById('auth-container');
    const mainContent = document.getElementById('main-content');
    if (authContainer) authContainer.classList.add('hidden');
    if (mainContent) mainContent.classList.remove('hidden');

    const dispName = document.getElementById('display-name');
    const heroName = document.getElementById('hero-name');
    if (dispName) dispName.innerText = user.toUpperCase();
    if (heroName) heroName.innerText = user.toUpperCase();

    // Setup PFP
    const fallback = document.getElementById('user-pfp-fallback');
    if (fallback) fallback.innerText = user[0].toUpperCase();
    fetchKickPFP(user);

    // 1. Firebase Listener (Standart)
    db.ref('users/' + user).on('value', (snap) => {
        const data = snap.val();
        // Eğer Firebase'den veri gelirse UI güncelle, gelmezse (null) API deneriz
        if (data) updateUserUI(data);
    });

    // 2. API Fallback (Firebase Rules engelliyorsa burası çalışır)
    fetch('/api/user/' + user)
        .then(res => res.json())
        .then(data => {
            if (data && !data.error) updateUserUI(data);
        })
        .catch(e => console.log("User API fetch failed:", e));

    // Default tab
    setTimeout(() => switchTab('market'), 100);
}

let lastUserData = null;
function updateUserUI(data) {
    if (!data) return;
    lastUserData = data; // Diğer fonksiyonlar için cache

    const balanceEl = document.getElementById('user-balance');
    if (balanceEl) {
        if (data.is_infinite) {
            balanceEl.innerText = `Omega'nın Kartı 💳♾️`;
            balanceEl.style.background = 'linear-gradient(135deg, #FFD700, #FFA500)';
            balanceEl.style.color = '#000';
        } else {
            balanceEl.innerText = `${(data.balance || 0).toLocaleString()} 💰`;
            balanceEl.style.background = '';
            balanceEl.style.color = '';
        }
    }

    if (data.auth_channel && data.auth_channel !== currentChannelId) {
        currentChannelId = data.auth_channel;
        loadChannelMarket(currentChannelId);
    } else if (!data.auth_channel) {
        const noChanMsg = document.getElementById('no-channel-msg');
        const marketGrid = document.getElementById('market-items');
        const channelBadge = document.getElementById('channel-badge');
        const marketStat = document.getElementById('market-status');

        if (noChanMsg) noChanMsg.classList.remove('hidden');
        if (marketGrid) marketGrid.innerHTML = "";
        if (channelBadge) channelBadge.classList.add('hidden');
        if (marketStat) marketStat.innerText = "Market ürünlerini görmek için herhangi bir kanalda !doğrulama yapmalısın.";
    }
    // Her oturum açışta kariyer sekmesini yükle (varsayılan sekme yaptık)
    loadCareer();
}

async function loadChannelMarket(channelId) {
    document.getElementById('no-channel-msg').classList.add('hidden');
    const channelBadge = document.getElementById('channel-badge');
    if (channelBadge) channelBadge.classList.remove('hidden');
    const snap = await db.ref('channels/' + channelId).once('value');
    const channelData = snap.val() || {};
    const settings = channelData.settings || {};
    const sounds = settings.custom_sounds || {};

    const chanName = channelData.username || "Kick Kanalı";
    document.getElementById('chan-name').innerText = chanName;

    // Broadcaster PFP Fetch via Proxy
    try {
        const chanPfpImg = document.getElementById('chan-pfp');
        const chanPfpFallback = document.getElementById('chan-pfp-fallback');

        const res = await fetch(`/api/kick/pfp/${chanName}`);
        if (!res.ok) throw new Error("PFP error");
        const data = await res.json();

        if (data.pfp) {
            chanPfpImg.src = data.pfp;
            chanPfpImg.onload = () => {
                chanPfpImg.style.display = 'block';
                if (chanPfpFallback) chanPfpFallback.style.display = 'none';
            };
            chanPfpImg.onerror = () => {
                chanPfpImg.style.display = 'none';
                if (chanPfpFallback) chanPfpFallback.style.display = 'flex';
            };
        } else {
            throw new Error("No pfp data");
        }
    } catch (e) {
        console.log("Broadcaster PFP error", e);
        const chanPfpImg = document.getElementById('chan-pfp');
        const chanPfpFallback = document.getElementById('chan-pfp-fallback');
        if (chanPfpImg) chanPfpImg.style.display = 'none';
        if (chanPfpFallback) {
            chanPfpFallback.innerText = chanName[0].toUpperCase();
            chanPfpFallback.style.display = 'flex';
        }
    }

    // Side GIFs Update
    const defaultGif = "https://media.giphy.com/media/3o7TKMGpxPucV0G3S0/giphy.gif";

    const getGifUrl = (val) => {
        if (!val) return defaultGif;
        if (val.startsWith('http')) return val;
        return `/${val}`; // Support for local files in root
    };

    const leftGif = getGifUrl(settings.left_gif);
    const rightGif = getGifUrl(settings.right_gif);

    const leftGifEl = document.querySelector('.side-gif.left img');
    const rightGifEl = document.querySelector('.side-gif.right img');

    if (leftGifEl) {
        leftGifEl.src = leftGif;
        leftGifEl.onerror = () => { leftGifEl.src = defaultGif; };
    }
    if (rightGifEl) {
        rightGifEl.src = rightGif;
        rightGifEl.onerror = () => { rightGifEl.src = defaultGif; };
    }

    document.getElementById('market-status').innerText = `${chanName} market ürünleri yönetiliyor.`;
    const marketGrid = document.getElementById('market-items');
    if (marketGrid) marketGrid.innerHTML = "";

    const isEnabled = (cmd) => settings[cmd] !== false;

    // 1. MUTE
    const muteCost = settings.mute_cost || 10000;
    renderItem("🚫 Kullanıcı Sustur", "Hedeflenen kişiyi 2 dakika boyunca susturur.", muteCost, "mute", "", "", 0, !isEnabled('sustur'));

    // 2. TTS
    const ttsCost = settings.tts_cost || 2500;
    renderItem("🎙️ TTS (Sesli Mesaj)", "Mesajınızı yayında farklı seslerle seslendirir. (Maks 500 karakter)", ttsCost, "tts", "", "", 0, !isEnabled('tts'));

    // 3. SR
    const srCost = settings.sr_cost || 5000;
    renderItem("🎵 Şarkı İsteği (!sr)", "YouTube'dan istediğiniz şarkıyı açar.", srCost, "sr", "", "", 0, !isEnabled('sr'));

    // 4. SOUNDS
    Object.entries(sounds).forEach(([name, data]) => {
        renderItem(`🎵 Ses: !ses ${name}`, "Kanalda özel ses efekti çalar.", data.cost, "sound", name, data.url, data.duration || 0, !isEnabled('ses'));
    });
}

function renderItem(name, desc, price, type, trigger = "", soundUrl = "", duration = 0, isDisabled = false) {
    const marketGrid = document.getElementById('market-items');
    if (!marketGrid) return;

    const card = document.createElement('div');
    card.className = `item-card ${isDisabled ? 'disabled' : ''}`;
    const icon = type === 'tts' ? '🎙️' : (type === 'mute' ? '🚫' : (type === 'sr' ? '🎵' : '🎼'));

    card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div class="item-icon">${icon}</div>
            ${type === 'sound' && !isDisabled ? `
                <div style="display:flex; gap:10px;">
                    <button onclick="previewShopSound('${soundUrl}', ${duration})" style="background:none; border:none; color:var(--primary); cursor:pointer; font-size:1.5rem; padding:0;">▶️</button>
                    <button onclick="stopAllPreviews()" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size:1.5rem; padding:0;">⏹️</button>
                </div>
            ` : ''}
            ${isDisabled ? `<span class="disabled-label">DEVREDIŞI</span>` : ''}
        </div>
        <h3>${name}</h3>
        <p>${desc}</p>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
            <span class="price-tag" style="margin:0;">${parseInt(price).toLocaleString()} 💰</span>
            ${duration > 0 ? `<small style="color:#666">${duration}sn</small>` : ''}
        </div>
        <button class="buy-btn" ${isDisabled ? 'disabled' : ''} onclick="executePurchase('${type}', '${trigger}', ${price})">
            ${isDisabled ? 'Kapalı' : 'Hemen Uygula'}
        </button>
    `;
    marketGrid.appendChild(card);
}

function previewShopSound(url, duration) {
    stopAllPreviews();

    currentPreview = new Audio(url);
    currentPreview.volume = 0.5;
    currentPreview.play().catch(e => console.error("Önizleme hatası:", e));

    if (duration > 0) {
        currentPreviewTimeout = setTimeout(() => {
            stopAllPreviews();
        }, duration * 1000);
    }
}

function stopAllPreviews() {
    if (currentPreview) {
        currentPreview.pause();
        currentPreview.currentTime = 0;
        currentPreview = null;
    }
    if (currentPreviewTimeout) {
        clearTimeout(currentPreviewTimeout);
        currentPreviewTimeout = null;
    }
}


async function executePurchase(type, trigger, price) {
    if (!currentUser || !currentChannelId) return;
    const userData = await getUserData();
    if (!userData.balance) userData.balance = 0;
    const isInf = userData.is_infinite;

    // Not: Fiyat kontrolünü sunucuda yapıyoruz ama UI'da hızlı feedback için bırakabiliriz.
    // Ancak sunucu asıl yetkili.
    if (!isInf && (userData.balance || 0) < price) { return showToast("Bakiye yetersiz! ❌", "error"); }

    let userInput = "";
    if (type === 'tts') {
        openTTSModal(price);
        return;
    } else if (type === 'mute') {
        userInput = await showInput("Kullanıcı Sustur", "Susturulacak kullanıcının adını girin:", "Örn: aloske");
        if (!userInput) return;
        userInput = userInput.replace('@', '').toLowerCase().trim();
    } else if (type === 'sr') {
        userInput = await showInput("Şarkı İsteği", "YouTube Video Linkini Yapıştırın:", "https://youtube.com/...");
        if (!userInput) return;
        if (!userInput.includes('youtube.com') && !userInput.includes('youtu.be')) {
            await showAlert("Hata", "Lütfen geçerli bir YouTube linki girin!");
            return;
        }
        // No confirm, direct play 
    }

    // --- SECURE API CALL ---
    try {
        const payload = {
            username: currentUser,
            channelId: currentChannelId,
            type: type,
            data: {}
        };

        if (type === 'sound') payload.data = { trigger: trigger };
        if (type === 'mute') payload.data = { target: userInput };
        if (type === 'sr') payload.data = { url: userInput };

        const res = await fetch('/api/market/buy', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('aloskegang_token')}`
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (data.success) {
            showToast(data.message, "success");
            loadProfile(); // Balance update
        } else {
            showToast(data.error || "Hata oluştu!", "error");
        }
    } catch (e) {
        console.error(e);
        showToast("Sunucu ile iletişim hatası.", "error");
    }
}

function openTTSModal(price) {
    const modal = document.getElementById('tts-modal');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    document.getElementById('tts-input').value = "";
    document.getElementById('confirm-tts-buy').onclick = () => finalizeTTSPurchase(price);
}

function closeTTSModal() {
    const modal = document.getElementById('tts-modal');
    modal.classList.add('hidden');
    modal.style.display = 'none';
}

async function finalizeTTSPurchase(price) {
    const text = document.getElementById('tts-input').value.trim();
    const voice = document.getElementById('tts-voice-select').value;

    if (!text) return showToast("Mesaj boş olamaz!", "error");
    if (text.length > 500) return showToast("Mesaj çok uzun!", "error");

    // Client-side quick check
    const userData = await getUserData();
    if (!userData.is_infinite && (userData.balance || 0) < price) {
        return showToast("Bakiye yetersiz! ❌", "error");
    }

    try {
        const res = await fetch('/api/market/buy', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('aloskegang_token')}`
            },
            body: JSON.stringify({
                username: currentUser,
                channelId: currentChannelId,
                type: 'tts',
                data: { text: text, voice: voice }
            })
        });

        const data = await res.json();
        if (data.success) {
            showToast("TTS Mesajın yayına gönderildi! 🎙️", "success");
            closeTTSModal();
            loadProfile();
        } else {
            showToast(data.error || "İşlem başarısız.", "error");
        }
    } catch (e) {
        console.error(e);
        showToast("Sunucu hatası!", "error");
    }
}

function logout() {
    // 1. Local Storage
    localStorage.removeItem('aloskegang_user');
    localStorage.clear();

    // 2. Session Storage
    sessionStorage.clear();

    // 3. Clear Cookies
    document.cookie.split(";").forEach((c) => {
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });

    // 4. Reload
    location.reload();
}
function showToast(msg, type) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.innerText = msg;
    t.className = `toast ${type}`;
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 3000);
}
// TABS LOGIC
function switchTab(id) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById('tab-' + id).classList.remove('hidden');

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    // If called via event listener
    if (typeof event !== 'undefined' && event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    } else {
        // Programmatic call (e.g. from login)
        const targetBtn = document.querySelector(`.tab-btn[onclick*="switchTab('${id}')"]`);
        if (targetBtn) targetBtn.classList.add('active');
    }

    if (id === 'leaderboard') loadLeaderboard();
    if (id === 'borsa') loadBorsa();
    if (id === 'emlak') loadEmlak();
    if (id === 'quests') loadQuests();
    if (id === 'profile') loadProfile();
    if (id === 'career') loadCareer();
    if (id === 'stats') loadLiveStats();
    if (id === 'gangs') loadGangs();
}

let borsaActive = false;
let stockHistory = {}; // { CODE: [p1, p2, p3... p20] }

function drawStockChart(canvas, history, trend) {
    if (!canvas || !history || history.length < 2) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const paddingRight = 45; // Fiyat etiketleri için boşluk
    const effectiveW = w - paddingRight;

    ctx.clearRect(0, 0, w, h);

    const min = Math.min(...history);
    const max = Math.max(...history);
    const range = (max - min) || 1;

    // Arka plan çizgileri (Opsiyonel, şık durur)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    [0.1, 0.5, 0.9].forEach(p => {
        ctx.moveTo(0, h * p);
        ctx.lineTo(effectiveW, h * p);
    });
    ctx.stroke();

    // Ana Çizgi
    ctx.beginPath();
    ctx.strokeStyle = trend === 1 ? '#05ea6a' : '#ff4d4d';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';

    history.forEach((val, i) => {
        const x = (i / (history.length - 1)) * effectiveW;
        const y = h - ((val - min) / range) * h * 0.8 - (h * 0.1);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Alan (Gradiyent Dolgu)
    ctx.lineTo(effectiveW, h);
    ctx.lineTo(0, h);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, trend === 1 ? 'rgba(5,234,106,0.1)' : 'rgba(255,77,77,0.1)');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fill();

    // FİYAT SIRALAMASI (Sağ Tarafa Çizelge)
    const labels = [
        { v: max, y: h * 0.1 },
        { v: (max + min) / 2, y: h * 0.5 },
        { v: min, y: h * 0.9 }
    ];

    labels.forEach(l => {
        // Label Background
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(effectiveW + 2, l.y - 7, paddingRight - 4, 14);

        // Label Text
        ctx.fillStyle = '#888';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(Math.round(l.v).toLocaleString(), effectiveW + (paddingRight / 2), l.y + 3);

        // Dashed Guide Line
        ctx.beginPath();
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.moveTo(0, l.y);
        ctx.lineTo(effectiveW, l.y);
        ctx.stroke();
        ctx.setLineDash([]); // Reset
    });
}

async function loadBorsa() {
    const container = document.getElementById('borsa-items');
    if (!container) return;

    if (borsaActive) return;
    borsaActive = true;

    if (currentUser && currentUser.toLowerCase() === 'omegacyr') {
        let adminActions = document.getElementById('borsa-admin-actions');
        if (!adminActions) {
            adminActions = document.createElement('div');
            adminActions.id = 'borsa-admin-actions';
            adminActions.style.marginBottom = '20px';
            adminActions.style.display = 'flex';
            adminActions.style.gap = '10px';
            container.parentElement.insertBefore(adminActions, container);
        }

        // Clear previous buttons to avoid duplicates if re-rendered
        adminActions.innerHTML = '';

        const resetBtn = document.createElement('button');
        resetBtn.innerHTML = "🚨 SIFIRLA";
        resetBtn.className = "primary-btn";
        resetBtn.style.background = "#ff4d4d";
        resetBtn.style.color = "white";
        resetBtn.style.flex = "1";
        resetBtn.onclick = async () => {
            const confirmed = await showConfirm("⚠️ Borsa Sıfırlama", "Tüm kullanıcıların tüm hisselerini silmek istediğine emin misin?");
            if (!confirmed) return;
            const res = await fetch('/api/borsa/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requester: 'omegacyr' })
            });
            const d = await res.json();
            if (d.success) showToast(d.message, "success");
        };

        const fixBtn = document.createElement('button');
        fixBtn.innerHTML = "🔧 EKSİK MALİYET VERİLERİNİ ONAR";
        fixBtn.className = "primary-btn";
        fixBtn.style.background = "#ff9f43";
        fixBtn.style.color = "white";
        fixBtn.style.flex = "1";
        fixBtn.onclick = async () => {
            const confirmed = await showConfirm("🔧 Maliyet Düzelt", "Eksik maliyet verisi olan hisseler için GÜNCEL FİYAT baz alınarak maliyet eklenecek. Onaylıyor musun?");
            if (!confirmed) return;
            const res = await fetch('/api/borsa/fix-costs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requester: 'omegacyr' })
            });
            const d = await res.json();
            if (d.success) showToast(d.message, "success");
            else showToast(d.error, "error");
        };

        adminActions.appendChild(resetBtn);
        adminActions.appendChild(fixBtn);
    }

    container.innerHTML = `<div style="text-align:center; width:100%; padding:60px;"><div class="loader"></div><p style="margin-top:10px;">Borsa verileri yükleniyor...</p></div>`;

    const renderStocks = (stocks) => {
        if (!stocks) return;

        // Global Stocks Cache for Calculator
        window.shopStocks = stocks;

        if (stocks.error) {
            container.innerHTML = `<div class="error-box">${stocks.error}</div>`;
            return;
        }

        const entries = Object.entries(stocks);

        // Piyasa Durumu Bilgisi
        let statusBox = document.getElementById('market-cycle-status');
        if (!statusBox) {
            // İlk başarılı yüklemede "yükleniyor" yazısını temizle
            container.innerHTML = "";
            statusBox = document.createElement('div');
            statusBox.id = 'market-cycle-status';
            statusBox.style = "grid-column: 1 / -1; background: rgba(255,255,255,0.03); padding: 15px; border-radius: 12px; margin-bottom: 20px; border: 1px solid var(--glass-border); text-align: center;";
            container.appendChild(statusBox);
        }
        const cycle = entries[0][1].marketStatus || "NORMAL";
        const cycleMap = {
            "BULLISH": { t: "BOĞA PİYASASI (YÜKSELİŞ)", c: "#05ea6a" },
            "BEARISH": { t: "AYI PİYASASI (DÜŞÜŞ)", c: "#ff4d4d" },
            "VOLATILE": { t: "YÜKSEK VOLATİLİTE (RİSKLİ)", c: "#ffaa00" },
            "STAGNANT": { t: "DURGUN PİYASA (YATAY)", c: "#888" },
            "CRASH": { t: "⚠️ KRİZ: BÜYÜK ÇÖKÜŞ!", c: "red" },
            "NORMAL": { t: "NORMAL PİYASA", c: "#aaa" }
        };
        statusBox.innerHTML = `<small style="color:#666; display:block; margin-bottom:4px;">GÜNCEL EKONOMİK DURUM</small><strong style="color:${cycleMap[cycle].c}; font-size:1.1rem; letter-spacing:1px;">${cycleMap[cycle].t}</strong>`;

        entries.forEach(([code, data]) => {
            if (!data || typeof data !== 'object') return;
            if (code === 'status') return;

            // GÜNLÜK YÜZDE HESAPLAMA (Son 24h ilk fiyat baz alınır)
            let dailyStartPrice = data.oldPrice;
            if (data.history && data.history.length > 0) {
                dailyStartPrice = data.history[0]; // Listenin başı en eski kayıt (örn. 24 saat önce veya daha eski)
            }

            const diffVal = ((data.price - dailyStartPrice) / dailyStartPrice) * 100;
            const diff = diffVal.toFixed(2);
            const trendIcon = diffVal >= 0 ? '📈' : '📉';
            const color = diffVal >= 0 ? '#05ea6a' : '#ff4d4d';

            let card = document.querySelector(`.borsa-card[data-code="${code}"]`);
            if (card) {
                const trendEl = card.querySelector('.trend-val');
                const priceEl = card.querySelector('.price-val');
                const buyBtn = card.querySelector('.btn-buy-main');
                const sellBtn = card.querySelector('.btn-sell-main');

                trendEl.innerHTML = `${diffVal > 0 ? '+' : ''}${diff}% ${trendIcon}`;
                trendEl.style.color = color;
                priceEl.innerHTML = `${(data.price || 0).toLocaleString()} <span style="font-size:0.8rem; color:var(--primary);">💰</span>`;

                // Butonlardaki fiyatları güncelle
                buyBtn.onclick = () => executeBorsaBuy(code, data.price);
                sellBtn.onclick = () => executeBorsaSell(code, data.price);
            } else {
                card = document.createElement('div');
                card.className = 'item-card borsa-card';
                card.setAttribute('data-code', code);
                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <div style="display:flex; flex-direction:column;">
                            <span style="font-weight:800; font-size:1.1rem; color:var(--primary);">${code}</span>
                            ${data.name ? `<span style="font-size:0.75rem; color:#888;">${data.name}</span>` : ''}
                        </div>
                        <span class="trend-val" style="color:${color}; font-weight:800; font-size:0.75rem;">
                            ${diffVal > 0 ? '+' : ''}${diff}% ${trendIcon}
                        </span>
                    </div>
                    
                    <div style="font-size:0.6rem; color:#666; margin-bottom:4px; text-transform:uppercase; letter-spacing:1px;">Son 24-48 Saatlik Grafik</div>
                    <canvas id="chart-${code}" width="200" height="60" style="width:100%; height:60px; margin:5px 0;"></canvas>

                    <div class="price-val" style="font-size:1.5rem; font-weight:800; color:white; margin:10px 0;">
                        ${(data.price || 0).toLocaleString()} <span style="font-size:0.8rem; color:var(--primary);">💰</span>
                    </div>

                    <div style="font-size: 0.65rem; color: #ff4d4d; margin-bottom: 8px; font-weight: 600;">⚠️ %10 Satış Komisyonu Uygulanır</div>

                    <!-- Anlık Fiyat Gösterimi -->
                    <div id="price-calc-${code}" style="font-size:0.75rem; margin-bottom:10px; padding:8px; background:rgba(0,0,0,0.3); border-radius:8px; display:none;">
                        <div style="display:flex; justify-content:space-between; color:#aaa;">
                            <span>📈 Alış:</span>
                            <span id="buy-price-${code}" style="color:var(--primary); font-weight:700;">-</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; color:#aaa; margin-top:4px;">
                            <span>📉 Satış (-10%):</span>
                            <span id="sell-price-${code}" style="color:#ff6b6b; font-weight:700;">-</span>
                        </div>
                    </div>

                    <div class="borsa-controls" style="margin-top:10px;">
                        <input type="number" id="input-${code}" class="borsa-input" value="1" min="0.00000001" step="any" placeholder="Adet" aria-label="${code} Adet Satın Al/Sat" oninput="updateBorsaPrice('${code}', ${data.price})">
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                            <button class="buy-btn btn-buy-main" onclick="executeBorsaBuy('${code}', ${data.price})" style="background:var(--primary); color:black; font-weight:800; padding:8px;">AL</button>
                            <button class="buy-btn btn-sell-main" onclick="executeBorsaSell('${code}', ${data.price})" style="background:rgba(255,255,255,0.05); color:white; border:1px solid var(--glass-border); padding:8px;">SAT</button>
                        </div>
                    </div>
                `;
                container.appendChild(card);
            }
            // Use server-side hourly history + current price for the chart
            const chartData = [...(data.history || [])];
            if (data.price) chartData.push(data.price);
            drawStockChart(document.getElementById(`chart-${code}`), chartData, data.trend);

            // Auto-update price for default value
            updateBorsaPrice(code, data.price);
        });
    };

    db.ref('global_stocks').on('value', snap => {
        if (snap.exists()) renderStocks(snap.val());
    });

    // Haberleri dinle
    db.ref('global_news').limitToLast(10).on('value', snap => {
        if (snap.exists()) renderNews(snap.val());
    });
}

function renderNews(newsData) {
    const container = document.getElementById('news-ticker-container');
    if (!container) return;
    container.innerHTML = "";

    // Update date display
    const dateDisplay = document.getElementById('news-date-display');
    const lastUpdate = document.getElementById('news-last-update');
    const now = new Date();
    if (dateDisplay) {
        dateDisplay.textContent = now.toLocaleDateString('tr-TR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }
    if (lastUpdate) {
        lastUpdate.textContent = now.toLocaleTimeString('tr-TR', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    // Sort by timestamp desc (newest first)
    const sorted = Object.values(newsData).sort((a, b) => b.timestamp - a.timestamp);

    if (sorted.length === 0) {
        container.innerHTML = `
            <div class="news-empty">
                <i class="fas fa-newspaper"></i>
                Henüz piyasa haberi yok...
            </div>
        `;
        return;
    }

    sorted.forEach((n, index) => {
        const newsDate = new Date(n.timestamp);
        const timeStr = newsDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        const isGood = n.type === 'GOOD';
        const isBreaking = index === 0 && (Date.now() - n.timestamp < 300000); // Son 5 dk içindeki en yeni haber

        const div = document.createElement('div');
        div.className = `news-item${isBreaking ? ' breaking' : ''}`;
        div.innerHTML = `
            <div class="news-time">${timeStr}</div>
            <div class="news-content">
                <div class="news-indicator ${isGood ? 'good' : 'bad'}">
                    <span class="news-indicator-dot"></span>
                    ${isGood ? '📈 YÜKSELİŞ' : '📉 DÜŞÜŞ'}
                </div>
                <div class="news-headline">${n.text}</div>
            </div>
        `;
        container.appendChild(div);
    });
}

// Borsa anlık fiyat hesaplama
function updateBorsaPrice(code, price) {
    const input = document.getElementById(`input-${code}`);
    const priceCalc = document.getElementById(`price-calc-${code}`);
    const buyPriceEl = document.getElementById(`buy-price-${code}`);
    const sellPriceEl = document.getElementById(`sell-price-${code}`);

    if (!input || !priceCalc || !buyPriceEl || !sellPriceEl) return;

    const amount = parseFloat(input.value.replace(',', '.'));

    if (!amount || isNaN(amount) || amount <= 0) {
        priceCalc.style.display = 'none';
        return;
    }

    priceCalc.style.display = 'block';

    const buyTotal = Math.floor(price * amount);
    const sellGross = Math.floor(price * amount);
    const sellNet = Math.floor(sellGross * 0.90); // %10 komisyon düşülmüş

    buyPriceEl.textContent = buyTotal.toLocaleString() + ' 💰';
    sellPriceEl.textContent = sellNet.toLocaleString() + ' 💰';
}

async function executeBorsaBuy(code, price) {
    if (!currentUser) return;
    const input = document.getElementById(`input-${code}`);
    const amount = parseFloat(input.value.replace(',', '.')); // Virgül desteği
    if (!amount || isNaN(amount) || amount <= 0) return showToast("Geçersiz miktar!", "error");

    // REMOVED ALERT AND MOVED TO SERVER
    try {
        const res = await fetch('/api/borsa/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser, code, amount })
        });
        const data = await res.json();

        if (data.success) {
            showToast(data.message, "success");
            loadProfile();
        } else {
            showToast(data.error, "error");
        }
    } catch (e) {
        showToast("Sunucu hatası!", "error");
    }
}

async function executeBorsaSell(code, price) {
    if (!currentUser) return;
    // Note: Sell logic usually checks stock count which is in user data.
    // We should probably check it here but let server handle it mostly.
    const input = document.getElementById(`input-${code}`);
    const amount = parseFloat(input.value.replace(',', '.')); // Virgül desteği
    if (!amount || isNaN(amount) || amount <= 0) return showToast("Geçersiz miktar!", "error");

    // CONFIRMATION KEPT FOR SELL (Optional, user only asked to remove for buy, but safer to keep for sell or remove? User said "Alınsın mı? alertini kaldır". Usually selling is also better with confirm but consistency...)
    // Let's keep confirm for SELL for now unless user complains, or maybe remove it too? 
    // The user strictly said "Borsada alım yaparken Alınsın mı? alertini kaldır". 
    // I will keep it for sell to avoid accidental dumps.

    // No confirm, direct sell

    try {
        const res = await fetch('/api/borsa/sell', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser, code, amount })
        });
        const data = await res.json();

        if (data.success) {
            showToast(data.message, "success");
            loadProfile();
        } else {
            showToast(data.error, "error");
        }
    } catch (e) {
        showToast("Sunucu hatası!", "error");
    }
}

let lbType = 'global';
async function switchLB(type) {
    lbType = type;
    document.querySelectorAll('#tab-leaderboard .primary-btn').forEach(b => b.classList.remove('active'));
    event.currentTarget.classList.add('active');
    loadLeaderboard();
}

async function loadLeaderboard() {
    const container = document.getElementById('leaderboard-container');
    container.innerHTML = `<div class="loading-spinner"></div>`;
    try {
        const res = await fetch('/api/leaderboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: lbType, channelId: currentChannelId })
        });
        const list = await res.json();
        container.innerHTML = "";
        list.forEach((u, i) => {
            const item = document.createElement('div');
            item.className = 'leader-item';
            item.innerHTML = `
                <div style="display:flex; align-items:center; gap:15px;">
                    <span class="rank">${i + 1}.</span>
                    <span style="font-weight:600;">${u.name.toUpperCase()}</span>
                </div>
                <span style="color:var(--primary); font-weight:800;">${u.is_infinite ? '💳♾️' : u.balance.toLocaleString() + ' 💰'}</span>
            `;
            container.appendChild(item);
        });
    } catch (e) {
        console.error("Leaderboard Tablosu Hatası:", e);
        container.innerHTML = "<p>Leaderboard şu an yüklenemiyor.</p>";
    }
}

async function loadQuests() {
    if (!currentUser) return;
    const container = document.getElementById('quests-container');
    container.innerHTML = `<div class="loading-spinner"></div>`;

    try {
        // Use direct Firebase read instead of admin API which is restricted
        const snap = await db.ref('global_quests').once('value');
        const globalQuests = snap.val() || {};

        let u = lastUserData;
        if (!u) {
            try {
                const snap = await db.ref('users/' + currentUser).once('value');
                u = snap.val();
            } catch (e) { }
            if (!u) {
                try {
                    const res = await fetch('/api/user/' + currentUser);
                    const d = await res.json();
                    if (d && !d.error) u = d;
                } catch (e) { }
            }
        }
        u = u || {};
        const today = getTodayKey();
        const userToday = u.quests?.[today] || { m: 0, g: 0, d: 0, w: 0, claimed: {} };

        container.innerHTML = "";
        if (Object.keys(globalQuests).length === 0) {
            container.innerHTML = "<p style='text-align:center; color:var(--muted);'>Şu an aktif görev yok.</p>";
            return;
        }

        Object.entries(globalQuests).forEach(([id, q]) => {
            const currentProgress = userToday[q.type] || 0;
            const isClaimed = userToday.claimed?.[id];
            const isDone = currentProgress >= q.goal;
            const percent = Math.min(100, (currentProgress / q.goal) * 100);

            const card = document.createElement('div');
            card.className = 'quest-card';
            card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h3>${q.name}</h3>
                        <span style="color:var(--primary); font-weight:700;">+${(parseInt(q.reward) || 0).toLocaleString()} 💰</span>
                    </div>
                    <p>Görev Türü: ${q.type === 'm' ? 'Sohbet' : q.type === 'g' ? 'Kumar' : q.type === 'w' ? '👁️ İzleme' : '⚔️ Düello'}</p>
                    <div class="progress-bar"><div class="progress-fill" style="width: ${percent}%"></div></div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <small>${currentProgress}/${q.goal} ${q.type === 'm' ? 'Mesaj' : 'İşlem'}</small>
                        <button class="primary-btn" style="width:auto; padding:8px 20px;" 
                            ${isDone && !isClaimed ? '' : 'disabled'} onclick="claimQuest('${id}')">
                            ${isClaimed ? 'ALINDI' : (isDone ? 'ÖDÜLÜ AL' : 'TAMAMLA')}
                        </button>
                    </div>
                `;
            container.appendChild(card);
        });


    } catch (e) { container.innerHTML = "<p>Görevler yüklenemedi.</p>"; }
}

async function claimQuest(questId) {
    if (!currentUser) return;
    try {
        const res = await fetch('/api/claim-quest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser, questId })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`🎉 +${data.reward} 💰 aldın!`, "success");
            loadQuests();
            loadProfile();
        } else {
            showToast(data.error, "error");
        }
    } catch (e) { showToast("Bağlantı hatası!", "error"); }
}

async function loadProfile() {
    if (!currentUser) return;
    const container = document.getElementById('profile-card');
    let u = lastUserData;
    if (!u) {
        try {
            const snap = await db.ref('users/' + currentUser).once('value');
            u = snap.val();
        } catch (e) { }

        if (!u) {
            try {
                const res = await fetch('/api/user/' + currentUser);
                const d = await res.json();
                if (d && !d.error) u = d;
            } catch (e) { } // Only catch fetch error
        }
    }
    u = u || { balance: 0 };

    // Find custom styles
    const customColor = PROFILE_CUSTOMIZATIONS.colors.find(c => c.id === u.name_color);
    const customBg = PROFILE_CUSTOMIZATIONS.backgrounds.find(b => b.id === u.profile_bg);

    const nameStyle = customColor ? `color: ${customColor.color}; text-shadow: 0 0 15px ${customColor.color}88;` : "";
    const profileStyle = customBg ? customBg.style : "background: rgba(255,255,255,0.03);";

    container.style.cssText = `position:static; transform:none; width:100%; text-align:left; transition: all 0.5s ease; ${profileStyle}`;

    container.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:25px; padding: 30px;">
                <div style="display:flex; align-items:center; gap:20px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:20px;">
                    <div id="p-avatar" style="width:80px; height:80px; background:var(--primary); color:black; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:2rem; font-weight:800; border:4px solid rgba(255,255,255,0.1);">
                        ${currentUser[0].toUpperCase()}
                    </div>
                    <div>
                        <h2 style="${nameStyle} font-size:2rem; margin:0;">${currentUser.toUpperCase()}</h2>
                        <span style="background:rgba(255,255,255,0.1); padding:2px 10px; border-radius:20px; font-size:0.8rem; color:#ccc;">${u.job || 'İşsiz'}</span>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
                    <div class="stat-box" style="background:rgba(0,0,0,0.3);">
                        <label>Cüzdan</label>
                        <div class="val">${u.is_infinite ? 'Omega\'nın Kartı 💳♾️' : u.balance.toLocaleString() + ' 💰'}</div>
                    </div>
                    <div class="stat-box" style="background:rgba(0,0,0,0.3);">
                        <label>Eğitim</label>
                        <div class="val">${EDUCATION[u.edu || 0]}</div>
                    </div>
                    <div class="stat-box" style="background:rgba(0,0,0,0.3);">
                        <label>Sıralama</label>
                        <div class="val">#--</div>
                    </div>
                    <div class="stat-box" style="background:rgba(0,0,0,0.3);">
                        <label>Durum</label>
                        <div class="val">${(() => {
            if (u.is_admin) return '🛡️ Yönetici';
            const badges = u.badges || [];
            const isSubscriber = badges.some(b => {
                const badgeType = typeof b === 'string' ? b : (b.type || b.badge_type || '');
                return ['subscriber', 'founder', 'vip', 'sub_gifter', 'og'].includes(badgeType.toLowerCase());
            }) || u.is_subscriber === true || u.isSubscriber === true;
            return isSubscriber ? '💎 Abone' : '👤 Takipçi';
        })()}</div>
                    </div>
                </div>

                <div class="xp-section" style="background:rgba(255,255,255,0.03); padding:20px; border-radius:12px; border:1px solid var(--glass-border);">
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px; font-weight:600;">
                        <span>Eğitim XP</span>
                        <span style="color:var(--primary);">${u.xp || 0} / ${EDU_XP[(u.edu || 0) + 1] || 'MAX'}</span>
                    </div>
                    <div class="progress-bar" style="height:12px; background:#1a1a1a;">
                        <div class="progress-fill" style="width: ${Math.min(100, ((u.xp || 0) / (EDU_XP[(u.edu || 0) + 1] || u.xp || 1)) * 100)}%;"></div>
                    </div>
                    <p style="font-size:0.75rem; color:#666; margin-top:8px;">
                        Mesaj yazarak ve !çalış komutunu kullanarak XP kazanabilir, diplomanı yükseltebilirsin.
                    </p>
                </div>
                
                <div class="stats-section">
                    <h3 style="margin-bottom:15px; font-size:1rem; opacity:0.8;">📈 İstatistikler</h3>
                    <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:15px; margin-bottom:15px;">
                        <div class="stat-mini" style="border:1px solid #05ea6a33; background:rgba(5, 234, 106, 0.05);">
                            <label style="color:var(--primary);">Günlük İzleme</label>
                            <div class="v" style="color:var(--primary);">${u.quests?.[getTodayKey()]?.w || 0} dk</div>
                        </div>
                        <div class="stat-mini" style="background:rgba(5, 234, 106, 0.1);">
                            <label>Kanal İzleme</label>
                            <div class="v">${u.channel_watch_time?.[currentChannelId] || 0} dk</div>
                        </div>
                        <div class="stat-mini">
                            <label>Toplam İzleme</label>
                            <div class="v">${u.lifetime_w || 0} dk</div>
                        </div>
                        <div class="stat-mini">
                            <label>Toplam Mesaj</label>
                            <div class="v">${u.lifetime_m || 0}</div>
                        </div>
                        <div class="stat-mini">
                            <label>Toplam Kumar</label>
                            <div class="v">${u.lifetime_g || 0}</div>
                        </div>
                        <div class="stat-mini">
                            <label>Düello Galibiyet</label>
                            <div class="v">${u.lifetime_d || 0}</div>
                        </div>
                    </div>
                </div>

                <div class="portfolio-section" style="margin-top:20px; border-top:1px solid rgba(255,255,255,0.1); padding-top:20px;">
                    <h3 style="margin-bottom:15px; font-size:1rem; opacity:0.8;">📂 Borsa Portföyüm</h3>
                    <div id="user-portfolio" style="display:grid; grid-template-columns: repeat(2, 1fr); gap:10px;">
                        ${u.stocks && Object.keys(u.stocks).length > 0 ?
            Object.entries(u.stocks).map(([code, amt]) => {
                const totalCost = u.stock_costs ? (u.stock_costs[code] || 0) : 0;
                const avgCost = amt > 0 ? (totalCost / amt) : 0;
                return `
                        <div class="stat-mini" style="border:1px solid #05ea6a33; background:rgba(5, 234, 106, 0.05); display:block;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <label style="margin:0;">${code}</label>
                                <span style="font-size:0.7rem; color:#aaa;">Ort: ${avgCost > 0 ? Math.floor(avgCost).toLocaleString() : '?'} 💰</span>
                            </div>
                            <div class="v" style="margin-top:5px;">${Number(amt).toLocaleString('tr-TR', { maximumFractionDigits: 4 })} Adet</div>
                        </div>
                    `;
            }).join('') : '<p style="grid-column: span 2; font-size: 0.8rem; color:#666;">Henüz hissedar değilsin.</p>'
        }
                    </div>
                </div>

                <div class="emlak-portfolio-section" style="margin-top:20px; border-top:1px solid rgba(255,255,255,0.1); padding-top:20px;">
                    <h3 style="margin-bottom:15px; font-size:1rem; opacity:0.8;">🏠 Emlak Portföyüm</h3>
                    <div id="user-emlak" style="display:grid; grid-template-columns: 1fr; gap:10px;">
                        ${u.properties && u.properties.length > 0 ?
            u.properties.map(p => {
                const catIcons = { residence: 'house', shop: 'shop', land: 'seedling' };
                const icon = catIcons[p.category] || 'building';
                const hourly = Math.floor(p.income / 24);
                return `
                                <div class="stat-mini" style="border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.03); display:flex; justify-content:space-between; align-items:center;">
                                    <div style="display:flex; gap:10px; align-items:center;">
                                        <div style="width:35px; height:35px; background:rgba(255,255,255,0.05); border-radius:8px; display:flex; align-items:center; justify-content:center; color:var(--primary);">
                                            <i class="fas fa-${icon}"></i>
                                        </div>
                                        <div>
                                            <label>${p.city || 'Emlak'}</label>
                                            <div class="v" style="font-size:0.85rem;">${p.name}</div>
                                        </div>
                                    </div>
                                    <div style="text-align:right;">
                                        <div style="color:var(--primary); font-weight:800; font-size:0.8rem;">+${hourly.toLocaleString()} 💰/sa</div>
                                        <div style="font-size:0.65rem; color:#666;">Günlük: ${p.income.toLocaleString()}</div>
                                    </div>
                                </div>
                            `;
            }).join('') : '<p style="font-size: 0.8rem; color:#666;">Henüz mülk sahibi değilsin.</p>'
        }
                </div>

                <div class="gang-section" style="margin-top:20px; border-top:1px solid rgba(255,255,255,0.1); padding-top:20px;">
                    <h3 style="margin-bottom:15px; font-size:1rem; opacity:0.8;">🏴 Çete</h3>
                    ${u.gang ?
            `<div class="stat-mini" style="background:rgba(255, 0, 0, 0.1); border:1px solid rgba(255, 0, 0, 0.3); display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="switchTab('gangs')">
                            <div>
                                <label>Üyesin</label>
                                <div class="v" style="color:#e74c3c;">Çeteye Git ></div>
                            </div>
                        </div>`
            :
            `<div class="stat-mini" style="background:rgba(255,255,255,0.05); display:flex; justify-content:space-between; align-items:center;">
                            <label>Bir çeteye üye değilsin.</label>
                            <button class="secondary-btn" style="font-size:0.7rem; padding:4px 10px;" onclick="switchTab('gangs')">Çete Kur/Bul</button>
                        </div>`
        }
                </div>
            </div>
        `;

}

// --- GANG SYSTEM --- (Step 883 Client Logic)

async function loadGangs() {
    const lobby = document.getElementById('gang-lobby');
    const dashboard = document.getElementById('gang-dashboard');

    // 1. Check if user is logged in
    if (!currentUser) {
        lobby.classList.remove('hidden');
        dashboard.classList.add('hidden');
        document.getElementById('public-gang-list').innerHTML = '<div style="color:var(--primary); text-align:center; padding:20px;">Çeteleri görmek ve katılmak için giriş yapmalısın.</div>';
        return;
    }

    await ensureCities();
    let userData = lastUserData;

    // If we don't have fresh data, try to fetch it once (using Firebase instead of API)
    if (!userData) {
        try {
            const snap = await db.ref('users/' + currentUser).once('value');
            userData = snap.val();
            lastUserData = userData;
        } catch (e) {
            console.error("Gangs: User data fetch failed", e);
        }
    }

    const gangId = userData?.gang;
    console.log("Gangs Login Check:", { currentUser, gangId, hasUserData: !!userData });

    if (!gangId) {
        // Not in a gang -> Show Lobby
        lobby.classList.remove('hidden');
        dashboard.classList.add('hidden');

        // Populate City Select if empty
        const citySelect = document.getElementById('gang-city-input');
        if (citySelect && citySelect.options.length <= 1) {
            EMLAK_CITIES.sort((a, b) => a.name.localeCompare(b.name)).forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.innerText = c.name;
                citySelect.appendChild(opt);
            });
        }

        // --- FETCH PUBLIC GANGS ---
        try {
            const res = await fetch('/api/gang/list');
            const data = await res.json();
            const publicList = document.getElementById('public-gang-list');
            if (publicList && data.success) {
                publicList.innerHTML = '';
                const gangs = Object.values(data.gangs || {});
                if (gangs.length === 0) {
                    publicList.innerHTML = '<div style="color:#666; text-align:center; padding:20px;">Henüz kurulmuş çete yok.</div>';
                } else {
                    gangs.forEach(g => {
                        const card = document.createElement('div');
                        card.className = 'gang-card';
                        card.style = "margin-bottom:15px; padding:20px; display:flex; justify-content:space-between; align-items:center; position:relative; overflow:hidden;";

                        const memberCount = Object.keys(g.members || {}).length;
                        const cityName = EMLAK_CITIES.find(c => c.id === g.baseCity)?.name || g.baseCity;
                        const lvl = g.level || 1;

                        card.innerHTML = `
                            <div style="position:absolute; top:-10px; right:-10px; font-size:4rem; opacity:0.03; font-weight:900; pointer-events:none; font-style:italic;">${g.tag}</div>
                            <div style="text-align:left; position:relative; z-index:1;">
                                <div style="font-weight:900; color:white; font-size: 1.1rem; display:flex; align-items:center; gap:10px;">
                                    <span style="background:var(--primary); color:black; padding:3px 10px; border-radius:6px; font-size:0.8rem; font-weight:900; box-shadow:0 0 10px var(--primary-dim);">${g.tag}</span>
                                    ${g.name}
                                </div>
                                <div style="font-size:0.8rem; color:#aaa; margin-top:10px; display:flex; gap:15px; align-items:center;">
                                    <span title="Üs Şehri"><i class="fas fa-map-marker-alt" style="color:var(--primary);"></i> ${cityName}</span>
                                    <span title="Lider"><i class="fas fa-crown" style="color:#ffd700;"></i> ${g.leader}</span>
                                    <span title="Seviye"><i class="fas fa-star" style="color:#5dade2;"></i> Seviye ${lvl}</span>
                                    <span title="Üye Sayısı"><i class="fas fa-users" style="color:#aaa;"></i> ${memberCount} Üye</span>
                                </div>
                            </div>
                            <button onclick="joinGang('${g.id}')" class="primary-btn" style="width:auto; padding:10px 25px; font-size:0.85rem; border-radius:30px; position:relative; z-index:1; border:none; box-shadow: 0 4px 15px rgba(5,234,106,0.3);">
                                <i class="fas fa-user-plus"></i> KATIL
                            </button>
                        `;
                        publicList.appendChild(card);
                    });
                }
            }
        } catch (e) {
            console.error("Public Gang List Error", e);
        }

    } else {
        // In a gang -> Fetch Gang Info & Show Dashboard
        document.getElementById('gang-lobby').classList.add('hidden');
        document.getElementById('gang-dashboard').classList.remove('hidden');

        // Render Public Gangs anyway (at bottom)
        try {
            const res = await fetch('/api/gang/list');
            const data = await res.json();
            const list = document.getElementById('public-gang-list-dashboard');
            if (list && data.success) {
                list.innerHTML = '';
                const gangs = Object.values(data.gangs || {});
                if (gangs.length === 0) {
                    list.innerHTML = '<div style="color:#666; text-align:center; padding:20px;">Başka çete bulunamadı.</div>';
                } else {
                    gangs.forEach(g => {
                        if (g.id === gangId) return;

                        const card = document.createElement('div');
                        card.className = 'gang-card';
                        card.style = "padding:15px 20px; display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; background:rgba(255,255,255,0.02);";
                        const cityName = EMLAK_CITIES.find(c => c.id === g.baseCity)?.name || g.baseCity;
                        const lvl = g.level || 1;

                        card.innerHTML = `
                            <div style="text-align:left;">
                                <div style="font-weight:800; color:white; font-size:0.95rem; display:flex; align-items:center; gap:8px;">
                                    <span style="background:rgba(255,255,255,0.1); color:rgba(255,255,255,0.7); padding:2px 6px; border-radius:4px; font-size:0.7rem;">${g.tag}</span>
                                    ${g.name}
                                </div>
                                <div style="font-size:0.75rem; color:#666; margin-top:5px; display:flex; gap:10px;">
                                    <span>📍 ${cityName}</span>
                                    <span>⭐ Lvl ${lvl}</span>
                                    <span>👑 ${g.leader}</span>
                                </div>
                            </div>
                            <div style="font-size:0.85rem; color:var(--primary); font-weight:800; background:rgba(5,234,106,0.05); padding:5px 12px; border-radius:20px;">
                                <i class="fas fa-users" style="font-size:0.7rem;"></i> ${g.memberCount}
                            </div>
                        `;
                        list.appendChild(card);
                    });
                }
            }
        } catch (e) { console.error("Dashboard Gang List Error", e); }

        try {
            const res = await fetch('/api/gang/info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gangId })
            });

            const d = await res.json();
            if (d.success && d.gang) {
                const g = d.gang;
                document.getElementById('my-gang-name').innerText = g.name;
                document.getElementById('my-gang-tag').innerText = g.tag;
                document.getElementById('my-gang-leader').innerText = g.leader;
                document.getElementById('my-gang-balance').innerText = (g.balance || 0).toLocaleString() + ' 💰';

                // --- PENDING REQUESTS ---
                const reqSection = document.getElementById('gang-requests-section');
                const reqList = document.getElementById('gang-requests-list');
                const cleanCurrent = currentUser.toLowerCase();
                const myRank = g.members[cleanCurrent]?.rank;

                if (myRank === 'leader' || myRank === 'officer') {
                    reqSection.classList.remove('hidden');
                    reqList.innerHTML = '';
                    const requests = Object.keys(g.requests || {});
                    if (requests.length === 0) {
                        reqList.innerHTML = '<div style="color:#666; font-size:0.8rem;">Bekleyen istek yok.</div>';
                    } else {
                        requests.forEach(uname => {
                            const row = document.createElement('div');
                            row.className = 'member-row';
                            row.innerHTML = `
                                <span><i class="fas fa-user-clock"></i> @${uname}</span>
                                <div style="display:flex; gap:5px;">
                                    <button onclick="processGangRequest('${uname}', 'approve', '${gangId}')" class="primary-btn" style="width:auto; padding:5px 10px; font-size:0.7rem; background:#05ea6a; color:black;">ONAYLA</button>
                                    <button onclick="processGangRequest('${uname}', 'reject', '${gangId}')" class="logout-btn" style="width:auto; padding:5px 10px; font-size:0.7rem;">REDDET</button>
                                </div>
                            `;
                            reqList.appendChild(row);
                        });
                    }
                } else {
                    reqSection.classList.add('hidden');
                }

                // Display Base City if exists
                if (g.baseCity) {
                    const cityName = EMLAK_CITIES.find(c => c.id === g.baseCity)?.name || g.baseCity;
                    // Append or set somewhere in dashboard UI? 
                    // For now, let's append it to the name or tag area as a subtitle or info
                    // Re-using existing structure, adding a line
                    let infoDiv = document.getElementById('gang-info-extra');
                    if (!infoDiv) {
                        const headerDiv = document.querySelector('#gang-dashboard .gang-header > div:first-child');
                        infoDiv = document.createElement('p');
                        infoDiv.id = 'gang-info-extra';
                        infoDiv.style = "color:#aaa; margin-top:5px; font-size:0.8rem;";
                        headerDiv.appendChild(infoDiv);
                    }
                    infoDiv.innerText = `Üs: ${cityName}`;
                }

                // Members List
                const list = document.getElementById('gang-members-list');
                if (!list) return;
                list.innerHTML = '';

                let members = [];
                try {
                    members = Object.entries(g.members || {});
                } catch (e) {
                    console.error("Members parse error", e);
                    members = [];
                }

                // Member Count - Always use members list length as source of truth
                const memberCount = members.length;
                const countEl = document.getElementById('my-gang-count');
                if (countEl) countEl.innerText = memberCount;

                if (memberCount === 0) {
                    list.innerHTML = '<div style="color:#666; font-size:0.8rem; text-align:center; padding:20px;">Kadro verisi yüklenemedi.</div>';
                } else {
                    // Sort: Leader first
                    members.sort((a, b) => (b[1].rank === 'leader' ? 1 : 0) - (a[1].rank === 'leader' ? 1 : 0));

                    members.forEach(([uname, data]) => {
                        const isLeader = data.rank === 'leader';
                        const isOfficer = data.rank === 'officer';
                        let rankTitle = 'Tetikçi (Üye)';
                        let icon = '🔫';

                        if (isLeader) { rankTitle = 'Lider (Baba)'; icon = '👑'; }
                        else if (isOfficer) { rankTitle = 'Sağ Kol (Officer)'; icon = '⚔️'; }

                        const row = document.createElement('div');
                        row.className = 'member-row';

                        let actionsHtml = '<div style="display:flex; gap:8px;">';
                        if (myRank === 'leader' && uname.toLowerCase() !== cleanCurrent) {
                            const nextRank = isOfficer ? 'member' : 'officer';
                            const btnText = isOfficer ? 'Rütbe İndir' : 'Sağ Kol Yap';
                            actionsHtml += `<button onclick="promoteMember('${uname}', '${nextRank}', '${gangId}')" class="primary-btn" style="width:auto; padding:3px 8px; font-size:0.65rem; background:rgba(255,255,255,0.1); color:white; border:1px solid rgba(255,255,255,0.2);">${btnText}</button>`;
                        }

                        // Kick Button
                        const canIKick = (myRank === 'leader' && uname.toLowerCase() !== cleanCurrent) ||
                            (myRank === 'officer' && !isLeader && !isOfficer);

                        if (canIKick) {
                            actionsHtml += `<button onclick="kickMember('${uname}', '${gangId}')" class="logout-btn" style="width:auto; padding:3px 8px; font-size:0.65rem; border:1px solid rgba(255,50,50,0.3);">AT</button>`;
                        }
                        actionsHtml += '</div>';

                        row.innerHTML = `
                            <div style="display:flex; align-items:center; gap:10px;">
                                <span style="font-size:1.2rem;">${icon}</span>
                                <div style="text-align:left;">
                                    <div style="font-weight:700; color:white;">@${uname}</div>
                                    <div style="font-size:0.7rem; color:#888;">${rankTitle}</div>
                                </div>
                            </div>
                            ${actionsHtml}
                        `;
                        list.appendChild(row);
                    });

                    // Add Deposit / Upgrade Buttons Section (Below Members List)
                    const lvl = g.level || 1;
                    const bal = g.balance || 0;
                    const costs = { 1: 1000000, 2: 5000000, 3: 25000000, 4: 100000000 };
                    const nextCost = costs[lvl];
                    const nextLvlV = lvl + 1;

                    // Header Info Update
                    const headerInfo = document.getElementById('gang-info-extra');
                    if (headerInfo) {
                        const cityName = EMLAK_CITIES.find(c => c.id === g.baseCity)?.name || g.baseCity;
                        headerInfo.innerHTML = `
                            Üs: <b>${cityName}</b> | Seviye: <b>${lvl}</b> | Kasa: <b style="color:var(--primary);">${bal.toLocaleString()} 💰</b>
                        `;
                    }

                    // UPDATE TOP ACTIONS (Donate / Upgrade / Leave)
                    const actionsDiv = document.getElementById('gang-top-actions');
                    if (actionsDiv) {
                        actionsDiv.innerHTML = '';

                        // Donate
                        const dBtn = document.createElement('button');
                        dBtn.className = 'primary-btn';
                        dBtn.style = 'flex:1;';
                        dBtn.innerHTML = '💰 KASAYA BAĞIŞ YAP';
                        dBtn.onclick = () => depositGang(gangId);
                        actionsDiv.appendChild(dBtn);

                        // Upgrade (Leader Only)
                        if (myRank === 'leader' && nextCost) {
                            const uBtn = document.createElement('button');
                            uBtn.className = 'primary-btn';
                            uBtn.style = "flex:1; background: linear-gradient(45deg, #ffd700, #ff8c00); color:black; font-weight:800; border:none;";
                            uBtn.innerHTML = `<i class="fas fa-arrow-up"></i> YÜKSELT (${(nextCost / 1000000).toLocaleString()}M)`;
                            uBtn.onclick = () => upgradeGang(gangId, nextCost, nextLvlV);
                            actionsDiv.appendChild(uBtn);
                        } else if (myRank === 'leader' && !nextCost) {
                            const maxBtn = document.createElement('button');
                            maxBtn.className = "secondary-btn";
                            maxBtn.style = "flex:1;";
                            maxBtn.innerHTML = "MAX SEVİYE";
                            maxBtn.disabled = true;
                            actionsDiv.appendChild(maxBtn);
                        }

                        // Leave
                        const lBtn = document.createElement('button');
                        lBtn.className = 'logout-btn';
                        lBtn.style = 'flex:0.3; height: 50px;';
                        lBtn.innerText = 'Ayrıl';
                        lBtn.onclick = () => leaveGang();
                        actionsDiv.appendChild(lBtn);
                    }

                    // Remove old extras (cleanup if any left)
                    const oldExtras = list.parentNode.querySelectorAll('.gang-extras');
                    oldExtras.forEach(e => e.remove());

                }
            } else {
                console.error("Gang load failed:", d.error);
                showToast("Çete bilgileri alınamadı!", "error");
            }
        } catch (e) {
            console.error("Gang Info Fetch Error:", e);
            showToast("Bağlantı hatası!", "error");
        }
    }
}

async function createGang() {
    const name = document.getElementById('gang-name-input').value.trim();
    const tag = document.getElementById('gang-tag-input').value.trim();
    const baseCity = document.getElementById('gang-city-input').value;

    if (!name || !tag || !baseCity) return showToast("Ad, etiket ve şehir zorunlu!", "error");

    const isInf = lastUserData?.is_infinite === true;
    const confirmMsg = isInf
        ? `${name} [${tag.toUpperCase()}] çetesini Omega'nın Kartı ile ÜCRETSİZ kurmak istediğine emin misin?`
        : `${name} [${tag.toUpperCase()}] çetesini 1.000.000 💰 karşılığında kurmak istediğine emin misin?`;

    // No confirm, direct create

    // Optimistic UI interaction
    showToast("Çete kuruluyor...", "info");

    try {
        const res = await fetch('/api/gang/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser, name, tag, baseCity })
        });
        const data = await res.json();

        if (data.success) {
            showToast("🏴 Çete başarıyla kuruldu!", "success");
            // Reload user data to get gang ID
            const userRes = await fetch('/api/user/' + currentUser);
            lastUserData = await userRes.json();

            loadGangs();
            if (lastUserData.is_infinite) {
                document.getElementById('user-balance').innerText = "Omega'nın Kartı 💳♾️";
            } else {
                document.getElementById('user-balance').innerText = lastUserData.balance.toLocaleString() + ' 💰';
            }
        } else {
            showToast(data.error || "Hata oluştu!", "error");
        }
    } catch (e) {
        showToast("Sunucu hatası!", "error");
    }
}

async function leaveGang() {
    const isLeader = lastUserData?.gangRank === 'leader';
    const msg = isLeader
        ? "Çete Liderisin! Ayrılırsan çete tamamen feshedilecek (disband). Emin misin?"
        : "Çeteden ayrılmak istediğine emin misin?";

    const confirmed = await showConfirm("Ayrılma Onayı", msg);
    if (!confirmed) return;

    try {
        const res = await fetch('/api/gang/leave', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, "success");
            // Reload user data
            const userRes = await fetch('/api/user/' + currentUser);
            lastUserData = await userRes.json();
            loadGangs();
        } else {
            showToast(data.error || "Hata!", "error");
        }
    } catch (e) {
        showToast("Bağlantı hatası!", "error");
    }
}

async function joinGang(gangId) {
    if (!currentUser) return showToast("Lütfen giriş yapın!", "error");

    showToast("Çeteye katılınıyor...", "info");

    try {
        const res = await fetch('/api/gang/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser, gangId })
        });
        const data = await res.json();

        if (data.success) {
            showToast("🏴 Çeteye başarıyla katıldın!", "success");
            // Reload user data
            const userRes = await fetch('/api/user/' + currentUser);
            lastUserData = await userRes.json();
            loadGangs();
        } else {
            showToast(data.error || "Hata oluştu!", "error");
        }
    } catch (e) {
        showToast("Bağlantı hatası!", "error");
    }
}

async function processGangRequest(targetUser, action, gangId) {
    console.log(`🔄 Gang Request: ${action} for ${targetUser} in ${gangId} by ${currentUser}`);
    try {
        const res = await fetch('/api/gang/process-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requester: currentUser, targetUser, action, gangId })
        });
        const data = await res.json();
        console.log("📩 Gang Request Response:", data);
        if (data.success) {
            showToast(data.message, "success");
            // Sayfayı yenile ve gang verilerini güncelle
            setTimeout(() => loadGangs(), 500);
        } else {
            showToast(data.error || "Hata!", "error");
        }
    } catch (e) {
        console.error("❌ Gang Request Error:", e);
        showToast("İşlem hatası: " + e.message, "error");
    }
}

async function promoteMember(targetUser, newRank, gangId) {
    try {
        const res = await fetch('/api/gang/promote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requester: currentUser, targetUser, newRank, gangId })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, "success");
            loadGangs();
        } else {
            showToast(data.error || "Hata!", "error");
        }
    } catch (e) { showToast("Bağlantı hatası!", "error"); }
}

async function kickMember(target, gangId) {
    const confirmed = await showConfirm("👢 Üye At", `${target} kullanıcısını çeteden atmak istediğine emin misin?`);
    if (!confirmed) return;
    try {
        const res = await fetch('/api/gang/kick', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requester: currentUser, target, gangId })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, "success");
            loadGangs();
        } else {
            showToast(data.error || "Hata!", "error");
        }
    } catch (e) { showToast("Bağlantı hatası!", "error"); }
}

function openDonateModal() {
    document.getElementById('gang-donate-modal').classList.remove('hidden');
    document.getElementById('gang-donate-input').value = '';
}

function closeGangDonateModal() {
    document.getElementById('gang-donate-modal').classList.add('hidden');
}

async function confirmGangDonate() {
    const amount = parseInt(document.getElementById('gang-donate-input').value);
    if (!amount || amount <= 0) return showToast("Geçerli bir miktar girin!", "error");

    closeGangDonateModal();
    showToast("Bağış işleniyor...", "info");

    try {
        const res = await fetch('/api/gang/donate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser, amount })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`💎 Çete kasasına ${amount.toLocaleString()} 💰 bağışladın!`, "success");
            loadGangs();
        } else {
            showToast(data.error || "Hata!", "error");
        }
    } catch (e) { showToast("Bağlantı hatası!", "error"); }
}

async function openDonateModal_OLD() {
    const amount = prompt("Ne kadar bağışlamak istersin?");
    if (!amount) return;

    try {
        const res = await fetch('/api/gang/donate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser, amount })
        });
        const data = await res.json();
        if (data.success) {
            showToast("✅ Bağış yapıldı!", "success");
            if (!lastUserData?.is_infinite) {
                document.getElementById('user-balance').innerText = data.newBalance.toLocaleString() + ' 💰';
            }
            loadGangs(); // Refresh balance
        } else {
            showToast(data.error, "error");
        }
    } catch (e) { showToast("Bağış hatası", "error"); }
}

// --- EMLAK SYSTEM ---
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

async function ensureCities() {
    // Static cities populated, no fetch needed
    return true;
}

let emlakActive = false;
async function loadEmlak() {
    if (emlakActive) return;
    emlakActive = true;

    await ensureCities();

    // Admin Reset Butonu (Emlak için)
    if (currentUser === 'omegacyr') {
        const emlakTab = document.getElementById('tab-emlak');
        const resetBtn = document.createElement('button');
        resetBtn.innerHTML = "🚨 EMLAK SİSTEMİNİ SIFIRLA (ADMİN)";
        resetBtn.className = "primary-btn";
        resetBtn.style = "background: #ff4d4d; color: white; margin-bottom: 20px; width: auto; padding: 10px 25px;";
        resetBtn.onclick = async () => {
            const confirmed = await showConfirm("🚨 Emlak Sıfırlama", "Tüm şehirlerdeki mülkleri ve tüm kullanıcıların tapularını silmek istediğine emin misin? (Fiyatları güncellemek için gereklidir)");
            if (!confirmed) return;

            const res = await fetch('/api/emlak/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requester: 'omegacyr' })
            });
            const d = await res.json();
            if (d.success) {
                showToast(d.message, "success");
                setTimeout(() => location.reload(), 1500);
            } else {
                showToast(d.error || "Hata oluştu", "error");
            }
        };
        emlakTab.insertBefore(resetBtn, emlakTab.firstChild);
    }

    renderEmlakMap();
}

// CAREER LOGIC

async function loadCareer() {
    if (!currentUser) return;
    const grid = document.getElementById('career-grid');
    grid.innerHTML = '<div class="loader"></div>';

    // Use cache or try fetch
    let u = lastUserData;
    if (!u) {
        try {
            const snap = await db.ref('users/' + currentUser).once('value');
            u = snap.val();
        } catch (e) { console.log("Career DB Error", e); }

        if (!u) {
            try {
                const res = await fetch('/api/user/' + currentUser);
                const apiData = await res.json();
                if (apiData && !apiData.error) {
                    u = apiData;
                    if (!lastUserData) updateUserUI(u); // Update cache/UI if first time
                }
            } catch (e) { console.log("Career API Error", e); }
        }
    }
    u = u || {};
    const currentEdu = u.edu || 0;
    const currentJob = u.job || "İşsiz";

    grid.innerHTML = "";
    Object.entries(JOBS).forEach(([name, job]) => {
        if (name === "İşsiz") return;

        const isEduMet = currentEdu >= job.req_edu;
        const hasItem = u.items && u.items[job.req_item];
        const isCurrent = currentJob === name;

        const card = document.createElement('div');
        card.className = `market-card ${isCurrent ? 'active-job' : ''}`;
        card.style.opacity = isEduMet ? '1' : '0.5';

        card.innerHTML = `
            <div class="item-icon">${job.icon}</div>
            <div class="item-info">
                <h3>${name}</h3>
                <p>Maaş: <span class="item-cost">${job.reward.toLocaleString()} 💰</span> / Günlük</p>
                <div style="font-size:0.8rem; margin-top:5px; color:#aaa;">
                    🎓 ${EDUCATION[job.req_edu]}<br>
                    📦 ${job.req_item}
                </div>
            </div>
            <button class="buy-btn" onclick="applyForJob('${name}', ${job.price || 0})" 
                ${isCurrent ? 'disabled' : ''}>
                ${isCurrent ? 'Zaten Bu İşteler' : (hasItem ? 'Hemen Başla' : `${(job.price || 0).toLocaleString()} 💰 Al`)}
            </button>
        `;
        grid.appendChild(card);
    });
}

async function applyForJob(jobName, price) {
    if (!currentUser) return;
    const job = JOBS[jobName];

    // Client-side quick check
    let u = await getUserData();
    u = u || { balance: 0, items: {} };

    // 1. Eğitim Kontrolü
    if ((u.edu || 0) < job.req_edu) {
        return showToast(`Eğitim seviyen yetersiz! (${EDUCATION[job.req_edu]} gereklidir)`, "error");
    }

    // 2. Eşya Kontrolü & Satın Alma - CONFIRMATION
    const hasItem = u.items && u.items[job.req_item];
    if (!hasItem) {
        if (!u.is_infinite && (u.balance || 0) < price) {
            return showToast("Bakiye yetersiz! ❌", "error");
        }
        const confirmMsg = u.is_infinite
            ? `${jobName} olabilmek için gerekli olan ${job.req_item} eşyasını Omega'nın Kartı ile ÜCRETSİZ almak istiyor musun?`
            : `${jobName} olabilmek için ${job.req_item} satın almalısın. Fiyat: ${price.toLocaleString()} 💰 Onaylıyor musun?`;

        // No confirm, direct apply
    }

    try {
        const res = await fetch('/api/jobs/apply', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('aloskegang_token')}`
            },
            body: JSON.stringify({
                username: currentUser,
                jobName: jobName
            })
        });

        const data = await res.json();

        if (data.success) {
            showToast(data.message, "success");
            loadCareer();
            loadProfile();
        } else {
            showToast(data.error || "İşlem başarısız.", "error");
        }
    } catch (e) {
        console.error(e);
        showToast("Sunucu hatası!", "error");
    }
}


function renderEmlakMap() {
    const overlay = document.getElementById('map-overlay');
    if (!overlay) return;
    overlay.innerHTML = "";

    EMLAK_CITIES.forEach(city => {
        const dot = document.createElement('div');
        dot.className = 'city-dot';
        dot.style.left = `${city.x}%`;
        dot.style.top = `${city.y}%`;
        dot.style.transform = "translate(-50%, -50%)"; // Hizalama garantisi

        dot.addEventListener('mouseenter', () => {
            const toast = document.getElementById('city-info-toast');
            toast.querySelector('span').innerText = city.name.toUpperCase();
            toast.style.display = "flex";
        });

        dot.addEventListener('mouseleave', () => {
            const toast = document.getElementById('city-info-toast');
            toast.style.display = "none";
        });

        dot.addEventListener('click', () => {
            document.querySelectorAll('.city-dot').forEach(d => d.classList.remove('active'));
            dot.classList.add('active');
            loadCityProperties(city.id, city.name);
        });

        overlay.appendChild(dot);
    });
}

// Global değişkenler (Filtreleme için)
let currentCityProperties = [];
let currentLoadedCityId = "";
let currentLoadedCityName = "";

function filterProperties(category, btnElement) {
    // UI Update
    if (btnElement) {
        document.querySelectorAll('.filter-btn').forEach(b => {
            b.classList.remove('active');
            b.style.color = '#aaa';
        });
        btnElement.classList.add('active');
        btnElement.style.color = '#fff';
    }

    if (!currentCityProperties) return;

    let filtered = [];
    if (category === 'all') {
        filtered = currentCityProperties;
    } else {
        filtered = currentCityProperties.filter(p => p.category === category);
    }

    renderPropertyList(filtered, currentLoadedCityId, currentLoadedCityName);
}

function renderPropertyList(props, cityId, cityName) {
    const list = document.getElementById('city-properties-list');
    if (!list) return;

    list.innerHTML = "";

    // Grid layout ayarı (Tekrar emin olmak için)
    list.style.display = "grid";
    list.style.gridTemplateColumns = "repeat(auto-fill, minmax(280px, 1fr))";
    list.style.gap = "20px";
    list.style.padding = "10px";

    if (!props || props.length === 0) {
        list.innerHTML = `
            <div style="grid-column: 1 / -1; text-align:center; padding:40px; color:#666; display:flex; flex-direction:column; align-items:center;">
                <i class="fas fa-search" style="font-size:2rem; margin-bottom:15px; opacity:0.5;"></i>
                <p>Bu kategoride mülk bulunamadı.</p>
            </div>
        `;
        return;
    }

    props.forEach((p, index) => {
        const item = document.createElement('div');
        item.className = 'property-card';

        // Kategoriye Göre Renkler ve İkonlar
        let borderColor = '#444';
        let bgGradient = 'linear-gradient(135deg, rgba(255,255,255,0.03), rgba(0,0,0,0.5))';
        let iconColor = '#aaa';
        let catName = "MÜLK";

        if (p.category === 'residence') {
            borderColor = '#00E676'; // Yeşil
            iconColor = '#69F0AE';
            catName = "KONUT";
            bgGradient = 'linear-gradient(135deg, rgba(0, 230, 118, 0.05), rgba(0,0,0,0.4))';
        } else if (p.category === 'shop') {
            borderColor = '#2979FF'; // Mavi
            iconColor = '#448AFF';
            catName = "DÜKKAN";
            bgGradient = 'linear-gradient(135deg, rgba(41, 121, 255, 0.05), rgba(0,0,0,0.4))';
        } else if (p.category === 'land') {
            borderColor = '#FFC400'; // Amber
            iconColor = '#FFD740';
            catName = "ARAZİ";
            bgGradient = 'linear-gradient(135deg, rgba(255, 196, 0, 0.05), rgba(0,0,0,0.4))';
        }

        const isOwned = !!p.owner;
        const isMine = p.owner && p.owner.toLowerCase() === currentUser && (lastUserData?.properties || []).some(up => up.id === p.id);

        // Kart Stilleri
        item.style.background = isMine ? 'linear-gradient(135deg, rgba(255, 215, 0, 0.1), rgba(0,0,0,0.4))' : bgGradient;
        item.style.border = isMine ? '1px solid #FFD700' : `1px solid ${borderColor}33`; // Saydam border
        item.style.boxShadow = isMine ? '0 0 15px rgba(255, 215, 0, 0.1)' : '0 4px 6px rgba(0,0,0,0.3)';
        item.style.borderRadius = "16px";
        item.style.display = "flex";
        item.style.flexDirection = "column";
        item.style.padding = "0";
        item.style.overflow = "hidden";
        item.style.position = "relative";
        item.style.animation = `fadeInUp 0.5s forwards ${index * 0.05}s`;
        item.style.opacity = "0";

        // Gelir Kısmı
        let incomeHtml = "";
        // Sadece Konutlar gelir getirir (Şimdilik)
        if (p.category === 'residence' && p.income > 0) {
            incomeHtml = `
                <div style="margin-top:15px; background:rgba(0,0,0,0.3); padding:10px; border-radius:10px; display:flex; justify-content:space-between; align-items:center;">
                    <span style="color:#aaa; font-size:0.8rem;">GÜNLÜK GELİR</span>
                    <div style="display:flex; align-items:center; gap:5px;">
                        <i class="fas fa-arrow-trend-up" style="color:#00ff88; font-size:0.9rem;"></i>
                        <span style="color:#00ff88; font-weight:700;">+${p.income.toLocaleString()} 💰</span>
                    </div>
                </div>
            `;
        } else if (p.category === 'shop') {
            incomeHtml = `
                <div style="margin-top:15px; background:rgba(255,255,255,0.03); padding:10px; border-radius:10px; display:flex; align-items:center; justify-content:center; gap:8px;">
                    <i class="fas fa-briefcase" style="color:#aaa; font-size:0.9rem;"></i>
                    <span style="color:#888; font-size:0.8rem;">İşletme Kurulabilir</span>
                </div>
            `;
        }

        // Buton / Durum Kısmı
        let actionHtml = "";
        if (isMine) {
            actionHtml = `
                <div style="background:#FFD700; color:#000; font-weight:900; padding:12px; text-align:center; font-size:0.9rem; letter-spacing:1px; margin-top:auto;">
                    <i class="fas fa-check-circle"></i> SİZİN MÜLKÜNÜZ
                </div>`;
        } else if (isOwned) {
            actionHtml = `
                <div style="background:#ff3333; color:#fff; font-weight:800; padding:12px; text-align:center; font-size:0.9rem; letter-spacing:1px; margin-top:auto;">
                    <i class="fas fa-lock"></i> SAHİBİ: @${p.owner}
                </div>`;
        } else {
            actionHtml = `
                <button onclick="executePropertyBuy('${cityId}', '${p.id}', ${p.price}, '${cityName}')" 
                    class="buy-btn-anim"
                    style="
                        width:100%; padding:14px; background:var(--primary); color:#000; border:none; 
                        font-weight:900; cursor:pointer; font-size:1rem; margin-top:auto;
                        transition: background 0.2s;
                    "
                    onmouseover="this.style.background='#00e676'"
                    onmouseout="this.style.background='var(--primary)'"
                >
                    SATIN AL
                </button>
            `;
        }

        item.innerHTML = `
            <div style="padding:20px; display:flex; flex-direction:column; gap:10px; height:100%;">
                
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
                    <div style="display:flex; align-items:center; gap:15px; flex:1;">
                        <div style="width:50px; height:50px; background:${borderColor}22; border-radius:12px; display:flex; align-items:center; justify-content:center; box-shadow:inset 0 0 10px ${borderColor}11; flex-shrink:0;">
                            <i class="fa-solid fa-${p.icon || 'building'}" style="font-size:1.6rem; color:${iconColor};"></i>
                        </div>
                        <div style="flex:1;">
                            <div style="font-size:1.1rem; font-weight:800; color:#fff; line-height:1.2; margin-bottom:4px; word-break: break-word;">${p.name.replace(cityName, '').trim()}</div>
                            <div style="font-size:0.9rem; font-weight:700; color:#fff;">${p.price.toLocaleString()} 💰</div>
                        </div>
                    </div>
                    <div style="font-size:0.7rem; font-weight:800; color:${borderColor}; background:${borderColor}22; padding:4px 10px; border-radius:6px; letter-spacing:0.5px; white-space:nowrap;">
                        ${catName}
                    </div>
                </div>

                ${incomeHtml}

                <div style="flex:1;"></div> <!-- Spacer -->
            </div>
            ${actionHtml}
        `;

        list.appendChild(item);
    });
}

async function loadCityProperties(cityId, cityName) {
    const list = document.getElementById('city-properties-list');
    if (!list) return;

    currentLoadedCityId = cityId;
    currentLoadedCityName = cityName;

    // Başlığı güncelle
    const cityTitle = document.getElementById('city-title');
    if (cityTitle) cityTitle.innerText = cityName;

    // Filtreleri Göster
    const filters = document.getElementById('property-filters');
    if (filters) filters.style.display = 'flex';

    // Butonları resetle
    document.querySelectorAll('.filter-btn').forEach(b => {
        b.classList.remove('active');
        b.style.color = '#aaa';
    });
    // İlk butonu (Hepsi) aktif yap
    const firstBtn = document.querySelector('.filter-btn:first-child');
    if (firstBtn) {
        firstBtn.classList.add('active');
        firstBtn.style.color = '#fff';
    }

    list.innerHTML = `<div class="loader" style="margin: 20px auto;"></div>`;

    try {
        const res = await fetch(`/api/real-estate/properties/${cityId}?_t=${Date.now()}`);
        const props = await res.json();


        // Veriyi kaydet
        currentCityProperties = props || [];

        if (!currentCityProperties || currentCityProperties.length === 0) {
            list.innerHTML = `
                <div style="text-align:center; padding:30px 10px; background: rgba(255, 0, 0, 0.05); border: 1px dashed rgba(255, 0, 0, 0.3); border-radius: 15px; grid-column: 1 / -1;">
                    <i class="fas fa-lock" style="font-size: 2.5rem; color: #ff4d4d; margin-bottom: 15px;"></i>
                    <h4 style="color: white; margin-bottom: 10px;">Veri Bulunamadı veya Erişim Engellendi</h4>
                    <p style="font-size: 0.8rem; color: #aaa; line-height: 1.5;">Sunucudan mülk verisi alınamadı.</p>
                </div>
            `;
            return;
        }

        // Varsayılan olarak hepsini renderla
        renderPropertyList(currentCityProperties, cityId, cityName);

    } catch (e) {
        list.innerHTML = `
            <div style="text-align:center; padding:20px; color:var(--danger); grid-column: 1 / -1;">
                <i class="fas fa-exclamation-triangle" style="font-size:2rem; margin-bottom:10px;"></i>
                <p>Veriler yüklenemedi!</p>
                <p style="font-size:0.7rem; color:#888; margin-top:10px;">
                    Hata: ${e.message}
                </p>
            </div>
        `;
    }
}

async function executePropertyBuy(cityId, propId, price, cityName) {
    if (!currentUser) return showToast("Giriş yapmalısın!", "error");

    const u = await getUserData();
    const confirmMsg = u?.is_infinite
        ? `${cityName} - ${propId} mülkünü Omega'nın Kartı ile ÜCRETSİZ almak istediğine emin misin?`
        : `${price.toLocaleString()} 💰 karşılığında bu mülkü satın almak istediğine emin misin?`;

    // No confirm, direct buy

    try {
        const res = await fetch('/api/real-estate/buy', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('aloskegang_token')}`
            },
            body: JSON.stringify({
                username: currentUser,
                cityId: cityId,
                propertyId: propId
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, "success");
            loadProfile(); // Bakiyeyi güncellemek için
            loadCityProperties(cityId, cityName); // Listeyi yenile
        } else {
            showToast(data.error, "error");
        }
    } catch (e) {
        showToast("İşlem sırasında bir hata oluştu!", "error");
    }
}

async function loadLiveStats() {
    const container = document.getElementById('stats-container');
    if (!container) return;
    if (!currentChannelId) {
        container.innerHTML = '<p style="text-align:center; padding:40px; color:#666;">Kanal istatistiklerini görmek için bir kanalda !doğrulama yapmalısın.</p>';
        return;
    }
    container.innerHTML = '<div class="loader"></div>';

    try {
        const snap = await db.ref('users').once('value');
        const users = snap.val() || {};

        // Bu kanalda aktif olan kullanıcıları filtrele
        const userList = Object.entries(users)
            .map(([name, data]) => ({
                name,
                ...data,
                chan_m: data.channel_m?.[currentChannelId] || 0,
                chan_w: data.channel_watch_time?.[currentChannelId] || 0
            }))
            .filter(u => {
                const n = u.name.toLowerCase().replace('@', '');
                return (u.chan_m > 0 || u.chan_w > 0) && !['aloskegangbot', 'botrix'].includes(n);
            }); // BOTLARI GİZLE

        if (userList.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:40px; color:#666;">Bu kanal için henüz istatistik verisi toplanmamış.</p>';
            return;
        }

        // 1. En Zenginler (Bu kanalda bulunanlar arasından)
        const richest = [...userList].sort((a, b) => (b.balance || 0) - (a.balance || 0)).slice(0, 25);
        // 2. En Aktifler (Sadece bu kanalın mesajları)
        const mostActive = [...userList].sort((a, b) => b.chan_m - a.chan_m).slice(0, 25);
        // 3. Sadık İzleyiciler (Sadece bu kanalın izleme süresi)
        const hardestWorkers = [...userList].sort((a, b) => b.chan_w - a.chan_w).slice(0, 25);

        container.innerHTML = `
            <div class="glass-panel" style="padding:20px;">
                <h3 style="color:var(--primary); margin-bottom:15px; display:flex; align-items:center; gap:10px;">🏆 Kanal Zenginleri <small style="font-size:0.6rem; color:#666;">(Global Bakiye)</small></h3>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${richest.map((u, i) => `
                        <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(255,255,255,0.03); padding:10px; border-radius:10px;">
                            <span style="font-weight:700;">${i + 1}. ${u.name.toUpperCase()}</span>
                            <span style="color:var(--primary); font-weight:800;">${u.is_infinite ? '💳♾️' : (u.balance || 0).toLocaleString() + ' 💰'}</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="glass-panel" style="padding:20px;">
                <h3 style="color:var(--secondary); margin-bottom:15px; display:flex; align-items:center; gap:10px;">💬 En Aktif Chat <small style="font-size:0.6rem; color:#666;">(Bu Kanal)</small></h3>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${mostActive.map((u, i) => {
            const maxVal = mostActive[0].chan_m || 1;
            const percent = (u.chan_m / maxVal) * 100;
            return `
                            <div style="display:flex; flex-direction:column; gap:5px; background:rgba(255,255,255,0.03); padding:10px; border-radius:10px;">
                                <div style="display:flex; justify-content:space-between; font-size:0.85rem;">
                                    <span style="font-weight:700;">${i + 1}. ${u.name.toUpperCase()}</span>
                                    <span>${u.chan_m.toLocaleString()} Mesaj</span>
                                </div>
                                <div class="progress-bar" style="height:6px; background:rgba(255,255,255,0.05);"><div class="progress-fill" style="width:${percent}%; background:var(--secondary);"></div></div>
                            </div>
                        `;
        }).join('')}
                </div>
            </div>

            <div class="glass-panel" style="padding:20px;">
                <h3 style="color:#f1c40f; margin-bottom:15px; display:flex; align-items:center; gap:10px;">👁️ Sadık İzleyiciler <small style="font-size:0.6rem; color:#666;">(Bu Kanal)</small></h3>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${hardestWorkers.map((u, i) => {
            const maxVal = hardestWorkers[0].chan_w || 1;
            const percent = (u.chan_w / maxVal) * 100;
            return `
                            <div style="display:flex; flex-direction:column; gap:5px; background:rgba(255,255,255,0.03); padding:10px; border-radius:10px;">
                                <div style="display:flex; justify-content:space-between; font-size:0.85rem;">
                                    <span style="font-weight:700;">${i + 1}. ${u.name.toUpperCase()}</span>
                                    <span>${u.chan_w.toLocaleString()} dk</span>
                                </div>
                                <div class="progress-bar" style="height:6px; background:rgba(255,255,255,0.05);"><div class="progress-fill" style="width:${percent}%; background:#f1c40f;"></div></div>
                            </div>
                        `;
        }).join('')}
                </div>
            </div>
        `;
    } catch (e) {
        container.innerHTML = "<p>İstatistikler şu an yüklenemiyor.</p>";
    }
}

// --- ARENA (RPG) LOGIC ---
async function loadArena() {
    if (!currentUser) return;
    document.getElementById('my-rpg-stats').innerHTML = '<div class="loader"></div>';
    document.getElementById('arena-weapons').innerHTML = '<div class="loader"></div>';
    document.getElementById('arena-armors').innerHTML = '<div class="loader"></div>';

    const snap = await db.ref('users/' + currentUser).once('value');
    const u = snap.val() || { balance: 0 };
    const rpg = u.rpg || { level: 1, hp: 100, xp: 0, str: 5, def: 0, weapon: 'yumruk', armor: 'tisort' };

    // items: { "kilic": true, "zirh": true } gibi tutulabilir veya direkt rpg.inventory: ["kilic"]
    // Basitlik için rpg.inventory array kullanalım
    const inventory = rpg.inventory || [];

    // --- 1. My Stats ---
    const currentW = RPG_WEAPONS[rpg.weapon] || RPG_WEAPONS["yumruk"];
    const currentA = RPG_ARMORS[rpg.armor] || RPG_ARMORS["tisort"];

    const totalHP = (rpg.hp || 100) + (currentA.hp || 0);
    const totalSTR = (rpg.str || 5) + (currentW.dmg || 0);
    const totalDEF = (rpg.def || 0) + (currentA.def || 0);

    document.getElementById('my-rpg-stats').innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
                <strong style="color:var(--primary); font-size:1.2rem;">Level ${rpg.level || 1}</strong>
                <p style="margin-top:5px; font-size:0.9rem;">
                   ❤️ HP: ${totalHP} | ⚔️ STR: ${totalSTR} | 🛡️ DEF: ${totalDEF}
                </p>
                <p style="font-size:0.8rem; color:#888;">XP: ${rpg.xp || 0}</p>
            </div>
            <div style="text-align:right;">
                <div style="margin-bottom:5px;">${currentW.icon} ${currentW.name}</div>
                <div>${currentA.icon} ${currentA.name}</div>
            </div>
        </div>
    `;

    // --- 2. Weapons ---
    const wContainer = document.getElementById('arena-weapons');
    wContainer.innerHTML = "";
    Object.entries(RPG_WEAPONS).forEach(([code, item]) => {
        if (code === 'yumruk') return; // Default
        const owned = inventory.includes(code) || code === rpg.weapon; // weapon alanda varsa owned say veya inv
        const equipped = code === rpg.weapon;

        const card = document.createElement('div');
        card.className = "market-card";
        card.innerHTML = `
            <div class="item-icon">${item.icon}</div>
            <div class="item-info">
                <h3>${item.name}</h3>
                <p style="color:#aaa;">+${item.dmg} Hasar</p>
                <div class="item-cost">${item.price.toLocaleString()} 💰</div>
            </div>
            <button class="buy-btn" onclick="buyRpgItem('${code}', 'weapon')" ${equipped ? 'disabled' : ''}>
                ${equipped ? 'KUŞANILDI' : (owned ? 'KUŞAN' : 'SATIN AL')}
            </button>
        `;
        wContainer.appendChild(card);
    });

    // --- 3. Armors ---
    const aContainer = document.getElementById('arena-armors');
    aContainer.innerHTML = "";
    Object.entries(RPG_ARMORS).forEach(([code, item]) => {
        if (code === 'tisort') return; // Default
        const owned = inventory.includes(code) || code === rpg.armor;
        const equipped = code === rpg.armor;

        const card = document.createElement('div');
        card.className = "market-card";
        card.innerHTML = `
            <div class="item-icon">${item.icon}</div>
            <div class="item-info">
                <h3>${item.name}</h3>
                <p style="color:#aaa;">+${item.def} Defans | +${item.hp} HP</p>
                <div class="item-cost">${item.price.toLocaleString()} 💰</div>
            </div>
            <button class="buy-btn" onclick="buyRpgItem('${code}', 'armor')" ${equipped ? 'disabled' : ''}>
                ${equipped ? 'KUŞANILDI' : (owned ? 'KUŞAN' : 'SATIN AL')}
            </button>
        `;
        aContainer.appendChild(card);
    });
}

async function buyRpgItem(code, type) {
    if (!currentUser) return;
    const item = type === 'weapon' ? RPG_WEAPONS[code] : RPG_ARMORS[code];
    if (!item) return;

    const u = await getUserData();
    const confirmMsg = u?.is_infinite
        ? `${item.name} eşyasını Omega'nın Kartı ile ÜCRETSİZ almak/kuşanmak istiyor musun?`
        : `${item.name} - İşlem yapmak istiyor musun?`;

    // No confirm, direct buy

    try {
        const res = await fetch('/api/rpg/buy', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('aloskegang_token')}`
            },
            body: JSON.stringify({
                username: currentUser,
                type: type,
                code: code
            })
        });

        const data = await res.json();

        if (data.success) {
            showToast(data.message, "success");
            loadArena();
            loadProfile(); // Bakiye güncellemesi için
        } else {
            showToast(data.error || "İşlem başarısız.", "error");
        }
    } catch (e) {
        console.error(e);
        showToast("Hata oluştu.", "error");
    }
}

async function showCustomizationMarket() {
    // 1. Sekmeleri Manuel Yönet (switchTab fonksiyonunu çağırma çünkü o loadCareer()'ı tetikler)
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    const careerTab = document.getElementById('tab-career');
    careerTab.classList.remove('hidden');

    // Tab butonunu aktif yap
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector("button[onclick=\"switchTab('career')\"]").classList.add('active');

    const title = careerTab.querySelector('h2');
    const desc = careerTab.querySelector('p');

    title.innerHTML = "✨ Profil Özelleştirme Mağazası";
    desc.innerHTML = "İsmini renklendir ve profiline şık arka planlar ekleyerek fark yarat! (Aldığın her yenisi eskisinin yerine geçer)";

    const grid = document.getElementById('career-grid');
    grid.innerHTML = "";

    // Back to Careers button
    const backBtn = document.createElement('div');
    backBtn.innerHTML = `<button class="primary-btn" style="width: auto; padding: 10px 20px; background: rgba(255,255,255,0.05); border: 1px solid var(--glass-border);">🔙 Mesleklere Geri Dön</button>`;
    backBtn.style = "grid-column: 1 / -1; margin-bottom: 20px;";
    backBtn.onclick = () => {
        title.innerHTML = "💼 Kariyer & Meslekler";
        desc.innerHTML = "İşe başlamak için diploman (eğitim seviyen) yetmeli ve gerekli meslek eşyasını satın almalısın.";
        loadCareer();
    };
    grid.appendChild(backBtn);

    // Render Colors
    PROFILE_CUSTOMIZATIONS.colors.forEach(c => {
        const card = document.createElement('div');
        card.className = "market-card";
        card.innerHTML = `
            <div class="item-icon" style="color:${c.color}; text-shadow: 0 0 10px ${c.color};">🎨</div>
            <div class="item-info">
                <h3 style="color:${c.color}">${c.name}</h3>
                <p>İsim Rengi</p>
                <span class="item-cost">${c.price.toLocaleString()} 💰</span>
            </div>
            <button class="buy-btn" onclick="buyCustomization('color', '${c.id}', ${c.price})">Satın Al</button>
        `;
        grid.appendChild(card);
    });

    // Render Backgrounds
    PROFILE_CUSTOMIZATIONS.backgrounds.forEach(bg => {
        const card = document.createElement('div');
        card.className = "market-card";
        card.innerHTML = `
            <div class="item-icon" style="${bg.style}; border-radius:10px; width:40px; height:40px; margin: 0 auto 10px;"></div>
            <div class="item-info">
                <h3>${bg.name}</h3>
                <p>Profil Arkaplanı</p>
                <span class="item-cost">${bg.price.toLocaleString()} 💰</span>
            </div>
            <button class="buy-btn" onclick="buyCustomization('bg', '${bg.id}', ${bg.price})">Satın Al</button>
        `;
        grid.appendChild(card);
    });
}

async function buyCustomization(type, id, price) {
    if (!currentUser) return;

    // Not: Artık fiyat kontrolü ve confirm sunucuya gitmeden önce UI'da yapılabilir ama 
    // güvenlik için asıl kontrol sunucuda. Yine de UX için confirm tutuyoruz.
    const u = await getUserData();
    const confirmMsg = u?.is_infinite
        ? `Bu özelleştirmeyi Omega'nın Kartı ile ÜCRETSİZ almak istediğine emin misin?`
        : `Bu özelleştirmeyi ${price.toLocaleString()} 💰 karşılığında almak istediğine emin misin?`;

    // No confirm, direct buy

    try {
        const res = await fetch('/api/customization/buy', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('aloskegang_token')}`
            },
            body: JSON.stringify({
                username: currentUser,
                type: type,
                id: id
            })
        });

        const data = await res.json();

        if (data.success) {
            showToast(data.message, "success");
            loadProfile();
        } else {
            showToast(data.error || "İşlem başarısız.", "error");
        }
    } catch (e) {
        console.error(e);
        showToast("Sunucu hatası!", "error");
    }
}

// init is called via DOMContentLoaded
// SECURITY: DISABLE F12 & RIGHT CLICK (DEV MODE: DISABLED)
// SECURITY: DISABLE F12 & RIGHT CLICK (DEV MODE: DISABLED) - REMOVED BY REQUEST
// document.addEventListener('contextmenu', event => event.preventDefault());
// document.addEventListener('keydown', function (event) { ... });

// UTILS: Custom Modals replacing browser defaults
function showAlert(title, message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('alert-modal');
        if (!modal) { console.warn("Alert modal not found, fallback to native"); alert(message); resolve(); return; }

        const titleEl = document.getElementById('alert-modal-title');
        const msgEl = document.getElementById('alert-modal-message');
        if (titleEl) titleEl.innerText = title;
        if (msgEl) msgEl.innerText = message;

        modal.classList.remove('hidden');
        modal.style.display = 'flex';

        const btn = document.getElementById('alert-modal-btn');
        if (btn) {
            btn.onclick = () => {
                modal.classList.add('hidden');
                modal.style.display = 'none';
                resolve();
            };
        } else {
            setTimeout(() => {
                modal.classList.add('hidden');
                modal.style.display = 'none';
                resolve();
            }, 2000);
        }
    });
}

function showInput(title, desc, placeholder) {
    return new Promise((resolve) => {
        const modal = document.getElementById('input-modal');
        if (!modal) { const r = prompt(desc); resolve(r); return; }

        const titleEl = document.getElementById('input-modal-title');
        const descEl = document.getElementById('input-modal-desc');
        const input = document.getElementById('input-modal-value');

        if (titleEl) titleEl.innerText = title;
        if (descEl) descEl.innerText = desc;
        if (input) {
            input.value = "";
            input.placeholder = placeholder || "...";
        }

        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        if (input) input.focus();

        const close = () => {
            modal.classList.add('hidden');
            modal.style.display = 'none';
        };

        const confirmBtn = document.getElementById('input-modal-confirm');
        const cancelBtn = document.getElementById('input-modal-cancel');

        if (confirmBtn && cancelBtn) {
            // Remove old listeners to prevent multiple fires if called repeatedly
            // Cloning node is a clean way to wipe listeners
            const newConfirm = confirmBtn.cloneNode(true);
            const newCancel = cancelBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
            cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

            newConfirm.onclick = () => {
                const val = input ? input.value.trim() : "";
                if (!val) {
                    if (input) {
                        input.style.border = "1px solid red";
                        setTimeout(() => input.style.border = "1px solid var(--glass-border)", 1000);
                    }
                    return;
                }
                close();
                resolve(val);
            };

            newCancel.onclick = () => {
                close();
                resolve(null);
            };

            if (input) {
                input.onkeydown = (e) => {
                    if (e.key === 'Enter') newConfirm.click();
                    if (e.key === 'Escape') newCancel.click();
                };
            }
        } else {
            // Fallback if buttons missing
            close();
            resolve(null);
        }
    });
}

function showConfirm(title, message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        if (!modal) { const r = confirm(message); resolve(r); return; } // Fallback

        const titleEl = document.getElementById('confirm-modal-title');
        const msgEl = document.getElementById('confirm-modal-message');

        if (titleEl) titleEl.innerText = title;
        if (msgEl) msgEl.innerText = message;

        modal.classList.remove('hidden');
        modal.style.display = 'flex';

        const yesBtn = document.getElementById('confirm-modal-yes');
        const noBtn = document.getElementById('confirm-modal-cancel');

        // Clean up old listeners
        const newYes = yesBtn.cloneNode(true);
        const newNo = noBtn.cloneNode(true);
        yesBtn.parentNode.replaceChild(newYes, yesBtn);
        noBtn.parentNode.replaceChild(newNo, noBtn);

        newYes.onclick = () => {
            modal.style.display = 'none';
            modal.classList.add('hidden');
            resolve(true);
        };

        newNo.onclick = () => {
            modal.style.display = 'none';
            modal.classList.add('hidden');
            resolve(false);
        };
    });
}

// --- GANG HELPERS (Global) ---

async function depositGang(gangId) {
    const amountStr = await showInput("Kasaya Para Yatır", "Yatırmak istediğiniz miktarı girin:", "1000");
    if (!amountStr) return;
    const amount = parseInt(amountStr);
    if (isNaN(amount) || amount <= 0) return showToast("Geçersiz miktar", "error");

    try {
        const res = await fetch('/api/gang/deposit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser, gangId, amount })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, "success");
            loadGangs(); // Refresh
        } else {
            showToast(data.error, "error");
        }
    } catch (e) { showToast("Hata oluştu", "error"); }
}

async function upgradeGang(gangId, cost, nextLvl) {
    const confirmed = await showConfirm(`Çete Seviyesi ${nextLvl}`, `Kasadaki paradan ${(cost / 1000000).toLocaleString()}M 💰 harcanarak çete seviyesi yükseltilecek. Kapasite artacak. Onaylıyor musunuz?`);
    if (!confirmed) return;

    try {
        const res = await fetch('/api/gang/upgrade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser, gangId })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, "success");
            loadGangs(); // Refresh
        } else {
            showToast(data.error, "error");
        }
    } catch (e) { showToast("Hata oluştu", "error"); }
}



function calculateShopStock() {
    const codeInput = document.getElementById('shopCalcCode');
    const amtInput = document.getElementById('shopCalcAmount');
    if (!codeInput || !amtInput) return;

    const code = codeInput.value.toUpperCase().trim();
    const amount = parseFloat(amtInput.value);

    const buyEl = document.getElementById('shopCalcBuy');
    const sellEl = document.getElementById('shopCalcSell');

    if (!code || !amount || amount <= 0 || !window.shopStocks || !window.shopStocks[code]) {
        buyEl.innerText = "0 💰";
        sellEl.innerText = "0 💰";
        return;
    }

    const price = window.shopStocks[code].price;
    const buyCost = price * amount;

    // %10 Sales Commission
    const rawSell = price * amount;
    const commission = rawSell * 0.10;
    const netSell = rawSell - commission;

    buyEl.innerText = Math.floor(buyCost).toLocaleString() + " 💰";
    sellEl.innerText = Math.floor(netSell).toLocaleString() + " 💰";
}
