// backend/bot.js
const { Markup } = require('telegraf');
const { ethers } = require('ethers');

// Accepted userState object from index.js
module.exports = function setupBot(bot, userVaults, oracleWallet, userState) {

    // --- MENUS ---
    const getWelcomeMenu = () => Markup.inlineKeyboard([
        [Markup.button.callback('👁️ Use Sentinel (Monitor)', 'choose_sentinel')],
        [Markup.button.callback('🛡️ Use Vault (Protect)', 'choose_vault')]
    ]);

    const getVaultMenu = () => Markup.inlineKeyboard([
        [Markup.button.callback('🔒 FREEZE ASSET', 'freeze_action')],
        [Markup.button.callback('🚫 BLOCK WITHDRAWAL', 'block_action')],
        [Markup.button.callback('⬅️ Back to Menu', 'show_main_menu')]
    ]);

    // --- NAVIGATION ACTIONS ---
    
    // 1. Main Menu Action
    bot.action('show_main_menu', async (ctx) => {
        await ctx.answerCbQuery();
        delete userState[ctx.from.id]; // Reset state
        handleWelcome(ctx);
    });

    // 2. Choose Sentinel
    bot.action('choose_sentinel', async (ctx) => {
        const userId = ctx.from.id;
        userState[userId] = 'SENTINEL_MODE'; // <--- SET STATE
        
        await ctx.answerCbQuery();
        await ctx.reply(
            "👁️ **Sentinel Mode**\n\n" +
            "Please paste your **Personal Wallet Address** to monitor.", 
            { parse_mode: 'Markdown' }
        );
    });

    // 3. Choose Vault
    bot.action('choose_vault', async (ctx) => {
        const userId = ctx.from.id;
        userState[userId] = 'VAULT_MODE'; // <--- SET STATE
        
        await ctx.answerCbQuery();
        await ctx.reply(
            "🛡️ **Vault Mode**\n\n" +
            "Please paste your **Vault Contract Address** to link.", 
            { parse_mode: 'Markdown' }
        );
    });

    // --- VAULT ACTIONS ---
    bot.action('freeze_action', async (ctx) => {
        const userId = ctx.from.id;
        const vaultAddr = userVaults[userId];
        if (!vaultAddr) return ctx.reply("⚠️ No Vault linked.");

        await ctx.answerCbQuery("❄️ Freezing..."); 
        await ctx.reply("❄️ **FREEZING VAULT...**", { parse_mode: 'Markdown' });
        
        try {
            const vaultContract = new ethers.Contract(vaultAddr, ["function panicFreeze() external"], oracleWallet);
            const tx = await vaultContract.panicFreeze();
            await tx.wait();
            await ctx.reply(`✅ **FROZEN!**\nHash: \`${tx.hash}\``, { parse_mode: 'Markdown' });
        } catch (e) {
            ctx.reply("❌ Freeze Failed. Vault may already be frozen.");
        }
    });

    // --- EXPORTS ---
    const handleWelcome = (ctx) => {
        ctx.reply(
            "🤖 **ImmuNode Command Center**\n" +
            "Choose your tool:", 
            { parse_mode: 'Markdown', ...getWelcomeMenu() }
        );
    };

    const linkVault = async (ctx) => {
        const msg = ctx.message.text.trim();
        userVaults[ctx.from.id] = msg;
        await ctx.reply(
            `✅ **Vault Linked**\n\`${msg}\``,
            { parse_mode: 'Markdown', ...getVaultMenu() }
        );
        return true;
    };

    return { handleWelcome, linkVault };
};