#!/bin/bash

# 🎨 COLORS
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${CYAN}🚀 Starting Universal Backup...${NC}"

# 1. CHECK IF GIT IS INITIALIZED
if [ ! -d ".git" ]; then
    echo -e "${YELLOW}⚠️  Git is not initialized here.${NC}"
    echo -e "Initializing Git now..."
    git init
    git branch -M main
fi

# 2. CHECK REMOTE DESTINATION
CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null)

if [ -z "$CURRENT_REMOTE" ]; then
    # --- FIRST TIME SETUP ---
    echo -e "${RED}⚠️  No GitHub link found for this project!${NC}"
    echo -e "${CYAN}🔗 Paste the GitHub Repository URL below:${NC}"
    read new_url
    
    if [ ! -z "$new_url" ]; then
        git remote add origin $new_url
        echo -e "${GREEN}✅ Linked to: $new_url${NC}"
    else
        echo -e "${RED}❌ Invalid URL. Exiting.${NC}"
        exit 1
    fi
else
    # --- EXISTING PROJECT CHECK ---
    echo -e "---------------------------------------------------"
    echo -e "📂 Destination: ${YELLOW}$CURRENT_REMOTE${NC}"
    echo -e "---------------------------------------------------"
    
    # Optional: Uncomment below if you want it to ask every time. 
    # Otherwise, it assumes the current link is correct for speed.
    # echo -e "Is this correct? (y/n)"
    # read choice ...
fi

# 3. STAGE FILES
echo -e "${CYAN}📦 Staging all files...${NC}"
git add .

# 4. COMMIT
echo -e "${CYAN}📝 Enter commit message (Press Enter for auto-timestamp):${NC}"
read msg

if [ -z "$msg" ]; then
  msg="Update: $(date '+%Y-%m-%d %H:%M:%S')"
fi

git commit -m "$msg"

# 5. PUSH
echo -e "${CYAN}☁️  Pushing to GitHub...${NC}"
git push -u origin main

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ SUCCESS! Code saved.${NC}"
else
    # Try force push if standard push fails (useful for first upload)
    echo -e "${YELLOW}⚠️  Standard push failed. Trying Force Push (Safe for first upload)...${NC}"
    git push -u origin main --force
fi
