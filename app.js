"use strict";

/*
 * =========================================================
 * CLOVER DINING 食券OCR
 * app.js
 *
 * 主な機能
 * ・半券画像の撮影／選択
 * ・日付、通し番号、時刻、価格のOCR
 * ・時刻部分のみを切り出した再OCR
 * ・20％還元額の計算
 * ・端末内への履歴保存
 * ・重複登録防止
 * ・CSV出力
 * =========================================================
 */

/*
 * HTML要素
 */
const imageInput = document.getElementById("ticketImage");
const preview = document.getElementById("preview");
const ocrButton = document.getElementById("ocrButton");

const progressArea = document.getElementById("progressArea");
const progressText = document.getElementById("progressText");
const progressBar = document.getElementById("progressBar");

const dateInput = document.getElementById("ticketDate");
const numberInput = document.getElementById("ticketNumber");
const timeInput = document.getElementById("ticketTime");
const priceInput = document.getElementById("ticketPrice");

const refundAmount = document.getElementById("refundAmount");
const saveButton = document.getElementById("saveButton");
const csvButton = document.getElementById("csvButton");

const historyBody = document.getElementById("historyBody");
const rawText = document.getElementById("rawText");
const message = document.getElementById("message");

/*
 * アプリ内データ
 */
let selectedImage = null;
let currentPreviewUrl = "";
let records = [];

/*
 * OCR設定
 *
 * 半券が写真内で大きく、縦向きに写っていることを想定。
 * 時刻は、半券の上から約45～75％の範囲にある想定。
 */
const TIME_CROP_SETTINGS = {
  leftRatio: 0.08,
  topRatio: 0.43,
  widthRatio: 0.84,
  heightRatio: 0.32,
  scale: 4,
  threshold: 175
};

/*
 * =========================================================
 * 画像選択・スマホ撮影
 * =========================================================
 */
imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];

  if (!file) {
    return;
  }

  if (!file.type.startsWith("image/")) {
    showMessage("画像ファイルを選択してください。", true);
    resetSelectedImage();
    return;
  }

  /*
   * 古いプレビューURLを破棄
   */
  if (currentPreviewUrl) {
    URL.revokeObjectURL(currentPreviewUrl);
  }

  selectedImage = file;
  currentPreviewUrl = URL.createObjectURL(file);

  preview.src = currentPreviewUrl;
  preview.classList.remove("hidden");

  ocrButton.disabled = false;

  clearInputs();
  showMessage("「文字を読み取る」を押してください。");
});

/*
 * =========================================================
 * OCR実行
 * =========================================================
 */
ocrButton.addEventListener("click", async () => {
  if (!selectedImage) {
    showMessage("半券を撮影してください。", true);
    return;
  }

  let worker = null;

  try {
    setOcrRunning(true);

    /*
     * Tesseract.jsのWorkerを作成
     */
    worker = await Tesseract.createWorker(
      "eng",
      1,
      {
        logger: updateProgress
      }
    );

    /*
     * -----------------------------------------------------
     * 1回目：半券全体をOCR
     * -----------------------------------------------------
     */
    progressText.textContent = "半券全体を読み取っています...";

    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.AUTO
    });

    const fullResult = await worker.recognize(selectedImage);
    const fullText = fullResult.data.text ?? "";

    const parsed = parseTicketText(fullText);

    /*
     * -----------------------------------------------------
     * 2回目：時刻部分だけをOCR
     *
     * 全体OCRで時刻が読めた場合でも再認識し、
     * 正しく読めた時刻を優先する。
     * -----------------------------------------------------
     */
    progressText.textContent =
      "購入時間を詳しく読み取っています...";

    const croppedTimeImage = await cropAndEnhanceTimeArea(
      selectedImage
    );

    /*
     * 時刻は数字とコロンだけに限定
     */
    await worker.setParameters({
      tessedit_char_whitelist: "0123456789:",
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
      preserve_interword_spaces: "1"
    });

    const timeResult = await worker.recognize(
      croppedTimeImage
    );

    const timeText = timeResult.data.text ?? "";
    const detailedTime = extractTime(timeText);

    /*
     * 切り出しOCRの結果が妥当なら優先
     */
    if (isValidTime(detailedTime)) {
      parsed.time = detailedTime;
    }

    /*
     * 認識全文を確認用に表示
     */
    rawText.textContent =
      [
        "【半券全体のOCR結果】",
        fullText,
        "",
        "【時間部分の再OCR結果】",
        timeText
      ].join("\n");

    /*
     * 入力欄へ反映
     */
    dateInput.value = parsed.date;
    numberInput.value = parsed.number;
    timeInput.value = parsed.time;
    priceInput.value = parsed.price;

    updateRefund();

    /*
     * 読み取り結果の判定
     */
    const missingItems = [];

    if (!parsed.date) {
      missingItems.push("日付");
    }

    if (!parsed.number) {
      missingItems.push("通し番号");
    }

    if (!parsed.time) {
      missingItems.push("購入時間");
    }

    if (!parsed.price) {
      missingItems.push("価格");
    }

    if (missingItems.length === 0) {
      showMessage(
        "読み取りました。内容を確認して登録してください。"
      );
    } else {
      showMessage(
        `${missingItems.join("・")}を確認または修正してください。`,
        true
      );
    }
  } catch (error) {
    console.error("OCR error:", error);

    showMessage(
      "読み取りに失敗しました。半券を大きく、真上から撮影し直してください。",
      true
    );
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch (terminateError) {
        console.error(
          "Worker termination error:",
          terminateError
        );
      }
    }

    setOcrRunning(false);
  }
});

