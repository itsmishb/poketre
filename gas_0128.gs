/**
 * ポケモンカードOCR処理スクリプト (完全版)
 * - JSON Schemaによる構造化出力
 * - Markdown記法除去によるパースエラー防止
 * - 既存「登録待ち」カードの枚数(qty)自動集計機能
 * - AppSheet用高画質サムネイルURL生成 (&sz=w1000)
 */

// -----------------------------------------------------------------
// 1. スクリプト内 定数設定
// -----------------------------------------------------------------
const STAGING_SHEET_NAME = "OCR_Staging";

// 1回の実行で処理する最大のファイル数
const MAX_FILES_PER_RUN = 20; 

// LockServiceの待機時間（0 = 即時終了）
const LOCK_WAIT_TIME_MS = 0; 

// -----------------------------------------------------------------
// 2. 設定読み込み
// -----------------------------------------------------------------
function getScriptProperties_() {
  const properties = PropertiesService.getScriptProperties();
  const requiredKeys = [
    'GEMINI_API_KEY',
    'SPREADSHEET_ID',
    'INBOX_FOLDER_ID',
    'PROCESSED_FOLDER_ID',
    'ERROR_FOLDER_ID',
    'GEMINI_MODEL_MAIN',
    'GEMINI_MODEL_BACKUP'
  ];
  
  const config = {};
  let missingKeys = [];

  requiredKeys.forEach(key => {
    const value = properties.getProperty(key);
    if (!value) missingKeys.push(key);
    config[key] = value;
  });

  if (missingKeys.length > 0) {
    throw new Error(`必須プロパティ不足: ${missingKeys.join(', ')}`);
  }
  return config;
}

// -----------------------------------------------------------------
// 3. メイン処理
// -----------------------------------------------------------------
function processInboxImages() {
  // 多重起動防止
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_TIME_MS)) {
    Logger.log("他プロセス実行中のためスキップします。");
    return;
  }

  try {
    const config = getScriptProperties_();
    
    // フォルダ・シート取得
    const inboxFolder = DriveApp.getFolderById(config.INBOX_FOLDER_ID);
    const processedFolder = DriveApp.getFolderById(config.PROCESSED_FOLDER_ID);
    const errorFolder = DriveApp.getFolderById(config.ERROR_FOLDER_ID);
    const ss = SpreadsheetApp.openById(config.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(STAGING_SHEET_NAME);

    if (!sheet) throw new Error(`シート「${STAGING_SHEET_NAME}」が見つかりません。`);

    // --- ヘッダー情報の動的取得 ---
    const lastCol = sheet.getLastColumn();
    // シートが空の場合のエラー回避
    if (lastCol < 1) throw new Error("シートにヘッダー行がありません。");

    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const headerMap = {};
    headers.forEach((h, i) => { if(h) headerMap[h] = i + 1; });

    // 必須カラムチェック
    if (!headerMap['qty'] || !headerMap['status'] || !headerMap['serial_number']) {
      throw new Error("必須カラム(qty, status, serial_number)が見つかりません。ヘッダー名を確認してください。");
    }

    // --- ★集計ロジック: 既存の「登録待ち」データをメモリに展開 ---
    // Map構造: Key=serial_number, Value={ rowIndex: 行番号, qty: 現在枚数 }
    const pendingCardMap = new Map();
    const lastRow = sheet.getLastRow();
    
    if (lastRow > 1) {
      const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
      const idxStatus = headerMap['status'] - 1;
      const idxSerial = headerMap['serial_number'] - 1;
      const idxQty = headerMap['qty'] - 1;

      data.forEach((row, index) => {
        const status = row[idxStatus];
        const serial = row[idxSerial];
        const qty = row[idxQty];

        // ステータスが「登録待ち」のものだけをMapに登録して追跡
        if (status === "登録待ち" && serial) {
          pendingCardMap.set(String(serial), {
            rowIndex: index + 2, // 行番号 (ヘッダー分+1, 0始まり補正+1)
            qty: Number(qty) || 1
          });
        }
      });
    }

    // --- ファイル処理ループ ---
    const filesIterator = inboxFolder.getFiles();
    let processedCount = 0;

    while (filesIterator.hasNext() && processedCount < MAX_FILES_PER_RUN) {
      const file = filesIterator.next();
      const mimeType = file.getMimeType();

      if (mimeType === MimeType.JPEG || mimeType === MimeType.PNG) {
        try {
          Logger.log(`処理開始: ${file.getName()}`);

          // 1. 画像エンコード
          const base64Image = Utilities.base64Encode(file.getBlob().getBytes());
          
          // 2. API呼び出し
          const geminiResponse = callGeminiVisionApi(
            base64Image, mimeType, config.GEMINI_API_KEY, 
            config.GEMINI_MODEL_MAIN, config.GEMINI_MODEL_BACKUP
          );
          
          if (!geminiResponse) throw new Error("APIレスポンス取得失敗");

          // 3. ★書き込み または 更新 (Qty集計)
          writeOrUpdateSpreadsheet(sheet, headers, headerMap, pendingCardMap, file, geminiResponse);

          // 4. 共有設定 (AppSheet画像表示用: リンクを知っている全員)
          try {
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          } catch(e) { 
            Logger.log(`共有設定スキップ: ${e.message}`); 
          }

          // 5. フォルダ移動
          file.moveTo(processedFolder);
          Logger.log(`処理成功: ${file.getName()}`);
          processedCount++;

        } catch (e) {
          Logger.log(`処理失敗: ${file.getName()} - ${e.message}`);
          try {
            file.moveTo(errorFolder);
          } catch(moveErr) {
            Logger.log(`移動失敗: ${moveErr.message}`);
          }
        }
      }
    }

    Logger.log(processedCount > 0 ? `${processedCount} 件処理しました。` : "処理対象ファイルはありませんでした。");

  } catch (e) {
    Logger.log(`致命的なエラー: ${e.message}`);
  } finally {
    lock.releaseLock();
  }
}

