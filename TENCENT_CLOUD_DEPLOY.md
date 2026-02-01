# 🀄 上海敲麻 - 腾讯云轻量服务器部署指南

## 💰 第一步：购买服务器（约50元/年）

### 1. 打开腾讯云轻量服务器页面
https://cloud.tencent.com/product/lighthouse

### 2. 登录账号
- 微信扫码登录最方便
- 首次需要实名认证（身份证）

### 3. 选择配置
- **地域**：选离你最近的（如：上海、广州、北京）
- **镜像**：选择 **Ubuntu 22.04 LTS**
- **套餐**：选最便宜的（2核2G，约50元/年）
- **购买时长**：1年（首年优惠最大）

### 4. 完成支付
记住你的服务器 **公网IP地址**（如：`123.45.67.89`）

---

## 🔧 第二步：连接服务器

### 方法一：腾讯云网页终端（最简单）
1. 进入 [轻量服务器控制台](https://console.cloud.tencent.com/lighthouse)
2. 找到你的服务器，点击 **登录**
3. 选择 **一键登录**

### 方法二：SSH 工具
使用 PuTTY 或 Windows Terminal：
```bash
ssh root@你的服务器IP
```

---

## 🚀 第三步：一键部署（复制粘贴即可）

登录服务器后，直接复制下面的命令执行：

```bash
# 一键部署脚本 - 复制全部内容粘贴到服务器终端
curl -fsSL https://raw.githubusercontent.com/Luciuswang/mahjong-multiplayer/main/deploy.sh | bash
```

如果上面的命令失败，手动执行以下步骤：

```bash
# 1. 更新系统
apt update && apt upgrade -y

# 2. 安装 Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# 3. 安装 Git
apt install -y git

# 4. 安装 PM2（进程管理）
npm install -g pm2

# 5. 克隆项目
cd /opt
git clone https://github.com/Luciuswang/mahjong-multiplayer.git
cd mahjong-multiplayer

# 6. 安装依赖
npm install

# 7. 启动服务（PM2 守护进程）
pm2 start server.js --name mahjong
pm2 save
pm2 startup

# 8. 开放防火墙端口
ufw allow 3000

echo "✅ 部署完成！"
echo "🎮 访问地址: http://$(curl -s ifconfig.me):3000"
```

---

## ✅ 第四步：验证部署

在浏览器打开：
```
http://你的服务器IP:3000
```

例如：`http://123.45.67.89:3000`

看到麻将游戏页面就成功了！

---

## 📱 分享给朋友

把这个地址发给朋友：
```
http://你的服务器IP:3000
```

朋友用手机浏览器打开就能玩！

---

## 🔧 常用管理命令

```bash
# 查看运行状态
pm2 status

# 查看日志
pm2 logs mahjong

# 重启服务
pm2 restart mahjong

# 停止服务
pm2 stop mahjong

# 更新代码
cd /opt/mahjong-multiplayer
git pull
npm install
pm2 restart mahjong
```

---

## ❓ 常见问题

### Q: 访问不了？
1. 检查防火墙：`ufw status`，确保 3000 端口开放
2. 检查腾讯云安全组：控制台 → 防火墙 → 添加规则 → 端口 3000

### Q: 想用域名访问？
需要购买域名并进行 ICP 备案（约1-2周），然后配置 DNS 指向服务器IP。

### Q: 服务挂了？
PM2 会自动重启，如果还是不行：
```bash
pm2 restart mahjong
```

---

## 💡 可选：使用 80 端口（无需输入端口号）

```bash
# 安装 Nginx
apt install -y nginx

# 配置反向代理
cat > /etc/nginx/sites-available/mahjong << 'EOF'
server {
    listen 80;
    server_name _;
    
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF

# 启用配置
ln -sf /etc/nginx/sites-available/mahjong /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# 开放 80 端口
ufw allow 80
```

配置后访问：`http://你的服务器IP`（不需要加 :3000）

---

**🎉 祝你麻将大吉！** 🀄
