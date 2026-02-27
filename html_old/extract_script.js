const fs = require('fs');
const path = require('path');

// 读取备份文件
const filePath = path.join(__dirname, 'index_backup.html');
const content = fs.readFileSync(filePath, 'utf8');

// 找到script标签的位置
const scriptStartTag = '<script>';
const scriptEndTag = '</script>';

const startIndex = content.lastIndexOf(scriptStartTag);
const endIndex = content.lastIndexOf(scriptEndTag);

if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
    const scriptContent = content.substring(startIndex + scriptStartTag.length, endIndex);
    const outputPath = path.join(__dirname, 'extracted_script.js');
    fs.writeFileSync(outputPath, scriptContent.trim(), 'utf8');
    console.log('JavaScript代码已提取到 extracted_script.js');
    console.log('长度:', scriptContent.length);
} else {
    console.log('未找到script标签');
}
