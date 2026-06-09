#!/bin/bash
# 端到端验证：模拟油猴脚本完整流程（提取→DeepSeek→提交→判题）。
# 用法: ./e2e.sh <proNum> <assignID> [model]
set -e
PRONUM=${1:-2}; ASSIGN=${2:-51}; MODEL=${3:-deepseek-v4-pro}
DIR=/tmp/cgtest; B=${CG_BASE:-http://10.109.120.139}; J=$DIR/e2e_cookies.txt
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
# 凭据从环境变量读取，勿硬编码到仓库： export CG_USER=... CG_PASS=...
: "${CG_USER:?set CG_USER}"; : "${CG_PASS:?set CG_PASS}"

echo "===== [1] 登录并预热会话 ====="
curl -s -o /dev/null -c $J "$B/login/loginproc.jsp" --data "IndexStyle=1&stid=$CG_USER&pwd=$CG_PASS"
curl -s -o /dev/null -L -b $J -c $J "$B/courselist.jsp?urid=5492"
curl -s -o /dev/null -b $J "$B/assignment/index.jsp?courseID=4&assignID=$ASSIGN"
curl -s -b $J "$B/assignment/programList.jsp?proNum=$PRONUM&assignID=$ASSIGN" -o $DIR/pl_$PRONUM.html
echo "programList: $(wc -c <$DIR/pl_$PRONUM.html) bytes"

echo "===== [2] 提取题目 + DeepSeek 生成 ====="
cd $DIR && node gen.mjs $PRONUM $ASSIGN $MODEL
MAIN=$(node -e "process.stdout.write(require('./meta.json').mainClass)")
PID=$(node -e "process.stdout.write(require('./meta.json').problemID)")
echo ">>> mainClass=$MAIN  problemID=$PID"

echo "===== [3] 提交 (multipart) ====="
REF="$B/assignment/programList.jsp?proNum=$PRONUM&assignID=$ASSIGN"
SUBURL="$B/assignment/showProcessMsg.jsp?problemID=$PID&assignID=$ASSIGN&doSubmit=true&progLanguage=java&javaMainCLass=$MAIN&wtime=15"
curl -s -o /dev/null -w "submit HTTP=%{http_code} -> %{redirect_url}\n" -b $J -A "$UA" -e "$REF" \
    "$SUBURL" -F "FILE1=@$DIR/sol/$MAIN.java;type=application/octet-stream" -F "cgSubmitBtn=tijiao"

echo "===== [4] 轮询判题结果 ====="
sleep 2
for i in $(seq 1 25); do
  curl -s -b $J "$B/assignment/longtimerunJSON.jsp?assignID=$ASSIGN&problemID=$PID" -o $DIR/v.json
  if iconv -f GBK -t UTF-8//IGNORE $DIR/v.json | grep -q '得分'; then break; fi
  sleep 2
done
echo "--- 判题结果 ---"
iconv -f GBK -t UTF-8//IGNORE $DIR/v.json | sed 's/<[^>]*>/ /g; s/&nbsp;/ /g' | tr -s ' ' ' ' | grep -vE '^[[:space:]]*$' | head -30