// -----------------------------------------------------------------
// 4. API呼び出し (Markdown除去対策済み)
// -----------------------------------------------------------------
function callGeminiVisionApi(base64Image, mimeType, apiKey, modelMain, modelBackup) {
  
  const executeApiRequest = (modelName) => {
    // URL構築 (v1beta)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
    
    const payload = {
      contents: [{
        role: "user",
        parts: [
          { inline_data: { mime_type: mimeType, data: base64Image } },
          { text: buildOcrPrompt_() }
        ]
      }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseJsonSchema: getOcrResponseSchema_()
      }
    };

    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      headers: { "x-goog-api-key": apiKey },
      muteHttpExceptions: true
    };

    const res = UrlFetchApp.fetch(url, options);
    const code = res.getResponseCode();
    const body = res.getContentText();

    if (code === 200) {
      try {
        const json = JSON.parse(body);
        const parts = json?.candidates?.[0]?.content?.parts || [];
        const textPart = parts.find(p => typeof p.text === "string");
        
        if (!textPart) return { success: false, code: 500, body: "No text part found" };

        // ★Markdownコードブロック除去 (```json ... ```)
        let cleanText = textPart.text.trim();
        if (cleanText.startsWith("```")) {
          cleanText = cleanText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        }

        return { success: true, data: JSON.parse(cleanText) };

      } catch (e) {
        Logger.log(`JSONパース失敗 (${modelName}): ${e.message}`);
        return { success: false, code: 500, body: body };
      }
    }
    
    return { success: false, code: code, body: body };
  };

  // メインモデル実行
  let result = executeApiRequest(modelMain);
  if (result.success) return result.data;

  // 失敗時のフォールバック (404, 429, 5xx)
  const isRetryable = [404, 429, 500, 503].includes(result.code);
  
  if (isRetryable && modelBackup) {
    Logger.log(`メインモデル失敗(${result.code}) -> バックアップモデル(${modelBackup})で再試行`);
    Utilities.sleep(1000); // 少し待機
    let resultBackup = executeApiRequest(modelBackup);
    if (resultBackup.success) return resultBackup.data;
  }

  Logger.log("APIリクエスト完全失敗");
  return null;
}

