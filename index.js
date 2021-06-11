import fs from "fs";
import Binance from "node-binance-api";
import dotenv from "dotenv";

dotenv.config();

const bProxy = new Binance().options({
  APIKEY: dotenv.parse('APIKEY'),
  APISECRET: dotenv.parse('APISECRET'),
  verbose: true,
});

// TODO: automate: if cache file, retrieve cache. If no file, hit api and create file.
const cacheTickers = async () => {
  let ticker;
  try {
    ticker = await bProxy.prices();
  } catch (error) {
    console.error(error);
  }
  
  let btcTicker = Object.keys(ticker).filter((label) => label.includes('BTC'));
  let ethTicker = Object.keys(ticker).filter((label) => label.includes('ETH'));
  let dogeTicker = Object.keys(ticker).filter((label) => label.includes('DOGE'));
  let shibTicker = Object.keys(ticker).filter((label) => label.includes('SHIB'));

  fs.writeFileSync('./cache/ticker-labels.json', JSON.stringify(Object.keys(ticker)));
  fs.writeFileSync("./cache/ticker.json", JSON.stringify(ticker));
  fs.writeFileSync("./cache/btc-ticker.json", JSON.stringify(btcTicker));
  fs.writeFileSync("./cache/eth-ticker.json", JSON.stringify(ethTicker));
  fs.writeFileSync("./cache/doge-ticker.json", JSON.stringify(dogeTicker));
  fs.writeFileSync("./cache/shib-ticker.json", JSON.stringify(shibTicker));
};

// cacheTickers();

const retrieveShibCache = () => {
  const ticker = JSON.parse(fs.readFileSync('./cache/ticker.json').toString());
  let shibPairs = [];
  for (const coinPair in ticker) {
    if (Object.hasOwnProperty.call(ticker, coinPair)) {
      if(coinPair.includes('SHIB') && !coinPair.includes('SUSHI')) {
        shibPairs.push({coinPair, rate: ticker[coinPair]})
      }
    }
  }
  return shibPairs;
}

const shibCache = retrieveShibCache();
console.log(shibCache);