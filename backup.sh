#!/bin/bash

# 🎨 COLORS
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}🚀 Starting Quick Backup...${NC}"

# 1. Add all changes
git add .

# 2. Ask for a commit message (optional)
echo -e "${CYAN}📝 Enter a commit message (or press Enter for auto-timestamp):${NC}"
read msg

# If user hits Enter, use the current date/time
if [ -z "$msg" ]; then
  msg="Auto-backup: $(date '+%Y-%m-%d %H:%M:%S')"
fi

# 3. Commit
git commit -m "$msg"

# 4. Push to GitHub
echo -e "${CYAN}☁️ Uploading to GitHub...${NC}"
git push origin main

echo -e "${GREEN}✅ Backup Complete! Your code is safe.${NC}"
