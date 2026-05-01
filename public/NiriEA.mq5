//+------------------------------------------------------------------+
//|                                    CandlesJournalEA.mq5          |
//|     Production EA v2.00 — Multi-Account, Cent-Safe, Async        |
//+------------------------------------------------------------------+
//
// HOW TO INSTALL:
// 1. File → Open Data Folder → MQL5 → Experts → paste this file
// 2. Press F5 in MetaEditor to compile (must show 0 errors)
// 3. Navigator panel → right-click Experts → Refresh
// 4. Drag CandlesJournalEA onto any chart (e.g. EURUSD H1)
// 5. Inputs tab: paste SyncToken and SyncURL from Settings page
// 6. Common tab: enable "Allow algo trading"
// 7. Tools → Options → Expert Advisors → Allow WebRequest → add your URL
//
#property copyright "CandlesJournal"
#property version   "2.00"
#property description "Syncs closed trades to CandlesJournal — multi-account, cent-safe, async."

//--- Input parameters
input string InpSyncToken        = "";                 // Sync Token  (from Settings page)
input string InpSyncURL          = "";                 // Sync URL    (from Settings page)
input string InpAccountLabel     = "My MT5 Account";  // Label for this account
input int    InpSyncIntervalSecs = 30;                 // Sync interval in seconds

//--- Persistence keys (v2 — separate from v1 to avoid checkpoint collisions)
#define GV_LAST_TICKET    "CJ2_LAST_TICKET"
#define GV_LAST_SYNC_TIME "CJ2_LAST_SYNC_TIME"

//--- In-session dedup: "closeTime_ticket" keys prevent re-sending same deal
#define MAX_SYNCED_KEYS 5000
string g_syncedKeys[];
int    g_syncedCount = 0;

//--- Pending sync queue
ulong g_queue[];
int   g_queueCount = 0;

//--- Rate limiting
datetime g_lastSyncAt = 0;

//+------------------------------------------------------------------+
//  Persistence helpers
//+------------------------------------------------------------------+
ulong GetLastSyncedTicket()
{
   if(GlobalVariableCheck(GV_LAST_TICKET)) return (ulong)GlobalVariableGet(GV_LAST_TICKET);
   return 0;
}
void SetLastSyncedTicket(ulong t) { GlobalVariableSet(GV_LAST_TICKET, (double)t); }

datetime GetLastSyncTime()
{
   if(GlobalVariableCheck(GV_LAST_SYNC_TIME)) return (datetime)GlobalVariableGet(GV_LAST_SYNC_TIME);
   return 0;
}
void SetLastSyncTime(datetime t) { GlobalVariableSet(GV_LAST_SYNC_TIME, (double)t); }

//+------------------------------------------------------------------+
//  In-session dedup helpers
//+------------------------------------------------------------------+
string MakeSyncKey(ulong ticket, datetime closeTime)
{
   return IntegerToString((long)closeTime) + "_" + IntegerToString(ticket);
}

bool WasSyncedThisSession(ulong ticket, datetime closeTime)
{
   string key = MakeSyncKey(ticket, closeTime);
   for(int i = 0; i < g_syncedCount; i++)
      if(g_syncedKeys[i] == key) return true;
   return false;
}

void MarkSyncedThisSession(ulong ticket, datetime closeTime)
{
   if(g_syncedCount >= MAX_SYNCED_KEYS) return;
   string key = MakeSyncKey(ticket, closeTime);
   ArrayResize(g_syncedKeys, g_syncedCount + 1);
   g_syncedKeys[g_syncedCount++] = key;
}

//+------------------------------------------------------------------+
//  EscapeJSON — safely escape a string for embedding in JSON
//+------------------------------------------------------------------+
string EscapeJSON(string s)
{
   string out = "";
   int len = StringLen(s);
   for(int i = 0; i < len; i++)
   {
      ushort c = StringGetCharacter(s, i);
      if     (c == '"')  out += "\\\"";
      else if(c == '\\') out += "\\\\";
      else if(c == '\n') out += "\\n";
      else if(c == '\r') out += "\\r";
      else if(c == '\t') out += "\\t";
      else               out += ShortToString(c);
   }
   return out;
}

//+------------------------------------------------------------------+
//  SafeDouble — locale-independent number → string
//+------------------------------------------------------------------+
string SafeDouble(double v, int d) { return DoubleToString(NormalizeDouble(v, d), d); }

