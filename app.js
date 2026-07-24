"use strict";

/*
 * =========================================================
 * CLOVER DINING 食券OCR
 *
 * ・半券撮影
 * ・OCRによる日付、番号、時間、価格の抽出
 * ・時間部分の再OCR
 * ・所属、氏名の保存
 * ・半券画像の縮小保存
 * ・IndexedDBへの登録
 * ・重複登録防止
 * ・CSV出力
 * =========================================================
 */

/*
 * HTML要素
 */
const departmentInput =
  document.getElementById("department");

const employeeNameInput =
  document.getElementById("employeeName");

const imageInput =
  document.getElementById("ticketImage");

const preview =
  document.getElementById("preview");

const ocrButton =
  document.getElementById("ocrButton");

const progressArea =
  document.getElementById("progressArea");

const progressText =
  document.getElementById("progressText");

const progressBar =
  document.getElementById("progressBar");

const dateInput =
  document.getElementById("ticketDate");

const numberInput =
  document.getElementById("ticketNumber");

const timeInput =
  document.getElementById("ticketTime");

const priceInput =
  document.getElementById("ticketPrice");

const refundAmount =
  document.getElementById("refundAmount");

const saveButton =
  document.getElementById("saveButton");

const csvButton =
  document.getElementById("csvButton");

const historyBody =
  document.getElementById("historyBody");

const historySummary =
  document.getElementById("historySummary");

const rawText =
  document.getElementById("rawText");

const message =
  document.getElementById("message");

const imageModal =
  document.getElementById("imageModal");

const largeTicketImage =
  document.getElementById("largeTicketImage");

const closeImageModalButton =
  document.getElementById("closeImageModal");

/*
 * アプリ状態
 */
let selectedImage = null;
let currentPreviewUrl = "";
let records = [];

/*
 * IndexedDB設定
 */
const DATABASE_NAME =
  "CloverDiningMealTicketDatabase";

const DATABASE_VERSION = 1;

const STORE_NAME =
  "mealTicketRecords";

/*
 * 時刻OCR用切り出し設定
 *
 * 半券だけを縦向きで大きく撮影する想定。
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
 * 申請者情報
 * =========================================================
 */
departmentInput.addEventListener(
  "input",
  saveApplicantInformation
);

employeeNameInput.addEventListener(
  "input",
  saveApplicantInformation
);

function saveApplicantInformation() {
  localStorage.setItem(
    "cloverDiningDepartment",
    departmentInput.value.trim()
  );

  localStorage.setItem(
    "cloverDiningEmployeeName",
    employeeNameInput.value.trim()
  );
}

function loadApplicantInformation() {
  departmentInput.value =
    localStorage.getItem(
      "cloverDiningDepartment"
    ) ?? "";

  employeeNameInput.value =
    localStorage.getItem(
      "cloverDiningEmployeeName"
    ) ?? "";
}

/*
 * =========================================================
 * 画像選択・撮影
 * =========================================================
 */
imageInput.addEventListener(
  "change",
  () => {
    const file =
      imageInput.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      showMessage(
        "画像ファイルを選択してください。",
        true
      );

      resetSelectedImage();
      return;
    }

    if (currentPreviewUrl) {
      URL.revokeObjectURL(
        currentPreviewUrl
      );
    }

    selectedImage = file;

    currentPreviewUrl =
      URL.createObjectURL(file);

    preview.src =
      currentPreviewUrl;

    preview.classList.remove(
      "hidden"
    );

    ocrButton.disabled = false;

    clearTicketInputs();

    showMessage(
      "「文字を読み取る」を押してください。"
    );
  }
);

/*
 * =========================================================
 * OCR実行
 * =========================================================
 */
