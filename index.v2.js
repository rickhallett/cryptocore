import fs from 'fs';
import Binance from 'node-binance-api';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { create, all } from 'mathjs';
import winston from 'winston';
import { EventEmitter } from 'events';

dotenv.config();

const { format } = winston;
const { combine, timestamp, label, printf } = format;

const myFormat = printf(({ level, message, label, timestamp }) => {
  return `${timestamp} [${label}] ${level}: ${message}`;
});

const logger = winston.createLogger({
  level: 'info',
  format: combine(label({ label: 'sys:' }), timestamp(), myFormat),
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
  recvWindow: 6000,
  verbose: false,
});

bProxy.useServerTime();

const mathx = create(all);
mathx.config({ number: 'BigNumber', precision: 64 });

const eventBus = new EventEmitter();

const catchError = async (fn) => {
  let rtn;
  try {
    rtn = await fn();
  } catch (error) {
    handleError(error);
  }
  return rtn;
};

const getLatestSymbolRate = async (symbol) => {
  let ticker;
  try {
    ticker = await bProxy.prices(symbol);
  } catch (error) {
    handleError(error);
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
  } catch (error) {
    handleError(error);
  }
  return balances;
};

const getCurrentBalance = async (symbol) => {
  let balances = await bProxy.balance();
  return balances[symbol];
};

class Scheduler {
  constructor(symbol) {
    this.symbol = symbol;
    this.positions = [];
    this.samplers = [];
    this.buy(1); //init purchase
  }

  addPostion(position) {
    this.positions.push({
      price: position.price,
      qty: position.qty,
      date: position.date,
    });
  }

  addSample(sample) {
    this.samplers.push(sample);
  }

  getLastPosition() {
    return this.positions[this.positions.length - 1];
  }

  getLastHigh() {
    const highIdx = this.samplers.indexOf(
      Math.max(this.samplers.map((s) => s.price))
    );
    return this.samplers[highIdx];
  }

  getLastLow() {
    const lowIdx = this.samplers.indexOf(
      Math.max(this.samplers.map((s) => s.price))
    );
    return this.samplers[lowIdx];
  }

  async getBalance() {
    return await catchError(getCurrentBalance.bind(this, this.symbol));
  }

  async getTradeHistory() {
    const trades = await bProxy.trades(this.symbol);
    console.log({ trades });
  }

  async actionPriceDiff() {
    const curPrice = await getLatestSymbolRate(this.symbol);
    this.addSample(new Sample(curPrice));
    const lastPos = this.getLastPosition();
    const lastHigh = this.getLastHigh();
    const lastLow = this.getLastLow();

    if (lastHigh.calculateDiff(curPrice) >= 10) {
      this.buy(1, curPrice);
    }

    if (lastLow.calculateDiff(curPrice) <= -7.5) {
      this.sell(1, curPrice);
    }

    if (lastPos.calculateDiff(curPrice) <= -5) {
      this.sell(1, curPrice);
    }
  }

  async buy(qty, currPrice) {
    try {
      bProxy.marketBuy(this.symbol, qty);
    } catch (error) {
      handleError(error);
    }
    this.addPostion(
      new Position({ symbol: this.symbol, price: currPrice, qty })
    );
    console.log(await this.getBalance());
  }

  async sell(qty, currPrice) {
    bProxy.marketSell(this.symbol, qty);
    console.log(await this.getBalance());
  }
}

class MarketPoint {
  constructor({ symbol, price }) {
    this.symbol = symbol;
    this.price = price || 0;
    this.date = Date.now();
  }

  calculateDiff(curprice) {
    return mathx
      .divide(mathx.bignumber(curprice), this.price)
      .multiply(100)
      .subtract(100);
  }
}

class Sample extends MarketPoint {
  constructor({ symbol, price }) {
    super({ symbol, price });
  }
}

class Position extends MarketPoint {
  constructor({ symbol, price, qty }) {
    super({ symbol, price });
    this.qty = qty || 0;
  }
}

const getBalances = async () => {
  const balances = await getCurrentBalances();
  console.info('GBP', balances.GBP);
  console.info('USDT', balances.USDT);
  console.info('SHIB', balances.SHIB);
  return balances;
};

const runScheduler = async (scheduler, iterations, asyncCallback) => {
  const stopInterval = (i, cnxToken) => {
    if (i > iterations) {
      clearInterval(cnxToken);
      eventBus.emit('INTERVAL_COMPLETE', scheduler);
    }
  };

  let i = 0;
  const cnxToken = setInterval(async () => {
    await asyncCallback(scheduler);
    getBalances();
    stopInterval(i++, cnxToken);
  }, 60000);
};

const testMarketActions = async (scheduler) => {};

const main = async () => {
  const scheduler = new Scheduler('SHIBUSDT');

  runScheduler(scheduler, 3, testMarketActions);
};

eventBus.on('INTERVAL_COMPLETE', (scheduler) => {
  fs.writeFileSync(
    './cache/shib-positions.json',
    JSON.stringify(scheduler.positions)
  );
});

const handleError = (error) => {
  console.error(error);
};

// main();
// getBalances();

(async () => {
  // let res;
  // try {
  //   bProxy.useServerTime();
  //   res = await bProxy.marketBuy('SHIBUSDT', 1);
  // } catch (error) {
  //   console.error(error);
  // }
  // console.log({ res });
  const t = Date.now();

  bProxy.time().then((res) => {
    console.log(t - res.serverTime);
  });

  // console.log('server time');

  // bProxy.marketBuy('SHIBUSDT', 1, (error, response) => {
  //   console.error(error);
  //   console.info('Market Buy response', response);
  //   console.info('order id: ' + response.orderId);
  //   // Now you can limit sell with a stop loss, etc.
  // });
})();

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
