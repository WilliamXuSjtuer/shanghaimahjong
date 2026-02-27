
const fs = require('fs');
const path = require('path');

console.log('开始修改多人模式文件...');

// 读取文件
const singlePath = path.join(__dirname, 'mahjong', 'index.html');
const multiPath = path.join(__dirname, 'index.html');

const singleContent = fs.readFileSync(singlePath, 'utf8');
const multiContent = fs.readFileSync(multiPath, 'utf8');

// 1. 保留多人模式的所有头部信息（包括socket.io脚本）
const multiHeadStart = multiContent.indexOf('&lt;head&gt;');
const multiHeadEnd = multiContent.indexOf('&lt;/head&gt;') + '&lt;/head&gt;'.length;
const multiHead = multiContent.substring(multiHeadStart, multiHeadEnd);

// 2. 找到单人模式的body内容
const singleBodyStart = singleContent.indexOf('&lt;body&gt;');
const singleBodyEnd = singleContent.indexOf('&lt;/body&gt;');
const singleBody = singleContent.substring(singleBodyStart, singleBodyEnd);

// 3. 找到单人模式的style部分
const singleStyleStart = singleContent.indexOf('&lt;style&gt;');
const singleStyleEnd = singleContent.indexOf('&lt;/style&gt;') + '&lt;/style&gt;'.length;
const singleStyle = singleContent.substring(singleStyleStart, singleStyleEnd);

// 4. 提取多人模式的所有特色功能HTML元素（chat, emoji, network, particles, fireworks等）
// 提取多人模式的body内容
const multiBodyStart = multiContent.indexOf('&lt;body&gt;');
const multiBodyEnd = multiContent.indexOf('&lt;/body&gt;') + '&lt;/body&gt;'.length;
let multiBody = multiContent.substring(multiBodyStart, multiBodyEnd);

// 提取多人模式的特色HTML元素
const chatToggleBtn = /&lt;button[^&gt;]*chat-toggle-btn[^&gt;]*&gt;.*?&lt;\/button&gt;/s.exec(multiBody);
const chatPanel = /&lt;div[^&gt;]*chat-panel[^&gt;]*&gt;.*?&lt;\/div&gt;\s*&lt;\/div&gt;/s.exec(multiBody);
const emojiPanel = /&lt;div[^&gt;]*emoji-panel[^&gt;]*&gt;.*?&lt;\/div&gt;\s*&lt;\/div&gt;/s.exec(multiBody);
const emojiToggleBtn = /&lt;button[^&gt;]*emoji-toggle-btn[^&gt;]*&gt;.*?&lt;\/button&gt;/s.exec(multiBody);
const particlesContainer = /&lt;div[^&gt;]*particles-container[^&gt;]*&gt;.*?&lt;\/div&gt;/s.exec(multiBody);
const fireworksContainer = /&lt;div[^&gt;]*fireworks-container[^&gt;]*&gt;.*?&lt;\/div&gt;/s.exec(multiBody);
const networkIndicator = /&lt;div[^&gt;]*network-indicator[^&gt;]*&gt;.*?&lt;\/div&gt;/s.exec(multiBody);
const turnIndicator = /&lt;div[^&gt;]*turn-indicator[^&gt;]*&gt;.*?&lt;\/div&gt;/s.exec(multiBody);

// 5. 提取多人模式的特色样式
const multiStyleStart = multiContent.indexOf('&lt;style&gt;');
const multiStyleEnd = multiContent.indexOf('&lt;/style&gt;') + '&lt;/style&gt;'.length;
const multiStyle = multiContent.substring(multiStyleStart, multiStyleEnd);

// 6. 提取多人模式的完整脚本
const multiScriptStart = multiContent.indexOf('&lt;script&gt;');
const multiScriptEnd = multiContent.lastIndexOf('&lt;/script&gt;') + '&lt;/script&gt;'.length;
const multiScript = multiContent.substring(multiScriptStart, multiScriptEnd);

// 7. 构建新的HTML文件
let newContent = `&lt;!DOCTYPE html&gt;
&lt;html lang="zh"&gt;
${multiHead}

&lt;body&gt;
    &lt;!-- 保留多人模式的特色容器 --&gt;
`;

// 添加特色容器
if (particlesContainer) newContent += particlesContainer[0] + '\n';
if (fireworksContainer) newContent += fireworksContainer[0] + '\n';
if (networkIndicator) newContent += networkIndicator[0] + '\n';
if (turnIndicator) newContent += turnIndicator[0] + '\n';

// 添加单人模式的body内容，但替换一些关键部分
// 首先，获取单人模式的完整body内容（不带&lt;body&gt;标签）
let singleBodyContent = singleBody.substring('&lt;body&gt;'.length);

