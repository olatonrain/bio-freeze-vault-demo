#!/bin/bash

# 🎨 COLORS
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${CYAN}🚀 Starting Multi-Cloud Backup...${NC}"

# 1. CHECK GIT INIT
if [ ! -d ".git" ]; then
    echo -e "${YELLOW}⚠️  Git is not initialized here. Initializing...${NC}"
    git init
    git branch -M main
fi

# ==========================================
# 2. CHECK PRIMARY REMOTE (GITHUB)
# ==========================================
GITHUB_URL=$(git remote get-url origin 2>/dev/null)

if [ -z "$GITHUB_URL" ]; then
    echo -e "${RED}⚠️  No GitHub link found (Primary).${NC}"
    echo -e "${CYAN}🔗 Paste your GITHUB Repository URL:${NC}"
    read gh_url
    if [ ! -z "$gh_url" ]; then
        git remote add origin $gh_url
        echo -e "${GREEN}✅ GitHub linked.${NC}"
    else
        echo -e "${RED}❌ GitHub URL required. Exiting.${NC}"
        exit 1
    fi
else
    echo -e "📂 GitHub: ${GREEN}$GITHUB_URL${NC}"
fi

# ==========================================
# 3. CHECK SECONDARY REMOTE (GITLAB)
# ==========================================
GITLAB_URL=$(git remote get-url gitlab 2>/dev/null)

if [ -z "$GITLAB_URL" ]; then
    echo -e "---------------------------------------------------"
    echo -e "${YELLOW}⚠️  No GitLab backup found.${NC}"
    echo -e "Do you want to add a GitLab mirror for redundancy? (y/n)"
    read choice
    
    if [[ "$choice" == "y" || "$choice" == "Y" ]]; then
        echo -e "${CYAN}🔗 Paste your GITLAB Repository URL:${NC}"
        read gl_url
        if [ ! -z "$gl_url" ]; then
            git remote add gitlab $gl_url
            echo -e "${GREEN}✅ GitLab linked.${NC}"
            GITLAB_URL=$gl_url
        fi
    fi
else
    echo -e "📂 GitLab: ${GREEN}$GITLAB_URL${NC}"
fi

# ==========================================
# 4. EXECUTE BACKUP
# ==========================================
echo -e "---------------------------------------------------"
echo -e "${CYAN}📦 Staging files...${NC}"
git add .

echo -e "${CYAN}📝 Enter commit message (Press Enter for timestamp):${NC}"
read msg
if [ -z "$msg" ]; then
  msg="Backup: $(date '+%Y-%m-%d %H:%M:%S')"
fi
git commit -m "$msg"

# PUSH TO GITHUB
echo -e "---------------------------------------------------"
echo -e "${CYAN}☁️  Pushing to GitHub...${NC}"
git push -u origin main
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ GitHub Push Successful.${NC}"
else
    echo -e "${RED}❌ GitHub Push Failed.${NC}"
fi

# PUSH TO GITLAB (If configured)
if [ ! -z "$GITLAB_URL" ]; then
    echo -e "${CYAN}☁️  Pushing to GitLab...${NC}"
    git push -u gitlab main
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ GitLab Push Successful.${NC}"
    else
        echo -e "${RED}❌ GitLab Push Failed.${NC}"
    fi
fi

echo -e "---------------------------------------------------"
echo -e "${GREEN}🎉 Backup Sequence Complete!${NC}"
