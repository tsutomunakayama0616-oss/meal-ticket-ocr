"use strict";

/*
 * =========================================================
 * CLOVER DINING 食券OCR
 * app.js
 * =========================================================
 */

/*
 * =========================================================
 * HTML要素
 * =========================================================
 */

const departmentInput =
  document.getElementById("department");

const employeeNameInput =
  document.getElementById("employeeName");

/*
 * カメラ関連
 */
const cameraArea =
  document.getElementById("cameraArea");

const cameraVideo =
  document.getElementById("cameraVideo");

const cameraStatus =
  document.getElementById("cameraStatus");

const startCameraButton =
  document.getElementById("startCameraButton");

const stopCameraButton =
  document.getElementById("stopCameraButton");

const manualCaptureButton =
  document.getElementById("manualCaptureButton");

const autoCaptureEnabledInput =
  document.getElementById("autoCaptureEnabled");

const captureCountdown =
  document.getElementById("captureCountdown");

const captureFlash =
  document.getElementById("captureFlash");

const captureCanvas =
  document.getElementById("captureCanvas");

/*
 * 通常の画像選択
 */
const imageInput =
  document.getElementById("ticketImage");

const capturedImageArea =
  document.getElementById("capturedImageArea");

const preview =
  document.getElementById("preview");

const retakeButton =
  document.getElementById("retakeButton");

const ocrButton =
  document.getElementById("ocrButton");

/*
 * OCR進捗
 */
const progressArea =
  document.getElementById("progressArea");

const progressText =
  document.getElementById("progressText");

const progressBar =
  document.getElementById("progressBar");

/*
 * 日付プルダウン
 */
const yearSelect =
  document.getElementById("ticketYear");

const monthSelect =
  document.getElementById("ticketMonth");

const daySelect =
  document.getElementById("ticketDay");

const selectedDateDisplay =
  document.getElementById("selectedDateDisplay");

/*
 * 読み取り結果
 */
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

const message =
  document.getElementById("message");

const rawText =
  document.getElementById("rawText");

/*
 * 登録履歴
 */
const historyBody =
  document.getElementById("historyBody");

const historySummary =
  document.getElementById("historySummary");

const csvButton =
  document.getElementById("csvButton");

/*
 * 画像拡大表示
 */
const imageModal =
  document.getElementById("imageModal");

const largeTicketImage =
  document.getElementById("largeTicketImage");

const closeImageModalButton =
  document.getElementById("closeImageModal");

/*
 * =========================================================
 * アプリ状態
 * =========================================================
 */

let selectedImage = null;
let currentPreviewUrl = "";
let cameraStream = null;
let records = [];

let isCameraRunning = false;
let isCapturing = false;
let isOcrRunning = false;

let frameAnalysisTimer = null;
let stableFrameCount = 0;
let previousFrameData = null;

/*
 * 自動撮影判定
 */
const AUTO_CAPTURE_SETTINGS = {
  analysisIntervalMilliseconds: 350,
  requiredStableFrames: 4,
  maximumFrameDifference: 15,
  minimumBrightness: 55,
  maximumBrightness: 230,
  minimumContrast: 20
};

/*
 * 項目別OCRの切り出し範囲
 *
 * 撮影画像全体に半券が大きく縦向きで写っている想定。
 */
const OCR_CROP_SETTINGS = {
  date: {
    leftRatio: 0.08,
    topRatio: 0.01,
    widthRatio: 0.84,
    heightRatio: 0.19,
    scale: 4,
    threshold: 175
  },

  time: {
    leftRatio: 0.08,
    topRatio: 0.42,
    widthRatio: 0.84,
    heightRatio: 0.32,
    scale: 4,
    threshold: 175
  }
};

/*
 * =========================================================
 * IndexedDB設定
 * =========================================================
 */

const DATABASE_NAME =
  "CloverDiningMealTicketDatabase";

const DATABASE_VERSION = 1;

const STORE_NAME =
  "mealTicketRecords";

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
  try {
    localStorage.setItem(
      "cloverDiningDepartment",
      departmentInput.value.trim()
    );

    localStorage.setItem(
      "cloverDiningEmployeeName",
      employeeNameInput.value.trim()
    );
  } catch (error) {
    console.error(
      "Applicant information save error:",
      error
    );
  }
}

function loadApplicantInformation() {
  try {
    departmentInput.value =
      localStorage.getItem(
        "cloverDiningDepartment"
      ) ?? "";

    employeeNameInput.value =
      localStorage.getItem(
        "cloverDiningEmployeeName"
      ) ?? "";
  } catch (error) {
    console.error(
      "Applicant information load error:",
      error
    );
  }
}

