#!/bin/bash
# ============== 代码评审创建脚本 ==============
# 所有参数通过环境变量传入（由 Review 工具注入）
# 必需：REPO_ID, FULL_NAME, SRC_BRANCH, DEST_BRANCH, PLATFORM_URL, ACCESS_TOKEN
# 可选：REVIEW_SUBJECT（不传则自动生成）
# =================================================

set -euo pipefail
IFS=$'\n\t'

# 校验必需环境变量
for var in REPO_ID FULL_NAME SRC_BRANCH DEST_BRANCH PLATFORM_URL ACCESS_TOKEN; do
  if [ -z "${!var:-}" ]; then
    echo "[FAIL] 缺少环境变量: $var"
    exit 1
  fi
done

API_BASE="$PLATFORM_URL/v1/code/v2/repos/$REPO_ID"

# 校验依赖工具
if ! command -v curl >/dev/null 2>&1; then
  echo "[FAIL] 未找到 curl 工具"
  exit 1
fi

# JSON 字符串转义（处理双引号、反斜杠、控制字符）
escape_json() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  printf '%s' "$s"
}

echo "源分支：$SRC_BRANCH"
echo "目标分支：$DEST_BRANCH"

# 禁止源分支与目标分支相同
if [ "$SRC_BRANCH" = "$DEST_BRANCH" ]; then
  echo "[FAIL] 源分支与目标分支一致，无需创建评审"
  exit 1
fi

# 评审标题：优先用环境变量，否则自动生成
if [ -z "${REVIEW_SUBJECT:-}" ]; then
  REVIEW_SUBJECT="Merge $SRC_BRANCH into $DEST_BRANCH"
fi
echo "评审标题：$REVIEW_SUBJECT"

# 构造 JSON 请求体（纯 bash，无 jq 依赖）
SUBJECT_ESC=$(escape_json "$REVIEW_SUBJECT")
FULLNAME_ESC=$(escape_json "$FULL_NAME")
SRC_ESC=$(escape_json "$SRC_BRANCH")
DEST_ESC=$(escape_json "$DEST_BRANCH")
DATA="{\"subject\":\"$SUBJECT_ESC\",\"fullName\":\"$FULLNAME_ESC\",\"info\":\"-\",\"notifyReviewers\":[],\"srcBranch\":\"$SRC_ESC\",\"destBranch\":\"$DEST_ESC\"}"

echo ""
echo "正在创建代码评审..."

# 将 JSON 写入临时文件，再用 -d @file 发送
# 原因：Git Bash 下 curl --data-raw "$DATA" 会经过 MSYS2 参数转换层，
# 导致 UTF-8 中文被错误转码为 GBK，服务端 JSON 解析失败。
# 用 -d @file 让 curl 直接读取文件字节流，绕过参数传递的编码转换。
PAYLOAD_FILE=$(mktemp)
printf '%s' "$DATA" > "$PAYLOAD_FILE"

# 调用创建评审接口（使用 access_token 自定义请求头鉴权）
RESPONSE=$(curl -s -X POST "$API_BASE/reviews" \
  -H "Pragma: no-cache" \
  -H "access_token: $ACCESS_TOKEN" \
  -H "Content-Type: application/json;charset=UTF-8" \
  -d "@$PAYLOAD_FILE")

# 清理临时文件
rm -f "$PAYLOAD_FILE"

# 从 JSON 中提取字段值（纯 bash，支持字符串和数字）
extract_json_field() {
  local json="$1"
  local field="$2"
  local flat value
  # 压平换行，便于正则匹配
  flat=$(printf '%s' "$json" | tr -d '\n\r')
  # 先尝试字符串值："field":"xxx"
  value=$(printf '%s' "$flat" | sed -nE "s/.*\"$field\"[[:space:]]*:[[:space:]]*\"([^\"]*)\".*/\1/p")
  if [ -n "$value" ]; then
    printf '%s' "$value"
    return
  fi
  # 再尝试数字值："field":123
  value=$(printf '%s' "$flat" | sed -nE "s/.*\"$field\"[[:space:]]*:[[:space:]]*([0-9]+).*/\1/p")
  printf '%s' "$value"
}

# 解析返回结果
CODE=$(extract_json_field "$RESPONSE" "code")
REVIEW_ID=$(extract_json_field "$RESPONSE" "id")

if [ "$CODE" = "0" ] && [ -n "$REVIEW_ID" ]; then
  REVIEW_URL="$PLATFORM_URL/code/$FULL_NAME/-/reviews/$REVIEW_ID"
  echo ""
  echo "[OK] 代码评审创建成功！"
  echo "评审ID：$REVIEW_ID"
  echo "评审地址：$REVIEW_URL"
  exit 0
else
  echo ""
  echo "[FAIL] 创建失败"
  echo "接口返回：$RESPONSE"
  exit 1
fi
