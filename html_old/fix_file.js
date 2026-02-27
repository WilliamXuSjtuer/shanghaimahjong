const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'index_merged_complete.html');
let content = fs.readFileSync(filePath, 'utf8');

// 修复 1: updateDiscardArea - 使用正确的元素ID
content = content.replace(
    /const container = document\.getElementById\(`discards-\$\{displaySeat\}`\);/,
    `const discardZone = document.getElementById(\`discard\${displaySeat}\`);
                if (!discardZone) return;
                const container = discardZone.querySelector('.discards')`
);

// 修复 2: createTileElement - loading 改为 text-mode
content = content.replace(
    /classes\.push\('loading'\);/,
    `classes.push('text-mode');`
);

// 修复 3: createTileElement - !spritesLoaded 时添加 innerHTML
content = content.replace(
    /el\.dataset\.spriteStyle = spritePos;/,
    `el.dataset.spriteStyle = spritePos;
                el.innerHTML = \`
                    <div class="tile-text">
                        <span class="tile-value">\${NUM_NAMES[tile.value]}</span>
                        <span class="tile-type">\${TYPE_NAMES[tile.type]}</span>
                    </div>
                \`;`
);

// 修复 4: 在 _doUpdateGameUI 中添加对手手牌、花牌、副露区的渲染
const updateActionButtonsMarker = '// 更新按钮状态\n            updateActionButtons();';
const replacementCode = `// 更新按钮状态
            updateActionButtons();
            
            // 渲染对手手牌（背面）、花牌数量和副露区
            for (let i = 1; i <= 3; i++) {
                const player = gameState.players.find(p => getDisplaySeat(p.seatIndex) === i);
                if (!player) continue;
                
                // 渲染对手手牌（背面）
                const opponentHand = document.getElementById(\`opponent\${i}Hand\`);
                if (opponentHand && player.hand) {
                    opponentHand.innerHTML = '';
                    for (let j = 0; j < player.hand.length; j++) {
                        const tile = document.createElement('div');
                        tile.className = 'tile small back';
                        opponentHand.appendChild(tile);
                    }
                }
                
                // 显示对手花牌数量
                if (player.flowers && player.flowers.length > 0) {
                    const opponentInfo = document.querySelector(\`#opponent\${i} .player-info\`);
                    if (opponentInfo) {
                        let flowerSpan = opponentInfo.querySelector('.flower-count');
                        if (!flowerSpan) {
                            flowerSpan = document.createElement('span');
                            flowerSpan.className = 'flower-count';
                            flowerSpan.style.cssText = 'margin-left: 10px; color: #f1c40f; font-size: 0.9rem;';
                            opponentInfo.appendChild(flowerSpan);
                        }
                        flowerSpan.textContent = \`🌸\${player.flowers.length}\`;
                    }
                }
                
                // 渲染对手副露区
                const opponentMelds = document.getElementById(\`opponent\${i}Melds\`);
                if (opponentMelds && player.melds) {
                    opponentMelds.innerHTML = '';
                    player.melds.forEach(meld => {
                        const group = document.createElement('div');
                        group.className = 'meld-group';
                        meld.tiles.forEach(tile => {
                            const tileEl = createTileElement(tile, { small: true });
                            group.appendChild(tileEl);
                        });
                        opponentMelds.appendChild(group);
                    });
                }
            }`;

content = content.replace(updateActionButtonsMarker, replacementCode);

// 保存修改后的文件
fs.writeFileSync(filePath, content, 'utf8');
console.log('✓ 成功修复 index_merged_complete.html!');
console.log('  修复内容：');
console.log('  1. updateDiscardArea - 使用正确的元素ID');
console.log('  2. createTileElement - loading 改为 text-mode');
console.log('  3. createTileElement - !spritesLoaded 时添加 innerHTML');
console.log('  4. 添加对手手牌、花牌、副露区的渲染');
