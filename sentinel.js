// sentinel.js - The Biomapper Monitoring Module
const { Markup } = require('telegraf');
const ethers = require('ethers');
const schedule = require('node-schedule');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const nodemailer = require('nodemailer');

// Setup DB
const adapter = new FileSync('sentinel_db.json');
const db = low(adapter);
db.defaults({ users: [], system: { currentGenId: 0 } }).write();

// Config
const CONFIG = {
    CONTRACT: "0x54C62A9B61E7036D21A30c6a59F08D1F602B19e4", // Humanode Contract
    RPC_URL: "https://explorer-rpc-http.mainnet.stages.humanode.io",
    BATCH_SIZE: 25,
    BATCH_DELAY: 1100
};

// ABI
const ABI = [
    "function currentGeneration() view returns (uint256)",
    "function biomappings(address, uint256) view returns (uint256, bytes)",
    "function generationStartBlocks(uint256) view returns (uint256)"
];

module.exports = function setupSentinel(bot, provider) {
    const contract = new ethers.Contract(CONFIG.CONTRACT, ABI, provider);

    // --- HELPER FUNCTIONS ---
    async function calculateDaysLeft(wallet, genId) {
        try {
            const [blockNumber] = await contract.biomappings(wallet, genId);
            if (blockNumber === 0n) return { active: false, daysLeft: 0 };
            
            const genStart = await contract.generationStartBlocks(genId);
            const currentBlock = BigInt(await provider.getBlockNumber());
            const expiryBlock = genStart + 2628000n; // ~6 months
            const blocksLeft = expiryBlock - currentBlock;
            return { active: true, daysLeft: Math.floor(Number(blocksLeft) * 6 / 86400) };
        } catch (e) { console.error(e); return { active: false, error: true }; }
    }

    // --- COMMANDS ---
    bot.command('sentinel', (ctx) => {
        ctx.reply(
            "🛡️ **ImmuNode Sentinel**\n\nMonitor your Humanode biometric expiry.\n\nReply with your **Wallet Address** to register.",
            { parse_mode: 'Markdown' }
        );
    });

    // --- TEXT HANDLER (Registration) ---
    // Note: We hook into the bot's logic. 
    // This function returns true if it handled the message, false otherwise.
    const handleMessage = async (ctx) => {
        const text = ctx.message.text.trim();
        if (ethers.isAddress(text)) {
            // Register User
            const userId = ctx.from.id;
            const existing = db.get('users').find({ chatId: userId }).value();
            
            if (existing) {
                db.get('users').find({ chatId: userId }).assign({ wallet: text }).write();
                ctx.reply(`✅ Updated Sentinel Wallet: \`${text}\``, { parse_mode: 'Markdown' });
            } else {
                db.get('users').push({ chatId: userId, wallet: text, createdAt: Date.now() }).write();
                ctx.reply(`✅ Registered for Alerts: \`${text}\``, { parse_mode: 'Markdown' });
            }
            return true; // Handled
        }
        return false; // Not handled (let other bot logic handle it)
    };

    // --- DAILY CRON JOB ---
    schedule.scheduleJob('0 10 * * *', async () => {
        console.log("🔄 Running Sentinel Checks...");
        const users = db.get('users').value();
        if (users.length === 0) return;

        try {
            const genId = await contract.currentGeneration();
            
            for (const user of users) {
                const status = await calculateDaysLeft(user.wallet, genId);
                
                if (status.active && status.daysLeft <= 7) {
                    bot.telegram.sendMessage(
                        user.chatId, 
                        `⚠️ **Biomap Expiring Soon!**\n\nDays Left: ${status.daysLeft}\nPlease re-enroll immediately.`,
                        { parse_mode: 'Markdown' }
                    ).catch(e => console.error(`Failed to alert ${user.chatId}`));
                }
            }
        } catch (e) { console.error("Sentinel Cron Error:", e); }
    });

    return { handleMessage };
};
