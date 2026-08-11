# CASE1-15000 UI Design System V2

## 方向

本專案保留原本的 GitHub Pages + Supabase 架構，不直接搬入大型前端框架。V2 採用原生 CSS / JavaScript 實作一套可持續擴充的金融營運 Dashboard 視覺系統。

核心原則：

- 數字優先：金額、狀態、週期的資訊層級高於裝飾。
- 前後台一致：客戶前台與管理後台共用色彩、卡片、表格、狀態元件。
- 操作與資訊分離：主要 CTA、危險操作、狀態提示有明確視覺差異。
- 金融可信感：深藍主色、低飽和背景、節制陰影、綠色僅用於正向/完成狀態。
- 行動裝置優先：KPI 自動換列、後台導覽轉為橫向可滑動、表格保留橫向瀏覽。
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

## V2 新增檔案

- `assets/theme-v2.css`：整體視覺主題、卡片、表格、表單、側欄、Hero、響應式設計。
- `assets/dashboard-insights.css`：趨勢圖與資產/撥款摘要卡樣式。
- `assets/dashboard-insights.js`：前台近 8 週收益趨勢、資產概況；後台近 8 週收益分配、撥款完成度。
- `assets/common.js`：載入 V2 主題與 Dashboard insights，同時保留 hardening / audit / import / health extensions。

## 色彩角色

- Navy `#10263e`：品牌、側欄、主要結構。
- Blue `#2f6fed`：主要 CTA、客戶端圖表。
- Green `#0b8f73`：完成、已撥款、正收益與後台營運圖表。
- Amber：草稿、待撥款、需要注意但不是錯誤的狀態。
- Red：危險操作與錯誤。

## 後續優化建議

1. 將「週結算批次」完整收進每週結算 panel，避免 Dashboard 首頁過長。
2. 投資案與投資人表格增加搜尋、排序、分頁。
3. 撥款管理加入批次勾選與批次標記已撥款。
4. 增加投資案詳情 drawer，不必切換頁面就能看參與人與歷史收益。
5. 正式上線後依實際資料量決定是否引入虛擬表格或圖表 library。
