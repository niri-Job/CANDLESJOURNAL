//+------------------------------------------------------------------+
//|                                       CandlesJournalEA.mq5      |
//|          Automatically syncs closed trades to CandlesJournal     |
//+------------------------------------------------------------------+
#property copyright "CandlesJournal"
#property version   "1.00"
#property description "Syncs every closed trade to your CandlesJournal automatically."

input string InpSyncToken = "";                                                                   // Sync Token  (paste from Settings page)
input string InpServerURL = "https://symphonious-lily-0d7ae0.netlify.app/api/mt5/sync";           // Sync URL    (pre-filled for your live app)

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

   // ── Connection test ───────────────────────────────────────────
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
      Print("CandlesJournal ✓  Connected. Token valid. Ready to sync trades.");
   }
   else if(code == -1)
   {
      int err = GetLastError();
      Print("CandlesJournal ✗  Cannot reach server (error ", err, ")");
      if(err == 4014)
         Alert("CandlesJournal: WebRequest blocked by MT5!\n\n"
               "Fix: Tools → Options → Expert Advisors\n"
               "  ✓ Check 'Allow WebRequest for listed URL'\n"
               "  + Add: " + InpServerURL + "\n\n"
               "Then re-attach the EA.");
      else
         Alert("CandlesJournal: Network error " + IntegerToString(err) + ".\nCheck your internet connection.");
      return(INIT_FAILED);
   }
   else if(code == 401)
   {
      Alert("CandlesJournal: Invalid sync token!\n\n"
            "Go to the Settings page → Regenerate Token\n"
            "Then paste the new token into the EA inputs.");
      return(INIT_PARAMETERS_INCORRECT);
   }
   else
   {
      Print("CandlesJournal !  Init ping returned HTTP ", code, " — check server logs.");
   }

   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason) { }
void OnTick()                   { }

//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction& trans,
                        const MqlTradeRequest&     request,
                        const MqlTradeResult&      result)
{
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD)
      return;

   if(!HistoryDealSelect(trans.deal))
      return;

   ENUM_DEAL_ENTRY dealEntry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(trans.deal, DEAL_ENTRY);
   if(dealEntry != DEAL_ENTRY_OUT)
      return;

   // ── Closing deal details ──────────────────────────────────────
   string   symbol    = HistoryDealGetString(trans.deal,  DEAL_SYMBOL);
   double   exitPrice = HistoryDealGetDouble(trans.deal,  DEAL_PRICE);
   double   volume    = HistoryDealGetDouble(trans.deal,  DEAL_VOLUME);
   double   profit    = HistoryDealGetDouble(trans.deal,  DEAL_PROFIT)
                      + HistoryDealGetDouble(trans.deal,  DEAL_SWAP)
                      + HistoryDealGetDouble(trans.deal,  DEAL_COMMISSION);
   datetime closeTime = (datetime)HistoryDealGetInteger(trans.deal, DEAL_TIME);
   long     posId     = HistoryDealGetInteger(trans.deal, DEAL_POSITION_ID);

   // ── Find opening deal → entry price and direction ─────────────
   string direction  = "BUY";
   double entryPrice = 0;
   double sl = 0, tp = 0;

   if(HistorySelectByPosition(posId))
   {
      int nDeals = HistoryDealsTotal();
      for(int i = 0; i < nDeals; i++)
      {
         ulong tk = HistoryDealGetTicket(i);
         if(HistoryDealGetInteger(tk, DEAL_POSITION_ID) != posId) continue;

         ENUM_DEAL_ENTRY de = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(tk, DEAL_ENTRY);
         if(de == DEAL_ENTRY_IN)
         {
            direction  = (HistoryDealGetInteger(tk, DEAL_TYPE) == DEAL_TYPE_BUY) ? "BUY" : "SELL";
            entryPrice = HistoryDealGetDouble(tk, DEAL_PRICE);
            break;
         }
      }

      int nOrders = HistoryOrdersTotal();
      for(int i = 0; i < nOrders; i++)
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

   // ── Date string ───────────────────────────────────────────────
   MqlDateTime dt;
   TimeToStruct(closeTime, dt);
   string dateStr = StringFormat("%04d-%02d-%02d", dt.year, dt.mon, dt.day);

   // ── Asset class detection ──────────────────────────────────────
   string assetClass = "Forex";
   string symUp = symbol;
   StringToUpper(symUp);

   if(StringFind(symUp,"BTC") >= 0 || StringFind(symUp,"ETH") >= 0 ||
      StringFind(symUp,"XRP") >= 0 || StringFind(symUp,"BNB") >= 0 ||
      StringFind(symUp,"SOL") >= 0 || StringFind(symUp,"DOGE") >= 0 ||
      StringFind(symUp,"ADA") >= 0 || StringFind(symUp,"LTC") >= 0)
      assetClass = "Crypto";
   else if(StringFind(symUp,"SPX")  >= 0 || StringFind(symUp,"SP500") >= 0 ||
           StringFind(symUp,"NAS")  >= 0 || StringFind(symUp,"NDX")   >= 0 ||
           StringFind(symUp,"US30") >= 0 || StringFind(symUp,"DJ30")  >= 0 ||
           StringFind(symUp,"DAX")  >= 0 || StringFind(symUp,"FTSE")  >= 0 ||
           StringFind(symUp,"CAC")  >= 0 || StringFind(symUp,"UK100") >= 0 ||
           StringFind(symUp,"GER")  >= 0 || StringFind(symUp,"AUS200")>= 0)
      assetClass = "Indices";

   // ── Build JSON payload ─────────────────────────────────────────
   string slStr = (sl > 0) ? StringFormat("%.5f", sl) : "null";
   string tpStr = (tp > 0) ? StringFormat("%.5f", tp) : "null";

   string json = StringFormat(
      "{"
        "\"token\":\"%s\","
        "\"trade\":{"
          "\"pair\":\"%s\","
          "\"direction\":\"%s\","
          "\"lot\":%.2f,"
          "\"date\":\"%s\","
          "\"entry\":%.5f,"
          "\"exit\":%.5f,"
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

   // ── HTTP POST ──────────────────────────────────────────────────
   char   postData[];
   char   resData[];
   string resHeaders;
   string reqHeaders = "Content-Type: application/json\r\nAccept: application/json\r\n";

   int charLen = StringToCharArray(json, postData, 0, StringLen(json));
   ArrayResize(postData, charLen - 1);

   ResetLastError();
   int httpCode = WebRequest("POST", InpServerURL, reqHeaders, 10000, postData, resData, resHeaders);

   if(httpCode == 200)
   {
      Print("CandlesJournal ✓  ", symbol, " ", direction,
            " | Lot: ", DoubleToString(volume, 2),
            " | P&L: $", DoubleToString(NormalizeDouble(profit, 2), 2));
   }
   else if(httpCode == -1)
   {
      int err = GetLastError();
      Print("CandlesJournal ✗  WebRequest failed (error ", err, ")");
      if(err == 4014)
         Print("  → Go to MT5: Tools > Options > Expert Advisors > Allow WebRequest");
      Print("  → Add this URL: ", InpServerURL);
   }
   else
   {
      string resp = CharArrayToString(resData);
      Print("CandlesJournal ✗  HTTP ", httpCode, " — ", resp);
   }
}
//+------------------------------------------------------------------+
