require('dotenv').config({ path: '../.env' });
const { Telegraf } = require('telegraf');
const { ethers } = require('ethers');
const express = require('express');
const bodyParser = require('body-parser');
const { AuthorizationCode } = require('simple-oauth2');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

// --- IMPORT MODULES ---
const setupVaultBot = require('./bot');      // Existing Vault Bot
const setupSentinel = require('./sentinel'); // NEW Sentinel Module

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3001; 
const BOT_TOKEN = process.env.BOT_TOKEN;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL || "https://explorer-rpc-http.mainnet.stages.humanode.io";
const BASE_URL = process.env.BASE_URL || "https://api.immunode.xyz";

// --- VALIDATION ---
if (!BOT_TOKEN) {
    console.error('❌ ERROR: BOT_TOKEN is required in .env file');
    console.error('   Current BOT_TOKEN:', BOT_TOKEN ? 'Exists but might be invalid' : 'MISSING');
    process.exit(1);
}
if (!PRIVATE_KEY) {
    console.error('❌ ERROR: PRIVATE_KEY is required in .env file');
    process.exit(1);
}
if (!process.env.HUMANODE_CLIENT_ID || !process.env.HUMANODE_CLIENT_SECRET) {
    console.warn('⚠️ WARNING: HUMANODE_CLIENT_ID or HUMANODE_CLIENT_SECRET missing - OAuth will not work');
}

// Try alternative .env path if current one fails
try {
    require('dotenv').config({ path: './.env' });
} catch (e) {
    console.log('⚠️ Using ../.env path');
}

// --- INITIALIZE BLOCKCHAIN ---
const provider = new ethers.JsonRpcProvider(RPC_URL);
const oracleWallet = new ethers.Wallet(PRIVATE_KEY, provider);
console.log(`🔑 Oracle Wallet: ${oracleWallet.address}`);

// --- SETUP EXPRESS ---
const app = express();
app.use(cors({ origin: "*", credentials: true }));
app.use(bodyParser.json());

