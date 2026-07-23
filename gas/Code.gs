/**
 * QuestStudy — Google Apps Script バックエンド
 *
 * デプロイ手順:
 *   1. スプレッドシートを新規作成
 *   2. 拡張機能 > Apps Script でこのコードを貼り付け
 *   3. SHEET_ID を作成したスプレッドシートのIDに書き換える
 *   4. TOKEN を家族だけが知る文字列に書き換える
 *   5. デプロイ > 新しいデプロイ > 種類「ウェブアプリ」
 *      - 次のユーザーとして実行: 自分
 *      - アクセスできるユーザー: 全員
 *   6. デプロイURLをコピーして QuestStudy.jsx の GAS_URL に貼り付ける
 */

// ============================================================
// ★ ここを書き換える
// ============================================================

// スプレッドシートのURLから取得できるID
// 例: https://docs.google.com/spreadsheets/d/【ここ】/edit
var SHEET_ID = "YOUR_SPREADSHEET_ID";

// URLに付けるアクセストークン（英数字で自由に決めてOK）
var TOKEN = "YOUR_SECRET_TOKEN";

// ============================================================

var CELL = "A1"; // データを保存するセル（変更不要）

/**
 * GET: データの読み込み＆保存を両方処理する
 *   読み込み: ?token=xxx
 *   保存:     ?token=xxx&method=save&data=...
 */
function doGet(e) {
  if (!e || e.parameter.token !== TOKEN) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: "unauthorized" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();

  // method=save のときは保存処理
  if (e.parameter.method === "save") {
    var data = e.parameter.data;
    sheet.getRange(CELL).setValue(data);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // それ以外は読み込み
  var value = sheet.getRange(CELL).getValue();
  return ContentService
    .createTextOutput(value || "null")
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * POST: データを保存する
 * 呼び出し例: fetch(GAS_URL, { method:"POST", body: JSON.stringify({ token:"xxx", data:"..." }) })
 */
function doPost(e) {
  // URLSearchParams（application/x-www-form-urlencoded）で受け取る
  var token = e.parameter.token;
  var data  = e.parameter.data;

  if (token !== TOKEN) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: "unauthorized" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();
  sheet.getRange(CELL).setValue(data);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