/*
 * =========================================================
 * 日付プルダウン
 * =========================================================
 */

yearSelect.addEventListener(
  "change",
  () => {
    updateDayOptions();
    updateSelectedDateDisplay();
  }
);

monthSelect.addEventListener(
  "change",
  () => {
    updateDayOptions();
    updateSelectedDateDisplay();
  }
);

daySelect.addEventListener(
  "change",
  updateSelectedDateDisplay
);

function initializeYearOptions() {
  const currentYear =
    new Date().getFullYear();

  /*
   * 過去10年から翌年まで選択可能
   */
  const startYear =
    currentYear - 10;

  const endYear =
    currentYear + 1;

  yearSelect.innerHTML =
    '<option value="">年を選択</option>';

  for (
    let year = endYear;
    year >= startYear;
    year -= 1
  ) {
    addYearOption(year);
  }
}

function addYearOption(year) {
  const value =
    String(year);

  const alreadyExists = [
    ...yearSelect.options
  ].some((option) => {
    return option.value === value;
  });

  if (alreadyExists) {
    return;
  }

  const option =
    document.createElement("option");

  option.value = value;
  option.textContent =
    `${value}年`;

  yearSelect.appendChild(option);
}

function updateDayOptions() {
  const selectedYear =
    Number(yearSelect.value);

  const selectedMonth =
    Number(monthSelect.value);

  const previousDay =
    daySelect.value;

  daySelect.innerHTML =
    '<option value="">日を選択</option>';

  if (
    !selectedYear ||
    !selectedMonth
  ) {
    return;
  }

  const numberOfDays =
    new Date(
      selectedYear,
      selectedMonth,
      0
    ).getDate();

  for (
    let day = 1;
    day <= numberOfDays;
    day += 1
  ) {
    const option =
      document.createElement("option");

    option.value =
      String(day).padStart(
        2,
        "0"
      );

    option.textContent =
      `${day}日`;

    daySelect.appendChild(option);
  }

  const previousDayNumber =
    Number(previousDay);

  if (
    previousDayNumber >= 1 &&
    previousDayNumber <= numberOfDays
  ) {
    daySelect.value =
      String(previousDayNumber)
        .padStart(2, "0");
  }
}

function setTodayAsDefaultDate() {
  const today =
    new Date();

  const currentYear =
    today.getFullYear();

  addYearOption(currentYear);

  yearSelect.value =
    String(currentYear);

  monthSelect.value =
    String(
      today.getMonth() + 1
    ).padStart(2, "0");

  updateDayOptions();

  daySelect.value =
    String(
      today.getDate()
    ).padStart(2, "0");

  updateSelectedDateDisplay();
}

function getSelectedTicketDate() {
  const fullYear =
    yearSelect.value;

  const month =
    monthSelect.value;

  const day =
    daySelect.value;

  if (
    !fullYear ||
    !month ||
    !day
  ) {
    return "";
  }

  return [
    fullYear.slice(-2),
    month,
    day
  ].join(".");
}

function updateSelectedDateDisplay() {
  const ticketDate =
    getSelectedTicketDate();

  if (!ticketDate) {
    selectedDateDisplay.textContent =
      "選択日：未選択";

    return;
  }

  selectedDateDisplay.textContent =
    `選択日：${ticketDate}`;
}

function setDateSelectsFromOcr(
  ticketDate
) {
  const match =
    String(ticketDate).match(
      /^(\d{2})\.(\d{2})\.(\d{2})$/
    );

  if (!match) {
    return false;
  }

  const fullYear =
    2000 + Number(match[1]);

  const month =
    match[2];

  const day =
    match[3];

  if (
    fullYear < 2000 ||
    fullYear > 2099
  ) {
    return false;
  }

  const testDate =
    new Date(
      fullYear,
      Number(month) - 1,
      Number(day)
    );

  if (
    testDate.getFullYear() !==
      fullYear ||
    testDate.getMonth() + 1 !==
      Number(month) ||
    testDate.getDate() !==
      Number(day)
  ) {
    return false;
  }

  addYearOption(fullYear);

  yearSelect.value =
    String(fullYear);

  monthSelect.value =
    month;

  updateDayOptions();

  daySelect.value =
    day;

  updateSelectedDateDisplay();

  return true;
}

/*
 * =========================================================
 * カメラ起動
 * =========================================================
 */

startCameraButton.addEventListener(
  "click",
  startCamera
);

stopCameraButton.addEventListener(
  "click",
  stopCamera
);

manualCaptureButton.addEventListener(
  "click",
  () => {
    captureCameraImage();
  }
);

retakeButton.addEventListener(
  "click",
  async () => {
    resetCapturedImage();
    clearTicketResultFields();

    if (
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia
    ) {
      await startCamera();
    }
  }
);

