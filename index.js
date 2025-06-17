// 📦 Dependencies: axios, dotenv, node-cron
// Install: npm i axios dotenv node-cron

require('dotenv').config();
const axios = require('axios');
const cron = require('node-cron');

const API_KEY = process.env.API_KEY;
const CHAT_ID = process.env.CHAT_ID;
const BOT_TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

const FOREX_PAIRS = [
  "AUDCAD", "AUDCHF", "AUDJPY", "AUDNZD", "AUDUSD",
  "CADCHF", "CADJPY", "CHFJPY", "EURAUD", "EURCAD",
  "EURCHF", "EURGBP", "EURJPY", "EURNZD", "EURUSD",
  "GBPAUD", "GBPCAD", "GBPCHF", "GBPJPY", "GBPNZD",
  "GBPUSD", "NZDCAD", "NZDCHF", "NZDJPY", "NZDUSD",
  "USDCAD", "USDCHF", "USDJPY"
];

const ZONES = [10, 20, 30, 80, 90, 100];
const MAX_DAILY_ALERTS = parseInt(process.env.MAX_DAILY_ALERTS) || 800;
let alertCount = 0;

function getISTTime() {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

async function sendTelegram(msg) {
  if (alertCount >= MAX_DAILY_ALERTS) return;
  await axios.post(TELEGRAM_API, {
    chat_id: CHAT_ID,
    text: msg,
    parse_mode: 'Markdown'
  });
  alertCount++;
}

async function getRSI(symbol) {
  const url = `https://api.twelvedata.com/rsi?symbol=${symbol}&interval=1h&time_period=1&series_type=close&apikey=${API_KEY}`;
  try {
    const res = await axios.get(url);
    const rsi = parseFloat(res.data.values?.[0]?.rsi);
    return isNaN(rsi) ? null : rsi;
  } catch (err) {
    return null;
  }
}

async function getIchimoku(symbol) {
  const url = `https://api.twelvedata.com/ichimoku?symbol=${symbol}&interval=1h&tenkan=2&kijun=2&senkou_b=52&apikey=${API_KEY}`;
  try {
    const res = await axios.get(url);
    return res.data.values?.[0] || null;
  } catch (err) {
    return null;
  }
}

async function getEMA(symbol) {
  const url = `https://api.twelvedata.com/ema?symbol=${symbol}&interval=1h&time_period=26&series_type=close&apikey=${API_KEY}`;
  try {
    const res = await axios.get(url);
    return parseFloat(res.data.values?.[0]?.ema) || null;
  } catch (err) {
    return null;
  }
}

async function checkAndAlert(pair) {
  const rsi = await getRSI(pair);
  const ichimoku = await getIchimoku(pair);
  const ema = await getEMA(pair);

  if (rsi === null || !ichimoku || ema === null) return;

  let msg = `📊 *Indicators for ${pair}*\n` +
    `*RSI:* ${rsi.toFixed(2)}\n` +
    `*EMA (26):* ${ema.toFixed(2)}\n` +
    `*Tenkan-sen:* ${ichimoku.tenkan_sen}\n` +
    `*Kijun-sen:* ${ichimoku.kijun_sen}\n` +
    `*Senkou Span B:* ${ichimoku.senkou_span_b}\n` +
    `🕒 ${getISTTime()}`;

  if (rsi < 30 || rsi > 70) {
    msg = `⚠️ *RSI Alert* for *${pair}*\n` +
      `RSI: *${rsi.toFixed(2)}*\n` +
      `🕒 ${getISTTime()}`;
  }

  await sendTelegram(msg);
}

async function checkZones(pair) {
  const rsi = await getRSI(pair);
  if (rsi === null) return;

  for (let zone of ZONES) {
    if (Math.floor(rsi) === zone) {
      await sendTelegram(`🔔 *RSI Zone Triggered* for *${pair}*\nRSI: *${rsi.toFixed(2)}* near *${zone}*\n🕒 ${getISTTime()}`);
      break;
    }
  }
}

function resetAlertCountDaily() {
  const now = new Date();
  if (now.getHours() === 0 && now.getMinutes() === 0) {
    alertCount = 0;
  }
}

// 🔁 Every hour — Normal RSI check (Monday to Friday only)
cron.schedule('0 * * * 1-5', async () => {
  for (const pair of FOREX_PAIRS) {
    await checkAndAlert(pair);
  }
});

// 🔁 Every 6 hours — Zone check (Monday to Friday only)
cron.schedule('0 */6 * * 1-5', async () => {
  for (const pair of FOREX_PAIRS) {
    await checkZones(pair);
  }
});

// 🔁 Reset alert count at midnight (Monday to Friday only)
cron.schedule('0 0 * * 1-5', () => {
  alertCount = 0;
});

// 🚀 On Server Start
(async () => {
  await sendTelegram(`🚀 RSI Alert Bot Started Successfully!\n\n🕒 Time: ${getISTTime()}`);
  for (const pair of FOREX_PAIRS) {
    await checkAndAlert(pair);
  }
})();