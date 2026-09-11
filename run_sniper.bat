@echo off
title Invest Bot - Auction Sniper (Multi-Worker)
color 0b
echo ====================================================
echo      INVEST BOT - AUCTION SNIPER LAUNCHER
echo ====================================================
echo Membuka Auction Sniper Multi-Worker di folder Board...
cd /d "%~dp0Board"

echo.
echo Pastikan koneksi internet stabil.
echo Tekan Ctrl+C jika ingin menghentikan script.
echo.

node auctionSniper.js

echo.
echo Script telah selesai.
pause
