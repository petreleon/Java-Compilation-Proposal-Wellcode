#!/bin/zsh

# restart-server.sh - Reliable dev server restart

echo "Killing stale Next.js servers..."
lsof -ti:3000 -ti:3001 | xargs kill -9 2>/dev/null
pkill -f "next-server" 2>/dev/null
sleep 1

PS_COUNT=$(ps aux | grep "next-server" | grep -v grep | wc -l | tr -d ' ')
if [ "$PS_COUNT" -gt 0 ]; then
  echo "Warning: $PS_COUNT next-server processes still running"
  ps aux | grep "next-server" | grep -v grep
else
  echo "All stale servers cleared."
fi

echo ""
echo "Downloading assets if missing..."
node scripts/download-assets.js

echo ""
echo "Starting Next.js dev server..."
rm -rf .next/
npm run dev
