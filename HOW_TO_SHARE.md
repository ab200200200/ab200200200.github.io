# 一鍵啟動說明

## 給使用者的入口

解壓縮 ZIP 後，雙擊：

```text
start-stock-platform.bat
```

第一次執行會自動安裝套件，完成後會啟動服務並開啟：

```text
http://localhost:4000/
```

使用時請保持「Taiwan Stock Platform Server」視窗開著；關閉該視窗後網站服務也會停止。

新版 ZIP 會內含已建置好的前端與後端檔案，所以通常不需要在使用者電腦上重新 build；若 build 檔案遺失，啟動檔才會自動補 build。

## 電腦需求

- Windows
- Node.js LTS
- 可連上網路，因為資料會向 TWSE 與千張大戶來源抓取

如果雙擊後顯示找不到 Node.js，請先安裝：

```text
https://nodejs.org/
```

## 常見錯誤

如果看到 `ECONNREFUSED` 或 `http proxy error`，通常代表舊版分享包的前端已啟動但後端沒有啟動。請改用新版 ZIP，入口是 `start-stock-platform.bat`，網站網址是：

```text
http://localhost:4000/
```
