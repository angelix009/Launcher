#!/bin/bash
# Auto-fill and claim when vault reaches PURCHASING state
VAULT="H3SygoT8tLcf7uFD4xyuchmTQCLvuTHpwBmFvbovHYb6"
PRIV="HHseayi8m71ACt1VTnjRfUD9AwxmdQdBNXq2LYwxxGSMgAiSZwsvtTNDDduxwhxpEfRmEUebVx6Vd3oUWdRNv6N"
BASE="http://localhost:3001"

WALLETS=(
  "4VtBuv8XaRrAXQcM1JtpFGY8MSoLqb5mDvkLaCK8oRK85Z3ZCVdNdHE4xGCjLTPsj4wqvY6fy3hd4HcnZwa19Gbi"
  "2DMhijPhRj8UF5frj1PqhpWb3rr22HNzznyWEkAXn4Fy4Vz3Xi3x4ndbNMii22eo3A9SavVucx68BcLkGcMTZi1q"
  "5AHSGYLLdztUY1aDr4mFXZPi5KrZ4gDiXi2RPfpPafv87HuarBL4C1uk4QZsXm5xvsGH6TG9EN1ff7MXCoUySto"
)

echo "Waiting for PURCHASING state..."
while true; do
  STATE=$(curl -s -X POST $BASE/api/alpha-vault/status \
    -H 'Content-Type: application/json' \
    -d "{\"vaultAddress\":\"$VAULT\",\"network\":\"devnet\"}" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['state'])" 2>/dev/null)

  if [ "$STATE" = "2" ] || [ "$STATE" = "PURCHASING" ]; then
    echo "PURCHASING state reached!"
    break
  fi
  echo "  State: $STATE - waiting 30s..."
  sleep 30
done

echo ""
echo "=== FILLING VAULT ==="
FILL=$(curl -s -X POST $BASE/api/alpha-vault/fill \
  -H 'Content-Type: application/json' \
  -d "{\"vaultAddress\":\"$VAULT\",\"privateKey\":\"$PRIV\",\"network\":\"devnet\"}")
echo "$FILL" | python3 -m json.tool

echo ""
echo "=== CLAIMING FOR EACH WALLET ==="
for i in 0 1 2; do
  echo "Claiming wallet $((i+1))..."
  curl -s -X POST $BASE/api/alpha-vault/claim \
    -H 'Content-Type: application/json' \
    -d "{\"vaultAddress\":\"$VAULT\",\"walletPrivateKey\":\"${WALLETS[$i]}\",\"network\":\"devnet\"}" | python3 -c "
import sys,json
d = json.load(sys.stdin)
if d.get('success'):
    print(f'  OK - claimed: {d[\"data\"][\"claimedNow\"]} tokens, sig: {d[\"data\"][\"signature\"][:30]}...')
else:
    print(f'  FAIL: {d.get(\"error\",\"?\")[:120]}')
"
done

echo ""
echo "=== DONE ==="
