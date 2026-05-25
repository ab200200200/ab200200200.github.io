# Neon + Render 設定指南

## 1) 在 Neon 建立資料庫

1. 到 [Neon](https://neon.tech/) 建立專案。
2. 複製 `connection string`（格式類似 `postgresql://...`）。
3. 確認字串包含 `sslmode=require`。

## 2) 在 Render 設定環境變數（Backend 服務）

請在 Render 的 backend service 加上：

- `DATABASE_URL`：Neon connection string
- `PG_POOL_MAX=12`
- `DB_SYNC_CONCURRENCY=6`
- `SYNC_TIMEZONE=Asia/Taipei`
- `RUN_SYNC_ON_BOOT=false`
- `SYNC_ADMIN_TOKEN=<自訂長字串>`
- `DAILY_ROWS_TO_KEEP=400`
- `WEEKLY_ROWS_TO_KEEP=160`

> `DATABASE_URL` 存在時，後端啟動會自動建立資料表。

## 3) 自動更新排程（已內建）

系統會自動啟動三個排程（台北時區）：

1. 週一到週五 `19:00`  
   更新：`K線/成交量/外資/投信`

2. 週六 `09:00`  
   更新：`千張大戶`

3. 週一 `07:00`  
   更新股票清單（symbol universe）

## 4) 手動觸發更新（可選）

後端提供管理 API：

- `POST /api/admin/sync/daily?token=你的SYNC_ADMIN_TOKEN`
- `POST /api/admin/sync/majorholders?token=你的SYNC_ADMIN_TOKEN`

也可用本機指令：

- `npm run sync:daily --workspace backend`
- `npm run sync:major --workspace backend`
- `npm run sync:universe --workspace backend`

## 5) 資料表設計（分開管理）

已拆分成獨立資料表：

1. `stock_prices_daily`：主圖 K 線 OHLC
2. `stock_volumes_daily`：成交量
3. `institutional_foreign_daily`：外資買賣超
4. `institutional_trust_daily`：投信買賣超
5. `major_holders_weekly`：千張大戶
6. `stock_symbols`：股票清單

> 系統會在每次寫入後自動清理舊資料，預設每檔日資料保留 400 筆（足夠 80 週 K 線）。

## 6) 注意事項

1. 若 Render 使用會休眠的方案，排程在休眠時不會執行。  
   建議使用 always-on 方案，或另外加 Render Cron Job 定時呼叫管理 API。
2. 第一次完整同步需要較久時間，建議先跑一次 `sync:daily`。
