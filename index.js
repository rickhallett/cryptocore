import fs from 'fs';
import Binance from 'node-binance-api';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { create, all } from 'mathjs';
import winston from 'winston';
import { EventEmitter } from 'events';

dotenv.config();

const blue = chalk.blue;
const orange = chalk.keyword('orange');

const { format } = winston;
const { combine, timestamp, label, printf } = format;

const myFormat = printf(({ level, message, label, timestamp }) => {
  return `${timestamp} [${label}] ${level}: ${message}`;
});

const logger = winston.createLogger({
  level: 'info',
  format: combine(label({ label: 'sys:' }), timestamp(), myFormat),
  defaultMeta: { service: 'user-service' },
  transports: [
    new winston.transports.File({
      filename: './logs/error.log',
      level: 'error',
    }),
    new winston.transports.File({ filename: './logs/combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    })
  );
}

const bProxy = new Binance().options({
  APIKEY: process.env.APIKEY,
  APISECRET: process.env.APISECRET,
  useServerTime: true,
  recvWindow: 60000,
  verbose: false,
});

const mathx = create(all);
mathx.config({ number: 'BigNumber', precision: 64 });

const eventBus = new EventEmitter();

const cacheTickers = async () => {
  let ticker;

  try {
    ticker = JSON.parse(fs.readFileSync('./cache/ticker.json').toString());
    logger.info('Retrieved tickers from cache');
  } catch (error) {
    handleError(error);
    logger.error(error);
    if (error.message.substring(0, 6) === 'ENOENT') {
      logger.info('No cache. Retrieving from API.');
    }
  }

  if (!ticker) {
    try {
      ticker = await bProxy.prices();
      logger.info('Retrieved tickers from API');
    } catch (error) {
      handleError(error);
      logger.error(error);
    }
  }

  fs.writeFileSync('./cache/ticker.json', JSON.stringify(ticker));
  return ticker;
};

const retrieveShibCache = () => {
  const ticker = JSON.parse(fs.readFileSync('./cache/ticker.json').toString());
  let shibPairs = [];
  for (const coinPair in ticker) {
    if (Object.hasOwnProperty.call(ticker, coinPair)) {
      if (coinPair.includes('SHIB') && !coinPair.includes('SUSHI')) {
        shibPairs.push({ coinPair, rate: ticker[coinPair] });
      }
    }
  }
  return shibPairs;
};

const getLatestSymbolRate = async (symbol) => {
  let ticker;

  try {
    ticker = JSON.parse(
      fs.readFileSync(`./cache/latest-${symbol}.json`).toString()
    );
    logger.info(`\nRetrieved ${symbol} from cache`);
  } catch (error) {
    handleError(error);
    logger.error(error);
    if (error.message.substring(0, 6) === 'ENOENT') {
      logger.info('No cache. Retrieving from API.');
    }
  }

  if (!ticker) {
    try {
      logger.info(`\nRetrieving latest price for ${symbol}...`);
      ticker = await bProxy.prices(symbol);
      logger.info(`Price of ${symbol}:`, ticker[symbol]);
      fs.writeFileSync(`./cache/latest-${symbol}.json`, JSON.stringify(ticker));
    } catch (error) {
      handleError(error);
      logger.error(error);
    }
  }

  return {
    symbol,
    price: ticker[symbol],
  };
};

const getCurrentBalances = async () => {
  await bProxy.useServerTime();
  let balances;
  try {
    logger.info('Retrieving latest balances from api...');
    balances = await bProxy.balance();
    fs.writeFileSync('./cache/balances.json', JSON.stringify(balances));
    fs.writeFileSync(
      './cache/shib-balances.json',
      JSON.stringify(balances.SHIB)
    );
    logger.info(`SHIB balance: ${balances.SHIB.available}`);
    return balances;
  } catch (error) {
    handleError(error);
    logger.error(error);
  }
};

class Scheduler {
  constructor(symbol) {
    this.symbol = symbol;
    this.positions = [];
  }

  addPostion(position) {
    this.positions.push({
      price: position.price,
      date: position.date,
      rDate: position.readableDate,
    });
  }
}
class Position {
  constructor({ symbol, price, qty }) {
    this.symbol = symbol;
    this.price = price || 0;
    this.qty = qty || 0;
    this.date = Date.now();
    this.readableDate = Date(this.date);
  }

  calculateDiff(curprice) {
    return mathx.divide(mathx.bignumber(curprice), this.price).multiply(100);
  }

  buy(qty) {
    bProxy.marketBuy(this.symbol, qty);
  }

  sell(qty) {
    bProxy.marketSell(this.symbol, qty);
  }
}

const cachers = async () => {
  await cacheTickers();
  const shibCache = retrieveShibCache();
};

const getBalances = async () => {
  const balances = await getCurrentBalances();
  logger.info(`GBP balances: ${balances.GBP}`);
  logger.info(`USDT balances: ${balances.USDT}`);
  logger.info(`SHIB balances: ${balances.SHIB}`);
  return balances;
};

const tickerInterval = async (symbol, positions) => {
  const stopInterval = (i, cnxToken) => {
    if (i > 3) {
      clearInterval(cnxToken);
      eventBus.emit('INTERVAL_COMPLETE', positions);
    }
  };

  let i = 0;
  const cnxToken = setInterval(async () => {
    logger.info('Getting latest SHIB...');
    const posLatest = new Position(await getLatestSymbolRate('SHIBUSDT'));
    positions.addPostion(posLatest);
    logger.info(`added latest position: ${posLatest.symbol}`);
    stopInterval(i++, cnxToken, positions);
  }, 60000);
};

const main = async () => {
  const scheduler = new Scheduler();

  tickerInterval('SHIBUSDT', scheduler);
  // logger.info({ scheduler: JSON.stringify(scheduler) });
};

eventBus.on('INTERVAL_COMPLETE', (scheduler) => {
  fs.writeFileSync(
    './cache/shib-positions.json',
    JSON.stringify(scheduler.positions)
  );
  logger.info(`Added ${scheduler.positions} to scheduler`);
});

const handleError = (error) => {
  console.error(error);
};

main();

/**
 * Pseudo
 *
 * get new pos
 * check perc diff from last pos
 *
 * If  number  rises  10%  from  last low BUY
 * If  number  falls  7.5%  from  last  high  SELL
 * If number falls 5% below buy value SELL
 */
