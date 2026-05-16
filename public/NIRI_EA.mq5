//+------------------------------------------------------------------+
//|  NIRI_EA.mq5                                                     |
//|  Automatically syncs closed trades to your NIRI journal          |
//|  https://niri.live                                                |
//|                                                                   |
//|  INSTALLATION (5 steps, one file only):                          |
//|  1. Open MT5 → File → Open Data Folder → MQL5 → Experts          |
//|  2. Copy NIRI_EA.ex5 into that folder                            |
//|  3. Restart MT5, then open Navigator (Ctrl+N)                    |
//|  4. Tools → Options → Expert Advisors → Allow WebRequest →       |
//|     add https://niri.live                                        |
//|  5. Drag NIRI_EA onto any chart → Inputs tab →                   |
//|     paste your token from niri.live/settings → OK               |
//+------------------------------------------------------------------+
#property copyright "NIRI Trading Journal"
#property link      "https://niri.live"
#property version   "1.20"

//--- Single input: your NIRI sync token from niri.live/settings
input string InpToken = "";   // NIRI sync token (from niri.live/settings)

//--- Internal
#define WEBHOOK_URL     "https://niri.live/api/mt5/ea-sync"
#define CHECK_INTERVAL  10      // seconds between history scans (timer-based)
#define REQUEST_TIMEOUT 10000   // ms per WebRequest call
#define MAX_RETRIES     3
#define MAX_SENT        5000    // in-memory dedup ring buffer size

datetime g_syncWindow  = 0;
bool     g_ready       = false;
string   g_account     = "";
string   g_accountType = "";
int      g_scanCount   = 0;

ulong g_sent[];
int   g_sentCount = 0;

//+------------------------------------------------------------------+
int OnInit()
  {
   if(InpToken == "")
     {
      Alert("NIRI EA: Token is empty.\n"
            "Drag the EA onto a chart → Inputs tab → paste your token from niri.live/settings");
      return INIT_FAILED;
     }

   g_account = IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));

   ENUM_ACCOUNT_TRADE_MODE tradeMode = (ENUM_ACCOUNT_TRADE_MODE)AccountInfoInteger(ACCOUNT_TRADE_MODE);
   g_accountType = (tradeMode == ACCOUNT_TRADE_MODE_REAL) ? "live" : "demo";

   ArrayResize(g_sent, MAX_SENT);
   g_sentCount  = 0;
   g_syncWindow = D'2000.01.01 00:00';
   g_scanCount  = 0;

   Print("NIRI EA v1.20 — Active on account #", g_account,
         " (", AccountInfoString(ACCOUNT_SERVER), ")",
         " type=", g_accountType);
   Print("NIRI EA — Server URL: ", WEBHOOK_URL);

   PingServer();

   // Timer-based scanning — works even when chart has no ticks (weekends, off-hours)
   EventSetTimer(CHECK_INTERVAL);

   g_ready = true;
   Print("NIRI EA — Timer started, scanning every ", CHECK_INTERVAL, "s. History from 2000.01.01");
   return INIT_SUCCEEDED;
  }

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   EventKillTimer();
   if(g_ready)
      Print("NIRI EA — Stopped (reason=", reason, "). Total scans: ", g_scanCount);
  }

//+------------------------------------------------------------------+
// Timer fires every CHECK_INTERVAL seconds regardless of market activity
void OnTimer()
  {
   if(!g_ready) return;
   ScanDeals();
  }

//+------------------------------------------------------------------+
// OnTick kept as backup trigger
void OnTick()
  {
  }

//+------------------------------------------------------------------+
// Sends a minimal ping to verify WebRequest is allowed and token is valid.
void PingServer()
  {
   string pingJson   = "{\"account_number\":\"ping\",\"account_type\":\"ping\"}";
   string reqHeaders = "Content-Type: application/json\r\nAuthorization: Bearer " + InpToken;

   uchar  reqData[];
   uchar  resData[];
   string resHeaders;
   StringToCharArray(pingJson, reqData, 0, StringLen(pingJson));

   int code = WebRequest("POST", WEBHOOK_URL, reqHeaders,
                         REQUEST_TIMEOUT, reqData, resData, resHeaders);

   if(code == -1)
     {
      Alert("NIRI EA — WebRequest blocked.\n\n"
            "Fix: MT5 → Tools → Options → Expert Advisors\n"
            "→ Allow WebRequest for listed URL\n"
            "→ Add: https://niri.live");
      return;
     }
   if(code == 401)
     {
      Alert("NIRI EA — Invalid token (401).\n"
            "Generate a new token at niri.live/settings and re-attach the EA.");
      return;
     }

   string resStr = CharArrayToString(resData);
   Print(StringFormat("NIRI EA — Ping: HTTP %d — server reachable | %s", code, resStr));
  }

