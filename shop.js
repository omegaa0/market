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
const EDU_XP = [0, 5000, 10000, 20000, 50000, 75000, 150000, 500000];

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

// Global Variables
let currentUser = null;
let currentChannelId = null;
let currentPreview = null;
let currentPreviewTimeout = null;

function init() {
    console.log("Market initialized");
    const savedUser = localStorage.getItem('aloskegang_user');
    renderFreeCommands();

    if (savedUser) {
        login(savedUser);
    } else {
        showAuth();
    }

    const genBtn = document.getElementById('generate-code-btn');
    if (genBtn) genBtn.addEventListener('click', startAuth);

    const backBtn = document.getElementById('back-btn');
    if (backBtn) backBtn.addEventListener('click', showAuth);

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
}

window.addEventListener('DOMContentLoaded', init);

function getTodayKey() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
}

const FREE_COMMANDS = [
    // EKONOMİ & BİLGİ
    { cmd: "!bakiye", desc: "Mevcut paranı ve cüzdanını sorgular" },
    { cmd: "!günlük", desc: "Günlük hediye paranı alır (24 saatte bir)" },
    { cmd: "!kredi", desc: "Yediğin timeoutları paraya çevirir" },
    { cmd: "!zenginler", desc: "Kanalın en zengin 5 ismini listeler" },
    { cmd: "!kariyer", desc: "Eğitim seviyeni ve meslek bilgini görür" },
    { cmd: "!hediye @isim [miktar]", desc: "Başka bir kullanıcıya para gönderir" },

    // EĞLENCE & ETKİLEŞİM
    { cmd: "!çalış", desc: "Mesleğinde mesaiye başlar (15 dk sürer)" },
    { cmd: "!fal", desc: "Geleceğine dair gizemli bir yorum alır" },
    { cmd: "!söz", desc: "Rastgele anlamlı veya motive edici bir söz" },
    { cmd: "!şans", desc: "Bugünkü şans yüzdeni ölçer" },
    { cmd: "!iq", desc: "Zeka seviyeni (eğlencesine) test eder" },
    { cmd: "!kişilik", desc: "Karakter analizi yapar" },
    { cmd: "!ship @isim", desc: "Biriyle arandaki aşk uyumunu ölçer" },
    { cmd: "!zar", desc: "Çift zar atar" },
    { cmd: "!efkar", desc: "Efkar seviyeni ölçer 🚬" },
    { cmd: "!toxic", desc: "Ne kadar toksiksin?" },
    { cmd: "!karizma", desc: "Karizma seviyeni ölçer" },
    { cmd: "!gay", desc: "Gaylik seviyeni ölçer 🌈" },
    { cmd: "!keko", desc: "Falso var mı? Keko testi!" },
    { cmd: "!prenses", desc: "Prenseslik testi yapar 👸" },
    { cmd: "!ai [soru]", desc: "Yapay zekaya soru sor (Abonelere özel)" },
    { cmd: "!gündem", desc: "Güncel haber başlıklarını getirir" },
    { cmd: "!hava [şehir]", desc: "Belirlediğin şehrin hava durumunu çeker" },
    { cmd: "!burç [burç]", desc: "Günlük burç yorumunu getirir" },
    { cmd: "!8ball [soru]", desc: "Sihirli 8 top sorunu cevaplar" },
    { cmd: "!hangisi [A] mı [B] mi", desc: "Bot senin yerine karar verir" },

    // OYUNLAR & KUMAR
    { cmd: "!çevir [miktar]", desc: "Slot makinesinde şansını denersin" },
    { cmd: "!yazitura [miktar] [y/t]", desc: "Yazı-tura bahis oyunu oynarsın" },
    { cmd: "!kutu [miktar] [1-3]", desc: "Gizemli kutulardan birini açarsın" },
    { cmd: "!duello @isim [miktar]", desc: "Birine parasına meydan okursun" },
    { cmd: "!rusruleti @isim [miktar]", desc: "Ölümcül rusk ruleti (Timeout + Para)" },
    { cmd: "!soygun", desc: "Ekip toplayıp banka soygunu başlatırsın" },
    { cmd: "!atyarışı [miktar] [1-5]", desc: "At yarışında seçtiğin ata bahis yatırırsın" },
    { cmd: "!piyango katıl", desc: "Büyük ikramiye için bilet alırsın" },

    // BORSA & KRİPTO
    { cmd: "!borsa", desc: "Canlı hisse senedi fiyatlarını listeler" },
    { cmd: "!borsa al [kod] [adet]", desc: "Hisse senedi satın alırsın" },
    { cmd: "!borsa sat [kod] [adet]", desc: "Elindeki hisseleri nakde çevirirsin" }
];