// 现在，我们需要将单人模式的开始屏幕和规则屏幕替换为多人模式的
// 先添加多人模式的大厅和房间界面
const lobbyScreen = /&lt;div[^&gt;]*lobby-screen[^&gt;]*&gt;.*?&lt;\/div&gt;\s*&lt;\/div&gt;/s.exec(multiBody);
const roomScreen = /&lt;div[^&gt;]*room-screen[^&gt;]*&gt;.*?&lt;\/div&gt;\s*&lt;\/div&gt;/s.exec(multiBody);
const gameScreen = /&lt;div[^&gt;]*game-screen[^&gt;]*&gt;.*?&lt;\/div&gt;\s*&lt;\/div&gt;/s.exec(multiBody);
const roundResultModal = /&lt;div[^&gt;]*round-result-modal[^&gt;]*&gt;.*?&lt;\/div&gt;\s*&lt;\/div&gt;/s.exec(multiBody);
const matchResultModal = /&lt;div[^&gt;]*match-result-modal[^&gt;]*&gt;.*?&lt;\/div&gt;\s*&lt;\/div&gt;/s.exec(multiBody);
const modal = /&lt;div[^&gt;]*class="modal"[^&gt;]*&gt;.*?&lt;\/div&gt;\s*&lt;\/div&gt;/s.exec(multiBody);

// 添加多人模式的界面
if (lobbyScreen) newContent += lobbyScreen[0] + '\n';
if (roomScreen) newContent += roomScreen[0] + '\n';

