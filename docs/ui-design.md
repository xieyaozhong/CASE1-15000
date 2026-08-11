# CASE1-15000 UI Design System V3

## 方向

本專案保留原本的 GitHub Pages + Supabase 架構，不直接搬入大型前端框架。V2 / V3 採用原生 CSS / JavaScript 實作一套可持續擴充的金融營運 Dashboard 視覺與操作系統。

核心原則：

- 數字優先：金額、狀態、週期的資訊層級高於裝飾。
- 前後台一致：客戶前台與管理後台共用色彩、卡片、表格、狀態元件。
- 操作與資訊分離：主要 CTA、危險操作、狀態提示有明確視覺差異。
- 金融可信感：深藍主色、低飽和背景、節制陰影、綠色僅用於正向/完成狀態。
- 行動裝置優先：KPI 自動換列、後台導覽轉為橫向可滑動；客戶前台資料表在手機轉成資訊卡片。
- 不以美感犧牲正式流程：草稿、確認鎖定、撥款、稽核、RLS 與 Excel 匯入邏輯維持原本機制。

## 開源設計參考

### Tabler

- Repo: https://github.com/tabler/tabler
- License: MIT
- 參考重點：清楚的資訊層級、資料表格、狀態標籤、響應式 Dashboard 排版。

### TailAdmin

- Repo: https://github.com/TailAdmin/tailadmin-free-tailwind-dashboard-template
- React version: https://github.com/TailAdmin/free-react-tailwind-admin-dashboard
- License: MIT
- 參考重點：深色側欄、Finance Dashboard 資訊密度、KPI 卡片、進階表格與行動版導覽。

### Flowbite Admin Dashboard

- Repo: https://github.com/themesberg/flowbite-admin-dashboard
- License: MIT
- 參考重點：CRUD 後台、表單、表格、狀態元件與統計卡的結構。

> 本專案沒有直接複製上述模板頁面，而是抽取常見 Dashboard 設計模式後，以本專案自己的 HTML、CSS 與 JavaScript 重做。

## V2 已完成

- `assets/theme-v2.css`：整體視覺主題、卡片、表格、表單、側欄、Hero、響應式設計。
- `assets/dashboard-insights.css`：趨勢圖與資產/撥款摘要卡樣式。
- `assets/dashboard-insights.js`：前台近 8 週收益趨勢、資產概況；後台近 8 週收益分配、撥款完成度。
- `assets/common.js`：集中載入視覺、UX、安全、稽核、匯入與正式上線檢查模組。

## V3 已完成

### 管理後台工作區

- 投資案、投資人、參與紀錄、撥款管理加入即時搜尋。
- 可點擊欄位標題進行升冪 / 降冪排序。
- 支援 10 / 20 / 50 / 100 筆分頁。
- 側欄顯示草稿批次、待撥款、投資案、投資人、參與紀錄數量徽章。
- 撥款管理支援勾選多筆後批次標記已撥款。
- 批次撥款仍逐筆呼叫既有 `DB.markPaid()`，因此沿用結算鎖定與正式資料庫 RPC 安全規則，不繞過原本權限機制。

### Quick View

- 點擊投資案列表可開啟右側詳情 Drawer。
- 投資案詳情包含案件金額、目前參與總額、參與人數、累計分配收益、參與投資人、最近收益與備註。
- 點擊投資人列表可開啟右側詳情 Drawer。
- 投資人詳情包含目前投入、累計收益、待撥款、累計已撥款、參與投資案與帳戶資訊。

### 手機前台

- `assets/mobile-tables.js` 自動替表格資料加入欄位標籤。
- `assets/mobile-tables.css` 在 640px 以下把客戶收益與投資案表格轉成卡片布局。
- 桌機與 iPad 寬螢幕仍保留高密度表格。

## 色彩角色

- Navy `#10263e`：品牌、側欄、主要結構。
- Blue `#2f6fed`：主要 CTA、客戶端圖表。
- Green `#0b8f73`：完成、已撥款、正收益與後台營運圖表。
- Amber：草稿、待撥款、需要注意但不是錯誤的狀態。
- Red：危險操作與錯誤。

## 下一階段建議

1. 將「週結算批次」完整收進每週結算 panel，首頁只保留營運摘要。
2. 為投資案與投資人增加編輯 / 停用流程，而不只新增與檢視。
3. 增加「單一週次撥款」快捷動作，一鍵勾選該週全部待撥款。
4. 增加資料匯出中心：投資人對帳單、週結算報表、撥款清冊。
5. 增加正式營運的錯誤紀錄、備份狀態與資料完整性檢查頁。
