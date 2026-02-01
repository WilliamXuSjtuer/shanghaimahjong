# 🀄 上海敲麻 - Zeabur 国内部署指南

## 📋 部署前准备

### 1. 确保代码在 GitHub 上
如果还没有推送到 GitHub，执行：

```bash
cd F:\WEB\mahjong-deploy
git init
git add .
git commit -m "上海敲麻 - 多人联机版"
git branch -M main
git remote add origin https://github.com/你的用户名/mahjong-deploy.git
git push -u origin main
```

---

## 🚀 Zeabur 部署步骤

### 第一步：注册 Zeabur 账号
1. 访问 **https://zeabur.com**
2. 点击右上角 **登录**
3. 选择 **使用 GitHub 登录**（推荐）
4. 授权 Zeabur 访问你的 GitHub

### 第二步：创建项目
1. 登录后，点击 **创建项目**
2. 项目名称：`mahjong`（或任意名称）
3. 选择区域：**🇭🇰 Hong Kong** 或 **🇸🇬 Singapore**（国内访问最快）

### 第三步：部署服务
1. 在项目页面，点击 **添加服务**
2. 选择 **Git - 从 GitHub 部署**
3. 找到并选择 `mahjong-deploy` 仓库
4. Zeabur 会自动检测到 Node.js 项目
5. 点击 **部署**

### 第四步：等待部署完成
- 通常 1-2 分钟即可完成
- 状态变为 **运行中** 表示成功

### 第五步：绑定域名
1. 点击服务卡片
2. 找到 **域名** 选项
3. 点击 **生成域名**
4. 获得类似：`mahjong-xxx.zeabur.app` 的地址

---

## 🎮 开始游戏

1. 打开生成的域名链接
2. 输入昵称
3. 点击 **创建房间**
4. 把 **6位房间号** 发给朋友
5. 朋友输入房间号加入
6. 全部准备后自动开始！

---

## 💰 费用说明

Zeabur 按实际使用量计费：
- **CPU**: $0.0001/核心/秒
- **内存**: $0.00001/MB/秒
- **估算**: 麻将游戏非常轻量，**约 3-5 元/月**

### 首次使用优惠
新用户注册后可能有免费额度，够测试使用。

---

## 🔧 常见问题

### Q: 部署失败怎么办？
A: 检查 Zeabur 的部署日志，通常是依赖安装问题，确保 package.json 正确。

### Q: 访问很慢？
A: 确保选择了香港或新加坡区域，不要选欧美区域。

### Q: WebSocket 连接失败？
A: Zeabur 原生支持 WebSocket，刷新页面重试即可。

### Q: 如何更新代码？
A: 推送代码到 GitHub 后，Zeabur 会自动重新部署。

---

## 📱 分享给朋友

部署成功后，把链接发给朋友：
```
https://你的域名.zeabur.app
```

朋友用手机浏览器打开即可直接玩，无需下载！

---

**🎉 祝你麻将大吉！** 🀄✨
