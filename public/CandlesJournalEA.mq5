//+------------------------------------------------------------------+
//|                                       CandlesJournalEA.mq5      |
//|          Automatically syncs closed trades to CandlesJournal     |
//+------------------------------------------------------------------+
#property copyright "CandlesJournal"
#property version   "1.04"
#property description "Syncs every closed trade to your CandlesJournal automatically."

input string InpSyncToken = "";                                                                   // Sync Token  (paste from Settings page)
input string InpServerURL = "https://symphonious-lily-0d7ae0.netlify.app/api/mt5/sync";           // Sync URL    (pre-filled for your live app)

// ── Global tick counter & deduplication array ─────────────────────────────────
int   g_tickCount    = 0;
ulong g_synced[];
int   g_syncedCount  = 0;

bool IsAlreadySynced(ulong ticket)
{
   for(int i = 0; i < g_syncedCount; i++)
      if(g_synced[i] == ticket) return true;
   return false;
}

void MarkSynced(ulong ticket)
{
   ArrayResize(g_synced, g_syncedCount + 1);
   g_synced[g_syncedCount++] = ticket;
}

// ── Asset class detection (handles suffixes: BTCUSDm, XAUUSDm, etc.) ─────────
string DetectAssetClass(string symbol)
{
   string s = symbol;
   StringToUpper(s);
   if(StringFind(s,"BTC")  >=0 || StringFind(s,"ETH")  >=0 || StringFind(s,"XRP") >=0 ||
      StringFind(s,"BNB")  >=0 || StringFind(s,"SOL")  >=0 || StringFind(s,"DOGE")>=0 ||
      StringFind(s,"ADA")  >=0 || StringFind(s,"LTC")  >=0 || StringFind(s,"LINK")>=0 ||
      StringFind(s,"DOT")  >=0)  return "Crypto";
   if(StringFind(s,"XAU")  >=0 || StringFind(s,"XAG")  >=0 || StringFind(s,"GOLD")  >=0 ||
      StringFind(s,"SILVER")>=0 || StringFind(s,"OIL")  >=0 || StringFind(s,"WTI")   >=0 ||
      StringFind(s,"BRENT")>=0)  return "Commodities";
   if(StringFind(s,"SPX")  >=0 || StringFind(s,"SP500") >=0 || StringFind(s,"NAS")  >=0 ||
      StringFind(s,"NDX")  >=0 || StringFind(s,"US30")  >=0 || StringFind(s,"DJ30") >=0 ||
      StringFind(s,"DAX")  >=0 || StringFind(s,"FTSE")  >=0 || StringFind(s,"CAC")  >=0 ||
      StringFind(s,"UK100")>=0 || StringFind(s,"GER")   >=0 || StringFind(s,"AUS200")>=0)
      return "Indices";
   return "Forex";
}

