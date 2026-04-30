const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  'package.json',
  'README.md',
  'README-Additional.md',
  'ReadMeDev.md',
  'Proxy-Rules.md',
  'src/extension.ts',
  'src/serverManager.ts',
  'src/providers/chatTreeProvider.ts',
  'src/webview/chatWebviewProvider.ts',
  'src/mcp/mcpConfigManager.ts',
  'src/mcp/mcpStandalone.ts',
  'src/mcp/server.ts',
  'src/mcp/types.ts',
  '.vscodeignore'
];

for (const file of filesToUpdate) {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace patterns
    content = content.replace(/HumanAgent-MCP/g, 'HITL-MCP');
    content = content.replace(/humanagent-mcp/g, 'hitl-mcp');
    content = content.replace(/HumanAgent MCP/g, 'HITL MCP');
    content = content.replace(/HumanAgent Chat/g, 'HITL Chat');
    content = content.replace(/HumanAgent_Chat/g, 'HITL_Chat');
    content = content.replace(/HumanAgent/g, 'HITL');
    content = content.replace(/humanagent/g, 'hitl');
    
    // Handle the icon file name in package.json
    if (file === 'package.json') {
      content = content.replace(/HITL_Icon_Square.png/g, 'HumanAgent_Icon_Square.png'); // Keep the original icon name for now
    }
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated: ' + file);
  }
}