async function startCamera() {
  if (isCameraRunning) {
    return;
  }

  if (
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices
      .getUserMedia !== "function"
  ) {
    showMessage(
      "このブラウザではアプリ内カメラを使用できません。写真を撮影・選択してください。",
      true
    );

    return;
  }

  try {
    stopCamera();

    setCameraStatus(
      "カメラの使用を許可してください。",
      "warning"
    );

    cameraStream =
      await navigator.mediaDevices
        .getUserMedia({
          video: {
            facingMode: {
              ideal: "environment"
            },

            width: {
              ideal: 1920
            },

            height: {
              ideal: 2560
            }
          },

          audio: false
        });

    cameraVideo.srcObject =
      cameraStream;

    await cameraVideo.play();

    isCameraRunning = true;
    isCapturing = false;
    stableFrameCount = 0;
    previousFrameData = null;

    cameraArea.classList.remove(
      "hidden"
    );

    startCameraButton.classList.add(
      "hidden"
    );

    capturedImageArea.classList.add(
      "hidden"
    );

    setCameraStatus(
      "半券を縦向きにして、ガイド枠内へ合わせてください。",
      "ready"
    );

    startFrameAnalysis();
  } catch (error) {
    console.error(
      "Camera start error:",
      error
    );

    stopCamera();

    let errorMessage =
      "カメラを起動できませんでした。";

    if (
      error &&
      error.name ===
        "NotAllowedError"
    ) {
      errorMessage =
        "カメラの使用が許可されていません。ブラウザの設定からカメラを許可してください。";
    } else if (
      error &&
      error.name ===
        "NotFoundError"
    ) {
      errorMessage =
        "使用できるカメラが見つかりませんでした。";
    }

    showMessage(
      errorMessage,
      true
    );

    setCameraStatus(
      errorMessage,
      "error"
    );
  }
}

function stopCamera() {
  stopFrameAnalysis();

  if (cameraStream) {
    cameraStream
      .getTracks()
      .forEach((track) => {
        track.stop();
      });
  }

  cameraStream = null;
  cameraVideo.srcObject = null;

  isCameraRunning = false;
  isCapturing = false;
  stableFrameCount = 0;
  previousFrameData = null;

  cameraArea.classList.add(
    "hidden"
  );

  startCameraButton.classList.remove(
    "hidden"
  );

  captureCountdown.classList.add(
    "hidden"
  );

  captureCountdown.textContent = "";
}

function setCameraStatus(
  text,
  statusClass = ""
) {
  cameraStatus.textContent = text;

  cameraStatus.classList.remove(
    "ready",
    "warning",
    "error"
  );

  if (statusClass) {
    cameraStatus.classList.add(
      statusClass
    );
  }
}

/*
 * =========================================================
 * 自動撮影判定
 * =========================================================
 */

function startFrameAnalysis() {
  stopFrameAnalysis();

  frameAnalysisTimer =
    window.setInterval(
      analyzeCameraFrame,
      AUTO_CAPTURE_SETTINGS
        .analysisIntervalMilliseconds
    );
}

function stopFrameAnalysis() {
  if (frameAnalysisTimer) {
    window.clearInterval(
      frameAnalysisTimer
    );

    frameAnalysisTimer = null;
  }
}

