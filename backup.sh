#!/bin/bash

# 🎨 COLORS
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. CHECK CURRENT DESTINATION
CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null)
TARGET_REPO="https://github.com/olatonrain/bio-freeze-vault.git"

echo -e "${CYAN}🚀 Starting Backup...${NC}"

if [ -z "$CURRENT_REMOTE" ]; then
    echo -e "${RED}⚠️  No GitHub link found!${NC}"
    echo -e "${YELLOW}Setting it to: $TARGET_REPO${NC}"
    git remote add origin $TARGET_REPO
    CURRENT_REMOTE=$TARGET_REPO
else
    echo -e "---------------------------------------------------"
    echo -e "📂 Current Destination: ${YELLOW}$CURRENT_REMOTE${NC}"
    echo -e "---------------------------------------------------"
    
    echo -e "Is this correct? (y/n) [Press Enter for Yes]"
    read choice
    
    if [[ "$choice" == "n" || "$choice" == "N" ]]; then
        echo -e "${CYAN}🔗 Enter the new GitHub URL:${NC}"
        read new_url
        if [ ! -z "$new_url" ]; then
            git remote remove origin
            git remote add origin $new_url
            echo -e "${GREEN}✅ Destination updated to: $new_url${NC}"
        else
            echo -e "${RED}❌ Invalid URL. Cancelling.${NC}"
            exit 1
        fi
    fi
fi

# 2. STAGE FILES
echo -e "${CYAN}📦 Staging files...${NC}"
git add .

# 3. ASK FOR MESSAGE
echo -e "${CYAN}📝 Enter commit message (Press Enter for auto-timestamp):${NC}"
read msg

if [ -z "$msg" ]; then
  msg="Backup: $(date '+%Y-%m-%d %H:%M:%S')"
fi

# 4. COMMIT & PUSH
git commit -m "$msg"

echo -e "${CYAN}☁️  Pushing to GitHub...${NC}"
git push -u origin main

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ SUCCESS! Your code is safe.${NC}"
else
    echo -e "${RED}❌ ERROR: Push failed. Check your internet or token.${NC}"
fi
