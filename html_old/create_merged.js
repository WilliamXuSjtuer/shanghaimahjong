const fs = require('fs');
const path = require('path');

// 读取index_merged.html的HTML部分
const mergedHtmlPath = path.join(__dirname, 'index_merged.html');
let mergedHtmlContent = fs.readFileSync(mergedHtmlPath, 'utf8');

// 找到script标签之前的内容
const scriptTagIndex = mergedHtmlContent.indexOf('<script>');
const htmlBeforeScript = mergedHtmlContent.substring(0, scriptTagIndex);

// 读取提取的JavaScript代码
const extractedScriptPath = path.join(__dirname, 'extracted_script.js');
const jsContent = fs.readFileSync(extractedScriptPath, 'utf8');

// 组合完整文件
const completeContent = htmlBeforeScript + '<script>\n' + jsContent + '\n    </script>\n</body>\n</html>';

// 写入完整的融合文件
const outputPath = path.join(__dirname, 'index_merged_complete.html');
fs.writeFileSync(outputPath, completeContent, 'utf8');

console.log('完整融合文件已创建: index_merged_complete.html');
console.log('文件大小:', Buffer.byteLength(completeContent, 'utf8'), '字节');
