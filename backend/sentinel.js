// sentinel.js - The Biomapper Monitoring Module
const { ethers } = require('ethers'); // FIX: Consistent import with main file
const schedule = require('node-schedule');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
// REMOVED: unused nodemailer import
// REMOVED: unused Markup import

// Setup DB with error handling
let db;
try {
    const adapter = new FileSync('sentinel_db.json');
    db = low(adapter);
    db.defaults({ users: [], system: { currentGenId: 0 } }).write();
} catch (err) {
    console.error('❌ Failed to initialize Sentinel database:', err);
    process.exit(1);
}

// Config
const CONFIG = {
    CONTRACT: "0x54C62A9B61E7036D21A30c6a59F08D1F602B19e4", // Humanode Contract
    BATCH_SIZE: 25,
    BATCH_DELAY: 1100,
    EXPIRY_WARNING_DAYS: 7,
    BLOCKS_PER_GENERATION: 2628000n // ~6 months
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
            // FIX: More explicit result handling
            // ethers v6 returns a Result object (array-like)
            const result = await contract.biomappings(wallet, genId);
            
            // Check if result is valid
            if (!result || result.length === 0) {
                 return { active: false, daysLeft: 0, status: 'not_mapped' };
            }

            const blockNumber = result[0]; // Access first element (blockNumber)
            
            if (blockNumber === 0n) {
                return { active: false, daysLeft: 0, status: 'not_mapped' };
            }
            
            const genStart = await contract.generationStartBlocks(genId);
            const currentBlock = BigInt(await provider.getBlockNumber());
            const expiryBlock = genStart + CONFIG.BLOCKS_PER_GENERATION;
            const blocksLeft = expiryBlock - currentBlock;
            
            // FIX: Handle negative days (already expired)
            const daysLeft = Math.floor(Number(blocksLeft) * 6 / 86400);
            
            if (daysLeft < 0) {
                return { active: false, daysLeft: 0, status: 'expired' };
            }
            
            return { active: true, daysLeft, status: 'active' };
        } catch (e) { 
            console.error(`calculateDaysLeft error for ${wallet}:`, e.message); 
            return { active: false, daysLeft: 0, error: true, status: 'error' }; 
        }
    }

    // --- COMMANDS ---
    bot.command('sentinel', async (ctx) => {
        try {
            await ctx.reply(
                "🛡️ **ImmuNode Sentinel**\n\n" +
                "Monitor your Humanode biometric expiry.\n\n" +
                "Reply with your **Wallet Address** to register.",
                { parse_mode: 'Markdown' }
            );
        } catch (err) {
            console.error('Error in /sentinel command:', err);
        }
    });

    // Status check command
    bot.command('status', async (ctx) => {
        try {
            const userId = ctx.from.id;
            const user = db.get('users').find({ chatId: userId }).value();
            
            if (!user) {
                return ctx.reply("❌ You're not registered. Use /sentinel to get started.");
            }
            
            const genId = await contract.currentGeneration();
            const status = await calculateDaysLeft(user.wallet, genId);
            
            let message;
            if (status.error) {
                message = "⚠️ Error checking your biomap status. Please try again later.";
            } else if (status.status === 'not_mapped') {
                message = "❌ **Not Biomapped**\n\nYour wallet is not mapped in the current generation.";
            } else if (status.status === 'expired') {
                message = "🔴 **Biomap Expired!**\n\nPlease re-enroll immediately.";
            } else {
                const emoji = status.daysLeft <= 7 ? '🟡' : '🟢';
                message = `${emoji} **Biomap Status**\n\nWallet: \`${user.wallet}\`\nDays Left: **${status.daysLeft}**`;
            }
            
            await ctx.reply(message, { parse_mode: 'Markdown' });
        } catch (err) {
            console.error('Error in /status command:', err);
            ctx.reply("❌ Error checking status. Please try again.");
        }
    });

    // --- TEXT HANDLER (Registration) ---
    const handleMessage = async (ctx) => {
        const text = ctx.message.text.trim();
        
        // Check if it's a valid Ethereum address
        if (!ethers.isAddress(text)) {
            return false; // Not handled - let other handlers process it
        }
        
        try {
            const userId = ctx.from.id;
            const checksumAddress = ethers.getAddress(text); // Normalize address
            const existing = db.get('users').find({ chatId: userId }).value();
            
            if (existing) {
                db.get('users')
                    .find({ chatId: userId })
                    .assign({ wallet: checksumAddress, updatedAt: Date.now() })
                    .write();
                await ctx.reply(
                    `✅ **Updated Sentinel Wallet**\n\n\`${checksumAddress}\``, 
                    { parse_mode: 'Markdown' }
                );
            } else {
                db.get('users')
                    .push({ 
                        chatId: userId, 
                        wallet: checksumAddress, 
                        createdAt: Date.now(),
                        username: ctx.from.username || null
                    })
                    .write();
                await ctx.reply(
                    `✅ **Registered for Alerts**\n\n` +
                    `Wallet: \`${checksumAddress}\`\n\n` +
                    `Use /status to check your biomap expiry.`, 
                    { parse_mode: 'Markdown' }
                );
            }
            return true; // Handled
        } catch (err) {
            console.error('Error handling wallet registration:', err);
            await ctx.reply("❌ Error registering wallet. Please try again.");
            return true; // Still handled (we responded)
        }
    };

    // --- DAILY CRON JOB ---
    schedule.scheduleJob('0 10 * * *', async () => {
        console.log("🔄 Running Sentinel Checks...");
        
        // FIX: Null check for users
        const users = db.get('users').value();
        if (!users || users.length === 0) {
            console.log("No users registered for Sentinel alerts");
            return;
        }

        try {
            const genId = await contract.currentGeneration();
            console.log(`Current Generation: ${genId}`);
            
            let alertsSent = 0;
            let errors = 0;
            
            for (const user of users) {
                try {
                    const status = await calculateDaysLeft(user.wallet, genId);
                    
                    // Alert if expiring soon OR expired
                    if (status.status === 'expired') {
                        // FIX: Await the sendMessage call
                        await bot.telegram.sendMessage(
                            user.chatId, 
                            `🔴 **Biomap EXPIRED!**\n\n` +
                            `Wallet: \`${user.wallet}\`\n\n` +
                            `Please re-enroll immediately to maintain your verification.`,
                            { parse_mode: 'Markdown' }
                        );
                        alertsSent++;
                    } else if (status.active && status.daysLeft <= CONFIG.EXPIRY_WARNING_DAYS) {
                        await bot.telegram.sendMessage(
                            user.chatId, 
                            `⚠️ **Biomap Expiring Soon!**\n\n` +
                            `Wallet: \`${user.wallet}\`\n` +
                            `Days Left: **${status.daysLeft}**\n\n` +
                            `Please re-enroll before expiry.`,
                            { parse_mode: 'Markdown' }
                        );
                        alertsSent++;
                    }
                    
                    // Add delay between checks to avoid rate limits
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                } catch (e) {
                    console.error(`Failed to process user ${user.chatId}:`, e.message);
                    errors++;
                }
            }
            
            console.log(`✅ Sentinel Check Complete: ${alertsSent} alerts sent, ${errors} errors`);
            
        } catch (e) { 
            console.error("Sentinel Cron Error:", e); 
        }
    });

    console.log('🛡️ Sentinel Module Initialized');
    return { handleMessage, calculateDaysLeft };
};