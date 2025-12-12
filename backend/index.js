require('dotenv').config({ path: '../.env' });
const { Telegraf, Markup } = require('telegraf');
const { ethers } = require('ethers');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3001; // Ensure this matches .env
const BOT_TOKEN = process.env.BOT_TOKEN;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// --- NETWORK CONFIGURATION ---
const MODE = process.env.NETWORK_MODE || 'testnet';
console.log(`🤖 Bot starting in ${MODE.toUpperCase()} mode`);

const RPC_URL = MODE === 'mainnet' 
    ? process.env.RPC_MAINNET 
    : process.env.RPC_TESTNET;

// --- SETUP ---
const app = express();
app.use(cors({
    origin: ["https://app.immunode.xyz", "http://localhost:3000"], 
    methods: ["GET", "POST"],
    credentials: true
}));
app.use(bodyParser.json());

// Rate Limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100,
  message: "Too many requests, please try again later."
});
app.use(limiter);

const bot = new Telegraf(BOT_TOKEN);
const provider = new ethers.JsonRpcProvider(RPC_URL);
const oracleWallet = new ethers.Wallet(PRIVATE_KEY, provider);

// DATABASE (In-Memory)
let userVaults = {}; 

// ==========================================
// 1. TELEGRAM BOT LOGIC
// ==========================================

// START COMMAND
bot.start((ctx) => {
    ctx.reply(
        "🛡️ <b>Welcome to Bio-Freeze Vault</b>\n\n" +
        "1. <b>Create Vault:</b> Open the App to create your safe.\n" +
        "2. <b>Link:</b> Paste your Vault Address here.\n" +
        "3. <b>Deposit:</b> Send funds to your Vault Address to secure them.",
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.url('🚀 Open Vault App', 'https://app.immunode.xyz')],
                [Markup.button.callback('🔒 PANIC FREEZE', 'freeze_action')]
            ])
        }
    );
});

// LINK VAULT (Use HTML mode for bolding)
bot.on('text', (ctx) => {
    const msg = ctx.message.text.trim();
    
    if (ethers.isAddress(msg)) {
        userVaults[ctx.from.id] = msg;
        
        ctx.reply(
            `✅ <b>Vault Successfully Linked!</b>\n\n` +
            `📍 <b>Your Safe Address:</b>\n<code>${msg}</code>\n` +
            `(Tap address to copy)\n\n` +
            `💰 <b>How to Protect Funds:</b>\n` +
            `Go to your Metamask and send HMND to the address above.\n\n` +
            `🚨 <b>Emergency:</b>\n` +
            `If you suspect a hack, come back here and tap PANIC FREEZE.`,
            { parse_mode: 'HTML' }
        );
    } else {
        ctx.reply("❌ That doesn't look like a valid Vault Address. Please copy it from the App.");
    }
});

// PANIC FREEZE ACTION
bot.action('freeze_action', async (ctx) => {
    const userId = ctx.from.id;
    const vaultAddr = userVaults[userId];

    if (!vaultAddr) return ctx.reply("⚠️ No Vault linked! Send your address first.");

    await ctx.reply("❄️ Attempting to freeze vault...");

    try {
        const vaultABI = ["function panicFreeze() external"];
        const vaultContract = new ethers.Contract(vaultAddr, vaultABI, oracleWallet);
        
        const tx = await vaultContract.panicFreeze();
        
        await ctx.reply(
            `✅ <b>VAULT FROZEN!</b>\n\n` + 
            `🔗 <b>Tx Hash:</b>\n<code>${tx.hash}</code>`, 
            { parse_mode: 'HTML' }
        );
    } catch (e) {
        console.error(e);
        ctx.reply("❌ Error: Could not freeze. Is it already frozen?");
    }
});

// ==========================================
// 2. WEB SERVER (ORACLE) LOGIC
// ==========================================

app.post('/verify-face', async (req, res) => {
    const { userAddress, vaultAddress, amount } = req.body;
    
    console.log(`Creating Oracle Signature for ${userAddress}...`);

    try {
        // 1. Re-create the hash exactly like Solidity
        const amountWei = ethers.parseEther(amount.toString());
        const messageHash = ethers.solidityPackedKeccak256(
            ["address", "address", "uint256", "address"],
            [userAddress, userAddress, amountWei, vaultAddress] 
        );

        // 2. Sign it with the Oracle Key
        const signature = await oracleWallet.signMessage(ethers.getBytes(messageHash));

        // 3. Send signature back
        res.json({ success: true, signature: signature });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Signing failed" });
    }
});

// START EVERYTHING
bot.launch();
app.listen(PORT, () => {
    console.log(`🤖 Bot & Oracle Server running on port ${PORT}`);
});

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