//+------------------------------------------------------------------+
void ScanDeals()
  {
   g_scanCount++;

   datetime from = g_syncWindow - 120;
   datetime to   = TimeCurrent() + 60;

   if(!HistorySelect(from, to))
     {
      Print("NIRI EA — Scan #", g_scanCount, ": HistorySelect failed");
      return;
     }

   int total = HistoryDealsTotal();
   Print(StringFormat("NIRI EA — Scan #%d: %d deals in history (window from %s)",
                       g_scanCount, total, TimeToString(g_syncWindow)));

   if(total == 0) return;

   int  sent             = 0;
   int  skipped          = 0;
   int  filtered         = 0;
   bool anyTransientFail = false;

   for(int i = 0; i < total; i++)
     {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0) continue;

      if(IsSent(ticket)) { skipped++; continue; }

      long dealType  = HistoryDealGetInteger(ticket, DEAL_TYPE);
      long dealEntry = HistoryDealGetInteger(ticket, DEAL_ENTRY);

      // Only closing entries on buy/sell deals
      if(dealType  != DEAL_TYPE_BUY  && dealType  != DEAL_TYPE_SELL)    { filtered++; continue; }
      if(dealEntry != DEAL_ENTRY_OUT &&
         dealEntry != DEAL_ENTRY_INOUT &&
         dealEntry != DEAL_ENTRY_OUT_BY) { filtered++; continue; }

      int result = PushDeal(ticket);
      if(result == 1)      { MarkSent(ticket); sent++; }
      else if(result == -1)  MarkSent(ticket);         // permanent — skip forever
      else                   anyTransientFail = true;  // transient — retry next scan
     }

   if(sent > 0 || g_scanCount <= 3)
      Print(StringFormat("NIRI EA — Scan #%d done: %d sent, %d already-sent skipped, %d filtered (non-close deals)",
                          g_scanCount, sent, skipped, filtered));

   if(!anyTransientFail && g_syncWindow < TimeCurrent() - 2 * CHECK_INTERVAL)
      g_syncWindow = TimeCurrent() - 2 * CHECK_INTERVAL;
  }