function renderFreeCommands() {
    const freeCmdContainer = document.getElementById('free-commands');
    if (!freeCmdContainer) return;
    freeCmdContainer.innerHTML = "";
    FREE_COMMANDS.forEach(c => {
        const item = document.createElement('div');
        item.style.padding = "10px";
        item.style.background = "rgba(255,255,255,0.02)";
        item.style.borderRadius = "8px";
        item.style.border = "1px solid var(--glass-border)";
        item.innerHTML = `
            <div style="color:var(--primary); font-weight:600; font-size:0.9rem;">${c.cmd}</div>
            <div style="color:#777; font-size:0.75rem; margin-top:2px;">${c.desc}</div>
        `;
        freeCmdContainer.appendChild(item);
    });
}

async function fetchKickPFP(username) {
    if (!username || username === "Misafir") return;
    try {
        const pfpImg = document.getElementById('user-pfp');
        const fallback = document.getElementById('user-pfp-fallback');

        // Use our server proxy to bypass CORS
        const res = await fetch(`/api/kick/pfp/${username}`);
        if (!res.ok) throw new Error("PFP not found");
        const data = await res.json();

        if (data.pfp) {
            pfpImg.src = data.pfp;
            pfpImg.onload = () => {
                pfpImg.style.display = 'block';
                if (fallback) fallback.style.display = 'none';
            };
            pfpImg.onerror = () => {
                pfpImg.style.display = 'none';
                if (fallback) fallback.style.display = 'flex';
            };
        }
    } catch (e) {
        console.log("PFP fetch error (CORS or server)", e);
        // Fallback remains visible
    }
}

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

            // VERIFICATION READ
            db.ref('pending_auth/' + user).once('value').then(snap => {
                const val = snap.val();
                console.log(`[Shop] Auth code READ BACK for ${user}:`, val);
                if (!val) {
                    showToast("HATA: Kod veritabanına yazılamadı! (Read-back failed)", "error");
                    alert(`KRİTİK HATA: '${user}' için veritabanına yazma başarısız oldu. Lütfen konsolu kontrol et.`);
                } else {
                    showToast(`Kod Kaydedildi: ${user} -> ${code}`, "success");
                }
            });

            // Onay bekleyen dinleyiciyi kur
            db.ref('auth_success/' + user).off(); // Eski varsa temizle
            db.ref('auth_success/' + user).on('value', (snap) => {
                if (snap.val()) {
                    db.ref('auth_success/' + user).remove();
                    db.ref('auth_success/' + user).off();
                    login(user);
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

function login(user) {
    currentUser = user;
    localStorage.setItem('aloskegang_user', user);

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

    db.ref('users/' + user).on('value', (snap) => {
        const data = snap.val() || { balance: 0, auth_channel: null };
        const balanceEl = document.getElementById('user-balance');
        if (balanceEl) balanceEl.innerText = `${(data.balance || 0).toLocaleString()} 💰`;

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
    });
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
    const userSnap = await db.ref('users/' + currentUser).once('value');
    const userData = userSnap.val() || { balance: 0 };
    const isInf = userData.is_infinite;
    if (!isInf && (userData.balance || 0) < price) { return showToast("Bakiye yetersiz! ❌", "error"); }

    let userInput = "";
    if (type === 'tts') {
        openTTSModal(price);
        return;
    } else if (type === 'mute') {
        userInput = prompt("Susturulacak kullanıcının adını girin (Örn: aloske):");
        if (!userInput) return;
        userInput = userInput.replace('@', '').toLowerCase().trim();
    } else if (type === 'sr') {
        userInput = prompt("YouTube Video Linkini Yapıştırın:");
        if (!userInput) return;
        if (!userInput.includes('youtube.com') && !userInput.includes('youtu.be')) {
            alert("Lütfen geçerli bir YouTube linki girin!");
            return;
        }
    } else {
        if (!confirm(`"${trigger}" sesi çalınsın mı?`)) return;
    }

    if (!isInf) {
        await db.ref('users/' + currentUser).transaction(u => { if (u) u.balance -= price; return u; });
    }

    if (type === 'tts') {
        await db.ref(`channels/${currentChannelId}/stream_events/tts`).push({
            text: `@${currentUser} diyor ki: ${userInput}`,
            played: false, notified: false, source: "market", timestamp: Date.now(), broadcasterId: currentChannelId
        });
    } else if (type === 'sound') {
        const snap = await db.ref(`channels/${currentChannelId}/settings/custom_sounds/${trigger}`).once('value');
        const sound = snap.val();
        if (sound) {
            await db.ref(`channels/${currentChannelId}/stream_events/sound`).push({
                soundId: trigger, url: sound.url, volume: sound.volume || 100, duration: sound.duration || 0,
                buyer: currentUser, source: "market",
                played: false, notified: false, timestamp: Date.now(), broadcasterId: currentChannelId
            });
        }
    } else if (type === 'mute') {
        await db.ref(`channels/${currentChannelId}/stream_events/mute`).push({
            user: currentUser, target: userInput, timestamp: Date.now(), broadcasterId: currentChannelId
        });
        await db.ref(`users/${userInput}/bans/${currentChannelId}`).transaction(c => (c || 0) + 1);
    } else if (type === 'sr') {
        await db.ref(`channels/${currentChannelId}/stream_events/song_requests`).push({
            query: userInput, user: currentUser, source: "market",
            played: false, timestamp: Date.now(), broadcasterId: currentChannelId
        });
    }
    showToast("İşlem Başarılı! 🚀", "success");
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

    const userSnap = await db.ref('users/' + currentUser).once('value');
    const userData = userSnap.val() || { balance: 0 };
    if (!userData.is_infinite && (userData.balance || 0) < price) {
        return showToast("Bakiye yetersiz! ❌", "error");
    }

    if (!userData.is_infinite) {
        await db.ref('users/' + currentUser).transaction(u => { if (u) u.balance -= price; return u; });
    }

    await db.ref(`channels/${currentChannelId}/stream_events/tts`).push({
        text: `@${currentUser} diyor ki: ${text}`,
        voice: voice,
        played: false, notified: false, source: "market", timestamp: Date.now(), broadcasterId: currentChannelId
    });

    closeTTSModal();
    showToast("TTS Mesajın yayına gönderildi! 🎙️", "success");
    loadProfile();
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
    if (event) event.currentTarget.classList.add('active');

    if (id === 'leaderboard') loadLeaderboard();
    if (id === 'borsa') loadBorsa();
    if (id === 'emlak') loadEmlak();
    if (id === 'quests') loadQuests();
    if (id === 'profile') loadProfile();
    if (id === 'career') loadCareer();
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

    if (currentUser === 'omegacyr') {
        const resetBtn = document.createElement('button');
        resetBtn.innerHTML = "🚨 TÜM HİSSELERİ SIFIRLA (ADMİN)";
        resetBtn.className = "primary-btn";
        resetBtn.style.background = "#ff4d4d";
        resetBtn.style.color = "white";
        resetBtn.style.marginBottom = "20px";
        resetBtn.onclick = async () => {
            if (!confirm("Tüm kullanıcıların tüm hisselerini silmek istediğine emin misin?")) return;
            const res = await fetch('/api/borsa/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requester: 'omegacyr' })
            });
            const d = await res.json();
            if (d.success) showToast(d.message, "success");
        };
        container.parentElement.insertBefore(resetBtn, container);
    }

    container.innerHTML = `<div style="text-align:center; width:100%; padding:60px;"><div class="loader"></div><p style="margin-top:10px;">Borsa verileri yükleniyor...</p></div>`;

    const renderStocks = (stocks) => {
        if (!stocks) return;

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
            "NORMAL": { t: "NORMAL PİYASA", c: "#aaa" }
        };
        statusBox.innerHTML = `<small style="color:#666; display:block; margin-bottom:4px;">GÜNCEL EKONOMİK DURUM</small><strong style="color:${cycleMap[cycle].c}; font-size:1.1rem; letter-spacing:1px;">${cycleMap[cycle].t}</strong>`;

        entries.forEach(([code, data]) => {
            if (!data || typeof data !== 'object') return;
            if (code === 'status') return;

            const trend = data.trend === 1 ? '📈' : '📉';
            const color = data.trend === 1 ? '#05ea6a' : '#ff4d4d';
            const diff = data.oldPrice ? (((data.price - data.oldPrice) / data.oldPrice) * 100).toFixed(2) : "0.00";

            let card = document.querySelector(`.borsa-card[data-code="${code}"]`);
            if (card) {
                const trendEl = card.querySelector('.trend-val');
                const priceEl = card.querySelector('.price-val');
                const buyBtn = card.querySelector('.btn-buy-main');
                const sellBtn = card.querySelector('.btn-sell-main');

                trendEl.innerHTML = `${data.trend === 1 ? '+' : ''}${diff}% ${trend}`;
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
                        <span style="font-weight:800; font-size:1.1rem; color:var(--primary);">${code}</span>
                        <span class="trend-val" style="color:${color}; font-weight:800; font-size:0.75rem;">
                            ${data.trend === 1 ? '+' : ''}${diff}% ${trend}
                        </span>
                    </div>
                    
                    <div style="font-size:0.6rem; color:#666; margin-bottom:4px; text-transform:uppercase; letter-spacing:1px;">Son 24-48 Saatlik Grafik</div>
                    <canvas id="chart-${code}" width="200" height="60" style="width:100%; height:60px; margin:5px 0;"></canvas>

                    <div class="price-val" style="font-size:1.5rem; font-weight:800; color:white; margin:10px 0;">
                        ${(data.price || 0).toLocaleString()} <span style="font-size:0.8rem; color:var(--primary);">💰</span>
                    </div>

                    <div style="font-size: 0.65rem; color: #ff4d4d; margin-bottom: 10px; font-weight: 600;">⚠️ %5 Satış Komisyonu Uygulanır</div>

                    <div class="borsa-controls" style="margin-top:10px;">
                        <input type="number" id="input-${code}" class="borsa-input" value="1" min="0.00000001" step="any" placeholder="Adet" aria-label="${code} Adet Satın Al/Sat">
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
        });
    };

    db.ref('global_stocks').on('value', snap => {
        if (snap.exists()) renderStocks(snap.val());
    });
}

async function executeBorsaBuy(code, price) {
    if (!currentUser) return;
    const input = document.getElementById(`input-${code}`);
    const amount = parseFloat(input.value.replace(',', '.')); // Virgül desteği
    if (!amount || isNaN(amount) || amount <= 0) return showToast("Geçersiz miktar!", "error");

    const total = Math.ceil(price * amount); // Küsüratlı olsa da tam sayıya yuvarlayalım ki ekonomi zor olsun
    if (!confirm(`${amount} adet ${code} için ${total.toLocaleString()} 💰 ödenecek. Onaylıyor musun?`)) return;

    db.ref('users/' + currentUser).once('value', async (snap) => {
        const u = snap.val() || { balance: 0 };
        if (!u.is_infinite && u.balance < total) return showToast("Bakiye yetersiz!", "error");

        await db.ref('users/' + currentUser).transaction(user => {
            if (user) {
                if (!user.is_infinite) user.balance -= total;
                if (!user.stocks) user.stocks = {};
                user.stocks[code] = (user.stocks[code] || 0) + amount;
            }
            return user;
        });
        showToast(`${amount} adet ${code} alındı!`, "success");
        loadProfile();
    });
}

async function executeBorsaSell(code, price) {
    if (!currentUser) return;
    const input = document.getElementById(`input-${code}`);
    const amount = parseFloat(input.value.replace(',', '.')); // Virgül desteği

    db.ref('users/' + currentUser).once('value', async (snap) => {
        const u = snap.val() || {};
        const owned = u.stocks?.[code] || 0;

        if (owned <= 0) return showToast("Bu hisseden elinde yok!", "error");
        if (!amount || isNaN(amount) || amount <= 0) return showToast("Geçersiz miktar!", "error");
        if (amount > owned) return showToast("Elindekinden fazlasını satamazsın!", "error");

        const grossTotal = price * amount;
        const commission = Math.floor(grossTotal * 0.05);
        const netTotal = Math.floor(grossTotal - commission); // Kazancı tam sayı yapalım

        if (!confirm(`${amount} adet ${code} satılacak.\nBrüt: ${grossTotal.toLocaleString()} 💰\nKomisyon (%5): -${commission.toLocaleString()} 💰\nNet Kazanç: ${netTotal.toLocaleString()} 💰\n\nSatış işlemini onaylıyor musun?`)) return;

        await db.ref('users/' + currentUser).transaction(user => {
            if (user) {
                user.balance = (user.balance || 0) + netTotal;
                user.stocks[code] -= amount;
                if (user.stocks[code] <= 0) delete user.stocks[code];
            }
            return user;
        });
        showToast(`${amount} adet ${code} satıldı! Komisyon sonrası kazanç: ${netTotal.toLocaleString()} 💰`, "success");
        loadProfile();
    });
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
                <span style="color:var(--primary); font-weight:800;">${u.balance.toLocaleString()} 💰</span>
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

        db.ref('users/' + currentUser).once('value', snap => {
            const u = snap.val() || {};
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
    db.ref('users/' + currentUser).once('value', snap => {
        const u = snap.val() || { balance: 0 };
        container.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:25px;">
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
                    <div class="stat-box">
                        <label>Cüzdan</label>
                        <div class="val">${u.balance.toLocaleString()} 💰</div>
                    </div>
                    <div class="stat-box">
                        <label>Meslek</label>
                        <div class="val">${u.job || 'İşsiz'}</div>
                    </div>
                    <div class="stat-box">
                        <label>Eğitim</label>
                        <div class="val">${EDUCATION[u.edu || 0]}</div>
                    </div>
                    <div class="stat-box">
                        <label>Durum</label>
                        <div class="val">${u.is_infinite ? '♾️ Sınırsız' : '👤 Oyuncu'}</div>
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
                Object.entries(u.stocks).map(([code, amt]) => `
                                <div class="stat-mini" style="border:1px solid #05ea6a33; background:rgba(5, 234, 106, 0.05);">
                                    <label>${code}</label>
                                    <div class="v">${Number(amt).toLocaleString('tr-TR', { maximumFractionDigits: 8 })} Adet</div>
                                </div>
                            `).join('') : '<p style="grid-column: span 2; font-size: 0.8rem; color:#666;">Henüz hissedar değilsin.</p>'
            }
                    </div>
                </div>

                <div class="emlak-portfolio-section" style="margin-top:20px; border-top:1px solid rgba(255,255,255,0.1); padding-top:20px;">
                    <h3 style="margin-bottom:15px; font-size:1rem; opacity:0.8;">🏠 Emlak Portföyüm</h3>
                    <div id="user-emlak" style="display:grid; grid-template-columns: 1fr; gap:10px;">
                        ${u.properties && u.properties.length > 0 ?
                u.properties.map(p => `
                                <div class="stat-mini" style="border:1px solid var(--primary); background:rgba(102, 252, 241, 0.05); display:flex; justify-content:space-between; align-items:center;">
                                    <div>
                                        <label>${p.city}</label>
                                        <div class="v" style="font-size:0.9rem;">${p.name}</div>
                                    </div>
                                    <div style="text-align:right;">
                                        <div style="color:var(--primary); font-weight:800; font-size:0.8rem;">+${Math.floor(p.income / 24)} 💰 / Saat</div>
                                        <div style="font-size:0.7rem; color:#666;">Günlük: ${p.income}</div>
                                    </div>
                                </div>
                            `).join('') : '<p style="font-size: 0.8rem; color:#666;">Henüz mülk sahibi değilsin.</p>'
            }
                    </div>
                </div>
            </div>
        `;
    });
}

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

let emlakActive = false;
function loadEmlak() {
    if (emlakActive) return;
    emlakActive = true;

    // Admin Reset Butonu (Emlak için)
    if (currentUser === 'omegacyr') {
        const emlakTab = document.getElementById('tab-emlak');
        const resetBtn = document.createElement('button');
        resetBtn.innerHTML = "🚨 EMLAK SİSTEMİNİ SIFIRLA (ADMİN)";
        resetBtn.className = "primary-btn";
        resetBtn.style = "background: #ff4d4d; color: white; margin-bottom: 20px; width: auto; padding: 10px 25px;";
        resetBtn.onclick = async () => {
            if (!confirm("Tüm şehirlerdeki mülkleri ve tüm kullanıcıların tapularını silmek istediğine emin misin? (Fiyatları güncellemek için gereklidir)")) return;
            const res = await fetch('/api/emlak/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requester: 'omegacyr' })
            });
            const d = await res.json();
            if (d.success) {
                showToast(d.message, "success");
                setTimeout(() => location.reload(), 1500);
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

    const snap = await db.ref('users/' + currentUser).once('value');
    const u = snap.val() || {};
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

    const snap = await db.ref('users/' + currentUser).once('value');
    const u = snap.val() || { balance: 0, items: {} };

    // 1. Eğitim Kontrolü
    if ((u.edu || 0) < job.req_edu) {
        return showToast(`Eğitim seviyen yetersiz! (${EDUCATION[job.req_edu]} gereklidir)`, "error");
    }

    // 2. Eşya Kontrolü & Satın Alma
    const hasItem = u.items && u.items[job.req_item];
    if (!hasItem) {
        if (!u.is_infinite && u.balance < price) {
            return showToast("Bakiye yetersiz! ❌", "error");
        }
        if (!confirm(`${jobName} olabilmek için ${job.req_item} satın almalısın. Fiyat: ${price.toLocaleString()} 💰 Onaylıyor musun?`)) return;

        await db.ref('users/' + currentUser).transaction(user => {
            if (user) {
                if (!user.is_infinite) user.balance -= price;
                if (!user.items) user.items = {};
                user.items[job.req_item] = true;
                user.job = jobName;
            }
            return user;
        });
        showToast(`${jobName} olarak işe başladın! Hayırlı olsun. 🚀`, "success");
    } else {
        // Eşyası varsa sadece mesleği güncelle
        await db.ref('users/' + currentUser).update({ job: jobName });
        showToast(`${jobName} mesleğine geçiş yaptın! ✅`, "success");
    }
    loadCareer();
    loadProfile();
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

async function loadCityProperties(cityId, cityName) {
    const list = document.getElementById('city-properties-list');
    if (!list) return;

    // Başlığı güncelle
    const cityTitle = document.getElementById('city-title');
    if (cityTitle) cityTitle.innerText = cityName;

    list.innerHTML = `<div class="loader" style="margin: 20px auto;"></div>`;

    try {
        const res = await fetch(`/api/real-estate/properties/${cityId}`);
        const props = await res.json();

        list.innerHTML = "";

        if (!props || props.length === 0) {
            list.innerHTML = `
                <div style="text-align:center; padding:30px 10px; background: rgba(255, 0, 0, 0.05); border: 1px dashed rgba(255, 0, 0, 0.3); border-radius: 15px;">
                    <i class="fas fa-lock" style="font-size: 2.5rem; color: #ff4d4d; margin-bottom: 15px;"></i>
                    <h4 style="color: white; margin-bottom: 10px;">Veri Erişim Engellendi</h4>
                    <p style="font-size: 0.8rem; color: #aaa; line-height: 1.5;">
                        Şehir verileri sunucudan boş döndü. Bu durum genellikle <b>Firebase Security Rules</b> ayarlarından kaynaklanır.
                    </p>
                    <div style="margin-top: 15px; padding: 10px; background: #000; border-radius: 8px; font-family: monospace; font-size: 0.7rem; color: #00ff88; text-align: left;">
                        Rules -> real_estate_market: { ".read": true, ".write": true }
                    </div>
                </div>
            `;
            return;
        }

        props.forEach((p, index) => {
            const item = document.createElement('div');
            item.className = 'property-card';
            item.style.padding = "20px";
            item.style.background = p.owner ? "rgba(255,50,50,0.03)" : "rgba(255,255,255,0.03)";
            item.style.borderRadius = "18px";
            item.style.border = p.owner ? "1px solid rgba(255,50,50,0.15)" : "1px solid rgba(255,255,255,0.05)";
            item.style.transition = "all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
            item.style.opacity = p.owner ? "0.6" : "1";
            item.style.transform = "translateY(20px)";
            item.style.animation = `fadeInUp 0.5s forwards ${index * 0.1}s`;

            const typeIcons = { low: 'shop', med: 'building', high: 'landmark' };
            let icon = typeIcons[p.type] || 'house';
            if (p.name.includes("Havalimanı")) icon = "plane-arrival";

            const btnHtml = p.owner
                ? `<div style="color:#ff4d4d; font-weight:900; font-size:0.75rem; background:rgba(255,77,77,0.1); padding:5px 12px; border-radius:10px; border:1px solid rgba(255,77,77,0.2);">💸 SAHİBİ: @${p.owner}</div>`
                : `<button class="buy-btn" onclick="executePropertyBuy('${cityId}', '${p.id}', ${p.price}, '${cityName}')" style="background:var(--primary); color:#000; padding: 10px 20px; font-size: 0.85rem; font-weight:900; width: auto; margin:0; border-radius:12px; box-shadow: 0 10px 20px rgba(0,255,136,0.2);">SATIN AL</button>`;

            item.innerHTML = `
                <div style="display:flex; align-items:flex-start; gap:15px; margin-bottom:15px;">
                    <div style="width:50px; height:50px; background:rgba(255,255,255,0.05); border-radius:14px; display:flex; align-items:center; justify-content:center; font-size:1.5rem; color:var(--primary);">
                        <i class="fas fa-${icon}"></i>
                    </div>
                    <div style="flex:1;">
                        <div style="font-weight:900; color:white; font-size:1.1rem; margin-bottom:2px;">${p.name}</div>
                        <div style="color:var(--primary); font-size:1rem; font-weight:900;">+${p.income.toLocaleString()} 💰 <span style="font-weight:400; font-size:0.7rem; color:#888;">/ Gün</span></div>
                    </div>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.2); padding:10px; border-radius:14px;">
                    <div style="display:flex; flex-direction:column;">
                        <span style="color:#666; font-size:0.65rem; text-transform:uppercase; letter-spacing:1px; font-weight:700;">MALİYET</span>
                        <span style="color:#fff; font-size:0.95rem; font-weight:800;">${p.price.toLocaleString()} 💰</span>
                    </div>
                    ${btnHtml}
                </div>
            `;
            list.appendChild(item);
        });
    } catch (e) {
        list.innerHTML = `
            <div style="text-align:center; padding:20px; color:var(--danger);">
                <i class="fas fa-exclamation-triangle" style="font-size:2rem; margin-bottom:10px;"></i>
                <p>Veriler yüklenemedi!</p>
                <p style="font-size:0.7rem; color:#888; margin-top:10px;">
                    Hata: ${e.message}<br><br>
                    <b>Çözüm:</b> Firebase konsolundan 'real_estate_market' düğümü için Security Rules ayarlarını güncelleyin veya botun yetkilerini kontrol edin.
                </p>
            </div>
        `;
    }
}

async function executePropertyBuy(cityId, propId, price, cityName) {
    if (!currentUser) return showToast("Giriş yapmalısın!", "error");

    if (!confirm(`${price.toLocaleString()} 💰 karşılığında bu mülkü satın almak istediğine emin misin?`)) return;

    try {
        const res = await fetch('/api/real-estate/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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

// init is called via DOMContentLoaded