/*
 * =========================================================
 * OCR文字列の解析
 * =========================================================
 */
function parseTicketText(text) {
  const normalized = normalizeText(text);

  return {
    date: extractDate(normalized),
    number: extractTicketNumber(normalized),
    time: extractTime(normalized),
    price: extractPrice(normalized)
  };
}

/*
 * OCR結果の表記を統一
 */
function normalizeText(text) {
  return String(text)
    .replace(/\r/g, "\n")
    .replace(/[：]/g, ":")
    .replace(/[．。]/g, ".")
    .replace(/[，]/g, ",")
    .replace(/[０-９]/g, (character) => {
      return String.fromCharCode(
        character.charCodeAt(0) - 0xFEE0
      );
    })
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/*
 * =========================================================
 * 日付の抽出
 *
 * 例：
 * 20.10.24
 * 20-10-24
 * 20/10/24
 * =========================================================
 */
function extractDate(text) {
  const normalized = normalizeNumericCharacters(text);

  const match = normalized.match(
    /(?:^|\s)(\d{2})\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{1,2})(?:\s|$)/
  );

  if (!match) {
    return "";
  }

  const year = match[1];
  const month = match[2].padStart(2, "0");
  const day = match[3].padStart(2, "0");

  const monthNumber = Number(month);
  const dayNumber = Number(day);

  if (
    monthNumber < 1 ||
    monthNumber > 12 ||
    dayNumber < 1 ||
    dayNumber > 31
  ) {
    return "";
  }

  return `${year}.${month}.${day}`;
}

/*
 * =========================================================
 * 時刻の抽出
 *
 * 対応例：
 * 11:55
 * 11：55
 * 11.55
 * 11 55
 * 1155
 * I1:55
 * =========================================================
 */
function extractTime(text) {
  const normalized = normalizeNumericCharacters(text)
    .replace(/[：]/g, ":")
    .replace(/[．。]/g, ".")
    .replace(/[;,]/g, ":")
    .replace(/\s+/g, " ")
    .trim();

  /*
   * パターン1：11:55、11.55など
   */
  const standardMatches = [
    ...normalized.matchAll(
      /(?:^|[^\d])([01]?\d|2[0-3])\s*[:.]\s*([0-5]\d)(?!\d)/g
    )
  ];

  if (standardMatches.length > 0) {
    /*
     * 複数ある場合は最後の候補を採用
     */
    const match =
      standardMatches[standardMatches.length - 1];

    const hour = match[1].padStart(2, "0");
    const minute = match[2];

    return `${hour}:${minute}`;
  }

  /*
   * パターン2：11 55
   */
  const separatedMatches = [
    ...normalized.matchAll(
      /(?:^|[^\d])([01]?\d|2[0-3])\s+([0-5]\d)(?!\d)/g
    )
  ];

  if (separatedMatches.length > 0) {
    const match =
      separatedMatches[separatedMatches.length - 1];

    const hour = match[1].padStart(2, "0");
    const minute = match[2];

    return `${hour}:${minute}`;
  }

  /*
   * パターン3：1155
   */
  const compactMatches = [
    ...normalized.matchAll(
      /(?:^|[^\d])(\d{3,4})(?!\d)/g
    )
  ];

  for (
    let index = compactMatches.length - 1;
    index >= 0;
    index -= 1
  ) {
    const digits = compactMatches[index][1];

    /*
     * 3桁の場合：
     * 955 → 09:55
     */
    const paddedDigits = digits.padStart(4, "0");

    const hour = Number(paddedDigits.slice(0, 2));
    const minute = Number(paddedDigits.slice(2, 4));

    if (
      hour >= 0 &&
      hour <= 23 &&
      minute >= 0 &&
      minute <= 59
    ) {
      return [
        String(hour).padStart(2, "0"),
        String(minute).padStart(2, "0")
      ].join(":");
    }
  }

  return "";
}