function analyzeCameraFrame() {
  if (
    !isCameraRunning ||
    isCapturing ||
    !autoCaptureEnabledInput.checked
  ) {
    stableFrameCount = 0;
    previousFrameData = null;
    return;
  }

  if (
    cameraVideo.readyState <
      HTMLMediaElement
        .HAVE_CURRENT_DATA ||
    cameraVideo.videoWidth <= 0 ||
    cameraVideo.videoHeight <= 0
  ) {
    return;
  }

  const analysisCanvas =
    document.createElement("canvas");

  /*
   * 小さい画像で分析して負荷を軽くする
   */
  analysisCanvas.width = 120;
  analysisCanvas.height = 160;

  const context =
    analysisCanvas.getContext(
      "2d",
      {
        willReadFrequently: true
      }
    );

  if (!context) {
    return;
  }

  const crop =
    getVideoGuideCrop();

  context.drawImage(
    cameraVideo,
    crop.sourceX,
    crop.sourceY,
    crop.sourceWidth,
    crop.sourceHeight,
    0,
    0,
    analysisCanvas.width,
    analysisCanvas.height
  );

  const imageData =
    context.getImageData(
      0,
      0,
      analysisCanvas.width,
      analysisCanvas.height
    );

  const metrics =
    calculateFrameMetrics(
      imageData
    );

  if (
    metrics.averageBrightness <
      AUTO_CAPTURE_SETTINGS
        .minimumBrightness
  ) {
    stableFrameCount = 0;

    setCameraStatus(
      "暗すぎます。明るい場所へ移動してください。",
      "warning"
    );

    previousFrameData =
      imageData.data.slice();

    return;
  }

  if (
    metrics.averageBrightness >
      AUTO_CAPTURE_SETTINGS
        .maximumBrightness
  ) {
    stableFrameCount = 0;

    setCameraStatus(
      "明るすぎます。光の反射を避けてください。",
      "warning"
    );

    previousFrameData =
      imageData.data.slice();

    return;
  }

  if (
    metrics.contrast <
      AUTO_CAPTURE_SETTINGS
        .minimumContrast
  ) {
    stableFrameCount = 0;

    setCameraStatus(
      "文字が不鮮明です。半券へ近づいてください。",
      "warning"
    );

    previousFrameData =
      imageData.data.slice();

    return;
  }

  if (!previousFrameData) {
    previousFrameData =
      imageData.data.slice();

    stableFrameCount = 0;

    return;
  }

  const frameDifference =
    calculateFrameDifference(
      previousFrameData,
      imageData.data
    );

  previousFrameData =
    imageData.data.slice();

  if (
    frameDifference <=
      AUTO_CAPTURE_SETTINGS
        .maximumFrameDifference
  ) {
    stableFrameCount += 1;

    const remainingFrames =
      AUTO_CAPTURE_SETTINGS
        .requiredStableFrames -
      stableFrameCount;

    if (remainingFrames > 0) {
      setCameraStatus(
        "半券を動かさず、そのままお待ちください。",
        "ready"
      );
    }
  } else {
    stableFrameCount = 0;

    setCameraStatus(
      "半券をガイド枠内で静止させてください。",
      "warning"
    );
  }

  if (
    stableFrameCount >=
      AUTO_CAPTURE_SETTINGS
        .requiredStableFrames
  ) {
    stableFrameCount = 0;

    beginAutomaticCapture();
  }
}

function calculateFrameMetrics(
  imageData
) {
  const pixels =
    imageData.data;

  let brightnessTotal = 0;
  let minimumBrightness = 255;
  let maximumBrightness = 0;
  let pixelCount = 0;

  for (
    let index = 0;
    index < pixels.length;
    index += 16
  ) {
    const red =
      pixels[index];

    const green =
      pixels[index + 1];

    const blue =
      pixels[index + 2];

    const gray =
      red * 0.299 +
      green * 0.587 +
      blue * 0.114;

    brightnessTotal += gray;
    pixelCount += 1;

    minimumBrightness =
      Math.min(
        minimumBrightness,
        gray
      );

    maximumBrightness =
      Math.max(
        maximumBrightness,
        gray
      );
  }

  return {
    averageBrightness:
      pixelCount > 0
        ? brightnessTotal /
          pixelCount
        : 0,

    contrast:
      maximumBrightness -
      minimumBrightness
  };
}

function calculateFrameDifference(
  previousPixels,
  currentPixels
) {
  let differenceTotal = 0;
  let sampleCount = 0;

  const availableLength =
    Math.min(
      previousPixels.length,
      currentPixels.length
    );

  for (
    let index = 0;
    index < availableLength;
    index += 32
  ) {
    const previousGray =
      previousPixels[index] *
        0.299 +
      previousPixels[index + 1] *
        0.587 +
      previousPixels[index + 2] *
        0.114;

    const currentGray =
      currentPixels[index] *
        0.299 +
      currentPixels[index + 1] *
        0.587 +
      currentPixels[index + 2] *
        0.114;

    differenceTotal +=
      Math.abs(
        previousGray -
        currentGray
      );

    sampleCount += 1;
  }

  return sampleCount > 0
    ? differenceTotal /
        sampleCount
    : Number.POSITIVE_INFINITY;
}

async function beginAutomaticCapture() {
  if (
    isCapturing ||
    !isCameraRunning
  ) {
    return;
  }

  isCapturing = true;
  stopFrameAnalysis();

  try {
    for (
      let count = 2;
      count >= 1;
      count -= 1
    ) {
      captureCountdown.textContent =
        String(count);

      captureCountdown.classList.remove(
        "hidden"
      );

      await wait(450);
    }

    captureCountdown.textContent =
      "";

    captureCountdown.classList.add(
      "hidden"
    );

    await captureCameraImage();
  } finally {
    isCapturing = false;
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(
      resolve,
      milliseconds
    );
  });
}

/*
 * =========================================================
 * カメラ画像の撮影
 * =========================================================
 */

