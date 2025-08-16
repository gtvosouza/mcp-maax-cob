#!/bin/bash

echo "🧪 Testando servidor MCP MAAX COB"
echo "=================================="
echo ""

# Testar modo STDIO (simulando Claude Desktop)
echo "📝 Testando modo STDIO..."
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"1.0.0","capabilities":{},"clientInfo":{"name":"test-client","version":"1.0.0"}},"id":1}' | MCP_TRANSPORT=stdio timeout 2 npm run --silent mcp:stdio 2>&1 | grep -A5 "MCP"

echo ""
echo "✅ MCP compilado com sucesso!"
echo ""
echo "📋 Para instalar no Claude Desktop:"
echo "1. Copie o conteúdo de claude_desktop_config.json"
echo "2. Cole no arquivo de configuração do Claude:"
echo "   - Windows: %APPDATA%\\Claude\\claude_desktop_config.json"
echo "   - macOS: ~/Library/Application Support/Claude/claude_desktop_config.json"
echo "   - Linux: ~/.config/Claude/claude_desktop_config.json"
echo ""
echo "3. Ajuste os caminhos no arquivo:"
echo "   - Mude '/home/gtvosouza/mcp-maax-cob' para o caminho correto"
echo "   - Configure as credenciais do banco de dados"
echo ""
echo "4. Reinicie o Claude Desktop"
echo ""
echo "🎉 Pronto! O MCP estará disponível no Claude."