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
//|     add https://www.niri.live                                    |
//|  5. Drag NIRI_EA onto any chart → Inputs tab →                   |
//|     paste your token from niri.live/settings → OK               |
//+------------------------------------------------------------------+
#property copyright "NIRI Trading Journal"
#property link      "https://niri.live"
#property version   "1.00"

//--- Single input: your NIRI sync token from niri.live/settings
input string InpToken = "";   // NIRI sync token (from niri.live/settings)

//--- Internal
#define WEBHOOK_URL     "https://www.niri.live/api/mt5/ea-sync"
#define CHECK_INTERVAL  5       // seconds between history scans
#define REQUEST_TIMEOUT 8000    // ms per WebRequest call
#define MAX_RETRIES     3
#define MAX_SENT        5000    // in-memory dedup ring buffer size

datetime g_lastCheck  = 0;
datetime g_syncWindow = 0;   // oldest time to look for deals
bool     g_ready      = false;
string   g_account    = "";  // auto-detected from MT5 on init

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

   g_account    = IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
   ArrayResize(g_sent, MAX_SENT);
   g_sentCount  = 0;
   g_syncWindow = D'2000.01.01 00:00';   // scan entire account history
   g_lastCheck  = TimeCurrent();
   g_ready      = true;

   Print("NIRI EA v1.0 — Active on account #", g_account,
         " (", AccountInfoString(ACCOUNT_SERVER), ")");
   Print("NIRI EA — Scanning full account history from 2000.01.01");
   return INIT_SUCCEEDED;
  }

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   if(g_ready)
      Print("NIRI EA — Stopped (reason=", reason, ")");
  }

//+------------------------------------------------------------------+
void OnTick()
  {
   if(!g_ready) return;
   if(TimeCurrent() - g_lastCheck < CHECK_INTERVAL) return;
   g_lastCheck = TimeCurrent();
   ScanDeals();
  }

//+------------------------------------------------------------------+
void ScanDeals()
  {
   datetime from = g_syncWindow - 120;   // 2-minute safety buffer
   datetime to   = TimeCurrent() + 60;

   if(!HistorySelect(from, to)) return;

   int  total            = HistoryDealsTotal();
   bool anyTransientFail = false;

   for(int i = 0; i < total; i++)
     {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0 || IsSent(ticket)) continue;

      long dealType  = HistoryDealGetInteger(ticket, DEAL_TYPE);
      long dealEntry = HistoryDealGetInteger(ticket, DEAL_ENTRY);

      // Only closing entries on buy/sell deals
      if(dealType  != DEAL_TYPE_BUY  && dealType  != DEAL_TYPE_SELL)    continue;
      if(dealEntry != DEAL_ENTRY_OUT &&
         dealEntry != DEAL_ENTRY_INOUT &&
         dealEntry != DEAL_ENTRY_OUT_BY) continue;

      int result = PushDeal(ticket);
      if(result == 1)
         MarkSent(ticket);         // success — skip on future scans
      else if(result == -1)
         MarkSent(ticket);         // permanent error — skip forever, don't retry
      else
         anyTransientFail = true;  // network/server error — keep in window for retry
     }

   // Only advance sync window when every deal in this batch succeeded or got a permanent error.
   // Transient failures keep the window in place so they're retried on the next scan.
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

   // Closing deal type is the opposite of the original position direction:
   // DEAL_TYPE_BUY on a close = original SELL position; DEAL_TYPE_SELL on close = BUY position
   string direction = (dealType == DEAL_TYPE_SELL) ? "BUY" : "SELL";
   double openPrice = 0.0;
   long   openTime  = 0;

   // Look up the entry deal to get original open price / open time
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
      // Restore the main history window
      HistorySelect(g_syncWindow - 120, TimeCurrent() + 60);
     }

   // Build JSON — manual construction avoids external library dependency
   string json =
      "{"
      "\"account_number\":\"" + g_account          + "\","
      "\"ticket\":"           + IntegerToString((long)closeTicket) + ","
      "\"symbol\":\""         + symbol              + "\","
      "\"type\":\""           + direction           + "\","
      "\"volume\":"           + DoubleToString(volume,     2) + ","
      "\"open_price\":"       + DoubleToString(openPrice,  5) + ","
      "\"close_price\":"      + DoubleToString(closePrice, 5) + ","
      "\"open_time\":"        + IntegerToString(openTime)     + ","
      "\"close_time\":"       + IntegerToString(closeTime)    + ","
      "\"profit\":"           + DoubleToString(profit,     2) + ","
      "\"commission\":"       + DoubleToString(commission, 2) + ","
      "\"swap\":"             + DoubleToString(swap_val,   2) + ","
      "\"comment\":\""        + EscapeJson(comment)          + "\""
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

      if(code == 200)
        {
         Print(StringFormat("NIRI EA — Synced #%I64d %s %s %.2f lots | P&L: %.2f",
                             (long)closeTicket, symbol, direction, volume, profit));
         return 1;
        }

      if(code == 403)
        {
         Alert("NIRI EA — Server rejected sync.\n"
               "Your token may be for a different account.\n"
               "Generate a new token at niri.live/settings");
         return -1;   // permanent — don't retry
        }

      if(code == -1)
        {
         Alert("NIRI EA — WebRequest blocked.\n\n"
               "Fix: MT5 → Tools → Options → Expert Advisors\n"
               "→ Allow WebRequest for listed URL\n"
               "→ Add: https://www.niri.live");
         return -1;   // permanent — missing URL permission
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
   return 0;   // transient failure — will be retried on next scan
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
      // Ring buffer: evict oldest entry
      for(int i = 0; i < MAX_SENT - 1; i++)
         g_sent[i] = g_sent[i + 1];
      g_sent[MAX_SENT - 1] = ticket;
     }
  }
//+------------------------------------------------------------------+
