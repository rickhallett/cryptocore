import fs from 'fs';
import Binance from 'node-binance-api';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { create, all } from 'mathjs';
import { bignumber } from 'mathjs';

dotenv.config();

const blue = chalk.blue;
const orange = chalk.keyword('orange');

const bProxy = new Binance().options({
  APIKEY: dotenv.parse('APIKEY'),
  APISECRET: dotenv.parse('APISECRET'),
  verbose: true,
});

const mathx = create(all);
mathx.config({ number: 'BigNumber', precision: 64 });

const cacheTickers = async () => {
  let ticker;

  try {
    ticker = JSON.parse(fs.readFileSync('./cache/ticker.json').toString());
    console.log(blue('Retrieved tickers from cache'));
  } catch (error) {
    console.error(error.message);
    if (error.message.substring(0, 6) === 'ENOENT') {
      console.log(orange('No cache. Retrieving from API.'));
    }
  }

  if (!ticker) {
    try {
      ticker = await bProxy.prices();
      console.log(blue('Retrieved tickers from API'));
    } catch (error) {
      console.error(error);
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
  console.log(orange(`Retrieving latest price for ${symbol}...`));
  let ticker;
  try {
    ticker = await bProxy.prices(symbol);
    console.info(`Price of ${symbol}:`, ticker[symbol]);
  } catch (error) {
    console.error(error);
  }
  return {
    symbol,
    price: ticker[symbol],
  };
};
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
  await cacheTickers();
  const shibCache = retrieveShibCache();
  console.log({ shibCache });
  const shibLatest = new Position(await getLatestSymbolRate('SHIBUSDT'));
  console.log({ shibLatest });
};

main();
