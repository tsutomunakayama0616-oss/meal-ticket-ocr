"use strict";

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

let selectedImage = null;
let records = [];

/*
 * 画像選択・スマホ撮影
 */
imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];

  if (!file) {
    return;
  }

  if (!file.type.startsWith("image/")) {
    showMessage("画像ファイルを選択してください。", true);
    return;
  }

  selectedImage = file;

  const imageUrl = URL.createObjectURL(file);

  preview.src = imageUrl;
  preview.classList.remove("hidden");

  ocrButton.disabled = false;

  clearInputs();
  showMessage("");
});

/*
 * OCR実行
 */
ocrButton.addEventListener("click", async () => {
  if (!selectedImage) {
    showMessage("半券を撮影してください。", true);
    return;
  }

  try {
    setOcrRunning(true);

    const result = await Tesseract.recognize(
      selectedImage,
      "eng",
      {
        logger: updateProgress
      }
    );

    const text = result.data.text ?? "";

    rawText.textContent = text;

    const parsed = parseTicketText(text);

    dateInput.value = parsed.date;
    numberInput.value = parsed.number;
    timeInput.value = parsed.time;
    priceInput.value = parsed.price;

    updateRefund();

    if (
      parsed.date &&
      parsed.number &&
      parsed.time &&
      parsed.price
    ) {
      showMessage(
        "読み取りました。内容を確認して登録してください。"
      );
    } else {
      showMessage(
        "読み取れなかった項目があります。内容を修正してください。",
        true
      );
    }
  } catch (error) {
    console.error(error);

    showMessage(
      "OCR処理に失敗しました。画像を撮り直してください。",
      true
    );
  } finally {
    setOcrRunning(false);
  }
});

/*
 * OCRの全文から4項目を抽出
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
 * OCRによくある表記揺れを整える
 */
function normalizeText(text) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[：]/g, ":")
    .replace(/[．。]/g, ".")
    .replace(/[０-９]/g, (character) => {
      return String.fromCharCode(
        character.charCodeAt(0) - 0xFEE0
      );
    })
    .replace(/\s+/g, " ")
    .trim();
}

/*
 * 日付を抽出
 * 例：20.10.24
 */
function extractDate(text) {
  const match = text.match(
    /\b(\d{2})[.\-\/](\d{1,2})[.\-\/](\d{1,2})\b/
  );

  if (!match) {
    return "";
  }

  const year = match[1];
  const month = match[2].padStart(2, "0");
  const day = match[3].padStart(2, "0");

  return `${year}.${month}.${day}`;
}

/*
 * 時刻を抽出
 * 例：11:55
 */
function extractTime(text) {
  const matches = [
    ...text.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g)
  ];

  if (matches.length === 0) {
    return "";
  }

  const match = matches[matches.length - 1];

  const hour = match[1].padStart(2, "0");
  const minute = match[2];

  return `${hour}:${minute}`;
}

/*
 * 価格を抽出
 * 「円」が認識できた場合を優先
 */
function extractPrice(text) {
  const yenMatch = text.match(/\b(\d{2,4})\s*[円¥Y]\b/i);

  if (yenMatch) {
    return yenMatch[1];
  }

  const numericCandidates = [
    ...text.matchAll(/\b(\d{2,4})\b/g)
  ]
    .map((match) => Number(match[1]))
    .filter((value) => {
      return value >= 100 && value <= 3000;
    });

  if (numericCandidates.length === 0) {
    return "";
  }

  /*
   * 半券では価格が下部にあるため、
   * 最後の妥当な数値を価格候補とする
   */
  return String(
    numericCandidates[numericCandidates.length - 1]
  );
}

/*
 * 通し番号を抽出
 */
function extractTicketNumber(text) {
  const numbers = [
    ...text.matchAll(/\b(\d{3,4})\b/g)
  ]
    .map((match) => match[1])
    .filter((value) => {
      const numericValue = Number(value);

      return numericValue >= 1 && numericValue <= 9999;
    });

  if (numbers.length === 0) {
    return "";
  }

  /*
   * 通し番号は通常、日付の直後にある。
   * 価格らしい数字を除外して最初の候補を使用する。
   */
  const likelyNumber = numbers.find((value) => {
    const numericValue = Number(value);

    return numericValue < 600;
  });

  return likelyNumber ?? numbers[0];
}

/*
 * 20％還元額を計算
 */
function updateRefund() {
  const price = Number(priceInput.value);

  if (!Number.isFinite(price) || price <= 0) {
    refundAmount.textContent = "0";
    return;
  }

  /*
   * 1円未満が発生した場合は四捨五入
   * 経理ルールに応じて変更可能
   */
  const refund = Math.round(price * 0.2);

  refundAmount.textContent = String(refund);
}

