# GitHub 上傳指引

這份專案已整理為可上傳 GitHub 的狀態，並已排除不應上傳的內容（例如 `node_modules`、備份 zip、快取資料庫）。

## 1) 先確認你要上傳的資料夾

請在這個資料夾執行：

`C:\Users\ab100100\Desktop\stock-platform`

## 2) 初始化並連到 GitHub（首次）

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<你的帳號>/<你的repo>.git
git push -u origin main
```

## 3) 之後每次更新

```bash
git add .
git commit -m "update"
git push
```

## 4) 目前已自動忽略的內容

- `node_modules/`
- `dist/`
- `release/`
- `stock-platform-share/`
- `*.zip`
- `backend/data/*.sqlite*`
- `.env`

## 5) 如果電腦找不到 git 指令

請先安裝 Git for Windows：  
https://git-scm.com/download/win

安裝完成後重開終端機，再執行上面的指令。