/*
 * OCRで数字に誤認されやすい英字を補正
 */
function normalizeNumericCharacters(text) {
  return String(text)
    .replace(/[０-９]/g, (character) => {
      return String.fromCharCode(
        character.charCodeAt(0) - 0xFEE0
      );
    })
    .replace(/[OoＱ〇○]/g, "0")
    .replace(/[Il|｜]/g, "1")
    .replace(/[Zz]/g, "2")
    .replace(/[Ss]/g, "5")
    .replace(/[Bb]/g, "8");
}

/*
 * 時刻が有効か確認
 */
function isValidTime(value) {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }

  const [hourText, minuteText] = value.split(":");

  const hour = Number(hourText);
  const minute = Number(minuteText);

  return (
    Number.isInteger(hour) &&
    Number.isInteger(minute) &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59
  );
}

/*
 * =========================================================
 * 価格の抽出
 * =========================================================
 */
function extractPrice(text) {
  const normalized = normalizeNumericCharacters(text);

  /*
   * 「円」または¥が認識された候補を優先
   */
  const yenMatches = [
    ...normalized.matchAll(
      /(?:^|[^\d])(\d{2,4})\s*(?:円|¥|￥|YEN)(?!\d)/gi
    )
  ];

  const validYenPrices = yenMatches
    .map((match) => Number(match[1]))
    .filter(isLikelyPrice);

  if (validYenPrices.length > 0) {
    return String(
      validYenPrices[validYenPrices.length - 1]
    );
  }

  /*
   * 「円」が読めなかった場合の候補
   */
  const numericCandidates = [
    ...normalized.matchAll(
      /(?:^|[^\d])(\d{2,4})(?!\d)/g
    )
  ]
    .map((match) => Number(match[1]))
    .filter(isLikelyPrice);

  if (numericCandidates.length === 0) {
    return "";
  }

  /*
   * 価格は半券の後半に印字されるため、
   * 最後の妥当な候補を使用
   */
  return String(
    numericCandidates[numericCandidates.length - 1]
  );
}

/*
 * 価格として妥当か
 */
function isLikelyPrice(value) {
  return (
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 3000 &&
    value % 10 === 0
  );
}

/*
 * =========================================================
 * 通し番号の抽出
 * =========================================================
 */
function extractTicketNumber(text) {
  const normalized = normalizeNumericCharacters(text);

  /*
   * 日付の直後にある3～4桁の数値を優先
   */
  const dateThenNumberMatch = normalized.match(
    /\d{2}\s*[.\-\/]\s*\d{1,2}\s*[.\-\/]\s*\d{1,2}[\s\n]+(\d{1,4})(?!\d)/
  );

  if (dateThenNumberMatch) {
    const value = Number(dateThenNumberMatch[1]);

    if (value >= 1 && value <= 9999) {
      return String(value);
    }
  }

  /*
   * 全体から候補を取得
   */
  const candidates = [
    ...normalized.matchAll(
      /(?:^|[^\d])(\d{3,4})(?!\d)/g
    )
  ]
    .map((match) => match[1])
    .filter((value) => {
      const numericValue = Number(value);

      if (
        numericValue < 1 ||
        numericValue > 9999
      ) {
        return false;
      }

      /*
       * 価格として見える数値は除外
       */
      if (
        numericValue >= 100 &&
        numericValue <= 3000 &&
        numericValue % 10 === 0
      ) {
        return false;
      }

      /*
       * 1155など、時刻と見えるものを除外
       */
      if (looksLikeCompactTime(value)) {
        return false;
      }

      return true;
    });

  if (candidates.length === 0) {
    return "";
  }

  return candidates[0];
}