ocrButton.addEventListener(
  "click",
  async () => {
    if (!selectedImage) {
      showMessage(
        "半券を撮影してください。",
        true
      );

      return;
    }

    let worker = null;

    try {
      setOcrRunning(true);

      worker =
        await Tesseract.createWorker(
          "eng",
          1,
          {
            logger: updateProgress
          }
        );

      /*
       * 半券全体をOCR
       */
      progressText.textContent =
        "半券全体を読み取っています...";

      await worker.setParameters({
        tessedit_pageseg_mode:
          Tesseract.PSM.AUTO
      });

      const fullResult =
        await worker.recognize(
          selectedImage
        );

      const fullText =
        fullResult.data.text ?? "";

      const parsed =
        parseTicketText(fullText);

      /*
       * 時刻部分だけ再OCR
       */
      progressText.textContent =
        "購入時間を詳しく読み取っています...";

      const croppedTimeImage =
        await cropAndEnhanceTimeArea(
          selectedImage
        );

      await worker.setParameters({
        tessedit_char_whitelist:
          "0123456789:",
        tessedit_pageseg_mode:
          Tesseract.PSM.SINGLE_LINE,
        preserve_interword_spaces: "1"
      });

      const timeResult =
        await worker.recognize(
          croppedTimeImage
        );

      const timeText =
        timeResult.data.text ?? "";

      const detailedTime =
        extractTime(timeText);

      if (
        isValidTime(detailedTime)
      ) {
        parsed.time =
          detailedTime;
      }

      rawText.textContent = [
        "【半券全体のOCR結果】",
        fullText,
        "",
        "【時刻部分の再OCR結果】",
        timeText
      ].join("\n");

      dateInput.value =
        parsed.date;

      numberInput.value =
        parsed.number;

      timeInput.value =
        parsed.time;

      priceInput.value =
        parsed.price;

      updateRefund();

      const missingItems = [];

      if (!parsed.date) {
        missingItems.push("日付");
      }

      if (!parsed.number) {
        missingItems.push(
          "通し番号"
        );
      }

      if (!parsed.time) {
        missingItems.push(
          "購入時間"
        );
      }

      if (!parsed.price) {
        missingItems.push("価格");
      }

      if (
        missingItems.length === 0
      ) {
        showMessage(
          "読み取りました。内容を確認して登録してください。"
        );
      } else {
        showMessage(
          `${missingItems.join(
            "・"
          )}を確認または修正してください。`,
          true
        );
      }
    } catch (error) {
      console.error(
        "OCR error:",
        error
      );

      showMessage(
        "読み取りに失敗しました。半券を大きく、真上から撮影し直してください。",
        true
      );
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch (
          terminateError
        ) {
          console.error(
            "Worker termination error:",
            terminateError
          );
        }
      }

      setOcrRunning(false);
    }
  }
);

/*
 * OCR全文を解析
 */
function parseTicketText(text) {
  const normalized =
    normalizeText(text);

  return {
    date:
      extractDate(normalized),

    number:
      extractTicketNumber(
        normalized
      ),

    time:
      extractTime(normalized),

    price:
      extractPrice(normalized)
  };
}

/*
 * OCR結果の表記統一
 */
