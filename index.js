import fs from 'fs';
import Binance from 'node-binance-api';
import dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

const blue = chalk.blue;
const orange = chalk.keyword('orange');

const bProxy = new Binance().options({
  APIKEY: dotenv.parse('APIKEY'),
  APISECRET: dotenv.parse('APISECRET'),
  verbose: true,
});

// TODO: automate: if cache file, retrieve cache. If no file, hit api and create file.
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

const main = async () => {
  await cacheTickers();
  const shibCache = retrieveShibCache();
  console.log({ shibCache });
};

main();
