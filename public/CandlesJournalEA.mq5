//+------------------------------------------------------------------+
//|                                       CandlesJournalEA.mq5      |
//|          Automatically syncs closed trades to CandlesJournal     |
//+------------------------------------------------------------------+
//
// HOW TO INSTALL:
// 1. Copy this file to your MT5 data folder:
//       File → Open Data Folder → MQL5 → Experts
// 2. Open MetaEditor: press F4 inside MT5 (or Tools → MetaEditor)
// 3. In MetaEditor: File → Open → find CandlesJournalEA.mq5
// 4. Press F5 (or Build → Compile) — must show "0 errors, 0 warnings"
// 5. Back in MT5 Navigator: right-click Experts → Refresh
// 6. Drag CandlesJournalEA onto any chart (e.g. EURUSD H1)
// 7. In the EA Inputs tab paste your Sync Token from the Settings page
// 8. Enable "Allow Algo Trading" (green button in MT5 toolbar)
// 9. Watch the Experts tab at the bottom for confirmation messages
//
#property copyright "CandlesJournal"
#property version   "1.07"
#property description "Syncs every closed trade to your CandlesJournal automatically."

input string InpSyncToken = "";                                                                   // Sync Token  (paste from Settings page)
input string InpServerURL = "https://symphonious-lily-0d7ae0.netlify.app/api/mt5/sync";           // Sync URL    (pre-filled for your live app)

#define GV_LAST_TICKET "CJ_LAST_TICKET"

//+------------------------------------------------------------------+
//  Persistence helpers
//+------------------------------------------------------------------+
ulong GetLastSyncedTicket()
{
   if(GlobalVariableCheck(GV_LAST_TICKET))
      return (ulong)GlobalVariableGet(GV_LAST_TICKET);
   return 0;
}

void SetLastSyncedTicket(ulong ticket)
{
   GlobalVariableSet(GV_LAST_TICKET, (double)ticket);
}

//+------------------------------------------------------------------+
//  StripSuffix — removes broker-specific suffixes from symbol names
//
//  Handles all common formats:
//    BTCUSDm   → BTCUSD   (Exness: trailing lowercase letters)
//    EURUSD.r  → EURUSD   (ICMarkets: dot + extension)
//    EURUSD.pro→ EURUSD   (dot + word)
//    EURUSD_raw→ EURUSD   (underscore + word)
//    XAUUSDm   → XAUUSD
//    GBPJPYm   → GBPJPY
//+------------------------------------------------------------------+
string StripSuffix(string raw)
{
   string s = raw;

   // Remove everything from '.' onwards  (.r, .pro, .ecn, .mt5, etc.)
   int dotPos = StringFind(s, ".");
   if(dotPos >= 0)
      s = StringSubstr(s, 0, dotPos);

   // Remove everything from '_' onwards  (_raw, _pro, _SB, etc.)
   int underPos = StringFind(s, "_");
   if(underPos >= 0)
      s = StringSubstr(s, 0, underPos);

   // Strip trailing lowercase letters  (m, mt, pro → gone; uppercase safe)
   int len = StringLen(s);
   while(len > 0)
   {
      ushort ch = StringGetCharacter(s, len - 1);
      if(ch >= 'a' && ch <= 'z')
         len--;
      else
         break;
   }
   return StringSubstr(s, 0, len);
}

