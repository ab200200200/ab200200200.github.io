# 台股分析平台

React + Vite + Tailwind CSS 前端，Node.js + Express + SQLite 後端，使用 TradingView Lightweight Charts 呈現日 K 線與均線。

## 功能

- 台股代號搜尋，例如 `2330`、`0050`、`2317`
- TWSE OpenAPI 上市股票最新日成交與行情摘要
- TWSE 官方 `STOCK_DAY` 補齊多日歷史日 K
- 後端自行計算 `MA5`、`MA10`、`MA20`、`MA60`、5 日均量與爆量判斷
- TWSE 三大法人買賣超與連買/連賣天數
- 神秘金字塔千張大戶持股比例與近週變化
- SQLite API 快取與 Express rate limit
- React Query 前端快取、loading state、error handling

## 資料來源

- 股票價格與最新日成交：TWSE OpenAPI `https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL`
- 歷史日 K：TWSE 官方 JSON `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?response=json&date=YYYYMM01&stockNo=股票代號`
- 上市公司基本資料可由 TWSE OpenAPI `https://openapi.twse.com.tw/v1/opendata/t187ap03_L` 擴充
- 三大法人：TWSE 官方 JSON `https://www.twse.com.tw/rwd/zh/fund/T86?response=json&date=YYYYMMDD&selectType=ALLBUT0999`
- 千張大戶：神秘金字塔 `https://norway.twsthr.info/StockHolders.aspx?stock=股票代號`
- 上櫃備援來源：TPEX OpenAPI `https://www.tpex.org.tw/openapi/`，可後續補上上櫃日行情與三大法人端點

免費資料源可能有延遲、欄位調整、短暫限流或防爬機制；後端已加入 TTL 快取與請求限制來降低被擋機率。

## TWSE OpenAPI 盤點

| 需求 | OpenAPI 端點 | 狀態 |
| --- | --- | --- |
| 最新開高低收、成交量、漲跌 | `/exchangeReport/STOCK_DAY_ALL` | 可用 |
| 最新收盤價、月平均價 | `/exchangeReport/STOCK_DAY_AVG_ALL` | 可用 |
| 公司基本資料 | `/opendata/t187ap03_L` | 可用，ETF 不一定包含 |
| 月成交資訊 | `/exchangeReport/FMSRFK_ALL` | 可用，但不能替代日 K |
| 年成交資訊 | `/exchangeReport/FMNPTK_ALL` | 可用，但不能替代日 K |
| 外資持股類股/前 20 名 | `/fund/MI_QFIIS_cat`, `/fund/MI_QFIIS_sort_20` | 可用，但不是個股三大法人買賣超 |
| 個股歷史日 K 多日資料 | 未在 swagger 中找到 | 不足 |
| 個股三大法人買賣超 T86 | 未在 swagger 中找到 | 不足 |

## 補齊缺失資料的做法

TWSE OpenAPI 的 `/exchangeReport/STOCK_DAY_ALL` 只適合拿最新交易日全表，因此後端會另外使用 TWSE 官方歷史 JSON `STOCK_DAY` 逐月抓取近 8 個月資料，合併成最多 180 根日 K。技術指標與 5 日均量都用這批日 K 自行計算。

三大法人資料改用 TWSE 官方 `T86` 日報，從最近交易日往前掃描，收集最多 20 筆資料，再計算連續買超或連續賣超天數。

如果查詢的是上櫃股票，目前會先回傳上市資料源查無資料；後續可接 TPEX OpenAPI 的上櫃日行情與三大法人買賣明細作 fallback。

## 合理性驗證

後端會回傳 `warnings` 與 `dataQuality`，避免把資料不足誤顯示為正常數值：

- 成交量為 0 或空值會警示。
- OHLC 價格為 0，或高低價未包住開收盤價會警示。
- 最新交易日距今超過 7 天會警示。
- 日 K 少於 5 根時，`MA5` 與 `5 日均量` 留空，不回傳 0。
- 日 K 少於 60 根時，`MA60` 依資料不足留空。
- 千張大戶比例超出 0-100，或週資料少於 4 筆會警示。

## 安裝

```bash
npm install
```

## 開發啟動

```bash
npm run dev
```

啟動後：

- Frontend: http://localhost:5173
- Backend: http://localhost:4000
- Health check: http://localhost:4000/health

## 單獨啟動

```bash
npm run dev --workspace backend
npm run dev --workspace frontend
```

## API

```text
GET /api/stock/:id
GET /api/technical/:id
GET /api/institutional/:id
GET /api/majorholders/:id
```

## 專案結構

```text
.
├── backend
│   ├── data
│   └── src
│       ├── routes
│       ├── services
│       └── utils
└── frontend
    └── src
        ├── components
        ├── hooks
        ├── services
        ├── types
        └── utils
```

## 建置與型別檢查

```bash
npm run typecheck
npm run build
```