function normalizeText(text) {
  return String(text)
    .replace(/\r/g, "\n")
    .replace(/[：]/g, ":")
    .replace(/[．。]/g, ".")
    .replace(/[，]/g, ",")
    .replace(
      /[０-９]/g,
      (character) => {
        return String.fromCharCode(
          character.charCodeAt(0) -
          0xFEE0
        );
      }
    )
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/*
 * OCRで数字に誤認される英字を補正
 */
function normalizeNumericCharacters(
  text
) {
  return String(text)
    .replace(
      /[０-９]/g,
      (character) => {
        return String.fromCharCode(
          character.charCodeAt(0) -
          0xFEE0
        );
      }
    )
    .replace(/[OoＱ〇○]/g, "0")
    .replace(/[Il|｜]/g, "1")
    .replace(/[Zz]/g, "2")
    .replace(/[Ss]/g, "5")
    .replace(/[Bb]/g, "8");
}

/*
 * 日付抽出
 */
function extractDate(text) {
  const normalized =
    normalizeNumericCharacters(
      text
    );

  const match =
    normalized.match(
      /(?:^|\s)(\d{2})\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{1,2})(?:\s|$)/
    );

  if (!match) {
    return "";
  }

  const year = match[1];

  const month =
    match[2].padStart(
      2,
      "0"
    );

  const day =
    match[3].padStart(
      2,
      "0"
    );

  const monthNumber =
    Number(month);

  const dayNumber =
    Number(day);

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
 * 時刻抽出
 */
function extractTime(text) {
  const normalized =
    normalizeNumericCharacters(
      text
    )
      .replace(/[：]/g, ":")
      .replace(/[．。]/g, ".")
      .replace(/[;,]/g, ":")
      .replace(/\s+/g, " ")
      .trim();

  /*
   * 11:55、11.55
   */
  const standardMatches = [
    ...normalized.matchAll(
      /(?:^|[^\d])([01]?\d|2[0-3])\s*[:.]\s*([0-5]\d)(?!\d)/g
    )
  ];

  if (
    standardMatches.length > 0
  ) {
    const match =
      standardMatches[
        standardMatches.length - 1
      ];

    const hour =
      match[1].padStart(
        2,
        "0"
      );

    return `${hour}:${match[2]}`;
  }

  /*
   * 11 55
   */
  const separatedMatches = [
    ...normalized.matchAll(
      /(?:^|[^\d])([01]?\d|2[0-3])\s+([0-5]\d)(?!\d)/g
    )
  ];

  if (
    separatedMatches.length > 0
  ) {
    const match =
      separatedMatches[
        separatedMatches.length - 1
      ];

    const hour =
      match[1].padStart(
        2,
        "0"
      );

    return `${hour}:${match[2]}`;
  }

  /*
   * 1155、955
   */
  const compactMatches = [
    ...normalized.matchAll(
      /(?:^|[^\d])(\d{3,4})(?!\d)/g
    )
  ];

  for (
    let index =
      compactMatches.length - 1;
    index >= 0;
    index -= 1
  ) {
    const digits =
      compactMatches[index][1]
        .padStart(4, "0");

    const hour =
      Number(
        digits.slice(0, 2)
      );

    const minute =
      Number(
        digits.slice(2, 4)
      );

    if (
      hour >= 0 &&
      hour <= 23 &&
      minute >= 0 &&
      minute <= 59
    ) {
      return [
        String(hour).padStart(
          2,
          "0"
        ),
        String(minute).padStart(
          2,
          "0"
        )
      ].join(":");
    }
  }

  return "";
}

function isValidTime(value) {
  if (
    !/^\d{2}:\d{2}$/.test(
      value
    )
  ) {
    return false;
  }

  const [
    hourText,
    minuteText
  ] = value.split(":");

  const hour =
    Number(hourText);

  const minute =
    Number(minuteText);

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
 * 価格抽出
 */
function extractPrice(text) {
  const normalized =
    normalizeNumericCharacters(
      text
    );

  const yenMatches = [
    ...normalized.matchAll(
      /(?:^|[^\d])(\d{2,4})\s*(?:円|¥|￥|YEN)(?!\d)/gi
    )
  ];

  const validYenPrices =
    yenMatches
      .map(
        (match) =>
          Number(match[1])
      )
      .filter(isLikelyPrice);

  if (
    validYenPrices.length > 0
  ) {
    return String(
      validYenPrices[
        validYenPrices.length - 1
      ]
    );
  }

  const numericCandidates = [
    ...normalized.matchAll(
      /(?:^|[^\d])(\d{2,4})(?!\d)/g
    )
  ]
    .map(
      (match) =>
        Number(match[1])
    )
    .filter(isLikelyPrice);

  if (
    numericCandidates.length === 0
  ) {
    return "";
  }

  return String(
    numericCandidates[
      numericCandidates.length - 1
    ]
  );
}

function isLikelyPrice(value) {
  return (
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 3000 &&
    value % 10 === 0
  );
}

/*
 * 通し番号抽出
 */
function extractTicketNumber(text) {
  const normalized =
    normalizeNumericCharacters(
      text
    );

  const dateThenNumberMatch =
    normalized.match(
      /\d{2}\s*[.\-\/]\s*\d{1,2}\s*[.\-\/]\s*\d{1,2}[\s\n]+(\d{1,4})(?!\d)/
    );

  if (dateThenNumberMatch) {
    const value =
      Number(
        dateThenNumberMatch[1]
      );

    if (
      value >= 1 &&
      value <= 9999
    ) {
      return String(value);
    }
  }

  const candidates = [
    ...normalized.matchAll(
      /(?:^|[^\d])(\d{3,4})(?!\d)/g
    )
  ]
    .map(
      (match) => match[1]
    )
    .filter((value) => {
      const numericValue =
        Number(value);

      if (
        numericValue < 1 ||
        numericValue > 9999
      ) {
        return false;
      }

      if (
        numericValue >= 100 &&
        numericValue <= 3000 &&
        numericValue % 10 === 0
      ) {
        return false;
      }

      if (
        looksLikeCompactTime(
          value
        )
      ) {
        return false;
      }

      return true;
    });

  return candidates[0] ?? "";
}

function looksLikeCompactTime(
  value
) {
  if (
    !/^\d{3,4}$/.test(value)
  ) {
    return false;
  }

  const paddedValue =
    value.padStart(4, "0");

  const hour =
    Number(
      paddedValue.slice(0, 2)
    );

  const minute =
    Number(
      paddedValue.slice(2, 4)
    );

  return (
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59
  );
}

/*
 * =========================================================
 * 時刻部分の切り出し
 * =========================================================
 */
function cropAndEnhanceTimeArea(
  imageFile
) {
  return new Promise(
    (resolve, reject) => {
      const image = new Image();

      const imageUrl =
        URL.createObjectURL(
          imageFile
        );

      image.onload = () => {
        try {
          const sourceWidth =
            image.naturalWidth;

          const sourceHeight =
            image.naturalHeight;

          if (
            sourceWidth <= 0 ||
            sourceHeight <= 0
          ) {
            throw new Error(
              "画像サイズを取得できません。"
            );
          }

          const cropX =
            Math.round(
              sourceWidth *
              TIME_CROP_SETTINGS
                .leftRatio
            );

          const cropY =
            Math.round(
              sourceHeight *
              TIME_CROP_SETTINGS
                .topRatio
            );

          const cropWidth =
            Math.round(
              sourceWidth *
              TIME_CROP_SETTINGS
                .widthRatio
            );

          const cropHeight =
            Math.round(
              sourceHeight *
              TIME_CROP_SETTINGS
                .heightRatio
            );

          const canvas =
            document.createElement(
              "canvas"
            );

          const context =
            canvas.getContext(
              "2d",
              {
                willReadFrequently:
                  true
              }
            );

          if (!context) {
            throw new Error(
              "画像処理機能を使用できません。"
            );
          }

          const scale =
            TIME_CROP_SETTINGS.scale;

          canvas.width =
            cropWidth * scale;

          canvas.height =
            cropHeight * scale;

          context.fillStyle =
            "#ffffff";

          context.fillRect(
            0,
            0,
            canvas.width,
            canvas.height
          );

          context.imageSmoothingEnabled =
            true;

          context.imageSmoothingQuality =
            "high";

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

          enhanceImageForOcr(
            context,
            canvas.width,
            canvas.height,
            TIME_CROP_SETTINGS
              .threshold
          );

          canvas.toBlob(
            (blob) => {
              URL.revokeObjectURL(
                imageUrl
              );

              if (!blob) {
                reject(
                  new Error(
                    "時刻画像を作成できません。"
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
          URL.revokeObjectURL(
            imageUrl
          );

          reject(error);
        }
      };

      image.onerror = () => {
        URL.revokeObjectURL(
          imageUrl
        );

        reject(
          new Error(
            "画像を読み込めませんでした。"
          )
        );
      };

      image.src = imageUrl;
    }
  );
}

/*
 * OCR用画像補正
 */
function enhanceImageForOcr(
  context,
  width,
  height,
  threshold
) {
  const imageData =
    context.getImageData(
      0,
      0,
      width,
      height
    );

  const pixels =
    imageData.data;

  let brightnessTotal = 0;
  let pixelCount = 0;

  for (
    let index = 0;
    index < pixels.length;
    index += 4
  ) {
    const gray =
      pixels[index] * 0.299 +
      pixels[index + 1] * 0.587 +
      pixels[index + 2] * 0.114;

    brightnessTotal += gray;
    pixelCount += 1;
  }

  const averageBrightness =
    pixelCount > 0
      ? brightnessTotal /
        pixelCount
      : threshold;

  const adaptiveThreshold =
    Math.max(
      135,
      Math.min(
        205,
        (
          threshold +
          averageBrightness
        ) / 2
      )
    );

  for (
    let index = 0;
    index < pixels.length;
    index += 4
  ) {
    const gray =
      pixels[index] * 0.299 +
      pixels[index + 1] * 0.587 +
      pixels[index + 2] * 0.114;

    const value =
      gray <
      adaptiveThreshold
        ? 0
        : 255;

    pixels[index] = value;
    pixels[index + 1] =
      value;
    pixels[index + 2] =
      value;
    pixels[index + 3] =
      255;
  }

  context.putImageData(
    imageData,
    0,
    0
  );
}

/*
 * =========================================================
 * 保存用画像作成
 * =========================================================
 */
function createStoredTicketImage(
  imageFile
) {
  return new Promise(
    (resolve, reject) => {
      const image = new Image();

      const imageUrl =
        URL.createObjectURL(
          imageFile
        );

      image.onload = () => {
        try {
          const maxSize = 1200;

          let width =
            image.naturalWidth;

          let height =
            image.naturalHeight;

          if (
            width > height &&
            width > maxSize
          ) {
            height =
              Math.round(
                height *
                maxSize /
                width
              );

            width = maxSize;
          } else if (
            height >= width &&
            height > maxSize
          ) {
            width =
              Math.round(
                width *
                maxSize /
                height
              );

            height = maxSize;
          }

          const canvas =
            document.createElement(
              "canvas"
            );

          const context =
            canvas.getContext("2d");

          if (!context) {
            throw new Error(
              "画像処理機能を使用できません。"
            );
          }

          canvas.width = width;
          canvas.height = height;

          context.fillStyle =
            "#ffffff";

          context.fillRect(
            0,
            0,
            width,
            height
          );

          context.drawImage(
            image,
            0,
            0,
            width,
            height
          );

          const dataUrl =
            canvas.toDataURL(
              "image/jpeg",
              0.75
            );

          URL.revokeObjectURL(
            imageUrl
          );

          resolve(dataUrl);
        } catch (error) {
          URL.revokeObjectURL(
            imageUrl
          );

          reject(error);
        }
      };

      image.onerror = () => {
        URL.revokeObjectURL(
          imageUrl
        );

        reject(
          new Error(
            "画像を読み込めませんでした。"
          )
        );
      };

      image.src = imageUrl;
    }
  );
}

/*
 * =========================================================
 * 還元額計算
 * =========================================================
 */
function updateRefund() {
  const price =
    Number(priceInput.value);

  if (
    !Number.isFinite(price) ||
    price <= 0
  ) {
    refundAmount.textContent =
      "0";

    return;
  }

  refundAmount.textContent =
    String(
      Math.round(
        price * 0.2
      )
    );
}

priceInput.addEventListener(
  "input",
  updateRefund
);

/*
 * =========================================================
 * IndexedDB
 * =========================================================
 */
function openDatabase() {
  return new Promise(
    (resolve, reject) => {
      const request =
        indexedDB.open(
          DATABASE_NAME,
          DATABASE_VERSION
        );

      request.onupgradeneeded =
        (event) => {
          const database =
            event.target.result;

          if (
            !database
              .objectStoreNames
              .contains(STORE_NAME)
          ) {
            const store =
              database
                .createObjectStore(
                  STORE_NAME,
                  {
                    keyPath: "id"
                  }
                );

            store.createIndex(
              "registeredAt",
              "registeredAt",
              {
                unique: false
              }
            );

            store.createIndex(
              "employeeName",
              "employeeName",
              {
                unique: false
              }
            );
          }
        };

      request.onsuccess =
        () => {
          resolve(
            request.result
          );
        };

      request.onerror =
        () => {
          reject(
            request.error
          );
        };
    }
  );
}

async function addRecordToDatabase(
  record
) {
  const database =
    await openDatabase();

  return new Promise(
    (resolve, reject) => {
      const transaction =
        database.transaction(
          STORE_NAME,
          "readwrite"
        );

      transaction
        .objectStore(
          STORE_NAME
        )
        .add(record);

      transaction.oncomplete =
        () => {
          database.close();
          resolve();
        };

      transaction.onerror =
        () => {
          database.close();

          reject(
            transaction.error
          );
        };
    }
  );
}

async function getAllRecordsFromDatabase() {
  const database =
    await openDatabase();

  return new Promise(
    (resolve, reject) => {
      const transaction =
        database.transaction(
          STORE_NAME,
          "readonly"
        );

      const request =
        transaction
          .objectStore(
            STORE_NAME
          )
          .getAll();

      request.onsuccess =
        () => {
          const savedRecords =
            request.result ?? [];

          savedRecords.sort(
            (
              first,
              second
            ) => {
              return String(
                second.registeredAt
              ).localeCompare(
                String(
                  first.registeredAt
                )
              );
            }
          );

          database.close();

          resolve(
            savedRecords
          );
        };

      request.onerror =
        () => {
          database.close();

          reject(
            request.error
          );
        };
    }
  );
}

async function deleteRecordFromDatabase(
  recordId
) {
  const database =
    await openDatabase();

  return new Promise(
    (resolve, reject) => {
      const transaction =
        database.transaction(
          STORE_NAME,
          "readwrite"
        );

      transaction
        .objectStore(
          STORE_NAME
        )
        .delete(recordId);

      transaction.oncomplete =
        () => {
          database.close();
          resolve();
        };

      transaction.onerror =
        () => {
          database.close();

          reject(
            transaction.error
          );
        };
    }
  );
}

/*
 * =========================================================
 * 登録処理
 * =========================================================
 */
saveButton.addEventListener(
  "click",
  async () => {
    const department =
      departmentInput.value.trim();

    const employeeName =
      employeeNameInput.value.trim();

    if (!department) {
      showMessage(
        "所属を入力してください。",
        true
      );

      departmentInput.focus();
      return;
    }

    if (!employeeName) {
      showMessage(
        "氏名を入力してください。",
        true
      );

      employeeNameInput.focus();
      return;
    }

    if (!selectedImage) {
      showMessage(
        "登録する半券を撮影してください。",
        true
      );

      return;
    }

    const numericPrice =
      Number(priceInput.value);

    const record = {
      id:
        createRecordId(),

      department,

      employeeName,

      date:
        dateInput.value.trim(),

      number:
        numberInput.value.trim(),

      time:
        timeInput.value,

      price:
        numericPrice,

      refund:
        Math.round(
          numericPrice * 0.2
        ),

      ticketImage: "",

      registeredAt:
        new Date().toISOString()
    };

    const validationError =
      validateRecord(record);

    if (validationError) {
      showMessage(
        validationError,
        true
      );

      return;
    }

    const duplicate =
      records.some(
        (existingRecord) => {
          return (
            existingRecord
              .date ===
              record.date &&

            existingRecord
              .number ===
              record.number &&

            existingRecord
              .time ===
              record.time &&

            existingRecord
              .price ===
              record.price
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

    try {
      saveButton.disabled = true;

      showMessage(
        "半券画像を保存用に処理しています。"
      );

      record.ticketImage =
        await createStoredTicketImage(
          selectedImage
        );

      await addRecordToDatabase(
        record
      );

      records =
        await getAllRecordsFromDatabase();

      renderHistory();

      clearTicketInputs();
      resetSelectedImage();

      showMessage(
        "半券画像を含めて登録しました。"
      );
    } catch (error) {
      console.error(
        "Save error:",
        error
      );

      showMessage(
        "登録データを保存できませんでした。端末の空き容量も確認してください。",
        true
      );
    } finally {
      saveButton.disabled =
        false;
    }
  }
);

function createRecordId() {
  if (
    typeof crypto !==
      "undefined" &&
    typeof crypto.randomUUID ===
      "function"
  ) {
    return crypto.randomUUID();
  }

  return [
    Date.now(),
    Math.random()
      .toString(36)
      .slice(2)
  ].join("-");
}

function validateRecord(record) {
  if (
    !/^\d{2}\.\d{2}\.\d{2}$/
      .test(record.date)
  ) {
    return "日付を26.07.24の形式で入力してください。";
  }

  const dateParts =
    record.date
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
    !/^\d{1,4}$/
      .test(record.number)
  ) {
    return "通し番号を数字で入力してください。";
  }

  if (
    !isValidTime(
      record.time
    )
  ) {
    return "購入時間を正しく入力してください。";
  }

  if (
    !isLikelyPrice(
      record.price
    )
  ) {
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

  const totalRefund =
    records.reduce(
      (total, record) => {
        return (
          total +
          Number(
            record.refund || 0
          )
        );
      },
      0
    );

  historySummary.textContent =
    `登録件数：${records.length}件／還元予定合計：${totalRefund}円`;

  if (
    records.length === 0
  ) {
    const emptyRow =
      document.createElement(
        "tr"
      );

    const emptyCell =
      document.createElement(
        "td"
      );

    emptyCell.colSpan = 9;

    emptyCell.textContent =
      "登録された半券はありません。";

    emptyRow.appendChild(
      emptyCell
    );

    historyBody.appendChild(
      emptyRow
    );

    return;
  }

  records.forEach(
    (record) => {
      const row =
        document.createElement(
          "tr"
        );

      /*
       * 画像
       */
      const imageCell =
        document.createElement(
          "td"
        );

      if (record.ticketImage) {
        const imageButton =
          document.createElement(
            "button"
          );

        imageButton.type =
          "button";

        imageButton.className =
          "ticket-image-button";

        imageButton.setAttribute(
          "aria-label",
          "半券画像を拡大表示"
        );

        const image =
          document.createElement(
            "img"
          );

        image.src =
          record.ticketImage;

        image.alt =
          `${record.employeeName}さんの半券`;

        image.className =
          "ticket-thumbnail";

        imageButton.appendChild(
          image
        );

        imageButton.addEventListener(
          "click",
          () => {
            openTicketImageModal(
              record.ticketImage
            );
          }
        );

        imageCell.appendChild(
          imageButton
        );
      } else {
        imageCell.textContent =
          "―";
      }

      const departmentCell =
        createTableCell(
          record.department
        );

      const nameCell =
        createTableCell(
          record.employeeName
        );

      const dateCell =
        createTableCell(
          record.date
        );

      const numberCell =
        createTableCell(
          record.number
        );

      const timeCell =
        createTableCell(
          record.time
        );

      const priceCell =
        createTableCell(
          `${record.price}円`
        );

      const refundCell =
        createTableCell(
          `${record.refund}円`
        );

      const actionCell =
        document.createElement(
          "td"
        );

      const deleteButton =
        document.createElement(
          "button"
        );

      deleteButton.type =
        "button";

      deleteButton.className =
        "delete-button";

      deleteButton.textContent =
        "削除";

      deleteButton.addEventListener(
        "click",
        async () => {
          const confirmed =
            window.confirm(
              [
                "この登録を削除しますか？",
                "",
                `日付：${record.date}`,
                `番号：${record.number}`,
                `価格：${record.price}円`
              ].join("\n")
            );

          if (!confirmed) {
            return;
          }

          try {
            await deleteRecordFromDatabase(
              record.id
            );

            records =
              await getAllRecordsFromDatabase();

            renderHistory();

            showMessage(
              "登録履歴を削除しました。"
            );
          } catch (error) {
            console.error(
              "Delete error:",
              error
            );

            showMessage(
              "登録履歴を削除できませんでした。",
              true
            );
          }
        }
      );

      actionCell.appendChild(
        deleteButton
      );

      row.append(
        imageCell,
        departmentCell,
        nameCell,
        dateCell,
        numberCell,
        timeCell,
        priceCell,
        refundCell,
        actionCell
      );

      historyBody.appendChild(
        row
      );
    }
  );
}

function createTableCell(value) {
  const cell =
    document.createElement("td");

  cell.textContent =
    String(value ?? "");

  return cell;
}

/*
 * =========================================================
 * 画像拡大表示
 * =========================================================
 */
function openTicketImageModal(
  imageData
) {
  largeTicketImage.src =
    imageData;

  imageModal.classList.remove(
    "hidden"
  );

  imageModal.setAttribute(
    "aria-hidden",
    "false"
  );

  document.body.style.overflow =
    "hidden";

  closeImageModalButton.focus();
}

function closeTicketImageModal() {
  imageModal.classList.add(
    "hidden"
  );

  imageModal.setAttribute(
    "aria-hidden",
    "true"
  );

  largeTicketImage.src = "";

  document.body.style.overflow =
    "";
}

closeImageModalButton.addEventListener(
  "click",
  closeTicketImageModal
);

imageModal.addEventListener(
  "click",
  (event) => {
    if (
      event.target === imageModal
    ) {
      closeTicketImageModal();
    }
  }
);

document.addEventListener(
  "keydown",
  (event) => {
    if (
      event.key === "Escape" &&
      !imageModal.classList
        .contains("hidden")
    ) {
      closeTicketImageModal();
    }
  }
);

/*
 * =========================================================
 * CSV出力
 * =========================================================
 */
csvButton.addEventListener(
  "click",
  () => {
    if (
      records.length === 0
    ) {
      showMessage(
        "出力するデータがありません。",
        true
      );

      return;
    }

    const header = [
      "所属",
      "氏名",
      "日付",
      "通し番号",
      "購入時間",
      "価格",
      "還元額",
      "登録日時"
    ];

    const rows =
      records.map(
        (record) => {
          return [
            record.department,
            record.employeeName,
            record.date,
            record.number,
            record.time,
            record.price,
            record.refund,
            formatRegisteredAt(
              record.registeredAt
            )
          ];
        }
      );

    const csvText = [
      header,
      ...rows
    ]
      .map((row) => {
        return row
          .map(
            escapeCsvValue
          )
          .join(",");
      })
      .join("\r\n");

    const blob =
      new Blob(
        [
          "\uFEFF",
          csvText
        ],
        {
          type:
            "text/csv;charset=utf-8"
        }
      );

    const url =
      URL.createObjectURL(
        blob
      );

    const link =
      document.createElement(
        "a"
      );

    link.href = url;

    link.download =
      createCsvFileName();

    document.body.appendChild(
      link
    );

    link.click();
    link.remove();

    setTimeout(
      () => {
        URL.revokeObjectURL(
          url
        );
      },
      1000
    );

    showMessage(
      "CSVファイルを出力しました。"
    );
  }
);

function escapeCsvValue(value) {
  const stringValue =
    String(value ?? "");

  return `"${stringValue.replaceAll(
    '"',
    '""'
  )}"`;
}

function createCsvFileName() {
  const now = new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      now.getDate()
    ).padStart(2, "0");

  return (
    `CLOVER_DINING_食券申請_${year}${month}${day}.csv`
  );
}

function formatRegisteredAt(
  value
) {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  return date.toLocaleString(
    "ja-JP"
  );
}

/*
 * =========================================================
 * OCR進行表示
 * =========================================================
 */
function updateProgress(status) {
  progressArea.classList.remove(
    "hidden"
  );

  if (
    typeof status.progress ===
    "number"
  ) {
    const progress =
      Math.max(
        0,
        Math.min(
          1,
          status.progress
        )
      );

    progressBar.value =
      progress;

    progressText.textContent =
      `読み取り中：${Math.round(
        progress * 100
      )}％`;
  }
}

function setOcrRunning(
  isRunning
) {
  imageInput.disabled =
    isRunning;

  saveButton.disabled =
    isRunning;

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
function clearTicketInputs() {
  dateInput.value = "";
  numberInput.value = "";
  timeInput.value = "";
  priceInput.value = "";

  refundAmount.textContent =
    "0";

  rawText.textContent = "";
}

function resetSelectedImage() {
  selectedImage = null;

  imageInput.value = "";

  preview.src = "";

  preview.classList.add(
    "hidden"
  );

  ocrButton.disabled = true;

  progressArea.classList.add(
    "hidden"
  );

  progressBar.value = 0;

  if (currentPreviewUrl) {
    URL.revokeObjectURL(
      currentPreviewUrl
    );

    currentPreviewUrl = "";
  }
}

function showMessage(
  text,
  isError = false
) {
  message.textContent = text;

  message.style.color =
    isError
      ? "#a00000"
      : "#176327";
}

/*
 * =========================================================
 * Service Worker
 * =========================================================
 */
if (
  "serviceWorker" in navigator
) {
  window.addEventListener(
    "load",
    async () => {
      try {
        await navigator
          .serviceWorker
          .register(
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
 * =========================================================
 * 初期処理
 * =========================================================
 */
async function initializeApplication() {
  loadApplicantInformation();

  try {
    records =
      await getAllRecordsFromDatabase();

    renderHistory();
  } catch (error) {
    console.error(
      "Initialization error:",
      error
    );

    records = [];

    renderHistory();

    showMessage(
      "登録履歴を読み込めませんでした。",
      true
    );
  }
}

initializeApplication();