//+------------------------------------------------------------------+
//  DetectAssetClass — works on the STRIPPED symbol
//+------------------------------------------------------------------+
string DetectAssetClass(string stripped)
{
   string s = stripped;
   StringToUpper(s);

   // Crypto
   if(StringFind(s,"BTC")  >= 0 || StringFind(s,"ETH")  >= 0 || StringFind(s,"XRP")  >= 0 ||
      StringFind(s,"BNB")  >= 0 || StringFind(s,"SOL")  >= 0 || StringFind(s,"DOGE") >= 0 ||
      StringFind(s,"ADA")  >= 0 || StringFind(s,"LTC")  >= 0 || StringFind(s,"LINK") >= 0 ||
      StringFind(s,"DOT")  >= 0 || StringFind(s,"AVAX") >= 0 || StringFind(s,"MATIC")>= 0 ||
      StringFind(s,"UNI")  >= 0 || StringFind(s,"ATOM") >= 0 || StringFind(s,"TRX")  >= 0)
      return "Crypto";

   // Metals / Commodities
   if(StringFind(s,"XAU")   >= 0 || StringFind(s,"XAG")   >= 0 || StringFind(s,"GOLD")  >= 0 ||
      StringFind(s,"SILVER")>= 0 || StringFind(s,"OIL")   >= 0 || StringFind(s,"WTI")   >= 0 ||
      StringFind(s,"BRENT") >= 0 || StringFind(s,"USOIL") >= 0 || StringFind(s,"UKOIL") >= 0 ||
      StringFind(s,"NGAS")  >= 0 || StringFind(s,"COPPER")>= 0 || StringFind(s,"XPTUSD")>= 0)
      return "Metals";

   // Indices
   if(StringFind(s,"SPX")   >= 0 || StringFind(s,"SP500") >= 0 || StringFind(s,"NAS")   >= 0 ||
      StringFind(s,"NDX")   >= 0 || StringFind(s,"US30")  >= 0 || StringFind(s,"DJ30")  >= 0 ||
      StringFind(s,"DAX")   >= 0 || StringFind(s,"FTSE")  >= 0 || StringFind(s,"CAC")   >= 0 ||
      StringFind(s,"UK100") >= 0 || StringFind(s,"GER")   >= 0 || StringFind(s,"AUS200")>= 0 ||
      StringFind(s,"JP225") >= 0 || StringFind(s,"HK50")  >= 0 || StringFind(s,"US500") >= 0 ||
      StringFind(s,"US100") >= 0 || StringFind(s,"VIX")   >= 0 || StringFind(s,"CHINA") >= 0)
      return "Indices";

   return "Forex";
}

//+------------------------------------------------------------------+
//  SafeDouble — locale-independent number → JSON string
//  DoubleToString always uses a period regardless of system locale.
//+------------------------------------------------------------------+
string SafeDouble(double value, int digits)
{
   return DoubleToString(NormalizeDouble(value, digits), digits);
}

//+------------------------------------------------------------------+
//  PostJSON — send a JSON string via WebRequest and return HTTP code
//+------------------------------------------------------------------+
int PostJSON(string json, string &responseBody)
{
   char   postData[];
   char   resData[];
   string resHeaders;
   string reqHeaders = "Content-Type: application/json\r\nAccept: application/json\r\n";

   // StringToCharArray with no count includes null terminator (returns len+1).
   // Remove null before sending.
   int sz = StringToCharArray(json, postData);
   ArrayResize(postData, sz - 1);

   ResetLastError();
   int code = WebRequest("POST", InpServerURL, reqHeaders, 15000, postData, resData, resHeaders);
   responseBody = CharArrayToString(resData);
   return code;
}

