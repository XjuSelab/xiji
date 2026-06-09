#!/bin/bash
# 把 /cg-ai-solver.user.js 固定从 ~/public-scripts 提供，独立于 Aurash 构建产物。
# 以 root 运行： sudo bash ~/harden-nginx.sh
set -e
CONF=/etc/nginx/sites-available/aurash-tunnel
MARK="public-scripts/cg-ai-solver"   # 已插入标记（用 root 路径，避免与 location 行混淆）

if [ ! -f "$CONF" ]; then echo "找不到 $CONF"; exit 1; fi

if grep -q "$MARK" "$CONF"; then
    echo "已存在该 location，跳过插入。"
else
    BAK="${CONF}.bak.$(date +%Y%m%d%H%M%S)"
    cp "$CONF" "$BAK"
    echo "已备份 -> $BAK"
    # 在第一个 'location / {' 前插入精确匹配 location（精确匹配优先于前缀 /）
    awk '
        /^[[:space:]]*location \/ \{/ && !ins {
            print "    # 持久托管脚本猫脚本：独立于 Aurash dist，rebuild 不会清掉";
            print "    location = /cg-ai-solver.user.js {";
            print "        root /home/winbeau/public-scripts;";
            print "        default_type application/javascript; charset utf-8;";
            print "        add_header Cache-Control \"no-cache\";";
            print "    }";
            print "";
            ins=1
        }
        { print }
    ' "$BAK" > "$CONF"
    echo "已插入 location = /cg-ai-solver.user.js"
fi

echo "--- nginx -t ---"
if nginx -t; then
    systemctl reload nginx 2>/dev/null || nginx -s reload
    echo "RELOAD_OK"
else
    echo "!! nginx -t 失败，回滚配置"
    LATEST=$(ls -t ${CONF}.bak.* 2>/dev/null | head -1)
    [ -n "$LATEST" ] && cp "$LATEST" "$CONF" && echo "已回滚到 $LATEST"
    exit 1
fi