// -----------------------------------------------------------------
// 5. 書き込み・更新ロジック (Qty集計・高画質サムネ対応)
// -----------------------------------------------------------------
function writeOrUpdateSpreadsheet(sheet, headers, headerMap, pendingMap, file, data) {
  const fileId = file.getId();
  
  // ★高画質サムネイル対応 (&sz=w1000)
  const fileUrl = "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w1000";

  // シリアルナンバー生成 (セットコード_番号)
  // 1. セットコードの前半英字を大文字に固定 (例: sv9 -> SV9, sv5a -> SV5a)
  let setCode = (data.set_code || '???').replace(/^[a-z]+/, (match) => match.toUpperCase());
  
  // 2. card_number_text の整形 (3桁ゼロ埋め強制: 010/100, 001/066等)
  let cardNumStr = data.card_number_text;
  if (cardNumStr && cardNumStr.includes('/')) {
    const parts = cardNumStr.split('/');
    const num = parts[0].trim().padStart(3, '0');
    const total = parts[1].trim().replace(/[^0-9]/g, '').padStart(3, '0');
    cardNumStr = `${num}/${total}`;
  } else if (!cardNumStr) {
    // card_number_text がない場合、数値から生成
    const num = (data.card_number !== null && data.card_number !== undefined) 
      ? String(data.card_number).padStart(3, '0') 
      : "000";
    const total = (data.number_total !== null && data.number_total !== undefined)
      ? String(data.number_total).padStart(3, '0')
      : "???";
    cardNumStr = `${num}/${total}`;
  }
  
  const serialNumber = `${setCode}_${cardNumStr}`;

  // --- 分岐: 既存更新 or 新規追加 ---
  if (pendingMap.has(serialNumber)) {
    // 【A】既存「登録待ち」あり -> Qty更新
    const entry = pendingMap.get(serialNumber);
    const newQty = entry.qty + 1;
    const rowIdx = entry.rowIndex;
    const colIdx = headerMap['qty'];

    sheet.getRange(rowIdx, colIdx).setValue(newQty);
    
    // メモリ上のマップも更新 (同バッチ内での再出現に備える)
    entry.qty = newQty;
    Logger.log(`Qty更新: ${serialNumber} -> ${newQty}枚 (行:${rowIdx})`);

  } else {
    // 【B】新規 -> 行追加
    const lastColIndex = headers.length;
    const newRowData = new Array(lastColIndex).fill(null);

    // ヘッダー名に基づいて値をマッピング
    headers.forEach((headerName, i) => {
      let value = null;
      switch (headerName) {
        // --- システム管理系 ---
        case "file_name": value = file.getName(); break;
        case "image_url": value = fileUrl; break;
        case "raw_text": value = ""; break;
        case "ai_json": value = JSON.stringify(data); break;
        case "status": value = "登録待ち"; break;
        case "confirmed_at": value = ""; break;
        
        // --- キー項目 ---
        case "serial_number": value = serialNumber; break;
        case "qty": value = 1; break;

        // --- Gemini抽出データ ---
        case "set_code": value = data.set_code || null; break;
        case "regulation_mark": value = data.regulation_mark || null; break;
        case "card_number": value = data.card_number; break;
        case "number_total": value = data.number_total || null; break;
        case "rarity": value = data.rarity || null; break;
        case "card_type": value = data.card_type || null; break;
        case "trainer_subtype": value = data.trainer_subtype || null; break;
        case "poke_type": value = data.poke_type || null; break;
        case "name_ja": value = data.name_ja || null; break;
        case "holo": value = (data.holo === true); break;
        case "illustrator": value = data.illustrator || null; break;
        case "card_number_text": value = cardNumStr; break; // 整形済みを使用
        case "mirror_pattern": value = data.mirror_pattern || null; break;
        
        case "stg_id": value = "stg_" + fileId; break;
      }
      newRowData[i] = value;
    });

    sheet.appendRow(newRowData);
    const newRowIndex = sheet.getLastRow();

    // マップに新規登録
    pendingMap.set(serialNumber, { rowIndex: newRowIndex, qty: 1 });
    Logger.log(`新規追加: ${serialNumber} (行:${newRowIndex})`);
  }
}

// -----------------------------------------------------------------
// 6. プロンプト・スキーマ定義
// -----------------------------------------------------------------
/**
 * Gemini API に渡すプロンプトテキストを生成する
 * (ドラゴン判定強化 + ワザエネルギー無視 + メガ名称補正版)
 * @return {string} プロンプト
 */
