// backend/index.js
require('dotenv').config({ path: '../.env' });
const { Telegraf } = require('telegraf');
const { ethers } = require('ethers');
const express = require('express');
const cors = require('cors');
const { AuthorizationCode } = require('simple-oauth2');
const bodyParser = require('body-parser');
const axios = require('axios');

// --- MODULES ---
const setupVaultBot = require('./bot');      
const setupSentinel = require('./sentinel'); 

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3001; 
const BOT_TOKEN = process.env.BOT_TOKEN;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const BASE_URL = process.env.BASE_URL || "https://api.immunode.xyz";

// [UI/UX] Smart Network Selection
const MODE = process.env.NETWORK_MODE || 'testnet';
const RPC_URL = MODE === 'mainnet' 
    ? (process.env.RPC_MAINNET || "https://explorer-rpc-http.mainnet.stages.humanode.io")
    : (process.env.RPC_TESTNET || "https://explorer-rpc-http.testnet5.stages.humanode.io");

// [UI/UX] Startup Banner
console.clear();
console.log("==========================================");
console.log("   ❄️  BIO-FREEZE VAULT & SENTINEL       ");
console.log("==========================================");
console.log(`🌍 MODE:        ${MODE.toUpperCase()}`);
console.log(`🔗 RPC:         ${RPC_URL}`);
console.log(`🤖 BOT TOKEN:   ${BOT_TOKEN ? '✅ Loaded' : '❌ Missing'}`);
console.log("==========================================\n");

if (!BOT_TOKEN || !PRIVATE_KEY) {
    console.error('❌ CRITICAL ERROR: Missing BOT_TOKEN or PRIVATE_KEY in .env');
    process.exit(1);
}

// --- BLOCKCHAIN CONNECTION ---
const provider = new ethers.JsonRpcProvider(RPC_URL);
const oracleWallet = new ethers.Wallet(PRIVATE_KEY, provider);

// --- EXPRESS SERVER ---
const app = express();
app.use(cors());
app.use(bodyParser.json());

// Routes
app.get('/health', (req, res) => res.json({ status: 'healthy', mode: MODE }));

app.get('/signer', (req, res) => {
    res.send(`<h1>🛡️ ImmuNode Signer (${MODE})</h1><p>Oracle: ${oracleWallet.address}</p>`);
});

// OAuth Logic
const humanodeConfig = {
    client: { id: process.env.HUMANODE_CLIENT_ID, secret: process.env.HUMANODE_CLIENT_SECRET },
    auth: { tokenHost: 'https://auth.humanode.io', tokenPath: '/oauth/token', authorizePath: '/oauth/authorize' },
};
let client;
try { client = new AuthorizationCode(humanodeConfig); } catch (err) {}

app.get('/auth/humanode', (req, res) => {
    if (!client) return res.status(500).json({ error: 'OAuth not configured' });
    const { userAddress, vaultAddress, amount, action } = req.query;
    const state = JSON.stringify({ userAddress, vaultAddress, amount, action });
    const authorizationUri = client.authorizeURL({
        redirect_uri: `${BASE_URL}/auth/callback`,
        scope: 'face_scan', 
        state: Buffer.from(state).toString('base64'), 
    });
    res.json({ url: authorizationUri });
});

app.get('/auth/callback', async (req, res) => {
    const { code, state, error } = req.query;
    if (error) return res.redirect(`https://app.immunode.xyz?status=biomapping_missing`);
    try {
        const txData = JSON.parse(Buffer.from(state, 'base64').toString());
        const accessTokenWrapper = await client.getToken({ code, redirect_uri: 'https://api.immunode.xyz/auth/callback' });
        if (txData.action === 'rescue') {
            const amountWei = ethers.parseEther(txData.amount.toString());
            const messageHash = ethers.solidityPackedKeccak256(
                ["address", "address", "uint256", "address"], 
                [txData.userAddress, txData.userAddress, amountWei, txData.vaultAddress]
            );
            const signature = await oracleWallet.signMessage(ethers.getBytes(messageHash));
            res.redirect(`https://app.immunode.xyz?status=success&action=rescue&signature=${encodeURIComponent(signature)}`);
        } else {
            res.redirect(`https://app.immunode.xyz?status=success&action=${txData.action}`);
        }
    } catch (err) {
        res.redirect(`https://app.immunode.xyz?status=biomapping_missing`);
    }
});

// ==========================================
// 🤖 TELEGRAM BOT SETUP
// ==========================================

const bot = new Telegraf(BOT_TOKEN);
const userState = {}; 
const userVaults = {};

// Init Modules
// [Fix] Pass the configured provider to Sentinel
const sentinel = setupSentinel(bot, provider);
const vaultBot = setupVaultBot(bot, userVaults, oracleWallet, userState); 

// 1. START COMMAND
bot.start((ctx) => {
    delete userState[ctx.from.id];
    vaultBot.handleWelcome(ctx);
});

// 2. SMART ROUTER
bot.on('text', async (ctx) => {
    try {
        const text = ctx.message.text.trim();
        const userId = ctx.from.id;
        const state = userState[userId];

        // [UI/UX] Log incoming interaction
        console.log(`📩 [User ${userId}] sent: "${text}" | State: ${state || 'NONE'}`);

        if (ethers.isAddress(text)) {
            // Priority 1: Explicit State
            if (state === 'SENTINEL_MODE') {
                await sentinel.handleMessage(ctx);
                delete userState[userId]; 
                return;
            }
            if (state === 'VAULT_MODE') {
                await vaultBot.linkVault(ctx);
                delete userState[userId]; 
                return;
            }

            // Priority 2: Auto-Detect
            const code = await provider.getCode(text);
            if (code === '0x') {
                console.log(`   👉 Detected Wallet -> Routing to Sentinel`);
                await sentinel.handleMessage(ctx);
            } else {
                console.log(`   👉 Detected Contract -> Routing to Vault`);
                await vaultBot.linkVault(ctx);
            }
        } else {
            await ctx.reply("❓ Please send a valid **Ethereum Address**.", { parse_mode: 'Markdown' });
        }
    } catch (err) {
        console.error('❌ Router Error:', err.message);
        ctx.reply("❌ System Error");
    }
});

// --- LAUNCH ---
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API Server running on Port ${PORT}`);
});

bot.launch().then(() => {
    console.log('✅ Telegram Bot is ONLINE and listening...');
}).catch(err => console.error('❌ Bot Launch Failed:', err));

process.once('SIGINT', () => { bot.stop(); server.close(); });
process.once('SIGTERM', () => { bot.stop(); server.close(); });