//+------------------------------------------------------------------+
// Returns: 1 = sent, 0 = transient failure (retry), -1 = permanent failure (skip)
int PushDeal(ulong closeTicket)
  {
   string symbol     = HistoryDealGetString(closeTicket, DEAL_SYMBOL);
   long   dealType   = HistoryDealGetInteger(closeTicket, DEAL_TYPE);
   double volume     = HistoryDealGetDouble(closeTicket, DEAL_VOLUME);
   double closePrice = HistoryDealGetDouble(closeTicket, DEAL_PRICE);
   long   closeTime  = HistoryDealGetInteger(closeTicket, DEAL_TIME);
   double profit     = HistoryDealGetDouble(closeTicket, DEAL_PROFIT);
   double commission = HistoryDealGetDouble(closeTicket, DEAL_COMMISSION);
   double swap_val   = HistoryDealGetDouble(closeTicket, DEAL_SWAP);
   string comment    = HistoryDealGetString(closeTicket, DEAL_COMMENT);
   long   posId      = HistoryDealGetInteger(closeTicket, DEAL_POSITION_ID);

   // Closing deal type is opposite of original position direction
   string direction = (dealType == DEAL_TYPE_SELL) ? "BUY" : "SELL";
   double openPrice = 0.0;
   long   openTime  = 0;

   if(HistorySelectByPosition(posId))
     {
      int n = HistoryDealsTotal();
      for(int j = 0; j < n; j++)
        {
         ulong pt = HistoryDealGetTicket(j);
         if(HistoryDealGetInteger(pt, DEAL_ENTRY) == DEAL_ENTRY_IN)
           {
            openPrice = HistoryDealGetDouble(pt, DEAL_PRICE);
            openTime  = HistoryDealGetInteger(pt, DEAL_TIME);
            long openType = HistoryDealGetInteger(pt, DEAL_TYPE);
            direction = (openType == DEAL_TYPE_BUY) ? "BUY" : "SELL";
            break;
           }
        }
      HistorySelect(g_syncWindow - 120, TimeCurrent() + 60);
     }

   string json =
      "{"
      "\"account_number\":\"" + g_account                          + "\","
      "\"account_type\":\""   + g_accountType                      + "\","
      "\"ticket\":"           + IntegerToString((long)closeTicket)  + ","
      "\"symbol\":\""         + symbol                             + "\","
      "\"type\":\""           + direction                          + "\","
      "\"volume\":"           + DoubleToString(volume,     2)       + ","
      "\"open_price\":"       + DoubleToString(openPrice,  5)       + ","
      "\"close_price\":"      + DoubleToString(closePrice, 5)       + ","
      "\"open_time\":"        + IntegerToString(openTime)           + ","
      "\"close_time\":"       + IntegerToString(closeTime)          + ","
      "\"profit\":"           + DoubleToString(profit,     2)       + ","
      "\"commission\":"       + DoubleToString(commission, 2)       + ","
      "\"swap\":"             + DoubleToString(swap_val,   2)       + ","
      "\"comment\":\""        + EscapeJson(comment)                 + "\""
      "}";

   string reqHeaders =
      "Content-Type: application/json\r\n"
      "Authorization: Bearer " + InpToken;

   for(int attempt = 1; attempt <= MAX_RETRIES; attempt++)
     {
      uchar  reqData[];
      uchar  resData[];
      string resHeaders;
      StringToCharArray(json, reqData, 0, StringLen(json));

      int code = WebRequest("POST", WEBHOOK_URL, reqHeaders,
                            REQUEST_TIMEOUT, reqData, resData, resHeaders);

      string resStr = CharArrayToString(resData);
      Print(StringFormat("NIRI EA — #%I64d attempt %d/%d → HTTP %d | %s",
                          (long)closeTicket, attempt, MAX_RETRIES, code, resStr));

      if(code == 200)
        {
         Print(StringFormat("NIRI EA — Synced #%I64d %s %s %.2f lots | P&L: %.2f",
                             (long)closeTicket, symbol, direction, volume, profit));
         return 1;
        }

      if(code == 401)
        {
         Alert("NIRI EA — Token rejected (401).\n"
               "Generate a new token at niri.live/settings and re-attach the EA.");
         return -1;
        }

      if(code == 403)
        {
         Alert("NIRI EA — Server rejected sync (403).\n"
               "Response: " + resStr + "\n"
               "If account mismatch: generate a new token at niri.live/settings");
         return -1;
        }

      if(code == -1)
        {
         Alert("NIRI EA — WebRequest blocked.\n\n"
               "Fix: MT5 → Tools → Options → Expert Advisors\n"
               "→ Allow WebRequest for listed URL\n"
               "→ Add: https://niri.live");
         return -1;
        }

      if(attempt < MAX_RETRIES)
        {
         Print(StringFormat("NIRI EA — Attempt %d/%d failed (HTTP %d), retrying…",
                             attempt, MAX_RETRIES, code));
         Sleep(2000 * attempt);
        }
      else
        {
         Print(StringFormat("NIRI EA — Failed to sync #%I64d after %d attempts (last HTTP %d)",
                             (long)closeTicket, MAX_RETRIES, code));
        }
     }
   return 0;
  }

//+------------------------------------------------------------------+
string EscapeJson(string s)
  {
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   StringReplace(s, "\n", "\\n");
   StringReplace(s, "\r", "\\r");
   StringReplace(s, "\t", "\\t");
   return s;
  }

//+------------------------------------------------------------------+
bool IsSent(ulong ticket)
  {
   for(int i = 0; i < g_sentCount; i++)
      if(g_sent[i] == ticket) return true;
   return false;
  }

//+------------------------------------------------------------------+
void MarkSent(ulong ticket)
  {
   if(g_sentCount < MAX_SENT)
     {
      g_sent[g_sentCount++] = ticket;
     }
   else
     {
      for(int i = 0; i < MAX_SENT - 1; i++)
         g_sent[i] = g_sent[i + 1];
      g_sent[MAX_SENT - 1] = ticket;
     }
  }
//+------------------------------------------------------------------+