//+------------------------------------------------------------------+
//  SyncDeal — build payload and POST one closed deal
//+------------------------------------------------------------------+
void SyncDeal(ulong dealTicket)
{
   Print("CandlesJournal: --- SyncDeal START ticket #", dealTicket, " ---");

   if(!HistoryDealSelect(dealTicket))
   {
      Print("CandlesJournal: HistoryDealSelect FAILED ticket #", dealTicket, " — skipping");
      return;
   }

   ENUM_DEAL_ENTRY dealEntry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
   Print("CandlesJournal: Entry type = ", EnumToString(dealEntry));

   if(dealEntry != DEAL_ENTRY_OUT && dealEntry != DEAL_ENTRY_OUT_BY)
   {
      Print("CandlesJournal: Not a closing deal — skipping");
      return;
   }

   string   rawSymbol = HistoryDealGetString(dealTicket, DEAL_SYMBOL);
   string   symbol    = StripSuffix(rawSymbol);          // clean pair sent to journal
   double   exitPrice = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
   double   volume    = HistoryDealGetDouble(dealTicket, DEAL_VOLUME);
   double   profit    = HistoryDealGetDouble(dealTicket, DEAL_PROFIT)
                      + HistoryDealGetDouble(dealTicket, DEAL_SWAP)
                      + HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
   datetime closeTime = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);
   long     posId     = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);

   Print("CandlesJournal: raw=", rawSymbol, " stripped=", symbol,
         " exit=", exitPrice, " vol=", volume,
         " pnl=",  NormalizeDouble(profit, 2), " posId=", posId);

   // ── Find opening deal → entry price + direction ───────────────
   string direction  = "BUY";
   double entryPrice = exitPrice;
   double sl = 0, tp = 0;
   bool   foundOpen  = false;

   if(HistorySelectByPosition(posId))
   {
      int n = HistoryDealsTotal();
      for(int i = 0; i < n; i++)
      {
         ulong tk = HistoryDealGetTicket(i);
         ENUM_DEAL_ENTRY de = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(tk, DEAL_ENTRY);
         // DEAL_ENTRY_IN  = normal open (hedging + netting)
         // DEAL_ENTRY_INOUT = netting position reversal (first side is the close, ignored here)
         if(de == DEAL_ENTRY_IN)
         {
            direction  = (HistoryDealGetInteger(tk, DEAL_TYPE) == DEAL_TYPE_BUY) ? "BUY" : "SELL";
            entryPrice = HistoryDealGetDouble(tk, DEAL_PRICE);
            foundOpen  = true;
            Print("CandlesJournal: Opening deal — direction:", direction,
                  " entry:", entryPrice, " entry_type:", EnumToString(de));
            break;
         }
      }
      // Try to find SL/TP from the position's orders
      int no = HistoryOrdersTotal();
      for(int i = 0; i < no; i++)
      {
         ulong tk = HistoryOrderGetTicket(i);
         if(HistoryOrderGetInteger(tk, ORDER_POSITION_ID) != posId) continue;
         double oSL = HistoryOrderGetDouble(tk, ORDER_SL);
         double oTP = HistoryOrderGetDouble(tk, ORDER_TP);
         if(oSL > 0) sl = oSL;
         if(oTP > 0) tp = oTP;
         break;
      }
   }

   if(!foundOpen)
   {
      // Fallback for netting accounts or when position history is unavailable:
      // The closing deal type is the OPPOSITE of the original position direction.
      // e.g. DEAL_TYPE_SELL to close → original position was BUY
      long dealType = HistoryDealGetInteger(dealTicket, DEAL_TYPE);
      direction     = (dealType == DEAL_TYPE_SELL) ? "BUY" : "SELL";
      Print("CandlesJournal: Opening deal not found — netting fallback direction:", direction);
   }

   MqlDateTime dt;
   TimeToStruct(closeTime, dt);
   string dateStr    = StringFormat("%04d-%02d-%02d", dt.year, dt.mon, dt.day);
   string assetClass = DetectAssetClass(symbol);          // on stripped symbol

   string slStr = (sl > 0) ? SafeDouble(sl, 5) : "null";
   string tpStr = (tp > 0) ? SafeDouble(tp, 5) : "null";

   // ── Build JSON (string concat + DoubleToString only — never StringFormat for floats) ──
   string json = "{"
      + "\"token\":\""        + InpSyncToken                              + "\","
      + "\"trade\":{"
      + "\"pair\":\""         + symbol                                    + "\","
      + "\"direction\":\""    + direction                                 + "\","
      + "\"lot\":"            + SafeDouble(volume, 2)                     + ","
      + "\"date\":\""         + dateStr                                   + "\","
      + "\"entry\":"          + SafeDouble(entryPrice, 5)                 + ","
      + "\"exit_price\":"     + SafeDouble(exitPrice, 5)                  + ","
      + "\"sl\":"             + slStr                                     + ","
      + "\"tp\":"             + tpStr                                     + ","
      + "\"pnl\":"            + SafeDouble(NormalizeDouble(profit, 2), 2) + ","
      + "\"asset_class\":\""  + assetClass                                + "\","
      + "\"session\":\"London\","
      + "\"setup\":\"\","
      + "\"notes\":\"Auto-synced from MT5\""
      + "}"
      + "}";

   Print("CandlesJournal: Sending payload: ", json);

   string resp;
   int httpCode = PostJSON(json, resp);

   Print("CandlesJournal: Server response: HTTP ", httpCode, " | body: ", resp);

   if(httpCode == 200)
   {
      ulong last = GetLastSyncedTicket();
      if(dealTicket > last) SetLastSyncedTicket(dealTicket);

      Print("CandlesJournal ✓  SYNCED — ", symbol, " (", rawSymbol, ") ", direction,
            " | Lot:", SafeDouble(volume, 2),
            " | P&L: $", SafeDouble(NormalizeDouble(profit, 2), 2),
            " | AssetClass:", assetClass,
            " | Ticket:", dealTicket);
   }
   else if(httpCode == -1)
   {
      int err = GetLastError();
      Print("CandlesJournal ✗  WebRequest FAILED — error: ", err);
      if(err == 4014)
         Print("  → Tools > Options > Expert Advisors > Allow WebRequest > Add: ", InpServerURL);
      else
         Print("  → Check internet connection.");
   }
   else
   {
      Print("CandlesJournal ✗  HTTP ", httpCode, " — ", resp);
      // 4xx = bad payload → mark as skipped to prevent infinite retry
      if(httpCode >= 400 && httpCode < 500)
      {
         Print("CandlesJournal: 4xx error — marking ticket #", dealTicket, " as skipped.");
         ulong last = GetLastSyncedTicket();
         if(dealTicket > last) SetLastSyncedTicket(dealTicket);
      }
   }

   Print("CandlesJournal: --- SyncDeal END ticket #", dealTicket, " ---");
}

