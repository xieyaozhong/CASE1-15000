# CASE1-15000｜每週收益結算系統

前後台分離的每週收益結算 MVP，適合 GitHub Pages + Supabase。

## 功能

- 客戶前台：只看自己的投資案、目前投入、每週收益、累計收益、撥款狀態，可匯出 CSV。
- 管理後台：投資人、投資案、參與紀錄管理；每週輸入案件收益並按參與金額比例自動分配；撥款狀態管理。
- Excel 匯入：直接支援舊表格中「日期／起租案名／案源／案件金額／參與總額／各投資人欄位／目前總共撥款」的結構。
- 權限：Supabase Auth + Postgres Row Level Security。投資人只能查自己的參與與週結算；admin 才能管理全部資料。
- Demo：未設定 Supabase 時自動使用 localStorage，方便直接在 GitHub Pages 預覽。

## 1. 先看 Demo

目前 `config.js`：

```js
DEMO_MODE: true
```

直接用 GitHub Pages 開啟即可看到完整前台與後台示範，不會寫入真實客戶資料。

## 2. 建立正式 Supabase

1. 建立 Supabase Project。
2. 開啟 SQL Editor，執行 `supabase/schema.sql`。
3. 到 Authentication 建立第一個管理員帳號，或直接用網站前台註冊。
4. 將第一個帳號升級為 admin：

```sql
update public.app_users
set role = 'admin'
where user_id = (select id from auth.users where email = '你的管理員 Email');
```

5. 修改 `config.js`：

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
4. RLS 只允許該帳號查自己的參與與收益紀錄。

## 4. 每週結算流程

1. 先建立投資案。
2. 建立投資人。
3. 建立「投資人 × 投資案」參與金額。
4. 每週到「每週結算」輸入：週起始日、週結束日、投資案、本週總收益、費用。
5. 系統自動計算：

`個人收益 = (本週總收益 - 費用) × 個人參與金額 ÷ 該案有效參與總額`

6. 到「撥款管理」逐筆標記已撥款。

## 5. 匯入舊 Excel

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

## GitHub Pages

這個專案是純靜態前端，可直接用 GitHub Pages 發佈。若使用 branch source，選 `main` + `/ (root)` 即可。

> 本系統是收益/撥款紀錄與結算工具，不負責判斷投資商品合法性、收益保證或會計/稅務申報。正式營運前仍建議依實際業務增加稽核紀錄、備份、個資告知與會計欄位。
