import yahooFinanceDefault from 'yahoo-finance2';
const YahooFinance = yahooFinanceDefault.default ?? yahooFinanceDefault;

const yf = new YahooFinance();
const results = await yf.historical('PLTR', {
  period1: '2023-01-01',
  period2: '2026-08-19',
  interval: '1d',
});

results.forEach(d => {
  const date = d.date.toISOString().slice(0, 10);
  const close = d.close ? d.close.toFixed(2) : null;
  if (close) process.stdout.write(`${date},${close}\n`);
});

process.stderr.write(`Total: ${results.length} rows\n`);
