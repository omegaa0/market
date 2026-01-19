const fs = require('fs');
const { minify } = require('terser');
const path = require('path');

async function buildProduction() {
    console.log('🏗️  Production build başlatılıyor...');

    // shop.js dosyasını oku
    const shopJsPath = path.join(__dirname, 'shop.js');
    const shopJsCode = fs.readFileSync(shopJsPath, 'utf8');

    console.log('📦 shop.js minify/obfuscate ediliyor...');

    const result = await minify(shopJsCode, {
        compress: {
            dead_code: true,
            drop_console: false, // Console.log'ları kalsın debug için
            drop_debugger: true,
            keep_classnames: false,
            keep_fnames: false,
            passes: 2
        },
        mangle: {
            toplevel: true,
            properties: {
                regex: /^_/ // Sadece _ ile başlayan private değişkenleri obfuscate et
            }
        },
        format: {
            comments: false
        }
    });

    if (result.error) {
        console.error('❌ Minify hatası:', result.error);
        process.exit(1);
    }

    // Minified dosyayı kaydet
    const outputPath = path.join(__dirname, 'shop.min.js');
    fs.writeFileSync(outputPath, result.code, 'utf8');

    console.log(`✅ Build tamamlandı!`);
    console.log(`📄 Orijinal boyut: ${(shopJsCode.length / 1024).toFixed(2)} KB`);
    console.log(`📄 Minified boyut: ${(result.code.length / 1024).toFixed(2)} KB`);
    console.log(`💾 Kazanç: ${(100 - (result.code.length / shopJsCode.length * 100)).toFixed(1)}%`);
    console.log(`\n⚠️  shop.html içinde shop.js yerine shop.min.js kullanmayı unutma!`);
}

buildProduction().catch(console.error);