// Request logging middleware
app.use((req, res, next) => {
    console.log(`📥 ${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// --- 1. SIGNER PAGE ---
app.get('/signer', (req, res) => {
    const signerHTML = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ImmuNode Signer</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
                max-width: 800px;
                margin: 0 auto;
                padding: 2rem;
                background: #f5f5f5;
                color: #333;
            }
            .container {
                background: white;
                padding: 2rem;
                border-radius: 12px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }
            h1 {
                color: #2c3e50;
                margin-bottom: 1.5rem;
            }
            .status {
                padding: 1rem;
                border-radius: 8px;
                margin: 1rem 0;
                background: #e8f4fd;
                border-left: 4px solid #3498db;
            }
            .status.good {
                background: #e8f7ef;
                border-left-color: #2ecc71;
            }
            .code {
                background: #f8f9fa;
                padding: 1rem;
                border-radius: 6px;
                font-family: 'Monaco', 'Menlo', monospace;
                overflow-x: auto;
                margin: 1rem 0;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🛡️ ImmuNode Signer Service</h1>
            
            <div class="status good">
                <strong>✅ Service Active</strong>
                <p>This service is running and ready to process OAuth signatures.</p>
            </div>
            
            <h2>Oracle Wallet Address</h2>
            <div class="code">${oracleWallet.address}</div>
            
            <h2>Network Status</h2>
            <ul>
                <li>RPC Endpoint: ${RPC_URL}</li>
                <li>Base URL: ${BASE_URL}</li>
                <li>Server Port: ${PORT}</li>
                <li>Timestamp: ${new Date().toISOString()}</li>
            </ul>
            
            <h2>Available Endpoints</h2>
            <ul>
                <li><a href="/health">/health</a> - Health check</li>
                <li><a href="/auth/humanode">/auth/humanode</a> - OAuth initiation</li>
            </ul>
        </div>
    </body>
    </html>`;
    
    res.send(signerHTML);
});

// --- 2. OAUTH LOGIC (Vault) ---
const humanodeConfig = {
    client: { 
        id: process.env.HUMANODE_CLIENT_ID, 
        secret: process.env.HUMANODE_CLIENT_SECRET 
    },
    auth: { 
        tokenHost: 'https://auth.humanode.io', 
        tokenPath: '/oauth/token', 
        authorizePath: '/oauth/authorize' 
    },
};

let client;
try {
    client = new AuthorizationCode(humanodeConfig);
} catch (err) {
    console.error('❌ Failed to initialize OAuth client:', err.message);
}

let userVaults = {}; 
let walletIdentity = {};

app.get('/auth/humanode', (req, res) => {
    if (!client) {
        return res.status(500).json({ error: 'OAuth not configured' });
    }
    
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
    
    if (error) {
        console.error('OAuth Error:', error);
        return res.redirect(`https://app.immunode.xyz?status=biomapping_missing&error=${encodeURIComponent(error)}`);
    }

    if (!state) {
        return res.redirect(`https://app.immunode.xyz?status=error&message=missing_state`);
    }

    try {
        let txData;
        try {
            txData = JSON.parse(Buffer.from(state, 'base64').toString());
        } catch (parseErr) {
            console.error('Failed to parse state:', parseErr);
            return res.redirect(`https://app.immunode.xyz?status=error&message=invalid_state`);
        }

        const accessTokenWrapper = await client.getToken({ 
            code, 
            redirect_uri: 'https://api.immunode.xyz/auth/callback' 
        });
        
        const userProfile = await axios.get('https://auth.humanode.io/oauth/userinfo', {
            headers: { Authorization: `Bearer ${accessTokenWrapper.token.access_token}` }
        });

        const humanodeId = userProfile.data.sub;
        const wallet = txData.userAddress;

        if (!walletIdentity[wallet]) {
            walletIdentity[wallet] = humanodeId;
        } else if (walletIdentity[wallet] !== humanodeId) {
            console.warn(`Identity mismatch for wallet ${wallet}`);
            return res.redirect(`https://app.immunode.xyz?status=compromised`);
        }

        if (txData.action === 'rescue') {
            const amountWei = ethers.parseEther(txData.amount.toString());
            const messageHash = ethers.solidityPackedKeccak256(
                ["address", "address", "uint256", "address"], 
                [txData.userAddress, txData.userAddress, amountWei, txData.vaultAddress]
            );
            const signature = await oracleWallet.signMessage(ethers.getBytes(messageHash));
            
            res.redirect(`https://app.immunode.xyz?status=success&action=rescue&signature=${encodeURIComponent(signature)}`);
        } else if (txData.action === 'withdraw') {
            res.redirect(`https://app.immunode.xyz?status=success&action=withdraw`);
        } else {
            console.warn('Unknown action:', txData.action);
            res.redirect(`https://app.immunode.xyz?status=error&message=unknown_action`);
        }
    } catch (err) {
        console.error('Identity Check Failed:', err.message);
        res.redirect(`https://app.immunode.xyz?status=biomapping_missing`);
    }
});

// --- Health Check Endpoint ---
app.get('/health', (req, res) => {
    const healthData = { 
        status: 'healthy', 
        service: 'ImmuNode API',
        oracle: oracleWallet.address,
        network: RPC_URL,
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    };
    console.log('✅ Health check passed');
    res.json(healthData);
});

// --- 404 Handler ---
app.use((req, res) => {
    console.log(`❌ 404 Not Found: ${req.method} ${req.path}`);
    res.status(404).json({ 
        error: 'Not Found', 
        message: `Route ${req.path} not found`,
        availableRoutes: ['/health', '/signer', '/auth/humanode', '/auth/callback']
    });
});

// --- 3. BOT INITIALIZATION ---
console.log('🤖 Initializing Telegram Bot...');
console.log('🔑 Bot Token present:', !!BOT_TOKEN);

// Initialize bot with error handling
let bot;
try {
    bot = new Telegraf(BOT_TOKEN);
    console.log('✅ Telegram Bot instance created');
} catch (error) {
    console.error('❌ Failed to create bot instance:', error.message);
    process.exit(1);
}

// Load Modules
console.log('📦 Loading modules...');
const sentinel = setupSentinel(bot, provider);
setupVaultBot(bot, userVaults, oracleWallet);
console.log('✅ Modules loaded');

// SIMPLE START COMMAND (remove complex Markup for now)
bot.start((ctx) => {
    console.log(`🆕 User started bot: ${ctx.from.id} (@${ctx.from.username || 'no-username'})`);
    ctx.reply(
        "🛡️ **Welcome to ImmuNode**\n\n" +
        "**Available commands:**\n" +
        "/sentinel - Monitor biomap expiry\n" +
        "/status - Check your biomap status\n\n" +
        "**Or send me your wallet address (0x...) to:**\n" +
        "1. Register for Sentinel alerts\n" +
        "2. Link your vault\n\n" +
        "Start by typing /sentinel or pasting your wallet address.",
        { parse_mode: 'Markdown' }
    );
});

// Unified Message Handler
bot.on('text', async (ctx) => {
    try {
        console.log(`📨 Message from ${ctx.from.id}: ${ctx.message.text.substring(0, 50)}...`);
        
        // 1. Try Sentinel Registration
        const handledBySentinel = await sentinel.handleMessage(ctx);
        if (handledBySentinel) return;

        // 2. Fallback to Vault Linking
        const msg = ctx.message.text.trim();
        if (ethers.isAddress(msg)) {
            await ctx.reply(`✅ **Vault Linked:** \`${msg}\`\n\nYou can now use the menu to manage it.`, { parse_mode: 'Markdown' });
        }
    } catch (err) {
        console.error('Handler Error:', err);
        ctx.reply("❌ Error processing your message. Please try again.");
    }
});

// Error handling for bot
bot.catch((err, ctx) => {
    console.error(`Bot error for ${ctx.updateType}:`, err);
    console.error('Error stack:', err.stack);
});

// --- START SERVER FIRST ---
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Unified ImmuNode Server running on Port ${PORT}`);
    console.log(`🔗 Signer Page: http://localhost:${PORT}/signer`);
    console.log(`❤️ Health Check: http://localhost:${PORT}/health`);
});