function looksLikeCompactTime(value) {
  if (!/^\d{3,4}$/.test(value)) {
    return false;
  }

  const paddedValue = value.padStart(4, "0");

  const hour = Number(paddedValue.slice(0, 2));
  const minute = Number(paddedValue.slice(2, 4));

  return (
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59
  );
}

/*
 * =========================================================
 * 時刻部分の切り出し・画像補正
 * =========================================================
 */
function cropAndEnhanceTimeArea(imageFile) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const imageUrl = URL.createObjectURL(imageFile);

    image.onload = () => {
      try {
        const sourceWidth = image.naturalWidth;
        const sourceHeight = image.naturalHeight;

        if (
          sourceWidth <= 0 ||
          sourceHeight <= 0
        ) {
          throw new Error(
            "画像の大きさを取得できませんでした。"
          );
        }

        const cropX = Math.round(
          sourceWidth *
          TIME_CROP_SETTINGS.leftRatio
        );

        const cropY = Math.round(
          sourceHeight *
          TIME_CROP_SETTINGS.topRatio
        );

        const cropWidth = Math.round(
          sourceWidth *
          TIME_CROP_SETTINGS.widthRatio
        );

        const cropHeight = Math.round(
          sourceHeight *
          TIME_CROP_SETTINGS.heightRatio
        );

        const canvas =
          document.createElement("canvas");

        const context =
          canvas.getContext("2d", {
            willReadFrequently: true
          });

        if (!context) {
          throw new Error(
            "画像処理機能を使用できません。"
          );
        }

        const scale = TIME_CROP_SETTINGS.scale;

        canvas.width = cropWidth * scale;
        canvas.height = cropHeight * scale;

        /*
         * 背景を白くする
         */
        context.fillStyle = "#ffffff";
        context.fillRect(
          0,
          0,
          canvas.width,
          canvas.height
        );

        /*
         * 時刻部分を切り出して拡大
         */
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";

        context.drawImage(
          image,
          cropX,
          cropY,
          cropWidth,
          cropHeight,
          0,
          0,
          canvas.width,
          canvas.height
        );

        /*
         * グレースケール化・二値化
         */
        enhanceImageForOcr(
          context,
          canvas.width,
          canvas.height,
          TIME_CROP_SETTINGS.threshold
        );

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(imageUrl);

            if (!blob) {
              reject(
                new Error(
                  "時刻部分の画像を作成できませんでした。"
                )
              );
              return;
            }

            resolve(blob);
          },
          "image/png",
          1
        );
      } catch (error) {
        URL.revokeObjectURL(imageUrl);
        reject(error);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);

      reject(
        new Error(
          "撮影画像を読み込めませんでした。"
        )
      );
    };

    image.src = imageUrl;
  });
}

/*
 * OCR用に画像を白黒化
 */
function enhanceImageForOcr(
  context,
  width,
  height,
  threshold
) {
  const imageData = context.getImageData(
    0,
    0,
    width,
    height
  );

  const pixels = imageData.data;

  /*
   * 画像全体の平均的な明るさを取得
   */
  let brightnessTotal = 0;
  let pixelCount = 0;

  for (
    let index = 0;
    index < pixels.length;
    index += 4
  ) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];

    const gray =
      red * 0.299 +
      green * 0.587 +
      blue * 0.114;

    brightnessTotal += gray;
    pixelCount += 1;
  }

  const averageBrightness =
    pixelCount > 0
      ? brightnessTotal / pixelCount
      : threshold;

  /*
   * 写真の明るさに応じて、しきい値を微調整
   */
  const adaptiveThreshold = Math.max(
    135,
    Math.min(
      205,
      (threshold + averageBrightness) / 2
    )
  );

  for (
    let index = 0;
    index < pixels.length;
    index += 4
  ) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];

    const gray =
      red * 0.299 +
      green * 0.587 +
      blue * 0.114;

    const value =
      gray < adaptiveThreshold
        ? 0
        : 255;

    pixels[index] = value;
    pixels[index + 1] = value;
    pixels[index + 2] = value;
    pixels[index + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
}