// ── Build and POST one closed deal to the journal ────────────────────────────
void SyncDeal(ulong dealTicket)
{
   if(IsAlreadySynced(dealTicket)) return;

   // Select the deal so we can read its properties
   if(!HistoryDealSelect(dealTicket))
   {
      Print("CandlesJournal: HistoryDealSelect FAILED for deal #", dealTicket);
      return;
   }

   ENUM_DEAL_ENTRY dealEntry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
   if(dealEntry != DEAL_ENTRY_OUT && dealEntry != DEAL_ENTRY_OUT_BY)
      return; // not a closing deal

   string   symbol    = HistoryDealGetString (dealTicket, DEAL_SYMBOL);
   double   exitPrice = HistoryDealGetDouble (dealTicket, DEAL_PRICE);
   double   volume    = HistoryDealGetDouble (dealTicket, DEAL_VOLUME);
   double   profit    = HistoryDealGetDouble (dealTicket, DEAL_PROFIT)
                      + HistoryDealGetDouble (dealTicket, DEAL_SWAP)
                      + HistoryDealGetDouble (dealTicket, DEAL_COMMISSION);
   datetime closeTime = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);
   long     posId     = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);

   Print("CandlesJournal: New deal found — ticket #", dealTicket,
         " | symbol: ", symbol,
         " | exit: ",   exitPrice,
         " | pnl: ",    NormalizeDouble(profit, 2),
         " | posId: ",  posId);

   // ── find entry price + direction from the opening deal ───────────
   string direction  = "BUY";
   double entryPrice = exitPrice;
   double sl = 0, tp = 0;

   if(HistorySelectByPosition(posId))
   {
      int n = HistoryDealsTotal();
      for(int i = 0; i < n; i++)
      {
         ulong tk = HistoryDealGetTicket(i);
         ENUM_DEAL_ENTRY de = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(tk, DEAL_ENTRY);
         if(de == DEAL_ENTRY_IN)
         {
            direction  = (HistoryDealGetInteger(tk, DEAL_TYPE) == DEAL_TYPE_BUY) ? "BUY" : "SELL";
            entryPrice = HistoryDealGetDouble(tk, DEAL_PRICE);
            break;
         }
      }
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

   MqlDateTime dt;
   TimeToStruct(closeTime, dt);
   string dateStr    = StringFormat("%04d-%02d-%02d", dt.year, dt.mon, dt.day);
   string assetClass = DetectAssetClass(symbol);
   string slStr      = (sl > 0) ? StringFormat("%.5f", sl) : "null";
   string tpStr      = (tp > 0) ? StringFormat("%.5f", tp) : "null";

   string json = StringFormat(
      "{"
        "\"token\":\"%s\","
        "\"trade\":{"
          "\"pair\":\"%s\","
          "\"direction\":\"%s\","
          "\"lot\":%.2f,"
          "\"date\":\"%s\","
          "\"entry\":%.5f,"
          "\"exit_price\":%.5f,"
          "\"sl\":%s,"
          "\"tp\":%s,"
          "\"pnl\":%.2f,"
          "\"asset_class\":\"%s\","
          "\"notes\":\"Auto-synced from MT5\""
        "}"
      "}",
      InpSyncToken,
      symbol, direction, volume,
      dateStr, entryPrice, exitPrice,
      slStr, tpStr,
      NormalizeDouble(profit, 2),
      assetClass
   );

   Print("CandlesJournal: Sending to server — payload: ", json);

   char   postData[], resData[];
   string resHeaders;
   string reqHeaders = "Content-Type: application/json\r\nAccept: application/json\r\n";
   int    charLen    = StringToCharArray(json, postData, 0, StringLen(json));
   ArrayResize(postData, charLen - 1);

   ResetLastError();
   int    httpCode = WebRequest("POST", InpServerURL, reqHeaders, 15000, postData, resData, resHeaders);
   string resp     = CharArrayToString(resData);

   Print("CandlesJournal: Server response: HTTP ", httpCode, " | body: ", resp);

   if(httpCode == 200)
   {
      MarkSynced(dealTicket);
      Print("CandlesJournal ✓  SYNCED — ", symbol, " ", direction,
            " | Lot: ", DoubleToString(volume, 2),
            " | P&L: $", DoubleToString(NormalizeDouble(profit, 2), 2));
   }
   else if(httpCode == -1)
   {
      int err = GetLastError();
      Print("CandlesJournal ✗  WebRequest FAILED — error code: ", err);
      if(err == 4014)
         Print("  → Fix: Tools > Options > Expert Advisors > Allow WebRequest > Add: ", InpServerURL);
      else
         Print("  → Network error. Check internet connection.");
   }
   else
   {
      Print("CandlesJournal ✗  Sync FAILED — HTTP ", httpCode, " | body: ", resp);
   }
}

