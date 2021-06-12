import fs from 'fs';
import Binance from 'node-binance-api';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { create, all } from 'mathjs';
import winston from 'winston';

dotenv.config();

const blue = chalk.blue;
const orange = chalk.keyword('orange');

// console.info({ env: process.env });

// const winston = require('winston');

const { format } = winston;
const { combine, timestamp, label, printf } = format;

const myFormat = printf(({ level, message, label, timestamp }) => {
  return `${timestamp} [${label}] ${level}: ${message}`;
});

const logger = winston.createLogger({
  level: 'info',
  // format: winston.format.json(),
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

// if (process.env.NODE_ENV !== 'production') {
//   logger.add(
//     new winston.transports.Console({
//       format: winston.format.simple(),
//     })
//   );
// }

const bProxy = new Binance().options({
  APIKEY: process.env.APIKEY,
  APISECRET: process.env.APISECRET,
  useServerTime: true,
  recvWindow: 60000,
  verbose: false,
});

bProxy.useServerTime();

// console.info({ bProxy });

const mathx = create(all);
mathx.config({ number: 'BigNumber', precision: 64 });

const cacheTickers = async () => {
  let ticker;

  try {
    ticker = JSON.parse(fs.readFileSync('./cache/ticker.json').toString());
    console.log('hit');
    // logger.log(blue('Retrieved tickers from cache'));
    logger.info('Retrieved tickers from cache');
    logger.error('Retrieved tickers from cache');
  } catch (error) {
    // console.error(error.message);
    if (error.message.substring(0, 6) === 'ENOENT') {
      // console.log(orange('No cache. Retrieving from API.'));
    }
  }

  if (!ticker) {
    try {
      ticker = await bProxy.prices();
      // console.log(blue('Retrieved tickers from API'));
    } catch (error) {
      // console.error(error);
    }
  }

  fs.writeFileSync('./cache/ticker.json', JSON.stringify(ticker));
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
    // console.log(blue(`\nRetrieved ${symbol} from cache`));
  } catch (error) {
    // console.error(error.message);
    if (error.message.substring(0, 6) === 'ENOENT') {
      // console.log(orange('No cache. Retrieving from API.'));
    }
  }

  if (!ticker) {
    try {
      // console.log(orange(`\nRetrieving latest price for ${symbol}...`));
      ticker = await bProxy.prices(symbol);
      // console.info(`Price of ${symbol}:`, ticker[symbol]);
      fs.writeFileSync(`./cache/latest-${symbol}.json`, JSON.stringify(ticker));
    } catch (error) {
      // console.error(error);
    }
  }

  return {
    symbol,
    price: ticker[symbol],
  };
};

const getCurrentBalances = async () => {
  let balances;
  try {
    balances = await bProxy.balance();
    // console.info('balances()', balances);
    // console.info('ETH balance: ', balances.ETH.available);
  } catch (error) {
    // console.error(error);
  }

  bProxy.balance((error, balances) => {
    // if (error) return console.error(error);

    balances = balances;

    // console.info('balances()', balances);
    // console.info('BNB balance 2: ', balances.BNB.available);

    return balances;
  });
};

class Scheduler {
  constructor() {
    this.positions = {};
  }

  addPostion(position) {
    this.positions[position.symbol] = {
      price: position.price,
      date: position.date,
      rDate: position.readableDate,
    };
  }
}
class Position {
  constructor({ symbol, price }) {
    this.symbol = symbol;
    this.price = mathx.bignumber(price || 0);
    this.date = Date.now();
    this.readableDate = Date(this.date);
  }

  calculateDiff(curprice) {
    return mathx.divide(mathx.bignumber(curprice), this.price).multiply(100);
  }

  buy() {}

  sell() {}
}

const main = async () => {
  const positions = new Scheduler();
  await cacheTickers();
  const shibCache = retrieveShibCache();
  // console.log({ shibCache });
  const shibLatest = new Position(await getLatestSymbolRate('SHIBUSDT'));
  // console.log({ shibLatest });
  positions.addPostion(shibLatest);
  // console.log({ positions: JSON.stringify(positions) });
  await getCurrentBalances();
};

main();
