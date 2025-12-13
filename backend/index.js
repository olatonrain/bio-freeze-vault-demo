require('dotenv').config({ path: '../.env' });
const { Telegraf, Markup } = require('telegraf'); // Telegraf still needed for setup
const { ethers } = require('ethers');
const express = require('express');
const bodyParser = require('body-parser');
const { AuthorizationCode } = require('simple-oauth2');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const setupBot = require('./bot'); // <--- IMPORT THE NEW BOT FILE

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3001; 
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

// --- OAUTH CONFIGURATION (Real Humanode) ---
const humanodeConfig = {
  client: {
    id: process.env.HUMANODE_CLIENT_ID,
    secret: process.env.HUMANODE_CLIENT_SECRET,
  },
  auth: {
    tokenHost: 'https://auth.humanode.io', 
    tokenPath: '/oauth/token',
    authorizePath: '/oauth/authorize',
  },
};
const client = new AuthorizationCode(humanodeConfig);

// DATABASE (In-Memory)
let userVaults = {};
let walletIdentity = {};

// 1. START THE SCAN (Identity Aware)
app.get('/auth/humanode', (req, res) => {
    const { userAddress, vaultAddress, amount, action } = req.query;
    console.log(`🚀 Starting Identity Check for: ${userAddress}`);
    
    // Pack state
    const state = JSON.stringify({ userAddress, vaultAddress, amount, action });
    
    const authorizationUri = client.authorizeURL({
        redirect_uri: 'https://api.immunode.xyz/auth/callback',
        scope: 'face_scan', 
        state: Buffer.from(state).toString('base64'), 
    });

    res.json({ url: authorizationUri });
});

// 2. HANDLE THE CALLBACK (The Security Core)
app.get('/auth/callback', async (req, res) => {
    const { code, state, error } = req.query;

    // A. DECODE STATE
    let txData = {};
    try {
        txData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch (e) {
        return res.redirect(`https://app.immunode.xyz?status=error`);
    }

    // B. HANDLE ERRORS (User cancelled or No Biomapping)
    if (error) {
        console.log("🚨 OAuth Error:", error);
        return res.redirect(`https://app.immunode.xyz?status=biomapping_missing`);
    }

    try {
        // C. GET TOKEN
        const accessTokenWrapper = await client.getToken({
            code,
            redirect_uri: 'https://api.immunode.xyz/auth/callback',
        });

        // D. GET USER IDENTITY (The Unique Face ID)
        const userProfile = await axios.get('https://auth.humanode.io/oauth/userinfo', {
            headers: { Authorization: `Bearer ${accessTokenWrapper.token.access_token}` }
        });

        const humanodeId = userProfile.data.sub; // The Unique ID of the Face
        const wallet = txData.userAddress;

        console.log(`🔍 Verifying Identity: ${humanodeId} for Wallet: ${wallet}`);

        // E. IDENTITY LOCK CHECK
        if (!walletIdentity[wallet]) {
            // First time? Lock this Face to this Wallet.
            walletIdentity[wallet] = humanodeId;
            console.log("🔒 Identity Bound: Wallet linked to Face ID.");
        } else {
            // Recurring user? CHECK IF IT MATCHES.
            if (walletIdentity[wallet] !== humanodeId) {
                console.log("🚨 INTRUDER DETECTED: Face does not match Wallet Owner!");
                return res.redirect(`https://app.immunode.xyz?status=compromised`);
            }
        }

        // F. SUCCESS - EXECUTE ACTION
        if (txData.action === 'rescue') {
            const amountWei = ethers.parseEther(txData.amount.toString());
            const messageHash = ethers.solidityPackedKeccak256(
                ["address", "address", "uint256", "address"],
                [txData.userAddress, txData.userAddress, amountWei, txData.vaultAddress] 
            );
            const signature = await oracleWallet.signMessage(ethers.getBytes(messageHash));
            
            res.redirect(`https://app.immunode.xyz?status=success&action=rescue&signature=${signature}`);

        } else if (txData.action === 'withdraw') {
            res.redirect(`https://app.immunode.xyz?status=success&action=withdraw`);
        }

    } catch (err) {
        console.error('Identity Check Failed:', err.message);
        // If profile fetch fails, it usually means biomapping is invalid/expired
        res.redirect(`https://app.immunode.xyz?status=biomapping_missing`);
    }
});

// Rate Limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100,
  message: "Too many requests, please try again later."
});
app.use(limiter);

// --- INIT BOT & WALLET ---
const bot = new Telegraf(BOT_TOKEN);
const provider = new ethers.JsonRpcProvider(RPC_URL);
const oracleWallet = new ethers.Wallet(PRIVATE_KEY, provider);

// --- LOAD BOT LOGIC FROM EXTERNAL FILE ---
setupBot(bot, userVaults, oracleWallet);

// ==========================================
// WEB SERVER (ORACLE) LOGIC
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