function getVideoGuideCrop() {
  const videoWidth =
    cameraVideo.videoWidth;

  const videoHeight =
    cameraVideo.videoHeight;

  /*
   * CSSのticket-guideに近い範囲
   */
  const sourceX =
    Math.round(
      videoWidth * 0.22
    );

  const sourceY =
    Math.round(
      videoHeight * 0.08
    );

  const sourceWidth =
    Math.round(
      videoWidth * 0.56
    );

  const sourceHeight =
    Math.round(
      videoHeight * 0.84
    );

  return {
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight
  };
}

async function captureCameraImage() {
  if (
    !isCameraRunning ||
    cameraVideo.videoWidth <= 0 ||
    cameraVideo.videoHeight <= 0
  ) {
    showMessage(
      "カメラ画像を取得できませんでした。",
      true
    );

    return;
  }

  try {
    isCapturing = true;
    stopFrameAnalysis();

    const crop =
      getVideoGuideCrop();

    /*
     * OCR精度を確保するため、
     * 出力幅を1200px程度にする
     */
    const outputWidth = 1200;

    const outputHeight =
      Math.round(
        outputWidth *
        crop.sourceHeight /
        crop.sourceWidth
      );

    captureCanvas.width =
      outputWidth;

    captureCanvas.height =
      outputHeight;

    const context =
      captureCanvas.getContext(
        "2d"
      );

    if (!context) {
      throw new Error(
        "撮影画像を作成できません。"
      );
    }

    context.fillStyle =
      "#ffffff";

    context.fillRect(
      0,
      0,
      outputWidth,
      outputHeight
    );

    context.drawImage(
      cameraVideo,
      crop.sourceX,
      crop.sourceY,
      crop.sourceWidth,
      crop.sourceHeight,
      0,
      0,
      outputWidth,
      outputHeight
    );

    triggerCaptureFlash();

    const imageBlob =
      await canvasToBlob(
        captureCanvas,
        "image/jpeg",
        0.92
      );

    selectedImage =
      new File(
        [imageBlob],
        `clover-ticket-${Date.now()}.jpg`,
        {
          type: "image/jpeg"
        }
      );

    await showSelectedImage(
      selectedImage
    );

    stopCamera();

    setCameraStatus(
      "撮影しました。",
      "ready"
    );

    /*
     * 自動撮影の場合は
     * 撮影後にOCRも自動実行する
     */
    await runOcr();
  } catch (error) {
    console.error(
      "Capture error:",
      error
    );

    showMessage(
      "撮影に失敗しました。もう一度撮影してください。",
      true
    );

    if (isCameraRunning) {
      startFrameAnalysis();
    }
  } finally {
    isCapturing = false;
  }
}

function triggerCaptureFlash() {
  captureFlash.classList.remove(
    "hidden",
    "flash-active"
  );

  void captureFlash.offsetWidth;

  captureFlash.classList.add(
    "flash-active"
  );

  window.setTimeout(
    () => {
      captureFlash.classList.add(
        "hidden"
      );

      captureFlash.classList.remove(
        "flash-active"
      );
    },
    320
  );
}

function canvasToBlob(
  canvas,
  mimeType,
  quality
) {
  return new Promise(
    (resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(
              new Error(
                "画像データを作成できませんでした。"
              )
            );

            return;
          }

          resolve(blob);
        },
        mimeType,
        quality
      );
    }
  );
}

/*
 * =========================================================
 * 通常の画像撮影・選択
 * =========================================================
 */

imageInput.addEventListener(
  "change",
  async () => {
    const file =
      imageInput.files?.[0];

    if (!file) {
      return;
    }

    if (
      !file.type.startsWith(
        "image/"
      )
    ) {
      showMessage(
        "画像ファイルを選択してください。",
        true
      );

      imageInput.value = "";

      return;
    }

    stopCamera();

    selectedImage = file;

    clearTicketResultFields();

    await showSelectedImage(
      selectedImage
    );

    showMessage(
      "画像を選択しました。文字を読み取ってください。"
    );
  }
);

async function showSelectedImage(
  imageFile
) {
  if (currentPreviewUrl) {
    URL.revokeObjectURL(
      currentPreviewUrl
    );
  }

  currentPreviewUrl =
    URL.createObjectURL(
      imageFile
    );

  preview.src =
    currentPreviewUrl;

  capturedImageArea.classList.remove(
    "hidden"
  );

  ocrButton.disabled = false;
}

function resetCapturedImage() {
  selectedImage = null;

  imageInput.value = "";

  preview.src = "";

  capturedImageArea.classList.add(
    "hidden"
  );

  ocrButton.disabled = true;

  progressArea.classList.add(
    "hidden"
  );

  if (currentPreviewUrl) {
    URL.revokeObjectURL(
      currentPreviewUrl
    );

    currentPreviewUrl = "";
  }
}

