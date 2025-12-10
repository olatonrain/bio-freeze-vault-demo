# ❄️ **Bio-Freeze Vault**

**Non-custodial, biometric asset-protection system powered by Humanode**

Bio-Freeze Vault prevents *instant wallet draining*. Even if an attacker gets your private key, they cannot withdraw instantly. You get a 72-hour buffer to detect the breach, activate a **Panic Freeze** via Telegram, and **Rescue** your funds using biometric verification.

---

## 🚀 **Features**

### 🛡️ **72-Hour Time-Lock**

All private-key withdrawals are delayed for 3 days.

### 🥶 **Panic Freeze (Telegram)**

Freeze your vault instantly from a Telegram bot if you notice suspicious activity.

### 👤 **Biometric Rescue**

Bypass the 72-hour lock using Humanode Bio-Auth (face scan). Verified by an off-chain Oracle.

### ⛔ **Anti-Hostage Stalemate**

Even with your key, attackers cannot unfreeze the vault without waiting 24 hours.

---

## 🏗️ **Architecture**

### **1. Smart Contracts (Solidity)**

* `BioVault.sol` — Handles timers, freeze logic, oracle validation.
* `VaultFactory.sol` — Deploys personal vault contracts for users.

### **2. Oracle Sentinel (Node.js)**

* Operates the Telegram bot.
* Validates Humanode OAuth tokens.
* Signs Rescue operations as the Oracle.

### **3. Frontend Dashboard (Next.js)**

* Monitor balances and vault state.
* Trigger biometric rescue.
* Interact with deployed vaults.

---

## 🛠️ **Installation & Setup**

### **Prerequisites**

* Node.js v18+
* Hardhat
* MetaMask (connected to Humanode)

---

## **1. Clone the Repository**

```bash
git clone https://github.com/olatonrain/bio-freeze-vault.git
cd bio-freeze-vault
npm install
```

---

## **2. Configure Environment (.env Master Config)**

Create a `.env` file in the root directory:

```
# === MASTER SWITCH ===
NETWORK_MODE=testnet   # 'testnet' or 'mainnet'

# === SHARED SECRETS ===
PORT=3001
BOT_TOKEN=your_telegram_bot_token
PRIVATE_KEY=your_wallet_private_key

# === HUMANODE TESTNET ===
RPC_TESTNET=https://explorer-rpc-http.testnet5.stages.humanode.io
FACTORY_TESTNET=0x1ccaB40f0981a9D42Eea3770F4E9c7149277b1D8
CHAIN_ID_TESTNET=0x3A05

# === HUMANODE MAINNET ===
RPC_MAINNET=https://explorer-rpc-http.mainnet.stages.humanode.io
FACTORY_MAINNET=0x...
CHAIN_ID_MAINNET=0x1472
```

---

## **3. Link Frontend Environment**

Next.js requires an `.env` file inside its folder.

```bash
ln -s ../.env frontend/.env
```

---

## **4. Run the System**

### **Backend (Oracle + Telegram Bot)**

```bash
cd backend
node index.js
```

### **Frontend (Dashboard)**

```bash
cd frontend
npm run dev
```

---

## 🗺️ **Roadmap**

### **Phase 1 — MVP (HMND native support)**

Status: ✅ Approved & Active

### **Phase 2 — Multi-Asset Support**

USDT / USDC via ChainPort

### **Phase 3 — Joint Accounts**

Shared / family multisig vaults

---