// 现在构建新的游戏界面，结合单人模式的布局和多人模式的元素
newContent += `
    &lt;!-- 游戏界面 - 采用单人模式布局 --&gt;
    &lt;div class="screen game-screen" id="gameScreen"&gt;
        &lt;!-- 状态栏 - 采用单人模式结构，添加多人模式特色 --&gt;
        &lt;div class="status-bar"&gt;
            &lt;div class="status-item"&gt;
                &lt;div class="status-icon"&gt;🎴&lt;/div&gt;
                &lt;span&gt;剩余: &lt;span id="remainingTiles"&gt;92&lt;/span&gt;张&lt;/span&gt;
            &lt;/div&gt;
            &lt;div class="status-item"&gt;
                &lt;div class="status-icon"&gt;🏆&lt;/div&gt;
                &lt;span&gt;分数: &lt;span id="playerScore"&gt;0&lt;/span&gt;&lt;/span&gt;
            &lt;/div&gt;
            &lt;div class="status-item"&gt;
                &lt;div class="status-icon" id="menqingIcon"&gt;🚪&lt;/div&gt;
                &lt;span id="menqingStatus"&gt;门清&lt;/span&gt;
            &lt;/div&gt;
            &lt;div class="status-item"&gt;
                &lt;div class="status-icon"&gt;🎲&lt;/div&gt;
                &lt;span&gt;局数: &lt;span id="roundNum"&gt;1&lt;/span&gt;/4&lt;/span&gt;
            &lt;/div&gt;
            &lt;!-- 多人模式特色：房间信息 --&gt;
            &lt;div class="status-item" style="display: none;" id="roomInfoItem"&gt;
                &lt;div class="status-icon"&gt;🏠&lt;/div&gt;
                &lt;span id="roomCodeDisplay"&gt;ROOM&lt;/span&gt;
            &lt;/div&gt;
            &lt;button class="back-btn" onclick="leaveGame()"&gt;
                &lt;i class="fas fa-home"&gt;&lt;/i&gt; 返回
            &lt;/button&gt;
        &lt;/div&gt;

        &lt;!-- 积分面板 - 多人模式特色 --&gt;
        &lt;div class="score-panel" id="scorePanel"&gt;&lt;/div&gt;

        &lt;!-- 麻将桌面 - 采用单人模式布局 --&gt;
        &lt;div class="mahjong-table"&gt;
            &lt;!-- 对手区域 - 采用单人模式网格布局 --&gt;
            &lt;div class="opponents-area" id="opponentsArea"&gt;
                &lt;div class="opponent" id="opponent2"&gt;
                    &lt;div class="player-info seat-info"&gt;
                        &lt;div class="player-avatar seat-avatar"&gt;🤖&lt;/div&gt;
                        &lt;span class="player-name seat-name"&gt;AI-南&lt;/span&gt;
                        &lt;span class="player-wind seat-wind"&gt;南&lt;/span&gt;
                    &lt;/div&gt;
                    &lt;div class="opponent-hand seat-tiles" id="opponent2Hand"&gt;&lt;/div&gt;
                    &lt;div class="melds-area" id="opponent2Melds"&gt;&lt;/div&gt;
                    &lt;div class="seat-discards" id="opponent2Discards"&gt;&lt;/div&gt;
                &lt;/div&gt;
                &lt;div class="opponent" id="opponent1"&gt;
                    &lt;div class="player-info seat-info"&gt;
                        &lt;div class="player-avatar seat-avatar"&gt;🤖&lt;/div&gt;
                        &lt;span class="player-name seat-name"&gt;AI-东&lt;/span&gt;
                        &lt;span class="player-wind seat-wind"&gt;东&lt;/span&gt;
                    &lt;/div&gt;
                    &lt;div class="opponent-hand seat-tiles" id="opponent1Hand"&gt;&lt;/div&gt;
                    &lt;div class="melds-area" id="opponent1Melds"&gt;&lt;/div&gt;
                    &lt;div class="seat-discards" id="opponent1Discards"&gt;&lt;/div&gt;
                &lt;/div&gt;
                &lt;div class="opponent" id="opponent3"&gt;
                    &lt;div class="player-info seat-info"&gt;
                        &lt;div class="player-avatar seat-avatar"&gt;🤖&lt;/div&gt;
                        &lt;span class="player-name seat-name"&gt;AI-北&lt;/span&gt;
                        &lt;span class="player-wind seat-wind"&gt;北&lt;/span&gt;
                    &lt;/div&gt;
                    &lt;div class="opponent-hand seat-tiles" id="opponent3Hand"&gt;&lt;/div&gt;
                    &lt;div class="melds-area" id="opponent3Melds"&gt;&lt;/div&gt;
                    &lt;div class="seat-discards" id="opponent3Discards"&gt;&lt;/div&gt;
                &lt;/div&gt;
            &lt;/div&gt;

            &lt;!-- 中央区域 - 采用单人模式四方向弃牌区 --&gt;
            &lt;div class="center-area"&gt;
                &lt;div class="discard-zone top" id="discard1"&gt;
                    &lt;div class="zone-label"&gt;东家出牌&lt;/div&gt;
                    &lt;div class="discards"&gt;&lt;/div&gt;
                &lt;/div&gt;
                &lt;div class="discard-sides"&gt;
                    &lt;div class="discard-zone left" id="discard2"&gt;
                        &lt;div class="zone-label"&gt;南家&lt;/div&gt;
                        &lt;div class="discards"&gt;&lt;/div&gt;
                    &lt;/div&gt;
                    &lt;div class="discard-zone right" id="discard3"&gt;
                        &lt;div class="zone-label"&gt;北家&lt;/div&gt;
                        &lt;div class="discards"&gt;&lt;/div&gt;
                    &lt;/div&gt;
                &lt;/div&gt;
                &lt;div class="discard-zone bottom" id="discard0"&gt;
                    &lt;div class="zone-label"&gt;我的出牌&lt;/div&gt;
                    &lt;div class="discards"&gt;&lt;/div&gt;
                &lt;/div&gt;
            &lt;/div&gt;

            &lt;!-- 玩家区域 - 采用单人模式布局 --&gt;
            &lt;div class="player-area my-hand-area"&gt;
                &lt;div class="player-info"&gt;
                    &lt;div class="player-avatar current-turn" id="playerAvatar"&gt;😊&lt;/div&gt;
                    &lt;span class="player-name"&gt;玩家&lt;/span&gt;
                    &lt;span class="player-wind"&gt;西&lt;/span&gt;
                    &lt;span id="turnIndicatorText" style="margin-left: 10px; color: var(--gold);"&gt;轮到你了！&lt;/span&gt;
                    &lt;span id="flowerCount" style="margin-left: 15px; color: #f1c40f;"&gt;🌸 花牌: 0&lt;/span&gt;
                &lt;/div&gt;
                &lt;div class="hand-container my-hand" id="playerHand"&gt;&lt;/div&gt;
                &lt;div class="melds-area my-melds" id="playerMelds"&gt;&lt;/div&gt;
                &lt;!-- 花牌展示区 --&gt;
                &lt;div class="flowers-display" id="playerFlowers" style="margin-top: 10px; display: flex; gap: 5px; justify-content: center; flex-wrap: wrap;"&gt;&lt;/div&gt;
            &lt;/div&gt;

            &lt;!-- 操作按钮 - 采用单人模式布局 --&gt;
            &lt;div class="action-panel action-buttons" id="actionButtons"&gt;
                &lt;button class="action-btn danger" id="discardBtn" onclick="discardSelected()" disabled&gt;
                    &lt;i class="fas fa-hand-point-down"&gt;&lt;/i&gt; 打牌
                &lt;/button&gt;
                &lt;button class="action-btn success" id="huBtn" onclick="checkHu()" disabled&gt;
                    &lt;i class="fas fa-trophy"&gt;&lt;/i&gt; 胡牌
                &lt;/button&gt;
                &lt;button class="action-btn secondary" onclick="showTips()"&gt;
                    &lt;i class="fas fa-lightbulb"&gt;&lt;/i&gt; 提示
                &lt;/button&gt;
                &lt;button class="action-btn secondary" id="soundBtn" onclick="toggleSound()"&gt;
                    &lt;i class="fas fa-volume-up"&gt;&lt;/i&gt; 声音
                &lt;/button&gt;
                &lt;button class="action-btn secondary" onclick="showFullScoreboard()" style="background: linear-gradient(135deg, #f39c12 0%, #d35400 100%);"&gt;
                    &lt;i class="fas fa-trophy"&gt;&lt;/i&gt; 积分榜
                &lt;/button&gt;
            &lt;/div&gt;
        &lt;/div&gt;
    &lt;/div&gt;
`;