//+------------------------------------------------------------------+
//  IsCentAccount — detect cent/micro accounts
//+------------------------------------------------------------------+
bool IsCentAccount()
{
   string cur = AccountInfoString(ACCOUNT_CURRENCY);
   StringToUpper(cur);
   if(StringFind(cur, "USC") >= 0 || StringFind(cur, "CENT") >= 0) return true;
   // Heuristic: standard forex contract = 100,000; cent = 1,000
   double cs = SymbolInfoDouble(Symbol(), SYMBOL_TRADE_CONTRACT_SIZE);
   if(cs > 0 && cs < 10000) return true;
   return false;
}

//+------------------------------------------------------------------+
//  StripSuffix — remove broker-specific symbol extensions
//  e.g. EURUSDm → EURUSD,  EURUSD.r → EURUSD,  XAUUSDpro → XAUUSD
//+------------------------------------------------------------------+
string StripSuffix(string raw)
{
   string s = raw;
   int p = StringFind(s, ".");
   if(p >= 0) s = StringSubstr(s, 0, p);
   int u = StringFind(s, "_");
   if(u >= 0) s = StringSubstr(s, 0, u);
   int len = StringLen(s);
   while(len > 0)
   {
      ushort c = StringGetCharacter(s, len - 1);
      if(c >= 'a' && c <= 'z') len--;
      else break;
   }
   return StringSubstr(s, 0, len);
}

//+------------------------------------------------------------------+
//  DetectAssetClass — classify a stripped symbol
//+------------------------------------------------------------------+
string DetectAssetClass(string sym)
{
   string s = sym;
   StringToUpper(s);
   if(StringFind(s,"BTC")>=0 || StringFind(s,"ETH")>=0 || StringFind(s,"XRP")>=0 ||
      StringFind(s,"BNB")>=0 || StringFind(s,"SOL")>=0 || StringFind(s,"DOGE")>=0 ||
      StringFind(s,"ADA")>=0 || StringFind(s,"LTC")>=0 || StringFind(s,"LINK")>=0)
      return "Crypto";
   if(StringFind(s,"XAU")>=0 || StringFind(s,"XAG")>=0 || StringFind(s,"GOLD")>=0 ||
      StringFind(s,"OIL")>=0 || StringFind(s,"WTI")>=0 || StringFind(s,"BRENT")>=0 ||
      StringFind(s,"USOIL")>=0 || StringFind(s,"UKOIL")>=0 || StringFind(s,"NGAS")>=0)
      return "Metals";
   if(StringFind(s,"SPX")>=0 || StringFind(s,"NAS")>=0 || StringFind(s,"US30")>=0 ||
      StringFind(s,"DAX")>=0 || StringFind(s,"FTSE")>=0 || StringFind(s,"UK100")>=0 ||
      StringFind(s,"US100")>=0 || StringFind(s,"US500")>=0 || StringFind(s,"GER")>=0 ||
      StringFind(s,"JP225")>=0 || StringFind(s,"HK50")>=0 || StringFind(s,"VIX")>=0)
      return "Indices";
   return "Forex";
}

//+------------------------------------------------------------------+
//  PostJSON — HTTP POST; returns HTTP code; fills responseBody
//+------------------------------------------------------------------+
int PostJSON(string json, string &responseBody)
{
   char   postData[], resData[];
   string resHeaders;
   string reqHeaders = "Content-Type: application/json\r\nAccept: application/json\r\n";
   int sz = StringToCharArray(json, postData);
   ArrayResize(postData, sz - 1);   // strip null terminator
   ResetLastError();
   int code = WebRequest("POST", InpSyncURL, reqHeaders, 5000, postData, resData, resHeaders);
   responseBody = CharArrayToString(resData);
   return code;
}

