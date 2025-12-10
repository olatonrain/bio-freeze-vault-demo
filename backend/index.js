require('dotenv').config({ path: '../.env' });
const { Telegraf, Markup } = require('telegraf');
const { ethers } = require('ethers');
const express = require('express');
const bodyParser = require('body-parser');

const rateLimit = require('express-rate-limit');

// Rule: Maximum 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100,
  message: "Too many requests, please try again later."
});

// Apply it to all requests
app.use(limiter);

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const PRIVATE_KEY = process.env.PRIVATE_KEY; // Your Server's Wallet Key (The Oracle)

// --- NETWORK CONFIGURATION ---
const MODE = process.env.NETWORK_MODE || 'testnet';
console.log(`🤖 Bot starting in ${MODE.toUpperCase()} mode`);

// Select the correct RPC based on the mode
const RPC_URL = MODE === 'mainnet' 
    ? process.env.RPC_MAINNET 
    : process.env.RPC_TESTNET;

// --- SETUP ---
const app = express();
app.use(bodyParser.json());

const bot = new Telegraf(BOT_TOKEN);
const provider = new ethers.JsonRpcProvider(RPC_URL);
const oracleWallet = new ethers.Wallet(PRIVATE_KEY, provider);

// DATABASE (In-Memory for now - we will upgrade later)
// Maps UserID -> VaultAddress
let userVaults = {}; 

// ==========================================
// 1. TELEGRAM BOT LOGIC
// ==========================================

bot.start((ctx) => {
    ctx.reply(
        "🛡️ *Welcome to Bio-Freeze Vault*\n\n" +
        "1. *Create Vault:* Open the App to create your safe.\n" +
        "2. *Link:* Paste your Vault Address here.\n" +
        "3. *Deposit:* Send funds to your Vault Address to secure them.",
        {
            parse_mode: 'Markdown', // <--- THIS TURNS ON BOLD TEXT
            ...Markup.inlineKeyboard([
                [Markup.button.url('🚀 Open Vault App', 'http://37.60.247.116:3000')],
                [Markup.button.callback('🔒 PANIC FREEZE', 'freeze_action')]
            ])
        }
    );
});

// LINK VAULT
bot.on('text', (ctx) => {
    const msg = ctx.message.text.trim();
    
    if (ethers.isAddress(msg)) {
        userVaults[ctx.from.id] = msg;
        
        ctx.reply(
            `✅ *Vault Successfully Linked!*\n\n` +
            `📍 *Your Safe Address:*\n\`${msg}\`\n` +
            `(Tap address to copy)\n\n` +
            `💰 *How to Protect Funds:*\n` +
            `Go to your Metamask and send HMND to the address above.\n\n` +
            `🚨 *Emergency:*\n` +
            `If you suspect a hack, come back here and tap PANIC FREEZE.`,
            { parse_mode: 'Markdown' } // <--- THIS TURNS ON BOLD TEXT
        );
    } else {
        ctx.reply("❌ That doesn't look like a valid Vault Address. Please copy it from the App.");
    }
});

// PANIC BUTTON ACTION
bot.action('freeze_action', async (ctx) => {
    const userId = ctx.from.id;
    const vaultAddr = userVaults[userId];

    if (!vaultAddr) return ctx.reply("⚠️ No Vault linked! Send your address first.");

    await ctx.reply("❄️ Attempting to freeze vault...");

    try {
        // We connect to the User's Vault using the Oracle Wallet
        const vaultABI = ["function panicFreeze() external"];
        const vaultContract = new ethers.Contract(vaultAddr, vaultABI, oracleWallet);
        
        const tx = await vaultContract.panicFreeze();
        
        // SUCCESS MESSAGE
        await ctx.reply(
            `✅ *VAULT FROZEN!*\n\n` + 
            `🔗 *Tx Hash:*\n\`${tx.hash}\``, 
            { parse_mode: 'Markdown' } // <--- Enable Formatting
        );
    } catch (e) {
        console.error(e);
        ctx.reply("❌ Error: Could not freeze. Is it already frozen?");
    }
});

// ==========================================
// 2. WEB SERVER (ORACLE) LOGIC
// ==========================================

// This endpoint receives the "Face Scan Success" signal from your Frontend
app.post('/verify-face', async (req, res) => {
bot.on('text', (ctx) => {
    const msg = ctx.message.text.trim();
    
    // Check if it looks like an Ethereum Address
    if (ethers.isAddress(msg)) {
        userVaults[ctx.from.id] = msg;
        
        ctx.reply(
            `✅ **Vault Successfully Linked!**\n\n` +
            `📍 **Your Safe Address:**\n\`${msg}\`\n` +
            `(Tap address to copy)\n\n` +
            `💰 **How to Protect Funds:**\n` +
            `Go to your Metamask and send HMND to the address above.\n\n` +
            `🚨 **Emergency:**\n` +
            `If you suspect a hack, come back here and tap PANIC FREEZE.`
        );
    } else {
        ctx.reply("❌ That doesn't look like a valid Vault Address. Please copy it from the App.");
    }
});    const { userAddress, vaultAddress, amount } = req.body;
    
    // IN REALITY: We would verify the Humanode OAuth Token here first.
    // FOR MVP: We assume if this endpoint is hit, the face scan passed.
    
    console.log(`Creating Oracle Signature for ${userAddress}...`);

    try {
        // 1. Re-create the hash exactly like Solidity
        const amountWei = ethers.parseEther(amount.toString());
        const messageHash = ethers.solidityPackedKeccak256(
            ["address", "address", "uint256", "address"],
            [userAddress, userAddress, amountWei, vaultAddress] // sending to self (new wallet)
        );

        // 2. Sign it with the Oracle Key
        const signature = await oracleWallet.signMessage(ethers.getBytes(messageHash));

        // 3. Send signature back to frontend so User can submit it
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