/*
 * =========================================================
 * OCR
 * =========================================================
 */

ocrButton.addEventListener(
  "click",
  runOcr
);

async function runOcr() {
  if (!selectedImage) {
    showMessage(
      "読み取る半券画像がありません。",
      true
    );

    return;
  }

  if (isOcrRunning) {
    return;
  }

  let worker = null;

  try {
    isOcrRunning = true;
    setOcrRunningState(true);

    worker =
      await Tesseract.createWorker(
        "eng",
        1,
        {
          logger:
            updateOcrProgress
        }
      );

    /*
     * 1．半券全体
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
      parseTicketText(
        fullText
      );

    /*
     * 2．日付部分
     */
    progressText.textContent =
      "日付を詳しく読み取っています...";

    const dateImage =
      await cropAndEnhanceImage(
        selectedImage,
        OCR_CROP_SETTINGS.date
      );

    await worker.setParameters({
      tessedit_char_whitelist:
        "0123456789.-/",
      tessedit_pageseg_mode:
        Tesseract.PSM.SINGLE_LINE,
      preserve_interword_spaces:
        "1"
    });

    const dateResult =
      await worker.recognize(
        dateImage
      );

    const dateText =
      dateResult.data.text ?? "";

    const detailedDate =
      extractDate(dateText);

    if (detailedDate) {
      parsed.date =
        detailedDate;
    }

    /*
     * 3．時刻部分
     */
    progressText.textContent =
      "購入時間を詳しく読み取っています...";

    const timeImage =
      await cropAndEnhanceImage(
        selectedImage,
        OCR_CROP_SETTINGS.time
      );

    await worker.setParameters({
      tessedit_char_whitelist:
        "0123456789:",
      tessedit_pageseg_mode:
        Tesseract.PSM.SINGLE_LINE,
      preserve_interword_spaces:
        "1"
    });

    const timeResult =
      await worker.recognize(
        timeImage
      );

    const timeText =
      timeResult.data.text ?? "";

    const detailedTime =
      extractTime(timeText);

    if (
      isValidTime(
        detailedTime
      )
    ) {
      parsed.time =
        detailedTime;
    }

    rawText.textContent = [
      "【半券全体】",
      fullText,
      "",
      "【日付部分】",
      dateText,
      "",
      "【時刻部分】",
      timeText
    ].join("\n");

    /*
     * 日付はOCR成功時のみ上書き。
     * OCR失敗時は現在選択中の日付を維持する。
     */
    if (parsed.date) {
      setDateSelectsFromOcr(
        parsed.date
      );
    }

    numberInput.value =
      parsed.number;

    timeInput.value =
      parsed.time;

    priceInput.value =
      parsed.price;

    updateRefund();

    const missingItems = [];

    if (
      !getSelectedTicketDate()
    ) {
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
      missingItems.push(
        "価格"
      );
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
        )}を選択または修正してください。`,
        true
      );
    }
  } catch (error) {
    console.error(
      "OCR error:",
      error
    );

    showMessage(
      "文字を読み取れませんでした。半券を大きく、明るい場所で撮影してください。",
      true
    );
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch (error) {
        console.error(
          "Worker terminate error:",
          error
        );
      }
    }

    isOcrRunning = false;
    setOcrRunningState(false);
  }
}

function setOcrRunningState(
  running
) {
  ocrButton.disabled =
    running || !selectedImage;

  retakeButton.disabled =
    running;

  saveButton.disabled =
    running;

  startCameraButton.disabled =
    running;

  imageInput.disabled =
    running;

  if (running) {
    progressArea.classList.remove(
      "hidden"
    );

    progressBar.value = 0;

    progressText.textContent =
      "OCRを準備しています...";
  }
}

function updateOcrProgress(
  status
) {
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

/*
 * =========================================================
 * OCR結果解析
 * =========================================================
 */

function parseTicketText(text) {
  const normalized =
    normalizeText(text);

  return {
    date:
      extractDate(
        normalized
      ),

    number:
      extractTicketNumber(
        normalized
      ),

    time:
      extractTime(
        normalized
      ),

    price:
      extractPrice(
        normalized
      )
  };
}

function normalizeText(text) {
  return String(text)
    .replace(/\r/g, "\n")
    .replace(/[：]/g, ":")
    .replace(/[．。]/g, ".")
    .replace(/[，]/g, ",")
    .replace(
      /[０-９]/g,
      convertFullWidthNumber
    )
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function convertFullWidthNumber(
  character
) {
  return String.fromCharCode(
    character.charCodeAt(0) -
    0xFEE0
  );
}

function normalizeNumericCharacters(
  text
) {
  return String(text)
    .replace(
      /[０-９]/g,
      convertFullWidthNumber
    )
    .replace(/[OoＱ〇○]/g, "0")
    .replace(/[Il|｜]/g, "1")
    .replace(/[Zz]/g, "2")
    .replace(/[Ss]/g, "5")
    .replace(/[Bb]/g, "8");
}

/*
 * 日付抽出
 *
 * 対応：
 * 26.07.24
 * 26-07-24
 * 26/07/24
 * 26 07 24
 * 260724
 */
function extractDate(text) {
  const normalized =
    normalizeNumericCharacters(
      text
    )
      .replace(/[．。]/g, ".")
      .replace(/\s+/g, " ")
      .trim();

  const separatedMatch =
    normalized.match(
      /(?:^|[^\d])(\d{2})\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{1,2})(?!\d)/
    );

  if (separatedMatch) {
    return validateAndFormatDateParts(
      separatedMatch[1],
      separatedMatch[2],
      separatedMatch[3]
    );
  }

  const spaceSeparatedMatch =
    normalized.match(
      /(?:^|[^\d])(\d{2})\s+(\d{1,2})\s+(\d{1,2})(?!\d)/
    );

  if (spaceSeparatedMatch) {
    return validateAndFormatDateParts(
      spaceSeparatedMatch[1],
      spaceSeparatedMatch[2],
      spaceSeparatedMatch[3]
    );
  }

  const compactMatch =
    normalized.match(
      /(?:^|[^\d])(\d{6})(?!\d)/
    );

  if (compactMatch) {
    const digits =
      compactMatch[1];

    return validateAndFormatDateParts(
      digits.slice(0, 2),
      digits.slice(2, 4),
      digits.slice(4, 6)
    );
  }

  return "";
}

function validateAndFormatDateParts(
  yearText,
  monthText,
  dayText
) {
  const year =
    Number(yearText);

  const month =
    Number(monthText);

  const day =
    Number(dayText);

  const fullYear =
    2000 + year;

  const date =
    new Date(
      fullYear,
      month - 1,
      day
    );

  if (
    date.getFullYear() !==
      fullYear ||
    date.getMonth() + 1 !==
      month ||
    date.getDate() !==
      day
  ) {
    return "";
  }

  return [
    String(year).padStart(
      2,
      "0"
    ),
    String(month).padStart(
      2,
      "0"
    ),
    String(day).padStart(
      2,
      "0"
    )
  ].join(".");
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

    return [
      match[1].padStart(
        2,
        "0"
      ),
      match[2]
    ].join(":");
  }

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

    return [
      match[1].padStart(
        2,
        "0"
      ),
      match[2]
    ].join(":");
  }

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
    !/^\d{2}:\d{2}$/
      .test(value)
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

  const yenPrices =
    yenMatches
      .map((match) => {
        return Number(
          match[1]
        );
      })
      .filter(
        isLikelyPrice
      );

  if (
    yenPrices.length > 0
  ) {
    return String(
      yenPrices[
        yenPrices.length - 1
      ]
    );
  }

  const numericCandidates = [
    ...normalized.matchAll(
      /(?:^|[^\d])(\d{2,4})(?!\d)/g
    )
  ]
    .map((match) => {
      return Number(
        match[1]
      );
    })
    .filter(
      isLikelyPrice
    );

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
    .map((match) => {
      return match[1];
    })
    .filter((value) => {
      const number =
        Number(value);

      if (
        number < 1 ||
        number > 9999
      ) {
        return false;
      }

      if (
        isLikelyPrice(number)
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
    !/^\d{3,4}$/
      .test(value)
  ) {
    return false;
  }

  const padded =
    value.padStart(4, "0");

  const hour =
    Number(
      padded.slice(0, 2)
    );

  const minute =
    Number(
      padded.slice(2, 4)
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
 * OCR用画像切り出し
 * =========================================================
 */

function cropAndEnhanceImage(
  imageFile,
  settings
) {
  return new Promise(
    (resolve, reject) => {
      const image =
        new Image();

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

          const cropX =
            Math.round(
              sourceWidth *
              settings.leftRatio
            );

          const cropY =
            Math.round(
              sourceHeight *
              settings.topRatio
            );

          const cropWidth =
            Math.round(
              sourceWidth *
              settings.widthRatio
            );

          const cropHeight =
            Math.round(
              sourceHeight *
              settings.heightRatio
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

          canvas.width =
            cropWidth *
            settings.scale;

          canvas.height =
            cropHeight *
            settings.scale;

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
            settings.threshold
          );

          canvas.toBlob(
            (blob) => {
              URL.revokeObjectURL(
                imageUrl
              );

              if (!blob) {
                reject(
                  new Error(
                    "OCR用画像を作成できませんでした。"
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
            "撮影画像を読み込めませんでした。"
          )
        );
      };

      image.src = imageUrl;
    }
  );
}

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
      130,
      Math.min(
        215,
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
 * 還元額
 * =========================================================
 */

priceInput.addEventListener(
  "input",
  updateRefund
);

function updateRefund() {
  const price =
    Number(
      priceInput.value
    );

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

/*
 * =========================================================
 * 保存用画像
 * =========================================================
 */

function createStoredTicketImage(
  imageFile
) {
  return new Promise(
    (resolve, reject) => {
      const image =
        new Image();

      const imageUrl =
        URL.createObjectURL(
          imageFile
        );

      image.onload = () => {
        try {
          const maxSize =
            1400;

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
            canvas.getContext(
              "2d"
            );

          if (!context) {
            throw new Error(
              "画像を保存できません。"
            );
          }

          canvas.width =
            width;

          canvas.height =
            height;

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
              0.78
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
              .contains(
                STORE_NAME
              )
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
 * 半券登録
 * =========================================================
 */

saveButton.addEventListener(
  "click",
  saveTicketRecord
);

async function saveTicketRecord() {
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
    Number(
      priceInput.value
    );

  const record = {
    id:
      createRecordId(),

    department,

    employeeName,

    date:
      getSelectedTicketDate(),

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
    validateRecord(
      record
    );

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
          existingRecord.date ===
            record.date &&
          existingRecord.number ===
            record.number &&
          existingRecord.time ===
            record.time &&
          existingRecord.price ===
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
    saveButton.disabled =
      true;

    showMessage(
      "半券画像を保存しています。"
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

    /*
     * 所属・氏名・日付は残す。
     */
    clearTicketResultFields();
    resetCapturedImage();

    showMessage(
      "半券画像を含めて登録しました。"
    );
  } catch (error) {
    console.error(
      "Save error:",
      error
    );

    showMessage(
      "データを保存できませんでした。端末の空き容量を確認してください。",
      true
    );
  } finally {
    saveButton.disabled =
      false;
  }
}

function validateRecord(record) {
  if (!record.date) {
    return "購入日を選択してください。";
  }

  if (
    !/^\d{2}\.\d{2}\.\d{2}$/
      .test(record.date)
  ) {
    return "購入日を正しく選択してください。";
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
    const row =
      document.createElement(
        "tr"
      );

    const cell =
      document.createElement(
        "td"
      );

    cell.colSpan = 9;

    cell.textContent =
      "登録された半券はありません。";

    row.appendChild(cell);
    historyBody.appendChild(row);

    return;
  }

  records.forEach((record) => {
    const row =
      document.createElement(
        "tr"
      );

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
  });
}

function createTableCell(value) {
  const cell =
    document.createElement(
      "td"
    );

  cell.textContent =
    String(value ?? "");

  return cell;
}

/*
 * =========================================================
 * 画像拡大
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

  document.body.classList.add(
    "modal-open"
  );

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

  document.body.classList.remove(
    "modal-open"
  );
}

closeImageModalButton.addEventListener(
  "click",
  closeTicketImageModal
);

imageModal.addEventListener(
  "click",
  (event) => {
    if (
      event.target ===
      imageModal
    ) {
      closeTicketImageModal();
    }
  }
);

document.addEventListener(
  "keydown",
  (event) => {
    if (
      event.key ===
        "Escape" &&
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
  exportCsv
);

function exportCsv() {
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
    records.map((record) => {
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
    });

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

  window.setTimeout(
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

function escapeCsvValue(value) {
  const stringValue =
    String(value ?? "");

  return `"${stringValue.replaceAll(
    '"',
    '""'
  )}"`;
}

function createCsvFileName() {
  const now =
    new Date();

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

function formatRegisteredAt(value) {
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
 * 画面リセット
 * =========================================================
 */

function clearTicketResultFields() {
  numberInput.value = "";
  timeInput.value = "";
  priceInput.value = "";

  refundAmount.textContent =
    "0";

  rawText.textContent = "";

  progressArea.classList.add(
    "hidden"
  );

  progressBar.value = 0;
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
 * ページ終了・非表示時
 * =========================================================
 */

window.addEventListener(
  "beforeunload",
  stopCamera
);

document.addEventListener(
  "visibilitychange",
  () => {
    if (
      document.hidden &&
      isCameraRunning
    ) {
      stopCamera();
    }
  }
);

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
 * 初期化
 * =========================================================
 */

async function initializeApplication() {
  initializeYearOptions();
  setTodayAsDefaultDate();
  loadApplicantInformation();

  ocrButton.disabled = true;

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