//+------------------------------------------------------------------+
//  BuildPayload — construct full JSON for one closing deal
//  Returns "" if the deal is not a closing deal.
//+------------------------------------------------------------------+
string BuildPayload(ulong ticket)
{
   if(!HistoryDealSelect(ticket)) return "";
   ENUM_DEAL_ENTRY de = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(ticket, DEAL_ENTRY);
   if(de != DEAL_ENTRY_OUT && de != DEAL_ENTRY_OUT_BY) return "";

   string rawSym    = HistoryDealGetString(ticket, DEAL_SYMBOL);
   string sym       = StripSuffix(rawSym);
   double exitPrice = HistoryDealGetDouble(ticket, DEAL_PRICE);
   double volume    = HistoryDealGetDouble(ticket, DEAL_VOLUME);
   double profit    = HistoryDealGetDouble(ticket, DEAL_PROFIT)
                    + HistoryDealGetDouble(ticket, DEAL_SWAP)
                    + HistoryDealGetDouble(ticket, DEAL_COMMISSION);
   datetime closeTime = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
   long posId       = HistoryDealGetInteger(ticket, DEAL_POSITION_ID);

   string direction  = "BUY";
   double entryPrice = exitPrice;
   double sl = 0, tp = 0;

   if(HistorySelectByPosition(posId))
   {
      int n = HistoryDealsTotal();
      for(int i = 0; i < n; i++)
      {
         ulong tk = HistoryDealGetTicket(i);
         if((ENUM_DEAL_ENTRY)HistoryDealGetInteger(tk, DEAL_ENTRY) == DEAL_ENTRY_IN)
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
   else
   {
      // Netting fallback: closing deal type is opposite of original direction
      direction = (HistoryDealGetInteger(ticket, DEAL_TYPE) == DEAL_TYPE_SELL) ? "BUY" : "SELL";
   }

   MqlDateTime mdt;
   TimeToStruct(closeTime, mdt);
   string dateStr = StringFormat("%04d-%02d-%02d", mdt.year, mdt.mon, mdt.day);

   // Account metadata
   string broker      = AccountInfoString(ACCOUNT_COMPANY);
   string currency    = AccountInfoString(ACCOUNT_CURRENCY);
   string server      = AccountInfoString(ACCOUNT_SERVER);
   long   login       = AccountInfoInteger(ACCOUNT_LOGIN);
   bool   isDemo      = (AccountInfoInteger(ACCOUNT_TRADE_MODE) == ACCOUNT_TRADE_MODE_DEMO);
   double balance     = AccountInfoDouble(ACCOUNT_BALANCE);
   bool   isCent      = IsCentAccount();
   double contractSz  = SymbolInfoDouble(rawSym, SYMBOL_TRADE_CONTRACT_SIZE);
   double tickVal     = SymbolInfoDouble(rawSym, SYMBOL_TRADE_TICK_VALUE);
   string acctSig     = IntegerToString(login) + "_" + EscapeJSON(server);

   // Build JSON using EscapeJSON for every string value
   string j = "{";
   j += "\"token\":\""        + EscapeJSON(InpSyncToken) + "\",";
   j += "\"account\":{";
   j += "\"account_signature\":\"" + acctSig                    + "\",";
   j += "\"account_label\":\""     + EscapeJSON(InpAccountLabel) + "\",";
   j += "\"account_login\":\""     + IntegerToString(login)      + "\",";
   j += "\"account_server\":\""    + EscapeJSON(server)          + "\",";
   j += "\"broker_name\":\""       + EscapeJSON(broker)          + "\",";
   j += "\"account_currency\":\""  + EscapeJSON(currency)        + "\",";
   j += "\"account_type\":\""      + (isDemo ? "demo" : "real")  + "\",";
   j += "\"is_cent\":"             + (isCent ? "true" : "false") + ",";
   j += "\"current_balance\":"     + SafeDouble(balance, 2);
   j += "},";
   j += "\"trade\":{";
   j += "\"pair\":\""         + EscapeJSON(sym)                            + "\",";
   j += "\"direction\":\""    + direction                                   + "\",";
   j += "\"lot\":"            + SafeDouble(volume, 2)                       + ",";
   j += "\"date\":\""         + dateStr                                     + "\",";
   j += "\"entry\":"          + SafeDouble(entryPrice, 5)                   + ",";
   j += "\"exit_price\":"     + SafeDouble(exitPrice, 5)                    + ",";
   j += "\"sl\":"             + (sl > 0 ? SafeDouble(sl, 5) : "null")      + ",";
   j += "\"tp\":"             + (tp > 0 ? SafeDouble(tp, 5) : "null")      + ",";
   j += "\"pnl\":"            + SafeDouble(NormalizeDouble(profit, 2), 2)   + ",";
   j += "\"asset_class\":\""  + DetectAssetClass(sym)                       + "\",";
   j += "\"is_cent\":"        + (isCent ? "true" : "false")                 + ",";
   j += "\"contract_size\":"  + SafeDouble(contractSz, 2)                   + ",";
   j += "\"tick_value\":"     + SafeDouble(tickVal, 5)                      + ",";
   j += "\"session\":\"London\",";
   j += "\"setup\":\"\",";
   j += "\"notes\":\"Auto-synced from MT5\",";
   j += "\"mt5_deal_id\":\"" + IntegerToString(ticket) + "\"";
   j += "}";
   j += "}";
   return j;
}

//+------------------------------------------------------------------+
//  EnqueueIfNew — add ticket to queue if not already tracked
//+------------------------------------------------------------------+
void EnqueueIfNew(ulong ticket)
{
   if(!HistoryDealSelect(ticket)) return;
   ENUM_DEAL_ENTRY de = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(ticket, DEAL_ENTRY);
   if(de != DEAL_ENTRY_OUT && de != DEAL_ENTRY_OUT_BY) return;

   datetime closeTime = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);

   // In-session dedup
   if(WasSyncedThisSession(ticket, closeTime)) return;

   // Persistent dedup: skip only when BOTH ticket AND time are behind checkpoints
   ulong    lastTk = GetLastSyncedTicket();
   datetime lastTm = GetLastSyncTime();
   if(ticket <= lastTk && closeTime < lastTm) return;

   // Queue dedup
   for(int i = 0; i < g_queueCount; i++)
      if(g_queue[i] == ticket) return;

   ArrayResize(g_queue, g_queueCount + 1);
   g_queue[g_queueCount++] = ticket;
   Print("CandlesJournal: Queued #", ticket, " (", HistoryDealGetString(ticket, DEAL_SYMBOL), ")");
}

//+------------------------------------------------------------------+
//  ProcessOneFromQueue — pop and sync one deal; called from OnTimer
//+------------------------------------------------------------------+
void ProcessOneFromQueue()
{
   if(g_queueCount == 0) return;

   // 500 ms throttle between syncs
   if(TimeCurrent() - g_lastSyncAt < 1) { Sleep(500); }

   ulong ticket = g_queue[0];
   for(int i = 0; i < g_queueCount - 1; i++) g_queue[i] = g_queue[i + 1];
   g_queueCount--;
   ArrayResize(g_queue, MathMax(0, g_queueCount));

   // Need history loaded to read deal details
   if(!HistoryDealSelect(ticket))
   {
      Print("CandlesJournal: HistoryDealSelect failed for queued #", ticket, " — skipping");
      return;
   }

   datetime closeTime = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
   string   rawSym    = HistoryDealGetString(ticket, DEAL_SYMBOL);
   double   profit    = HistoryDealGetDouble(ticket, DEAL_PROFIT)
                      + HistoryDealGetDouble(ticket, DEAL_SWAP)
                      + HistoryDealGetDouble(ticket, DEAL_COMMISSION);

   // Re-select the history range so BuildPayload can call HistorySelectByPosition
   HistorySelect(closeTime - 86400, TimeCurrent());

   string json = BuildPayload(ticket);
   if(json == "")
   {
      Print("CandlesJournal: Ticket #", ticket, " is not a closing deal — skipped");
      return;
   }

   string resp;
   int httpCode = PostJSON(json, resp);
   g_lastSyncAt = TimeCurrent();

   if(httpCode == 200)
   {
      bool isDup = (StringFind(resp, "\"duplicate\":true") >= 0);
      MarkSyncedThisSession(ticket, closeTime);
      if(ticket > GetLastSyncedTicket()) SetLastSyncedTicket(ticket);
      if(closeTime > GetLastSyncTime())  SetLastSyncTime(closeTime);
      if(isDup)
         Print("CandlesJournal: Duplicate #", ticket, " (", StripSuffix(rawSym), ") already in journal");
      else
         Print("CandlesJournal: SYNCED ✓  #", ticket,
               " | ", StripSuffix(rawSym),
               " | P&L $", SafeDouble(NormalizeDouble(profit, 2), 2));
   }
   else if(httpCode == -1)
   {
      int err = GetLastError();
      Print("CandlesJournal: WebRequest FAILED error=", err);
      if(err == 4014)
         Print("CandlesJournal: ACTION REQUIRED → Tools > Options > Expert Advisors > Allow WebRequest > Add: ", InpSyncURL);
      // Retry once after 2 s
      Sleep(2000);
      string resp2;
      int code2 = PostJSON(json, resp2);
      if(code2 == 200)
      {
         MarkSyncedThisSession(ticket, closeTime);
         Print("CandlesJournal: SYNCED (retry) ✓  #", ticket);
      }
      else
         Print("CandlesJournal: Retry also failed HTTP=", code2, " | ", resp2);
   }
   else if(httpCode == 401 || httpCode == 403)
   {
      Print("CandlesJournal: Invalid token (HTTP ", httpCode, ") — check Settings page and regenerate token");
   }
   else if(httpCode == 429)
   {
      Print("CandlesJournal: Rate limited (429) — re-queuing ticket #", ticket);
      ArrayResize(g_queue, g_queueCount + 1);
      g_queue[g_queueCount++] = ticket;
   }
   else
   {
      Print("CandlesJournal: HTTP ", httpCode, " | ", resp);
      // Advance checkpoints past 4xx to prevent infinite retry loop
      if(httpCode >= 400 && httpCode < 500)
      {
         MarkSyncedThisSession(ticket, closeTime);
         if(ticket > GetLastSyncedTicket()) SetLastSyncedTicket(ticket);
         if(closeTime > GetLastSyncTime())  SetLastSyncTime(closeTime);
      }
   }
}

//+------------------------------------------------------------------+
//  ScanHistory — find unprocessed closing deals and queue them
//+------------------------------------------------------------------+
void ScanHistory(int lookbackSeconds)
{
   if(!HistorySelect(TimeCurrent() - lookbackSeconds, TimeCurrent())) return;
   int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
      EnqueueIfNew(HistoryDealGetTicket(i));
}

//+------------------------------------------------------------------+
//  OnInit
//+------------------------------------------------------------------+
int OnInit()
{
   if(InpSyncToken == "")
   {
      Alert("CandlesJournal: Paste your Sync Token in the EA inputs.\nGet it from: Settings page → Generate Token");
      return INIT_PARAMETERS_INCORRECT;
   }
   if(InpSyncURL == "")
   {
      Alert("CandlesJournal: Sync URL is empty.\nCopy it from the Settings page.");
      return INIT_PARAMETERS_INCORRECT;
   }

   Print("CandlesJournal: ====== EA v2.00 INITIALIZING ======");
   Print("CandlesJournal: Account: ",   AccountInfoInteger(ACCOUNT_LOGIN),
         "@",                            AccountInfoString(ACCOUNT_SERVER),
         " | Broker: ",                  AccountInfoString(ACCOUNT_COMPANY),
         " | Currency: ",                AccountInfoString(ACCOUNT_CURRENCY),
         " | Type: ",                    (AccountInfoInteger(ACCOUNT_TRADE_MODE)==ACCOUNT_TRADE_MODE_DEMO) ? "Demo" : "Real",
         " | Cent: ",                    IsCentAccount() ? "Yes" : "No",
         " | Balance: ",                 SafeDouble(AccountInfoDouble(ACCOUNT_BALANCE), 2));

   // Ping the server to validate token and connectivity
   string pingJson  = "{\"token\":\"" + EscapeJSON(InpSyncToken) + "\",\"ping\":true}";
   string pingResp;
   int    pingCode  = PostJSON(pingJson, pingResp);
   Print("CandlesJournal: Ping HTTP ", pingCode, " | ", pingResp);

   if(pingCode == 200)
   {
      Print("CandlesJournal: Connected. Scanning last 7 days for missed trades...");
      ScanHistory(604800);
      Print("CandlesJournal: Initial scan complete — ", g_queueCount, " deal(s) queued");
   }
   else if(pingCode == -1)
   {
      int err = GetLastError();
      if(err == 4014)
         Alert("CandlesJournal: WebRequest is blocked!\n\n"
               "Fix: Tools → Options → Expert Advisors\n"
               "  ✓ Allow WebRequest for listed URL\n"
               "  + Add: " + InpSyncURL);
      else
         Alert("CandlesJournal: Network error " + IntegerToString(err) + ". Check internet connection.");
      return INIT_FAILED;
   }
   else if(pingCode == 401 || pingCode == 403)
   {
      Alert("CandlesJournal: Invalid token (HTTP " + IntegerToString(pingCode) + ").\nRegenerate on the Settings page.");
      return INIT_PARAMETERS_INCORRECT;
   }
   else
   {
      Print("CandlesJournal: Unexpected ping HTTP ", pingCode, " | ", pingResp);
   }

   int interval = (InpSyncIntervalSecs > 0 && InpSyncIntervalSecs <= 300) ? InpSyncIntervalSecs : 30;
   EventSetTimer(interval);
   Print("CandlesJournal: Timer set to ", interval, "s");
   Print("CandlesJournal: ====== EA v2.00 READY ======");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("CandlesJournal: EA removed. Reason=", reason);
}

//--- PRIMARY: timer tick — scan for new deals, then process one from queue
void OnTimer()
{
   ScanHistory(604800);
   ProcessOneFromQueue();
}

//--- SECONDARY: trade event fires — only scan (no WebRequest here, avoids blocking)
void OnTrade()
{
   ScanHistory(86400);
}

//--- TERTIARY: immediate notification on deal add for supported brokers
void OnTradeTransaction(const MqlTradeTransaction& trans,
                        const MqlTradeRequest&     req,
                        const MqlTradeResult&      res)
{
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD)
      ScanHistory(86400);
}
//+------------------------------------------------------------------+