priceInput.addEventListener("input", updateRefund);

/*
 * 登録
 */
saveButton.addEventListener("click", () => {
  const record = {
    date: dateInput.value.trim(),
    number: numberInput.value.trim(),
    time: timeInput.value,
    price: Number(priceInput.value),
    refund: Math.round(Number(priceInput.value) * 0.2)
  };

  const validationError = validateRecord(record);

  if (validationError) {
    showMessage(validationError, true);
    return;
  }

  const duplicate = records.some((existingRecord) => {
    return (
      existingRecord.date === record.date &&
      existingRecord.number === record.number &&
      existingRecord.time === record.time &&
      existingRecord.price === record.price
    );
  });

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

  imageInput.value = "";
  selectedImage = null;
  preview.src = "";
  preview.classList.add("hidden");
  ocrButton.disabled = true;

  showMessage("半券を登録しました。");
});

/*
 * 入力チェック
 */
function validateRecord(record) {
  if (!/^\d{2}\.\d{2}\.\d{2}$/.test(record.date)) {
    return "日付を20.10.24の形式で入力してください。";
  }

  if (!/^\d{1,4}$/.test(record.number)) {
    return "通し番号を数字で入力してください。";
  }

  if (!/^\d{2}:\d{2}$/.test(record.time)) {
    return "購入時間を入力してください。";
  }

  if (
    !Number.isFinite(record.price) ||
    record.price < 100 ||
    record.price > 3000
  ) {
    return "価格を正しく入力してください。";
  }

  return "";
}

/*
 * 履歴表示
 */
function renderHistory() {
  historyBody.innerHTML = "";

  records.forEach((record, index) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${escapeHtml(record.date)}</td>
      <td>${escapeHtml(record.number)}</td>
      <td>${escapeHtml(record.time)}</td>
      <td>${record.price}円</td>
      <td>${record.refund}円</td>
      <td>
        <button
          type="button"
          class="delete-button"
          data-index="${index}"
        >
          削除
        </button>
      </td>
    `;

    historyBody.appendChild(row);
  });

  document
    .querySelectorAll(".delete-button")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.index);

        records.splice(index, 1);
        saveRecords();
        renderHistory();
      });
    });
}

/*
 * 端末内への保存
 *
 * 注意：
 * これは試作用の保存です。
 * 他の端末や経理とは共有されません。
 */
function saveRecords() {
  localStorage.setItem(
    "mealTicketRecords",
    JSON.stringify(records)
  );
}

function loadRecords() {
  try {
    const savedData = localStorage.getItem(
      "mealTicketRecords"
    );

    records = savedData
      ? JSON.parse(savedData)
      : [];
  } catch (error) {
    console.error(error);
    records = [];
  }

  renderHistory();
}

/*
 * CSV出力
 */
csvButton.addEventListener("click", () => {
  if (records.length === 0) {
    showMessage("出力するデータがありません。", true);
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
    .map((row) => row.join(","))
    .join("\n");

  /*
   * Excelで日本語が文字化けしにくいよう
   * UTF-8 BOMを付ける
   */
  const blob = new Blob(
    ["\uFEFF", csvText],
    {
      type: "text/csv;charset=utf-8"
    }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "食券申請.csv";
  link.click();

  URL.revokeObjectURL(url);
});

/*
 * OCR進行状況
 */
function updateProgress(status) {
  progressArea.classList.remove("hidden");

  if (typeof status.progress === "number") {
    progressBar.value = status.progress;

    progressText.textContent =
      `読み取り中：${Math.round(status.progress * 100)}％`;
  } else {
    progressText.textContent = "読み取り処理中...";
  }
}

function setOcrRunning(isRunning) {
  ocrButton.disabled = isRunning;

  if (isRunning) {
    progressArea.classList.remove("hidden");
    progressBar.value = 0;
    progressText.textContent = "読み取り準備中...";
  } else {
    ocrButton.disabled = selectedImage === null;
  }
}

function clearInputs() {
  dateInput.value = "";
  numberInput.value = "";
  timeInput.value = "";
  priceInput.value = "";

  refundAmount.textContent = "0";
  rawText.textContent = "";
}

function showMessage(text, isError = false) {
  message.textContent = text;
  message.style.color = isError
    ? "#a00000"
    : "#176327";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/*
 * PWA用Service Worker登録
 */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker.js")
      .catch((error) => {
        console.error(
          "Service Worker registration failed:",
          error
        );
      });
  });
}

loadRecords();