/*
 * =========================================================
 * 20％還元額
 * =========================================================
 */
function updateRefund() {
  const price = Number(priceInput.value);

  if (
    !Number.isFinite(price) ||
    price <= 0
  ) {
    refundAmount.textContent = "0";
    return;
  }

  const refund = Math.round(price * 0.2);

  refundAmount.textContent = String(refund);
}

priceInput.addEventListener(
  "input",
  updateRefund
);

/*
 * =========================================================
 * 登録
 * =========================================================
 */
saveButton.addEventListener("click", () => {
  const numericPrice =
    Number(priceInput.value);

  const record = {
    date: dateInput.value.trim(),
    number: numberInput.value.trim(),
    time: timeInput.value,
    price: numericPrice,
    refund: Math.round(numericPrice * 0.2)
  };

  const validationError =
    validateRecord(record);

  if (validationError) {
    showMessage(validationError, true);
    return;
  }

  /*
   * 日付・通し番号・時刻・価格が一致する場合は重複
   */
  const duplicate = records.some(
    (existingRecord) => {
      return (
        existingRecord.date === record.date &&
        existingRecord.number === record.number &&
        existingRecord.time === record.time &&
        existingRecord.price === record.price
      );
    }
  );

  if (duplicate) {
    showMessage(
      "同じ半券がすでに登録されています。",
      true
    );
    return;
  }

  records.push(record);

  saveRecords();
  renderHistory();

  clearInputs();
  resetSelectedImage();

  showMessage("半券を登録しました。");
});

/*
 * 入力内容の確認
 */
function validateRecord(record) {
  if (
    !/^\d{2}\.\d{2}\.\d{2}$/.test(
      record.date
    )
  ) {
    return "日付を20.10.24の形式で入力してください。";
  }

  const dateParts = record.date
    .split(".")
    .map(Number);

  if (
    dateParts[1] < 1 ||
    dateParts[1] > 12 ||
    dateParts[2] < 1 ||
    dateParts[2] > 31
  ) {
    return "正しい日付を入力してください。";
  }

  if (
    !/^\d{1,4}$/.test(record.number)
  ) {
    return "通し番号を数字で入力してください。";
  }

  if (!isValidTime(record.time)) {
    return "購入時間を正しく入力してください。";
  }

  if (!isLikelyPrice(record.price)) {
    return "価格を正しく入力してください。";
  }

  return "";
}

/*
 * =========================================================
 * 履歴表示
 * =========================================================
 */
function renderHistory() {
  historyBody.innerHTML = "";

  if (records.length === 0) {
    const emptyRow =
      document.createElement("tr");

    const emptyCell =
      document.createElement("td");

    emptyCell.colSpan = 6;
    emptyCell.textContent =
      "登録された半券はありません。";

    emptyRow.appendChild(emptyCell);
    historyBody.appendChild(emptyRow);

    return;
  }

  records.forEach((record, index) => {
    const row = document.createElement("tr");

    const dateCell =
      document.createElement("td");
    dateCell.textContent = record.date;

    const numberCell =
      document.createElement("td");
    numberCell.textContent = record.number;

    const timeCell =
      document.createElement("td");
    timeCell.textContent = record.time;

    const priceCell =
      document.createElement("td");
    priceCell.textContent =
      `${record.price}円`;

    const refundCell =
      document.createElement("td");
    refundCell.textContent =
      `${record.refund}円`;

    const actionCell =
      document.createElement("td");

    const deleteButton =
      document.createElement("button");

    deleteButton.type = "button";
    deleteButton.className =
      "delete-button";
    deleteButton.textContent = "削除";
    deleteButton.dataset.index =
      String(index);

    deleteButton.addEventListener(
      "click",
      () => {
        const targetIndex =
          Number(deleteButton.dataset.index);

        records.splice(targetIndex, 1);

        saveRecords();
        renderHistory();

        showMessage(
          "登録履歴を削除しました。"
        );
      }
    );

    actionCell.appendChild(deleteButton);

    row.append(
      dateCell,
      numberCell,
      timeCell,
      priceCell,
      refundCell,
      actionCell
    );

    historyBody.appendChild(row);
  });
}

/*
 * =========================================================
 * 端末内保存
 * =========================================================
 */
