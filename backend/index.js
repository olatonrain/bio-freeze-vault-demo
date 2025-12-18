// backend/index.js
require('dotenv').config({ path: '../.env' });
const { Telegraf } = require('telegraf');
const { ethers } = require('ethers');
const express = require('express');
const cors = require('cors');
const { AuthorizationCode } = require('simple-oauth2');
const bodyParser = require('body-parser');
const axios = require('axios'); // Added missing axios import

// --- MODULES ---
const setupVaultBot = require('./bot');      
const setupSentinel = require('./sentinel'); 

// --- CONFIG ---
const PORT = process.env.PORT || 3001; 
const BOT_TOKEN = process.env.BOT_TOKEN;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL || "https://explorer-rpc-http.mainnet.stages.humanode.io";
const BASE_URL = process.env.BASE_URL || "https://api.immunode.xyz"; // Add BASE_URL

if (!BOT_TOKEN || !PRIVATE_KEY) process.exit(1);

// --- BLOCKCHAIN ---
const provider = new ethers.JsonRpcProvider(RPC_URL);
const oracleWallet = new ethers.Wallet(PRIVATE_KEY, provider);

// --- EXPRESS SERVER ---
const app = express();
app.use(cors());
app.use(bodyParser.json());

// ... (Keep existing Signer/Auth routes exactly as they were) ...
// For brevity: /signer, /auth/humanode, /auth/callback, /health go here.
// Only the BOT logic below is changed.
app.get('/health', (req, res) => res.json({ status: 'healthy' }));

// ==========================================
// 🤖 TELEGRAM BOT (STATEFUL ROUTER)
// ==========================================

const bot = new Telegraf(BOT_TOKEN);
const userState = {}; // Stores: 'SENTINEL_MODE' or 'VAULT_MODE'
const userVaults = {};

// Init Modules
const sentinel = setupSentinel(bot, provider);
// Pass userState to bot.js so it can set the mode
const vaultBot = setupVaultBot(bot, userVaults, oracleWallet, userState); 

// 1. START
bot.start((ctx) => {
    delete userState[ctx.from.id]; // Reset state on start
    vaultBot.handleWelcome(ctx);
});

// 2. ROUTER
bot.on('text', async (ctx) => {
    try {
        const text = ctx.message.text.trim();
        const userId = ctx.from.id;
        const state = userState[userId];

        console.log(`User: ${userId} | State: ${state} | Msg: ${text}`);

        // Only process addresses
        if (ethers.isAddress(text)) {
            
            // PRIORITY 1: Explicit State (User clicked a button)
            if (state === 'SENTINEL_MODE') {
                await sentinel.handleMessage(ctx);
                delete userState[userId]; // Reset after success
                return;
            }
            
            if (state === 'VAULT_MODE') {
                await vaultBot.linkVault(ctx);
                delete userState[userId]; // Reset after success
                return;
            }

            // PRIORITY 2: Auto-Detect (Fallback if no button clicked)
            const code = await provider.getCode(text);
            if (code === '0x') {
                await sentinel.handleMessage(ctx);
            } else {
                await vaultBot.linkVault(ctx);
            }

        } else {
            await ctx.reply("❓ Please send a valid **Ethereum Address**.");
        }
    } catch (err) {
        console.error('Router Error:', err);
        ctx.reply("❌ System Error");
    }
});

// --- LAUNCH ---
const server = app.listen(PORT, () => console.log(`🚀 Server on ${PORT}`));
bot.launch();

process.once('SIGINT', () => { bot.stop(); server.close(); });
process.once('SIGTERM', () => { bot.stop(); server.close(); });