// 添加多人模式的操作提示
const actionHints = /&lt;div[^&gt;]*class="action-hints"[^&gt;]*&gt;.*?&lt;\/div&gt;/s.exec(multiBody);
if (actionHints) newContent += actionHints[0] + '\n';

// 添加多人模式的模态框
if (modal) newContent += modal[0] + '\n';
if (roundResultModal) newContent += roundResultModal[0] + '\n';
if (matchResultModal) newContent += matchResultModal[0] + '\n';

// 添加多人模式的聊天和表情面板
if (chatToggleBtn) newContent += chatToggleBtn[0] + '\n';
if (chatPanel) newContent += chatPanel[0] + '\n';
if (emojiToggleBtn) newContent += emojiToggleBtn[0] + '\n';
if (emojiPanel) newContent += emojiPanel[0] + '\n';

// 添加多人模式的脚本
newContent += '\n' + multiScript;
newContent += '\n&lt;/body&gt;\n&lt;/html&gt;';

// 现在处理样式部分
// 我们需要融合单人模式和多人模式的样式
newContent = newContent.replace(
    /&lt;style&gt;[\s\S]*?&lt;\/style&gt;/,
    () =&gt; {
        return `&lt;style&gt;
/* ==================== 单人模式样式 ==================== */
${singleStyle.replace(/&lt;style&gt;|&lt;\/style&gt;/g, '')}

/* ==================== 多人模式特色样式 ==================== */
${multiStyle.replace(/&lt;style&gt;|&lt;\/style&gt;/g, '')}

/* ==================== 统一调整样式 ==================== */
/* 确保样式融合后不会冲突 */
.screen {
    display: none;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 20px;
}
.screen.active { display: flex; }

.game-screen {
    padding: 8px;
    justify-content: flex-start;
    min-height: 100vh;
    min-height: 100dvh;
}

/* 调整状态栏以容纳更多内容 */
.status-bar {
    flex-wrap: wrap;
    gap: 10px;
}

/* 多人模式的座位信息兼容 */
.seat-info {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
}

.seat-avatar {
    width: 40px;
    height: 40px;
    background: linear-gradient(135deg, var(--gold) 0%, #b8860b 100%);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.3rem;
    border: 2px solid white;
}

.seat-avatar.current-turn {
    animation: pulse 1s infinite;
    box-shadow: 0 0 15px var(--gold);
}

.seat-avatar.offline {
    filter: grayscale(100%);
    opacity: 0.5;
}

.seat-info.offline .seat-name::after {
    content: ' (离线)';
    color: #ff6b6b;
    font-size: 0.7rem;
}

.seat-name {
    font-size: 0.9rem;
    font-weight: bold;
}

.seat-wind {
    background: var(--red);
    color: white;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 0.75rem;
}

.seat-tiles {
    display: flex;
    gap: 2px;
    flex-wrap: wrap;
    justify-content: center;
}

.seat-discards {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    justify-content: center;
    margin-top: 8px;
    padding: 5px;
    background: rgba(0,0,0,0.2);
    border-radius: 8px;
    min-height: 35px;
    max-width: 200px;
}

.opponent .seat-discards {
    margin-top: 5px;
    max-width: 100px;
}

/* 响应式调整 */
@media (max-width: 768px) {
    .opponents-area { grid-template-columns: 1fr; }
    .tile { width: 34px; height: 47px; }
    .tile.small { width: 25px; height: 35px; }
    .status-bar { flex-wrap: wrap; gap: 10px; }
}

@media (max-width: 480px) {
    .tile { width: 30px; height: 42px; }
    .tile.small { width: 16px; height: 22px; }
}
&lt;/style&gt;`;
    }
);

// 保存文件
fs.writeFileSync(multiPath, newContent, 'utf8');
console.log('✅ 多人模式文件修改成功！');
console.log(`📄 文件路径: ${multiPath}`);
