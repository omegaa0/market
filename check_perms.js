const firebase = require('firebase/compat/app');
require('firebase/compat/database');
require('dotenv').config({ path: 'c:/Users/Mehmet/Desktop/KickChatBot/.env' });

const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    databaseURL: process.env.FIREBASE_DB_URL
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

async function checkAdminPerms() {
    console.log("--- CHECKING ADMIN PERMISSIONS ---");

    const snap = await db.ref('admin_users').once('value');
    const admins = snap.val() || {};

    if (Object.keys(admins).length === 0) {
        console.log("⚠️ No admins found in database!");
    } else {
        Object.entries(admins).forEach(([user, data]) => {
            console.log(`\nUser: ${user}`);
            console.log("Permissions:", JSON.stringify(data.permissions, null, 2));
        });
    }

    console.log("\n--- WRITE TEST ---");
    const testUser = "permtest_" + Math.floor(Math.random() * 100);
    console.log(`Creating test admin ${testUser} with 'stocks: true'...`);

    try {
        await db.ref(`admin_users/${testUser}`).set({
            name: testUser,
            permissions: { stocks: true, channels: false }
        });
        console.log("✅ Write success. Reading back...");

        const snap2 = await db.ref(`admin_users/${testUser}/permissions`).once('value');
        console.log("Read back perms:", snap2.val());

        if (snap2.val() && snap2.val().stocks === true) {
            console.log("✅ PERSISTENCE CONFIRMED: Data was written and read back successfully.");
        } else {
            console.error("❌ PERSISTENCE FAILED: Read back data does not match.");
        }

        // Cleanup
        await db.ref(`admin_users/${testUser}`).remove();

    } catch (e) {
        console.error("❌ Write Test Error:", e.message);
    }

    process.exit(0);
}

checkAdminPerms();