//+------------------------------------------------------------------+
//  ScanHistory — find and sync all unprocessed closing deals
//+------------------------------------------------------------------+
void ScanHistory(int lookbackSeconds)
{
   ulong lastTicket = GetLastSyncedTicket();
   Print("CandlesJournal: ScanHistory lookback:", lookbackSeconds,
         "s | lastTicket:", lastTicket);

   if(!HistorySelect(TimeCurrent() - lookbackSeconds, TimeCurrent()))
   {
      Print("CandlesJournal: HistorySelect FAILED");
      return;
   }

   int total = HistoryDealsTotal();
   Print("CandlesJournal: ", total, " deal(s) in window");
   if(total == 0) return;

   // Snapshot qualifying tickets before SyncDeal changes the history pool
   ulong toSync[];
   int   count = 0;
   for(int i = 0; i < total; i++)
   {
      ulong tk = HistoryDealGetTicket(i);
      if(tk <= lastTicket) continue;
      ENUM_DEAL_ENTRY de = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(tk, DEAL_ENTRY);
      if(de != DEAL_ENTRY_OUT && de != DEAL_ENTRY_OUT_BY) continue;
      ArrayResize(toSync, count + 1);
      toSync[count++] = tk;
   }

   if(count == 0) { Print("CandlesJournal: No new unsynced closing deals"); return; }
   Print("CandlesJournal: ", count, " new closing deal(s) to sync");

   for(int i = 0; i < count; i++)
      SyncDeal(toSync[i]);
}