// ── Scan a time window for unsynced closing deals (all symbols) ───────────────
void ScanAndSync(int lookbackSeconds)
{
   datetime from = TimeCurrent() - lookbackSeconds;
   if(!HistorySelect(from, TimeCurrent())) return;

   int total = HistoryDealsTotal();
   if(total == 0) return;

   // Collect ALL closing ticket numbers first — HistorySelectByPosition (inside
   // SyncDeal) replaces the pool, so we must snapshot before looping.
   ulong tickets[];
   int   ticketCount = 0;

   for(int i = 0; i < total; i++)
   {
      ulong tk = HistoryDealGetTicket(i);
      if(IsAlreadySynced(tk)) continue;
      ENUM_DEAL_ENTRY de = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(tk, DEAL_ENTRY);
      if(de != DEAL_ENTRY_OUT && de != DEAL_ENTRY_OUT_BY) continue;
      ArrayResize(tickets, ticketCount + 1);
      tickets[ticketCount++] = tk;
   }

   for(int i = 0; i < ticketCount; i++)
      SyncDeal(tickets[i]);
}

//+------------------------------------------------------------------+
int OnInit()
{
   if(InpSyncToken == "")
   {
      Alert("CandlesJournal: Enter your Sync Token in the EA inputs.\n\nGet it from: Settings page → MT5 Sync Token → Generate Token");
      return(INIT_PARAMETERS_INCORRECT);
   }
   if(InpServerURL == "")
   {
      Alert("CandlesJournal: Enter your Sync URL in the EA inputs.");
      return(INIT_PARAMETERS_INCORRECT);
   }

   Print("CandlesJournal EA initialized. Monitoring ALL symbols on this account. Version 1.04");

   // ── Connection + token test ───────────────────────────────────
   string hdr  = "Content-Type: application/json\r\nAccept: application/json\r\n";
   string ping = StringFormat("{\"token\":\"%s\",\"ping\":true}", InpSyncToken);
   char   pData[], pRes[];
   string pHeaders;
   int    pLen = StringToCharArray(ping, pData, 0, StringLen(ping));
   ArrayResize(pData, pLen - 1);

   ResetLastError();
   int code = WebRequest("POST", InpServerURL, hdr, 10000, pData, pRes, pHeaders);

   if(code == 200)
   {
      Print("CandlesJournal ✓  Server connected. Token valid.");
      Print("CandlesJournal: Scanning last 24 hours for missed trades...");
      ScanAndSync(86400); // catchup: last 24 hours
      Print("CandlesJournal: Catchup scan complete. Now watching for new trades via OnTick.");
   }
   else if(code == -1)
   {
      int err = GetLastError();
      Print("CandlesJournal ✗  Cannot reach server (error ", err, ")");
      if(err == 4014)
         Alert("CandlesJournal: WebRequest blocked!\n\n"
               "Fix: Tools → Options → Expert Advisors\n"
               "  ✓ Allow WebRequest for listed URL\n"
               "  + Add: " + InpServerURL);
      else
         Alert("CandlesJournal: Network error " + IntegerToString(err));
      return(INIT_FAILED);
   }
   else if(code == 401)
   {
      Alert("CandlesJournal: Invalid token — regenerate on the Settings page.");
      return(INIT_PARAMETERS_INCORRECT);
   }
   else
   {
      Print("CandlesJournal: Server returned HTTP ", code, " during init ping.");
   }

   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason) { }

// ── PRIMARY detection method: fires on every price tick ───────────────────────
// Throttled to one history scan per second to avoid performance issues.
// Looks back 60 seconds to catch any deal that just closed.
void OnTick()
{
   g_tickCount++;

   // Heartbeat: confirm EA is alive every 100 ticks
   if(g_tickCount % 100 == 0)
      Print("CandlesJournal: OnTick firing — tick #", g_tickCount,
            " | synced so far: ", g_syncedCount);

   // Throttle: scan history at most once per second
   static datetime s_lastScan = 0;
   datetime now = TimeCurrent();
   if(now - s_lastScan < 1) return;
   s_lastScan = now;

   // Scan last 60 seconds for new closed deals across ALL symbols
   ScanAndSync(60);
}
//+------------------------------------------------------------------+
