// backend/sentinel.js (DEBUG VERSION)
const { ethers } = require('ethers');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const { Markup } = require('telegraf');

// 1. Setup Database
let db;
try {
    const adapter = new FileSync('sentinel_db.json');
    db = low(adapter);
    db.defaults({ users: [], system: { currentGenId: 0 } }).write();
} catch (err) {
    console.error('❌ FATAL: DB Init Failed:', err);
    process.exit(1);
}

// 2. Network Config
const NETWORKS = {
    // Testnet 5 Address (Known)
    testnet: "0x54c62a9b61e7036d21a30c6a59f08d1f602b19e4", 
    // Mainnet Address (PLACEHOLDER - See Note Below)
    mainnet: "0xE859bef3E0Fc4305e0F5a538B93D68F5449D6EC4" 
};

const CONFIG = {
    EXPIRY_WARNING_DAYS: 7,
    BLOCKS_PER_GENERATION: 2628000n
};

const ABI = [
    "function currentGeneration() view returns (uint256)",
    "function biomappings(address, uint256) view returns (uint256, bytes)",
    "function generationStartBlocks(uint256) view returns (uint256)"
];

module.exports = function setupSentinel(bot, provider) {
    console.log("🛠️ SENTINEL DEBUG: Initializing module...");
    
    // 3. Detect Network Immediately
    let contractAddress = null;
    
    // Check connection on startup
    provider.getNetwork().then(network => {
        console.log(`🛠️ SENTINEL DEBUG: Connected to Chain ID ${network.chainId}`);
        
        // Auto-select address based on chain ID
        if (network.chainId === 14823n || network.chainId === 0x3A05n) { 
            contractAddress = NETWORKS.testnet;
            console.log(`✅ SENTINEL DEBUG: Selected TESTNET Address: ${contractAddress}`);
        } else if (network.chainId === 5234n || network.chainId === 0x1472n) { 
            contractAddress = NETWORKS.mainnet;
            console.log(`⚠️ SENTINEL DEBUG: Selected MAINNET Address: ${contractAddress}`);
            console.log(`   (Make sure this address is the real Mainnet Biomapping contract!)`);
        } else {
            console.warn(`⚠️ SENTINEL DEBUG: Unknown Chain ID ${network.chainId}. Defaulting to Testnet.`);
            contractAddress = NETWORKS.testnet;
        }
    }).catch(err => {
        console.error("❌ SENTINEL DEBUG: RPC Connection Failed on Startup:", err.message);
    });

    // --- HELPER: Status Check ---
    async function getStatus(walletAddr) {
        console.log(`🛠️ DEBUG: getStatus called for ${walletAddr}`);
        
        if (!contractAddress) {
            console.error("❌ DEBUG: Contract Address is UNDEFINED (RPC might be down)");
            return { error: true, message: "Network not ready. RPC connecting..." };
        }

        try {
            const contract = new ethers.Contract(contractAddress, ABI, provider);
            
            console.log("🛠️ DEBUG: Calling currentGeneration()...");
            const genId = await contract.currentGeneration();
            console.log(`🛠️ DEBUG: Generation ID: ${genId}`);

            console.log("🛠️ DEBUG: Calling biomappings()...");
            const cleanAddr = ethers.getAddress(walletAddr); 
            const result = await contract.biomappings(cleanAddr, genId);
            
            if (!result || result.length === 0 || result[0] === 0n) {
                console.log("🛠️ DEBUG: Not Mapped");
                return { active: false, daysLeft: 0, status: 'not_mapped' };
            }

            const genStart = await contract.generationStartBlocks(genId);
            const currentBlock = BigInt(await provider.getBlockNumber());
            const expiryBlock = genStart + CONFIG.BLOCKS_PER_GENERATION;
            const blocksLeft = expiryBlock - currentBlock;
            const daysLeft = Math.floor(Number(blocksLeft) * 6 / 86400); 
            
            return { active: true, daysLeft, status: 'active' };

        } catch (e) {
            console.error(`❌ DEBUG: Blockchain Error:`, e);
            return { error: true, message: e.message };
        }
    }

    const getSentinelMenu = () => {
        return Markup.inlineKeyboard([
            [Markup.button.callback('📡 Check Status', 'sentinel_status')],
            [Markup.button.callback('⬅️ Back to Menu', 'show_main_menu')]
        ]);
    };

    bot.command('sentinel', async (ctx) => {
        ctx.reply("👁️ **Sentinel Setup**\n\nReply with your **Wallet Address**.", { parse_mode: 'Markdown' });
    });

    // --- ACTION HANDLER ---
    bot.action('sentinel_status', async (ctx) => {
        console.log("👉 DEBUG: Button 'sentinel_status' CLICKED by user", ctx.from.id);
        
        try {
            // 1. Try to answer the click immediately (stops spinner)
            await ctx.answerCbQuery("🔍 Checking...").catch(e => console.error("CbQuery Error:", e.message));

            const userId = ctx.from.id;
            const user = db.get('users').find({ chatId: userId }).value();
            
            if (!user) {
                console.log("👉 DEBUG: User not found in DB");
                return ctx.reply("❌ No wallet registered. Please send your address first.");
            }

            console.log(`👉 DEBUG: Checking wallet ${user.wallet}`);
            const status = await getStatus(user.wallet);
            
            let message;
            if (status.error) {
                message = `⚠️ **System Error**\n\n\`${status.message}\``;
            } else if (status.status === 'not_mapped') {
                message = `❌ **Not Biomapped**\n\nWallet: \`${user.wallet}\`\nStatus: Unverified on this network.`;
            } else if (status.status === 'expired') {
                message = `🔴 **Biomap EXPIRED!**\n\nPlease re-enroll.`;
            } else {
                const emoji = status.daysLeft <= 7 ? '🟡' : '🟢';
                message = `${emoji} **Status: Active**\n\nWallet: \`${user.wallet}\`\nExpires in: **${status.daysLeft} Days**`;
            }

            console.log("👉 DEBUG: Sending Reply...");
            await ctx.reply(message, { parse_mode: 'Markdown', ...getSentinelMenu() });
            console.log("✅ DEBUG: Reply Sent!");

        } catch (err) {
            console.error("❌ FATAL ACTION ERROR:", err);
            ctx.reply("❌ Bot crashed while checking status.");
        }
    });

    // ... handleMessage remains same ...
    const handleMessage = async (ctx) => {
        const text = ctx.message.text.trim();
        const userId = ctx.from.id;
        if (!ethers.isAddress(text)) return false;

        const checksumAddress = ethers.getAddress(text);
        const existing = db.get('users').find({ chatId: userId }).value();
        
        if (existing) {
            db.get('users').find({ chatId: userId }).assign({ wallet: checksumAddress, updatedAt: Date.now() }).write();
        } else {
            db.get('users').push({ chatId: userId, wallet: checksumAddress, createdAt: Date.now(), username: ctx.from.username }).write();
        }

        await ctx.reply(`👁️ **Sentinel Activated**\nMonitoring: \`${checksumAddress}\``, { parse_mode: 'Markdown', ...getSentinelMenu() });
        return true;
    };

    return { handleMessage };
};