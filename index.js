const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

// 🔐 SECURE FIREBASE URL FROM ENVIRONMENT VARIABLES
const FIREBASE_URL = process.env.FIREBASE_URL;

// Store user states
const userStates = {};

// Function to fetch study materials from Firebase
async function getMaterialsFromFirebase() {
    try {
        const response = await fetch(`${FIREBASE_URL}/materials.json`);
        const data = await response.json();
        if (!data) return [];

        return Object.keys(data).map(key => ({
            id: key,
            title: data[key].title,
            subject: data[key].subject,
            link: data[key].link
        }));
    } catch (error) {
        console.error("Failed to fetch materials:", error);
        return [];
    }
}

async function startBot() {
    if (!FIREBASE_URL) {
        console.log("❌ ERROR: FIREBASE_URL is missing!");
        process.exit(1);
    }

    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ["Seesarathi", "Agent", "1.0"]
    });

    // Connection Updates
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.clear();
            console.log('\n📱 Scan the QR Code to connect Seesarathi Agent\n');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'open') {
            console.log('✅ SEESARATHI AGENT IS ONLINE!');
        }

        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                startBot();
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Handle Incoming Messages
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;
        if (msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const text = (
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            ""
        ).toLowerCase().trim();

        console.log(`📩 Query: ${text}`);

        // 📚 Fetch Study Materials
        if (text.includes("notes") || text.includes("materials") || text.includes("pdf")) {
            const materials = await getMaterialsFromFirebase();

            if (materials.length === 0) {
                await sock.sendMessage(sender, {
                    text: "📂 Study materials are currently unavailable. Please check back later."
                });
                return;
            }

            let response = "📚 *SEESARATHI STUDY MATERIALS*\n\n";
            materials.forEach(item => {
                response += `🔹 *${item.title}*\n📖 Subject: ${item.subject}\n🔗 ${item.link}\n\n`;
            });

            await sock.sendMessage(sender, { text: response });
        }

        // 🎓 Subject Guidance
        else if (text.includes("science") || text.includes("math") || text.includes("english")) {
            await sock.sendMessage(sender, {
                text: `📘 *Seesarathi Academic Guidance*\n\n` +
                      `Please specify what you need:\n` +
                      `• Type *notes science*\n` +
                      `• Type *notes math*\n` +
                      `• Type *notes english*`
            });
        }

        // 📝 Exam Preparation
        else if (text.includes("see") || text.includes("exam") || text.includes("guess")) {
            await sock.sendMessage(sender, {
                text: `📝 *SEE Exam Preparation*\n\n` +
                      `Get important resources:\n` +
                      `• Type *notes* for study materials\n` +
                      `• Type *syllabus* for curriculum\n` +
                      `• Type *guide* for preparation tips`
            });
        }

        // 📖 Syllabus Information
        else if (text.includes("syllabus")) {
            await sock.sendMessage(sender, {
                text: "📘 Visit CDC Nepal for the official syllabus:\nhttps://cdc.gov.np"
            });
        }

        // 📞 Contact Information
        else if (text.includes("contact")) {
            await sock.sendMessage(sender, {
                text: "📞 *Contact Seesarathi*\n\n📧 Email: support@seesarathi.com"
            });
        }

        // 👋 Greetings
        else if (text.includes("hi") || text.includes("hello") || text.includes("hey")) {
            await sock.sendMessage(sender, {
                text: `👋 *Welcome to Seesarathi Agent!*\n\n` +
                      `Your AI learning companion.\n\n` +
                      `📚 Type *notes* to get study materials\n` +
                      `📝 Type *exam* for SEE preparation\n` +
                      `📖 Type *syllabus* for curriculum details`
            });
        }

        // 🤖 Default Response
        else {
            await sock.sendMessage(sender, {
                text: `🤖 I couldn't understand your request.\n\n` +
                      `Try the following commands:\n` +
                      `• *notes*\n` +
                      `• *exam*\n` +
                      `• *syllabus*\n` +
                      `• *contact*`
            });
        }
    });
}

startBot().catch(err => console.log("Error: " + err));
