const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("Bio-Freeze Vault Simulation", function () {
  let Factory, Vault, factory, vault;
  let owner, hacker, oracle, guardian, newWallet;

  // SETUP: Run this before EVERY test
  beforeEach(async function () {
    // 1. Get accounts
    [owner, hacker, oracle, guardian, newWallet] = await ethers.getSigners();

    // 2. Deploy Factory
    Factory = await ethers.getContractFactory("VaultFactory");
    factory = await Factory.deploy(oracle.address, guardian.address);

    // 3. User creates a Vault
    const tx = await factory.connect(owner).createVault();
    await tx.wait();
    
    // 4. Get the Vault Address
    const myVaults = await factory.getMyVaults(owner.address);
    const vaultAddress = myVaults[0];
    Vault = await ethers.getContractFactory("BioVault");
    vault = Vault.attach(vaultAddress);

    // 5. *** FUND THE VAULT *** (The Fix)
    // Send 10 ETH to the vault so it's ready for testing
    await owner.sendTransaction({
      to: vaultAddress,
      value: ethers.parseEther("10.0")
    });
  });

  it("Should have initial balance of 10 ETH", async function () {
    const balance = await ethers.provider.getBalance(await vault.getAddress());
    expect(balance).to.equal(ethers.parseEther("10.0"));
  });

  it("Should enforce 72-Hour Timer on Key Withdrawal", async function () {
    // Hacker tries to withdraw 5 ETH
    await vault.connect(owner).requestWithdrawal(ethers.parseEther("5.0"));

    // Check: Is it pending?
    const request = await vault.pendingWithdrawal();
    console.log(`\n🕵️ Hacker requested withdrawal. Unlock time: ${request.unlockTime}`);

    // Attempt: Hacker tries to take money immediately -> SHOULD FAIL
    await expect(
        vault.connect(owner).finalizeWithdrawal()
    ).to.be.revertedWith("Wait 72 hours");
    
    console.log("✅ Security: Immediate theft blocked!");
  });

  it("Should allow Panic Freeze by Bot", async function () {
    // User sees the email and uses Telegram Bot (Guardian) to freeze
    await vault.connect(guardian).panicFreeze();

    const isFrozen = await vault.isFrozen();
    expect(isFrozen).to.be.true;

    // Hacker tries to withdraw now? -> SHOULD FAIL
    await expect(
        vault.connect(owner).requestWithdrawal(ethers.parseEther("1.0"))
    ).to.be.revertedWith("Vault is FROZEN");
    
    console.log("✅ Security: Hacker completely locked out.");
  });

  it("Should allow Bio-Rescue with Oracle Signature", async function () {
    // 1. Freeze first
    await vault.connect(guardian).panicFreeze();

    // 2. Prepare Rescue
    const amount = ethers.parseEther("10.0");
    const contractAddr = await vault.getAddress();
    
    // Create the hash (Matches Solidity logic)
    const messageHash = ethers.solidityPackedKeccak256(
        ["address", "address", "uint256", "address"],
        [owner.address, newWallet.address, amount, contractAddr]
    );

    // Oracle signs the hash
    const signature = await oracle.signMessage(ethers.getBytes(messageHash));

    console.log("\n🏥 Initiating Rescue with Face Signature...");

    // 3. Execute Rescue
    await vault.connect(owner).rescueFunds(newWallet.address, amount, signature);

    // 4. Verify Funds Moved
    const newWalletBal = await ethers.provider.getBalance(newWallet.address);
    // Expect > 10000 (default) + 9.95 (rescued amount)
    console.log(`✅ Rescue Successful!`);
    
    const vaultBal = await ethers.provider.getBalance(contractAddr);
    expect(vaultBal).to.equal(0);
  });
});
