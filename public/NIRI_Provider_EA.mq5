//+------------------------------------------------------------------+
//|  NIRI_Provider_EA.mq5                                            |
//|  Broadcasts your trades to NIRI Copy Trading subscribers         |
//|  https://niri.live                                               |
//|                                                                  |
//|  SETUP:                                                          |
//|  1. Go to niri.live/copy-trading → Become a Provider            |
//|  2. Copy your Provider Token                                     |
//|  3. Tools → Options → Expert Advisors → Allow WebRequest →      |
//|     add https://niri.live                                        |
//|  4. Drag this EA onto any chart → Inputs → paste Provider Token  |
//+------------------------------------------------------------------+
#property copyright "NIRI Trading Journal"
#property link      "https://niri.live"
#property version   "1.00"

input string InpProviderToken = "";   // Your Provider Token from niri.live/copy-trading

#define SIGNAL_URL      "https://niri.live/api/copy-trading/signal"
#define REQUEST_TIMEOUT 15000

string g_token = "";

//+------------------------------------------------------------------+
int OnInit()
  {
   if(InpProviderToken == "")
     {
      Alert("NIRI Provider EA: Provider Token is empty.\n"
            "Go to niri.live/copy-trading → Become a Provider to get your token.");
      return INIT_FAILED;
     }

   g_token = InpProviderToken;

   Print("NIRI Provider EA v1.00 starting on account #",
         IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)),
         " (", AccountInfoString(ACCOUNT_SERVER), ")");

   // Send heartbeat to confirm connection
   SendSignal("heartbeat", 0, "", "", 0, 0, 0, 0, 0, 0,
              AccountInfoDouble(ACCOUNT_BALANCE));

   EventSetTimer(60); // heartbeat every 60s
   return INIT_SUCCEEDED;
  }

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   EventKillTimer();
   Print("NIRI Provider EA stopped. Reason: ", reason);
  }

//+------------------------------------------------------------------+
void OnTimer()
  {
   // Periodic heartbeat keeps provider marked as active
   SendSignal("heartbeat", 0, "", "", 0, 0, 0, 0, 0, 0,
              AccountInfoDouble(ACCOUNT_BALANCE));
  }

//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest     &request,
                        const MqlTradeResult      &result)
  {
   // Only handle deal events
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD) return;

   ulong dealTicket = trans.deal;
   if(dealTicket == 0) return;

   if(!HistoryDealSelect(dealTicket)) return;

   ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
   ENUM_DEAL_TYPE  dealType = (ENUM_DEAL_TYPE)HistoryDealGetInteger(dealTicket, DEAL_TYPE);

   // Skip non-trade deals (balance, credit, etc.)
   if(dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL) return;

   string  sym       = HistoryDealGetString(dealTicket, DEAL_SYMBOL);
   double  volume    = HistoryDealGetDouble(dealTicket, DEAL_VOLUME);
   double  price     = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
   double  sl        = 0;
   double  tp        = 0;
   double  profit    = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
   ulong   posTicket = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);
   string  dir       = (dealType == DEAL_TYPE_BUY) ? "buy" : "sell";
   double  balance   = AccountInfoDouble(ACCOUNT_BALANCE);

   if(entry == DEAL_ENTRY_IN)
     {
      // Trade opened — get SL/TP from the position
      if(PositionSelectByTicket(posTicket))
        {
         sl = PositionGetDouble(POSITION_SL);
         tp = PositionGetDouble(POSITION_TP);
        }

      Print("NIRI Provider EA — OPEN #", IntegerToString((int)dealTicket),
            " ", sym, " ", dir, " lot=", DoubleToString(volume, 2),
            " @", DoubleToString(price, _Digits));

      SendSignal("open", (int)dealTicket, sym, dir, volume, price, sl, tp, 0, 0, balance);
     }
   else if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY)
     {
      Print("NIRI Provider EA — CLOSE #", IntegerToString((int)dealTicket),
            " ", sym, " pnl=", DoubleToString(profit, 2));

      SendSignal("close", (int)posTicket, sym, dir, volume, 0, 0, 0, price, profit, balance);
     }
  }

//+------------------------------------------------------------------+
void OnTradeUpdate()
  {
   // Detect SL/TP modifications on open positions
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;

      double sl = PositionGetDouble(POSITION_SL);
      double tp = PositionGetDouble(POSITION_TP);

      static double prevSL = 0, prevTP = 0;
      if(sl != prevSL || tp != prevTP)
        {
         string sym = PositionGetString(POSITION_SYMBOL);
         Print("NIRI Provider EA — MODIFY #", IntegerToString((int)ticket),
               " ", sym, " new_sl=", DoubleToString(sl, _Digits),
               " new_tp=", DoubleToString(tp, _Digits));

         SendSignal("modify", (int)ticket, sym, "", 0, 0, sl, tp, 0, 0,
                    AccountInfoDouble(ACCOUNT_BALANCE));
         prevSL = sl;
         prevTP = tp;
        }
     }
  }

//+------------------------------------------------------------------+
void SendSignal(string action, int ticket, string symbol, string direction,
                double lot, double entry, double sl, double tp,
                double close_price, double pnl, double balance)
  {
   string body = "{";
   body += "\"action\":\"" + action + "\"";
   if(ticket > 0)       body += ",\"ticket\":" + IntegerToString(ticket);
   if(symbol != "")     body += ",\"symbol\":\"" + symbol + "\"";
   if(direction != "")  body += ",\"direction\":\"" + direction + "\"";
   if(lot > 0)          body += ",\"lot_size\":" + DoubleToString(lot, 2);
   if(entry > 0)        body += ",\"entry_price\":" + DoubleToString(entry, 5);
   if(sl > 0)           body += ",\"stop_loss\":" + DoubleToString(sl, 5);
   if(tp > 0)           body += ",\"take_profit\":" + DoubleToString(tp, 5);
   if(close_price > 0)  body += ",\"close_price\":" + DoubleToString(close_price, 5);
   if(pnl != 0)         body += ",\"pnl\":" + DoubleToString(pnl, 2);
   if(balance > 0)      body += ",\"account_balance\":" + DoubleToString(balance, 2);
   body += "}";

   string headers = "Content-Type: application/json\r\nAuthorization: Bearer " + g_token;
   uchar  postData[], responseData[];
   string responseHeaders;

   StringToCharArray(body, postData, 0, StringLen(body));

   int statusCode = WebRequest("POST", SIGNAL_URL, headers, REQUEST_TIMEOUT,
                               postData, responseData, responseHeaders);

   if(statusCode == 200)
     {
      if(action != "heartbeat")
        Print("NIRI — Signal sent OK: action=", action, " ticket=", ticket);
     }
   else
     {
      string resp = CharArrayToString(responseData);
      Print("NIRI — Signal FAILED: action=", action, " HTTP=", statusCode,
            " response=", StringLen(resp) > 0 ? resp : "(empty)");
     }
  }
//+------------------------------------------------------------------+
