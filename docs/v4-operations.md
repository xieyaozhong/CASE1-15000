# CASE1-15000 V4 Operations

V4 把 V2/V3 的 Dashboard 視覺與管理工作區，進一步補成可日常營運的操作流程。

## 已完成

### 1. 投資案編輯與結束

- 投資案列表新增「編輯」操作欄。
- 可修改案號、名稱、案源、案件金額、起始日與備註。
- 可正式結束投資案。
- 結束案件時，同步把該案仍為 `active` 的參與紀錄改為 `closed`，並寫入結束日，避免客戶前台仍把本金算在「目前投入」。
- Demo 模式直接同步更新 localStorage。
- 正式 Supabase 建議安裝 `supabase/v4_operations.sql`，使用 `close_project_safe()` 在同一 transaction 完成案件與參與紀錄結束。
- 若正式資料庫尚未安裝 V4 RPC，前端會退回既有 admin RLS 下的更新流程，不會讓功能直接失效。

### 2. 投資人編輯

- 投資人列表新增「編輯」操作欄。
- 可修改投資人代碼、顯示名稱、登入 Email 與歷史已撥款起始值。
- 修改投資人 Email 不會直接修改 Supabase Auth 使用者 Email，介面會明確提示這個差異。

### 3. 單一週次快速撥款

- 撥款工作區新增「待撥款週次」選擇器。
- 可一鍵選取該週全部待撥款收益。
- 仍使用 V3 的批次撥款流程逐筆呼叫安全 `DB.markPaid()`，維持既有批次鎖定、RPC 與稽核規則。
- 可一鍵清除目前選取。

### 4. 報表匯出中心

管理後台新增「報表匯出」工作區，目前提供：

- 週結算撥款清冊 CSV
- 單一投資人對帳明細 CSV
- 全部投資案營運總覽 CSV

匯出內容包含實際營運會需要的週期、投資人、案件、本金、收益、撥款狀態與日期等欄位。

### 5. 週結算工作流重整

- 將「週結算批次／操作紀錄」從 Dashboard 首頁移入「每週結算」工作區。
- 每週結算頁新增三步驟流程提示：
  1. 試算收益
  2. 確認鎖定
  3. 完成撥款
- 首頁因此保留 KPI、趨勢與撥款摘要，不再混入大量操作表格。

### 6. V3 / V4 相容層

V3 Quick View 以第一欄代碼定位資料。V4 的編輯按鈕因此使用獨立「操作」欄，並標記成 V3 排序邏輯會忽略的欄位，避免：

- 案號被讀成 `P-001編輯`
- Quick View 失效
- 排序受到操作文字干擾

## 正式 Supabase 升級

在既有正式資料庫已執行：

1. `supabase/schema.sql`
2. `supabase/production.sql`

之後，再執行：

3. `supabase/v4_operations.sql`

V4 SQL 可重複執行。

## V4 前端檔案

- `assets/operations-v4.js`
- `assets/operations-v4.css`
- `assets/operations-v4-safe-close.js`
- `assets/operations-v4-compat.js`
- `assets/operations-v4-compat.css`

以上檔案由 `assets/common.js` 在管理後台自動載入。