function saveRecords() {
  try {
    localStorage.setItem(
      "mealTicketRecords",
      JSON.stringify(records)
    );
  } catch (error) {
    console.error(
      "Local storage error:",
      error
    );

    showMessage(
      "登録履歴を端末へ保存できませんでした。",
      true
    );
  }
}

function loadRecords() {
  try {
    const savedData =
      localStorage.getItem(
        "mealTicketRecords"
      );

    if (!savedData) {
      records = [];
    } else {
      const parsedRecords =
        JSON.parse(savedData);

      records = Array.isArray(parsedRecords)
        ? parsedRecords
        : [];
    }
  } catch (error) {
    console.error(
      "Load records error:",
      error
    );

    records = [];
  }

  renderHistory();
}

/*
 * =========================================================
 * CSV出力
 * =========================================================
 */
csvButton.addEventListener("click", () => {
  if (records.length === 0) {
    showMessage(
      "出力するデータがありません。",
      true
    );
    return;
  }

  const header = [
    "日付",
    "通し番号",
    "購入時間",
    "価格",
    "還元額"
  ];

  const rows = records.map((record) => {
    return [
      record.date,
      record.number,
      record.time,
      record.price,
      record.refund
    ];
  });

  const csvText = [
    header,
    ...rows
  ]
    .map((row) => {
      return row
        .map(escapeCsvValue)
        .join(",");
    })
    .join("\r\n");

  /*
   * Excelで文字化けしにくいように
   * UTF-8 BOMを付ける
   */
  const blob = new Blob(
    ["\uFEFF", csvText],
    {
      type: "text/csv;charset=utf-8"
    }
  );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;
  link.download =
    createCsvFileName();

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);

  showMessage(
    "CSVファイルを出力しました。"
  );
});

function escapeCsvValue(value) {
  const stringValue = String(value);

  return `"${stringValue.replaceAll(
    '"',
    '""'
  )}"`;
}

function createCsvFileName() {
  const now = new Date();

  const year = now.getFullYear();

  const month = String(
    now.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    now.getDate()
  ).padStart(2, "0");

  return [
    "CLOVER_DINING_食券申請",
    `${year}${month}${day}.csv`
  ].join("_");
}

/*
 * =========================================================
 * OCR進行状況
 * =========================================================
 */
function updateProgress(status) {
  progressArea.classList.remove("hidden");

  if (
    typeof status.progress === "number"
  ) {
    const progress =
      Math.max(
        0,
        Math.min(1, status.progress)
      );

    progressBar.value = progress;

    progressText.textContent =
      `読み取り中：${Math.round(
        progress * 100
      )}％`;
  }
}

function setOcrRunning(isRunning) {
  imageInput.disabled = isRunning;
  saveButton.disabled = isRunning;

  if (isRunning) {
    ocrButton.disabled = true;

    progressArea.classList.remove(
      "hidden"
    );

    progressBar.value = 0;

    progressText.textContent =
      "OCRを準備しています...";
  } else {
    imageInput.disabled = false;
    saveButton.disabled = false;

    ocrButton.disabled =
      selectedImage === null;
  }
}

/*
 * =========================================================
 * 画面リセット
 * =========================================================
 */
function clearInputs() {
  dateInput.value = "";
  numberInput.value = "";
  timeInput.value = "";
  priceInput.value = "";

  refundAmount.textContent = "0";
  rawText.textContent = "";
}

function resetSelectedImage() {
  selectedImage = null;
  imageInput.value = "";

  preview.src = "";
  preview.classList.add("hidden");

  ocrButton.disabled = true;

  if (currentPreviewUrl) {
    URL.revokeObjectURL(
      currentPreviewUrl
    );

    currentPreviewUrl = "";
  }
}

/*
 * メッセージ表示
 */
function showMessage(
  text,
  isError = false
) {
  message.textContent = text;

  message.style.color = isError
    ? "#a00000"
    : "#176327";
}

/*
 * =========================================================
 * Service Worker登録
 * =========================================================
 */
if ("serviceWorker" in navigator) {
  window.addEventListener(
    "load",
    async () => {
      try {
        await navigator.serviceWorker.register(
          "./service-worker.js"
        );
      } catch (error) {
        console.error(
          "Service Worker registration failed:",
          error
        );
      }
    }
  );
}

/*
 * 初期表示
 */
loadRecords();
