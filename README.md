# CASE1-15000｜每週收益結算系統

前後台分離的每週收益結算系統，適合 GitHub Pages + Supabase。

## 目前功能

- 客戶前台：只看自己的投資案、目前投入、每週收益、累計收益、撥款狀態，可匯出 CSV。
- 管理後台：投資人、投資案、參與紀錄管理；每週輸入案件收益並按參與金額比例自動分配；撥款狀態管理。
- 週結算鎖定：流程為「草稿 → 已確認 → 已撥款」。草稿可以重算；確認後收益分配被鎖定，避免誤改。
- 客戶可見性：投資人只會看到已確認或已撥款的週結算，不會看到管理員試算中的草稿。
- 操作紀錄：正式模式會記錄投資案、投資人、參與紀錄、結算確認與撥款異動。
- Excel 匯入：支援舊表格中「日期／起租案名／案源／案件金額／參與總額／各投資人欄位／目前總共撥款」的結構。
- 權限：Supabase Auth + Postgres Row Level Security。投資人只能查自己的參與與已確認收益；admin 才能管理全部資料。
- Demo：未設定 Supabase 時使用 localStorage，方便直接在 GitHub Pages 預覽。

## 1. 先看 Demo

目前 `config.js`：

```js
DEMO_MODE: true
```

直接用 GitHub Pages 開啟即可看到前台與管理後台示範，不會寫入真實客戶資料。

## 2. 建立正式 Supabase

1. 建立 Supabase Project。
2. 開啟 SQL Editor，先執行 `supabase/schema.sql`。
3. 接著執行 `supabase/production.sql`，加入正式營運用的結算鎖定、稽核紀錄與最終資料可見性規則。
4. 到 Authentication 建立第一個管理員帳號，或先使用網站前台註冊。
5. 將第一個帳號升級為 admin：

```sql
update public.app_users
set role = 'admin'
where user_id = (select id from auth.users where email = '你的管理員 Email');
```

6. 修改 `config.js`：

```js
window.APP_CONFIG = {
  APP_NAME: '週結算中心',
  SUPABASE_URL: 'https://YOUR_PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR_ANON_KEY',
  DEMO_MODE: false
};
```

`anon key` 可以放前端，但 **絕對不要把 service_role key 放進 GitHub Pages 或任何 JS 檔案**。

## 3. 投資人登入流程

1. 管理員先在後台建立投資人，填入客戶 Email。
2. 客戶在前台用相同 Email 建立 Supabase 帳號。
3. 登入時系統呼叫 `claim_my_investor()`，自動把 Auth 帳號綁到投資人資料。
4. RLS 只允許該帳號查自己的參與資料與已確認／已撥款的週結算。

## 4. 每週結算流程

1. 建立投資案。
2. 建立投資人。
3. 建立「投資人 × 投資案」參與金額。
4. 每週到後台輸入：週起始日、週結束日、投資案、本週總收益、費用。
5. 系統計算：

`個人收益 = (本週總收益 - 費用) × 個人參與金額 ÷ 該案有效參與總額`

6. 草稿階段可重新試算同一週同一案件。
7. 在「週結算批次」按 **確認結算並鎖定**。
8. 確認後客戶才會看到該週收益，且收益金額不能再直接重算。
9. 到「撥款管理」逐筆標記已撥款；該批次全部完成後會自動變成「已撥款」。

## 5. 操作紀錄

正式模式會在 `audit_logs` 留下重要異動，包括：

- 投資案新增／修改／刪除
- 投資人新增／修改／刪除
- 參與紀錄新增／修改／刪除
- 週收益計算
- 結算確認
- 撥款與取消撥款

管理後台會顯示最近的操作紀錄，方便日後對帳與追查。

## 6. 匯入舊 Excel

管理後台 → `Excel 匯入` → 選取原本的 `.xlsx`。

瀏覽器會辨識：

- A：日期
- B：起租案名／同仁
- C：案源
- D：案件金額
- E：參與總額
- E 後方連續有標題的欄位：投資人與各自參與金額
- 「目前總共撥款」右側：投資人歷史已撥款起始值

原始 Excel 不會被放入 GitHub repository；正式模式只會把解析後的結構化資料寫入 Supabase。

## 7. GitHub Pages

本專案是靜態前端，可直接用 GitHub Pages 發佈。若使用 branch source：

- Branch：`main`
- Folder：`/ (root)`

前台：`https://xieyaozhong.github.io/CASE1-15000/`

後台：`https://xieyaozhong.github.io/CASE1-15000/admin.html`

## 正式交付前檢查

- [ ] 已執行 `supabase/schema.sql`
- [ ] 已執行 `supabase/production.sql`
- [ ] 已建立 admin 帳號
- [ ] 已設定投資人登入 Email
- [ ] 已把 `config.js` 改為正式 Supabase URL / anon key
- [ ] 已把 `DEMO_MODE` 改為 `false`
- [ ] 已用測試投資人帳號確認只能看到自己的資料
- [ ] 已測試「草稿 → 確認 → 撥款」完整流程
- [ ] 已備份匯入前的原始 Excel

> 本系統是收益／撥款紀錄與結算工具，不負責判斷投資商品合法性、收益保證或會計／稅務申報。正式營運前仍建議依實際業務增加個資告知、備份、會計欄位與必要的法遵流程。
