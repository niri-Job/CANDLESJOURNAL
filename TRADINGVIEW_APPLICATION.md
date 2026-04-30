# TradingView Charting Library — Application Notes

## Current Integration

CandlesJournal currently uses the **TradingView free widget** (`tv.js` embedded via script tag), which provides:
- Live price charts for forex, crypto, indices, and commodities
- Symbol switching and interval selection
- `onChartReady` callback for post-load actions
- `chart().setVisibleRange({ from, to })` — used to jump to a trade's date when a trade is clicked in the trade panel

## Applying for the Charting Library

The **TradingView Advanced Charting Library** (formerly "Charting Library") unlocks:
- Drawing tools (entry/exit lines, SL/TP levels, rectangles)
- Market Replay / Bar Replay
- Custom studies and indicators
- Full trade overlay API

### How to Apply

1. Visit https://www.tradingview.com/HTML5-stock-forex-bitcoin-charting-library/
2. Click **"Get Library"** and fill in the application form
3. Describe the use case: *"Forex trade journaling app — overlay entry/exit/SL/TP lines on historical bars, market replay for trade review"*
4. Once approved, TradingView emails access to the private GitHub repo (`tradingview/charting_library`)

### Integration Plan (post-approval)

1. Clone the library into `public/charting_library/`
2. Replace the `<Script src="https://s3.tradingview.com/tv.js">` embed with the local bundle
3. Replace `new (window as any).TradingView.widget(...)` with `new TradingView.widget(...)` using the full config
4. Use `chart.createShape()` / `chart.createOrderLine()` to render entry, exit, SL, TP lines
5. Use `chart.replayBegin(timestamp)` for Market Replay

## Data Feed

The Charting Library requires a **UDF-compatible data feed** (or JS datafeed object) to supply OHLCV bars. Options:
- **Broker datafeed**: Wrap MT5 exported data as a local UDF server
- **Third-party**: Polygon.io, Twelve Data, Alpha Vantage (all support UDF format)
- **Direct**: Implement `IBrokerConnectionAdapterHost` if connecting a live broker

## Current Limitations (free widget)

| Feature | Free Widget | Charting Library |
|---|---|---|
| Jump to date | ✅ via `setVisibleRange` | ✅ native |
| Entry/Exit lines | ❌ | ✅ `createOrderLine` |
| SL/TP levels | ❌ | ✅ `createShape` |
| Market Replay | ❌ | ✅ `replayBegin` |
| Custom studies | ❌ | ✅ |
| Save/load layouts | ❌ | ✅ |