// --- THEN START BOT WITH POLLING ---
console.log('🚀 Launching Telegram Bot...');
bot.launch({
    polling: {
        interval: 300,
        autoStart: true,
        params: {
            timeout: 10
        }
    }
}).then(() => {
    console.log('✅ Telegram Bot launched successfully (polling mode)');
    console.log('🤖 Bot is now listening for messages...');
    
    // Test bot info
    bot.telegram.getMe().then(botInfo => {
        console.log(`🤖 Bot Username: @${botInfo.username}`);
        console.log(`🤖 Bot Name: ${botInfo.first_name}`);
        console.log(`🔗 Direct Link: https://t.me/${botInfo.username}`);
    }).catch(err => {
        console.error('❌ Failed to get bot info:', err.message);
    });
    
}).catch(err => {
    console.error('❌ Failed to launch bot:', err.message);
    console.error('Error details:', err);
    
    // Try to get more details about the token
    if (BOT_TOKEN) {
        console.log('🔑 Bot Token (first 10 chars):', BOT_TOKEN.substring(0, 10) + '...');
        console.log('🔑 Bot Token length:', BOT_TOKEN.length);
    }
    
    // Don't exit - let the API server continue running
    console.log('⚠️ Bot failed but API server continues...');
});

// Graceful shutdown
process.once('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down...');
    bot.stop('SIGINT');
    server.close();
    process.exit(0);
});

process.once('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down...');
    bot.stop('SIGTERM');
    server.close();
    process.exit(0);
});