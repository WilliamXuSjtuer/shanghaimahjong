#!/bin/bash

# 🀄 上海敲麻 - 一键部署脚本
# 适用于 Ubuntu 22.04 / 20.04

set -e

echo "🀄 上海敲麻 - 开始部署..."
echo "================================"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 1. 更新系统
echo -e "${YELLOW}[1/7] 更新系统...${NC}"
apt update && apt upgrade -y

# 2. 安装 Node.js 20
echo -e "${YELLOW}[2/7] 安装 Node.js 20...${NC}"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi
echo "Node.js 版本: $(node -v)"

# 3. 安装 Git
echo -e "${YELLOW}[3/7] 安装 Git...${NC}"
apt install -y git

# 4. 安装 PM2
echo -e "${YELLOW}[4/7] 安装 PM2...${NC}"
npm install -g pm2

# 5. 克隆或更新项目
echo -e "${YELLOW}[5/7] 下载游戏代码...${NC}"
cd /opt
if [ -d "mahjong-multiplayer" ]; then
    echo "更新已有代码..."
    cd mahjong-multiplayer
    git pull
else
    echo "克隆代码..."
    git clone https://github.com/Luciuswang/mahjong-multiplayer.git
    cd mahjong-multiplayer
fi

# 6. 安装依赖
echo -e "${YELLOW}[6/7] 安装依赖...${NC}"
npm install

# 7. 启动服务
echo -e "${YELLOW}[7/7] 启动游戏服务...${NC}"
pm2 delete mahjong 2>/dev/null || true
pm2 start server.js --name mahjong
pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash

# 8. 配置防火墙
echo -e "${YELLOW}配置防火墙...${NC}"
ufw allow 22
ufw allow 3000
ufw allow 80
echo "y" | ufw enable || true

# 获取公网IP
PUBLIC_IP=$(curl -s ifconfig.me || curl -s icanhazip.com || echo "你的服务器IP")

echo ""
echo "================================"
echo -e "${GREEN}✅ 部署完成！${NC}"
echo "================================"
echo ""
echo "🎮 游戏地址: http://${PUBLIC_IP}:3000"
echo ""
echo "📱 把这个地址发给朋友，一起玩麻将！"
echo ""
echo "常用命令："
echo "  pm2 status        - 查看状态"
echo "  pm2 logs mahjong  - 查看日志"
echo "  pm2 restart mahjong - 重启服务"
echo ""
echo "🀄 祝你麻将大吉！"
