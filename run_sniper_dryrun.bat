@echo off
title Invest Bot - Auction Sniper (DRY RUN SIMULATION)
color 0e
echo ====================================================
echo      AUCTION SNIPER - MODE DRY RUN (SIMULASI)
echo ====================================================
echo Mode ini AMAN: Bot akan berjalan normal dan mendeteksi
echo lelang, tetapi TIDAK AKAN mengirim bid uang/poin sungguhan.
echo ====================================================
echo.

cd /d "%~dp0Board"
node auctionSniper.js --dry-run

echo.
echo Simulasi selesai.
pause