//+------------------------------------------------------------------+
int OnInit()
{
   if(InpSyncToken == "")
   {
      Alert("CandlesJournal: Paste your Sync Token in the EA inputs.\nGet it: Settings page → Generate Token");
      return(INIT_PARAMETERS_INCORRECT);
   }
   if(InpServerURL == "")
   {
      Alert("CandlesJournal: Sync URL is empty.");
      return(INIT_PARAMETERS_INCORRECT);
   }

   Print("CandlesJournal: ====== EA v1.07 INITIALIZING ======");
   Print("CandlesJournal: Token length=", StringLen(InpSyncToken),
         " URL=", InpServerURL);
   Print("CandlesJournal: Last synced ticket (GlobalVar) = ", GetLastSyncedTicket());

   // ── Broker & account diagnostics ──────────────────────────────
   string broker   = AccountInfoString(ACCOUNT_COMPANY);
   string currency = AccountInfoString(ACCOUNT_CURRENCY);
   long   modeRaw  = AccountInfoInteger(ACCOUNT_MARGIN_MODE);
   string modeStr  = (modeRaw == 0) ? "Netting (0)" :
                     (modeRaw == 2) ? "Hedging (2)" :
                                      "Exchange (" + IntegerToString(modeRaw) + ")";
   string acctType = (AccountInfoInteger(ACCOUNT_TRADE_MODE) == ACCOUNT_TRADE_MODE_DEMO)
                     ? "Demo" : "Live";

   Print("CandlesJournal: Broker=",   broker,
         " | Currency=", currency,
         " | Mode=",     modeStr,
         " | Type=",     acctType);

   // Suffix-strip sanity check on the chart symbol
   string rawChart     = Symbol();
   string cleanChart   = StripSuffix(rawChart);
   string acClass      = DetectAssetClass(cleanChart);
   Print("CandlesJournal: Chart symbol raw=", rawChart,
         " stripped=", cleanChart,
         " asset_class=", acClass);

   // ── Connection + token ping ────────────────────────────────────
   string pingJson = "{\"token\":\"" + InpSyncToken + "\",\"ping\":true}";
   string pingResp;
   int    pingCode = PostJSON(pingJson, pingResp);
   Print("CandlesJournal: Ping HTTP ", pingCode, " | body: ", pingResp);

   if(pingCode == 200)
   {
      Print("CandlesJournal ✓  Connected. Scanning last 24 hours for missed trades...");
      ScanHistory(86400);
      Print("CandlesJournal: Catchup scan complete.");
   }
   else if(pingCode == -1)
   {
      int err = GetLastError();
      Print("CandlesJournal ✗  Cannot reach server. Error=", err);
      if(err == 4014)
         Alert("CandlesJournal: WebRequest blocked!\n\n"
               "Fix: Tools → Options → Expert Advisors\n"
               "  ✓ Allow WebRequest for listed URL\n"
               "  + Add: " + InpServerURL);
      else
         Alert("CandlesJournal: Network error " + IntegerToString(err));
      return(INIT_FAILED);
   }
   else if(pingCode == 401)
   {
      Alert("CandlesJournal: Token invalid. Regenerate on the Settings page.");
      return(INIT_PARAMETERS_INCORRECT);
   }
   else
   {
      Print("CandlesJournal: Unexpected ping HTTP ", pingCode, " | ", pingResp);
   }

   EventSetTimer(10);
   Print("CandlesJournal: Timer started (every 10 seconds).");
   Print("CandlesJournal: ====== EA v1.07 READY ======");
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("CandlesJournal: EA removed. Timer stopped.");
}

// PRIMARY — fires every 10 seconds, works on Exness where OnTradeTransaction is broken
void OnTimer()
{
   static int fires = 0;
   fires++;
   Print("CandlesJournal: OnTimer #", fires);
   ScanHistory(86400);
}

// SECONDARY — fires on any trade event
void OnTrade()
{
   Print("CandlesJournal: OnTrade fired");
   ScanHistory(86400);
}

// TERTIARY — fallback for brokers where this works
void OnTradeTransaction(const MqlTradeTransaction& trans,
                        const MqlTradeRequest&     request,
                        const MqlTradeResult&      result)
{
   Print("CandlesJournal: OnTradeTransaction type=", EnumToString(trans.type),
         " symbol=", trans.symbol, " deal=", trans.deal);
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD)
      ScanHistory(86400);
}
//+------------------------------------------------------------------+
