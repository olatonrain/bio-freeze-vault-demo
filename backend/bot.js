// bot.js
const { Markup } = require('telegraf');
const { ethers } = require('ethers');

module.exports = function setupBot(bot, userVaults, oracleWallet) {

    // --- MENUS ---
    const getMainMenu = () => {
        return Markup.inlineKeyboard([
            [Markup.button.callback('🔒 FREEZE ASSET', 'freeze_action')],
            [Markup.button.callback('🚫 BLOCK WITHDRAWAL', 'block_action')],
            [Markup.button.url('🚀 Open Vault App', 'https://app.immunode.xyz')]
        ]);
    };

    const getLinkMenu = () => {
        return Markup.inlineKeyboard([
            [Markup.button.url('🚀 Open Vault App', 'https://app.immunode.xyz')]
        ]);
    };

    // --- COMMANDS ---

    // 1. START: Check if wallet is linked
    bot.start((ctx) => {
        const userId = ctx.from.id;
        const vaultAddr = userVaults[userId];

        if (vaultAddr) {
            // WALLET LINKED: Show Full Dashboard
            ctx.reply(
                `🛡️ <b>Bio-Freeze Control Panel</b>\n\n` +
                `✅ <b>Vault Linked:</b>\n<code>${vaultAddr}</code>\n\n` +
                `Select an action below:`,
                {
                    parse_mode: 'HTML',
                    ...getMainMenu()
                }
            );
        } else {
            // NO WALLET: Show Instructions Only
            ctx.reply(
                "🛡️ <b>Welcome to Bio-Freeze Vault</b>\n\n" +
                "⚠️ <b>Status: No Vault Linked</b>\n\n" +
                "To activate this bot:\n" +
                "1. Copy your Vault Address from the App.\n" +
                "2. Paste it here in the chat.",
                {
                    parse_mode: 'HTML',
                    ...getLinkMenu()
                }
            );
        }
    });

    // 2. LINK VAULT HANDLER
    bot.on('text', (ctx) => {
        const msg = ctx.message.text.trim();
        const userId = ctx.from.id;
    
        if (ethers.isAddress(msg)) {
            userVaults[userId] = msg;
            
            ctx.reply(
                `✅ <b>Vault Successfully Linked!</b>\n\n` +
                `📍 <b>Your Safe Address:</b>\n<code>${msg}</code>\n` +
                `(Tap address to copy)\n\n` +
                `👇 <b>Access Control Unlocked:</b>`,
                { 
                    parse_mode: 'HTML',
                    ...getMainMenu() // Show the buttons immediately after linking
                }
            );
        } else {
            // Only reply error if they don't have a vault yet, to avoid spamming casual chat
            if(!userVaults[userId]) {
                ctx.reply("❌ That doesn't look like a valid Vault Address. Please copy it from the App.");
            }
        }
    });

    // 3. PANIC FREEZE ACTION
    bot.action('freeze_action', async (ctx) => {
        const userId = ctx.from.id;
        const vaultAddr = userVaults[userId];

        if (!vaultAddr) return ctx.reply("⚠️ No Vault linked! Send your address first.");

        await ctx.reply("❄️ <b>FREEZING VAULT...</b>\nSent transaction to blockchain...", { parse_mode: 'HTML' });

        try {
            const vaultABI = ["function panicFreeze() external"];
            const vaultContract = new ethers.Contract(vaultAddr, vaultABI, oracleWallet);
            
            // Send Tx
            const tx = await vaultContract.panicFreeze();
            
            // Wait for it to be mined so frontend sees it
            await tx.wait();
            
            await ctx.reply(
                `✅ <b>VAULT FROZEN!</b>\n\n` + 
                `The frontend will update automatically in a few seconds.\n\n` +
                `🔗 <b>Tx Hash:</b>\n<code>${tx.hash}</code>`, 
                { parse_mode: 'HTML' }
            );
        } catch (e) {
            console.error(e);
            ctx.reply("❌ Error: Could not freeze. It might already be frozen.");
        }
    });

    // 4. BLOCK ACCOUNT ACTION (New)
    bot.action('block_action', async (ctx) => {
        const userId = ctx.from.id;
        // In a real app, you would flag the user in DB here
        // delete userVaults[userId]; // Optional: Unlink them
        
        ctx.reply(
            "🚫 <b>ACCOUNT BLOCKED</b>\n\n" +
            "All withdrawal requests have been flagged. Please contact support to unlock.",
            { parse_mode: 'HTML' }
        );
    });
};
