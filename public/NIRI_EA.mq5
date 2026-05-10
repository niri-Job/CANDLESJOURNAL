//+------------------------------------------------------------------+
//|  NIRI_EA.mq5                                                     |
//|  Automatically syncs closed trades to your NIRI journal          |
//|  https://niri.live                                                |
//|                                                                   |
//|  INSTALLATION:                                                    |
//|  1. Open MetaEditor (MT5 → Tools → MetaQuotes Language Editor)   |
//|  2. Open this file, press F7 to compile                          |
//|  3. Copy NIRI_EA.ex5 to MT5 → File → Open Data Folder →         |
//|     MQL5 → Experts                                               |
//|  4. Restart MT5 or press F5 in Navigator                         |
//|  5. Tools → Options → Expert Advisors → Allow WebRequest →       |
//|     add https://niri.live                                        |
//|  6. Drag EA onto any chart, click Load → select NIRI_settings.set|
//+------------------------------------------------------------------+
#property copyright "NIRI Trading Journal"
#property link      "https://niri.live"
#property version   "1.00"

//--- Inputs — loaded automatically via NIRI_settings.set
input string InpToken   = "";   // NIRI sync token (from niri.live/settings)
input string InpAccount = "";   // Your registered MT5 account number

//--- Internal
#define WEBHOOK_URL     "https://niri.live/api/mt5/ea-sync"
#define CHECK_INTERVAL  5       // seconds between history scans
#define REQUEST_TIMEOUT 8000    // ms per WebRequest call
#define MAX_RETRIES     3
#define MAX_SENT        5000    // in-memory dedup ring buffer size

datetime g_lastCheck   = 0;
datetime g_syncWindow  = 0;     // oldest time to look for deals
bool     g_ready       = false;

ulong g_sent[];
int   g_sentCount = 0;

//+------------------------------------------------------------------+
int OnInit()
  {
   if(InpToken == "")
     {
      Alert("NIRI EA: Token is empty.\n"
            "Attach EA → Properties → Inputs → Load → select NIRI_settings.set\n"
            "Get your settings file at niri.live/settings");
      return INIT_FAILED;
     }

   if(InpAccount == "")
     {
      Alert("NIRI EA: Account number is empty. Load your NIRI_settings.set file.");
      return INIT_FAILED;
     }

   string currentLogin = IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
   if(currentLogin != InpAccount)
     {
      Alert("NIRI EA — Account Mismatch\n\n"
            "Registered account: #" + InpAccount + "\n"
            "Current account:    #" + currentLogin + "\n\n"
            "This EA is locked to a different account.\n"
            "Please download a new EA from niri.live/settings");
      return INIT_FAILED;
     }

   ArrayResize(g_sent, MAX_SENT);
   g_sentCount  = 0;
   // Look back 24 h on first start to catch any trades we missed
   g_syncWindow = TimeCurrent() - 86400;
   g_lastCheck  = TimeCurrent();
   g_ready      = true;

   Print("NIRI EA v1.0 — Active on account #", currentLogin,
         " (", AccountInfoString(ACCOUNT_SERVER), ")");
   Print("NIRI EA — Scanning history from ", TimeToString(g_syncWindow));
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

   // Re-check account lock on every tick — tamper protection
   if(IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) != InpAccount)
     {
      Print("NIRI EA — Account mismatch on tick. Disabling.");
      ExpertRemove();
      return;
     }

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

   int total = HistoryDealsTotal();
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

      if(PushDeal(ticket))
         MarkSent(ticket);
     }

   // Advance sync window so we don't re-scan the distant past every tick
   if(g_syncWindow < TimeCurrent() - 2 * CHECK_INTERVAL)
      g_syncWindow = TimeCurrent() - 2 * CHECK_INTERVAL;
  }

//+------------------------------------------------------------------+
bool PushDeal(ulong closeTicket)
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
      "\"account_number\":\"" + InpAccount      + "\","
      "\"ticket\":"           + IntegerToString((long)closeTicket) + ","
      "\"symbol\":\""         + symbol           + "\","
      "\"type\":\""           + direction        + "\","
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
         return true;
        }

      if(code == 403)
        {
         Alert("NIRI EA — Server rejected sync (account mismatch or revoked token).\n"
               "Generate a new EA at niri.live/settings");
         return false;   // permanent — don't retry
        }

      if(code == -1)
        {
         Alert("NIRI EA — WebRequest blocked.\n\n"
               "Fix: MT5 → Tools → Options → Expert Advisors\n"
               "→ Allow WebRequest for listed URL\n"
               "→ Add: https://niri.live");
         return false;   // permanent — missing URL permission
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
   return false;
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
