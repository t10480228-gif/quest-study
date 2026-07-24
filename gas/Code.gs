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
 * ユーザー名に対応するシートを取得する。
 * シートが存在しない場合は新規作成する。
 */
function getSheetForUser(ss, userName) {
  var sheet = ss.getSheetByName(userName);
  if (!sheet) {
    sheet = ss.insertSheet(userName);
  }
  return sheet;
}

/**
 * GET: データの読み込み
 *   ?token=xxx&user=ユーザー名
 */
function doGet(e) {
  if (!e || e.parameter.token !== TOKEN) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: "unauthorized" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var userName = e.parameter.user || "default";
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = getSheetForUser(ss, userName);

  var value = sheet.getRange(CELL).getValue();
  return ContentService
    .createTextOutput(value || "null")
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * POST: データを保存する
 * body: { token, user, data }
 */
function doPost(e) {
  // フロントエンドは Content-Type: text/plain で JSON 文字列を送る。
  // GAS は text/plain を e.postData.contents に格納する。
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (_) {}

  var token    = body.token;
  var userName = body.user || "default";
  var data     = body.data;

  if (token !== TOKEN) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: "unauthorized" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = getSheetForUser(ss, userName);
  sheet.getRange(CELL).setValue(data);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
