#!/bin/bash
find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" -not -path "*/out/*" -not -name "*.png" -not -name "*.vsix" -exec sed -i '' \
  -e 's/HumanAgent-MCP/HITL-MCP/g' \
  -e 's/humanagent-mcp/hitl-mcp/g' \
  -e 's/HumanAgent MCP/HITL MCP/g' \
  -e 's/HumanAgent Chat/HITL Chat/g' \
  -e 's/HumanAgent_Chat/HITL_Chat/g' \
  -e 's/HumanAgent/HITL/g' \
  -e 's/humanagent/hitl/g' \
  {} +
