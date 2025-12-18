// backend/sentinel.js
const { ethers } = require('ethers');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const { Markup } = require('telegraf');

// 1. DATABASE
let db;
try {
    const adapter = new FileSync('sentinel_db.json');
    db = low(adapter);
    db.defaults({ users: [] }).write();
} catch (err) {
    console.error('❌ DB Init Failed:', err);
    process.exit(1);
}

// 2. NETWORK CONFIGURATION
const NETWORKS = {
    // Testnet 5 (Israfel) - KNOWN WORKING
    testnet: "0x54c62a9b61e7036d21a30c6a59f08d1f602b19e4",
    
    // Mainnet - PLACEHOLDER
    // You must replace this if you switch to Mainnet
    mainnet: "0x45E7F628eFd31774De8299EABC80D73Be3E751B3" 
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
    
    // [UI/UX] Module Init Log
    console.log("👁️  Sentinel Module: Initializing...");

    // 3. AUTO-DETECT NETWORK
    let contractAddress = null;
    let networkName = "Unknown";

    provider.getNetwork().then(network => {
        const chainId = network.chainId;
        
        if (chainId === 14823n || chainId === 0x3A05n) { 
            contractAddress = NETWORKS.testnet;
            networkName = "Testnet 5";
            console.log(`   ✅ Connected to: ${networkName}`);
            console.log(`   🎯 Contract:     ${contractAddress}`);
        } else if (chainId === 5234n || chainId === 0x1472n) { 
            contractAddress = NETWORKS.mainnet;
            networkName = "Mainnet";
            console.log(`   ⚠️ Connected to: ${networkName}`);
            console.log(`   🎯 Contract:     ${contractAddress}`);
        } else {
            console.warn(`   ⚠️ Unknown Chain ID (${chainId}). Defaulting to Testnet config.`);
            contractAddress = NETWORKS.testnet;
        }
    }).catch(err => console.error("   ❌ RPC Connection Failed:", err.message));

    // --- STATUS CHECK LOGIC ---
    async function getStatus(walletAddr) {
        if (!contractAddress) return { error: true, message: "Network initializing..." };

        try {
            console.log(`   🔍 [Sentinel] Checking status for ${walletAddr}...`);
            const contract = new ethers.Contract(contractAddress, ABI, provider);
            
            // 1. Current Gen
            const genId = await contract.currentGeneration();
            
            // 2. Mapping Check
            const cleanAddr = ethers.getAddress(walletAddr); 
            const result = await contract.biomappings(cleanAddr, genId);
            
            if (!result || result.length === 0 || result[0] === 0n) {
                console.log(`   ❌ [Sentinel] Result: Not Mapped`);
                return { active: false, daysLeft: 0, status: 'not_mapped' };
            }

            // 3. Time Calculation
            const genStart = await contract.generationStartBlocks(genId);
            const currentBlock = BigInt(await provider.getBlockNumber());
            const expiryBlock = genStart + CONFIG.BLOCKS_PER_GENERATION;
            const blocksLeft = expiryBlock - currentBlock;
            const daysLeft = Math.floor(Number(blocksLeft) * 6 / 86400); 
            
            console.log(`   ✅ [Sentinel] Result: Active (${daysLeft} days left)`);
            return { active: true, daysLeft, status: 'active' };

        } catch (e) {
            console.error(`   ❌ [Sentinel] Error:`, e.message);
            return { error: true, message: "Blockchain check failed." };
        }
    }

    // --- MENUS ---
    const getSentinelMenu = () => Markup.inlineKeyboard([
        [Markup.button.callback('📡 Check Status', 'sentinel_status')],
        [Markup.button.callback('⬅️ Back to Menu', 'show_main_menu')]
    ]);

    // --- COMMANDS & ACTIONS ---
    bot.command('sentinel', async (ctx) => {
        ctx.reply(`👁️ **Sentinel Setup (${networkName})**\n\nReply with your **Wallet Address**.`, { parse_mode: 'Markdown' });
    });

    bot.action('sentinel_status', async (ctx) => {
        const userId = ctx.from.id;
        const user = db.get('users').find({ chatId: userId }).value();
        
        if (!user) return ctx.reply("❌ No wallet registered.");

        await ctx.answerCbQuery("🔍 Checking Blockchain...");
        
        const status = await getStatus(user.wallet);
        let message;
        
        if (status.error) {
            message = `⚠️ **System Error**\n\`${status.message}\``;
        } else if (status.status === 'not_mapped') {
            message = `❌ **Not Biomapped**\n\nNetwork: ${networkName}\nWallet: \`${user.wallet}\`\n\n_Status: Not found on this network._`;
        } else {
            const emoji = status.daysLeft <= 7 ? '🟡' : '🟢';
            message = `${emoji} **Active**\n\nNetwork: ${networkName}\nExpires in: **${status.daysLeft} Days**`;
        }
        
        await ctx.reply(message, { parse_mode: 'Markdown', ...getSentinelMenu() });
    });

    const handleMessage = async (ctx) => {
        const text = ctx.message.text.trim();
        const userId = ctx.from.id;

        if (!ethers.isAddress(text)) return false;
        
        const checksumAddress = ethers.getAddress(text);
        
        // Update DB
        const existing = db.get('users').find({ chatId: userId }).value();
        if (existing) {
            db.get('users').find({ chatId: userId }).assign({ wallet: checksumAddress, updatedAt: Date.now() }).write();
        } else {
            db.get('users').push({ chatId: userId, wallet: checksumAddress, createdAt: Date.now(), username: ctx.from.username }).write();
        }

        console.log(`   💾 [Sentinel] User ${userId} registered wallet ${checksumAddress}`);

        await ctx.reply(
            `👁️ **Sentinel Activated**\nTarget: \`${checksumAddress}\`\nNetwork: ${networkName}`, 
            { parse_mode: 'Markdown', ...getSentinelMenu() }
        );
        return true;
    };

    return { handleMessage };
};