function buildOcrPrompt_() {
  return `あなたはポケモンカードの情報を読み取る専門家です。画像から情報を抽出し、JSON形式で出力してください。

【最重要: タイプ(poke_type)の判定】
**注意: ワザのエネルギーマークや背景色は絶対に無視してください。**
**カードの「右上隅」にある小さな円アイコン**だけを見て、その「中身の形」で判定します。

* **ドラゴン (Dragon)**:
    * 【重要】背景は「黄金色(ゴールド)」。中身は「直角に折れ曲がった竜の紋章(Z字/S字に近い)」。
    * ※無色の「星型」や、雷の「イナズマ」と間違えないこと。
* **無色 (Colorless)**:
    * 背景は「白/グレー」。中身は「星型 (Star)」。
* **水 (Water)**:
    * 背景は「青」。中身は「丸い水滴」。
    * ※背景が青くても、右上のアイコンが金色の場合は「ドラゴン」です。
* **悪 (Darkness)**: 
    * 背景は「黒」または「濃い紺色」。中身は「横向きの三日月」または「爪痕」。
    * ※背景が青っぽくても、マークが三日月なら「悪」です。「水」と間違えないこと。
* **雷 (Lightning)**: 背景は黄色。中身は「イナズマ」。
* **闘 (Fighting)**: 背景は茶色。中身は「拳」。
* **草 (Grass)**: 葉 / **炎 (Fire)**: 炎 / **超 (Psychic)**: 目  / **鋼 (Metal)**: ボルト / **フェアリー**: 羽

【重要: 名称(name_ja)の抽出】
* 場所: 左上の「進化マーク」と右上の「HP」の間にある、**最も大きな文字**。
* 修正: 名前の一部としての「メガ(Mega)」は**含めてください**。(例: "メガルカリオ")
* 除外: 名前の周囲にある小さな「テラスタル」「～から進化」などの説明文は除外する。
* 表記: 末尾の「EX」「ex」は全て小文字の「ex」に統一する。(例: "ドラパルト ex")

【カード下部の読み取り (左から右へ)】
下部の小さな文字群を左から順に特定してください。
1. **set_code**: 左端の英数字 (例: M2a, SV7a)。
   * **重要**: 英字部分は必ず**大文字**にしてください (例: sv9 -> **SV9**, sv5a -> **SV5a**)。
2. **regulation_mark**: その右隣の四角枠内の文字。
   * **注意**: 縦棒1本に見える場合は「I」です。
3. **card_number_text**: 番号/総数。
   * **厳守**: 必ず「3桁/3桁」の形式で出力してください。10/100 ではなく **010/100**、1/66 ではなく **001/066** とします。
   * **禁止**: 近くにあるレアリティ(RRなど)はここ含めないこと。
4. **illustrator**: "illus." または "Ills." の右側に書かれている名前全て。(例: "aky CG Works")
5. **rarity**: 右端のアルファベット (例: RR, SAR)。

【出力スキーマ】
JSON形式のみを出力してください。
* name_ja
* set_code, regulation_mark, card_number_text, card_number(数値), number_total(数値), rarity
* illustrator
* card_type (ポケモン/トレーナーズ/エネルギー)
* poke_type
* trainer_subtype
* is_ace_spec, paradox_tag, is_waza_machine, mirror_pattern`;
}

function getOcrResponseSchema_() {
  return {
    "type": "object",
    "required": ["set_code", "name_ja", "card_type"],
    "properties": {
      "set_code": {"type":"string"},
      "regulation_mark": {
        "type": "string",
        "enum": ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"]
      },
      // 数値がないプロモ等のためにnullを許容
      "card_number": {"type": ["integer", "null"]}, 
      "number_total": {"type": ["integer", "null"]},
      "rarity": {
        "type": "string",
        "enum": [
          "C","U","R","RR","RRR","SR","SAR","AR","CHR","CSR",
          "UR","HR","SSR","S","K","PR","BWR",""
        ]
      },
      "card_type": {
        "type": "string",
        "enum": ["ポケモン","トレーナーズ","エネルギー"]
      },
      "trainer_subtype": {
        "type": ["string","null"],
        "enum": ["グッズ","サポート","スタジアム","ポケモンのどうぐ",null]
      },
      "poke_type": {
        "type": ["string","null"],
        "enum": ["草","炎","水","雷","超","闘","悪","鋼","ドラゴン","無色","フェアリー", null]
      },
      "name_ja": {"type":"string"},
      "art_variant": {"type":["string","null"]},
      "holo": {"type":"boolean"},
      "illustrator": {"type":["string","null"]},
      
      // 新規追加項目
      "is_ace_spec": { "type": "boolean" },
      "paradox_tag": { "type": ["string","null"], "enum": ["古代","未来", null] },
      "is_waza_machine": { "type": "boolean" },
      "card_number_text": { "type": ["string","null"] },
      "mirror_pattern": {
        "type": ["string","null"],
        "enum": ["モンスターボール","マスターボール","プレミアム", null]
      }
    }
  };
}