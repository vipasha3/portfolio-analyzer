import React, { useState, useEffect } from 'react';
import { 
  Upload, TrendingUp, Radio, Loader2, ArrowUpRight, ArrowDownRight, 
  ShieldAlert, Sparkles, PieChart, Home, BarChart3, 
  ArrowRightLeft, User, RefreshCw, FileText, Sun, Moon, Monitor, Lightbulb,
  Zap
} from 'lucide-react';
import { extractTextFromPdf } from './utils/pdfExtractor';

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;

export default function App() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [activeTab, setActiveTab] = useState('home');
  const [errorMsg, setErrorMsg] = useState('');
  
  // Theme State
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sharekhan_theme') || 'system';
    }
    return 'system';
  });

  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = window.document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const dark = theme === 'dark' || (theme === 'system' && mediaQuery.matches);
      setIsDark(dark);
      if (dark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    applyTheme();
    localStorage.setItem('sharekhan_theme', theme);

    const listener = () => {
      if (theme === 'system') {
        applyTheme();
      }
    };

    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, [theme]);

  const cycleTheme = () => {
    if (theme === 'system') setTheme('light');
    else if (theme === 'light') setTheme('dark');
    else setTheme('system');
  };

  const handleFileUpload = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setErrorMsg('');
    }
  };

  const fetchLiveNavForFunds = async (fundNames) => {
    let liveDataSummary = [];
    for (const fundName of fundNames) {
      if (!fundName || fundName.trim().length < 3) continue;
      try {
        const cleanName = fundName.replace(/Direct|Growth|Option|Plan|-/gi, '').trim();
        const searchRes = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(cleanName)}`);
        const searchData = await searchRes.json();

        if (searchData && searchData.length > 0) {
          const matchedScheme = searchData.find(s => s.schemeName.toLowerCase().includes('direct') && s.schemeName.toLowerCase().includes('growth')) || searchData[0];
          
          const navRes = await fetch(`https://api.mfapi.in/mf/${matchedScheme.schemeCode}`);
          const navData = await navRes.json();

          if (navData && navData.data && navData.data[0]) {
            const latest = navData.data[0];
            liveDataSummary.push({
              name: fundName,
              officialName: navData.meta.scheme_name,
              liveNav: parseFloat(latest.nav),
              navDate: latest.date
            });
          }
        }
      } catch (e) {
        console.error(`Error fetching NAV for ${fundName}:`, e);
      }
    }
    return liveDataSummary;
  };

  const handleAnalyze = async () => {
    if (!file) return;

    setLoading(true);
    setErrorMsg('');

    try {
      const pdfText = await extractTextFromPdf(file);

      if (!pdfText || pdfText.trim().length === 0) {
        setErrorMsg("Unable to read PDF content. Please upload a valid or unlocked PDF statement.");
        setLoading(false);
        return;
      }

      const extractFundsPrompt = `
        Extract ONLY Mutual Fund names present in this statement text as a comma-separated list.
        PDF Content: ${pdfText.substring(0, 3000)}
      `;

      const fundListRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: extractFundsPrompt }]
        })
      });

      if (!fundListRes.ok) {
        throw new Error('Failed to fetch fund names from Groq API');
      }

      const fundListData = await fundListRes.json();
      const extractedNamesText = fundListData.choices?.[0]?.message?.content || "";
      const extractedFundNames = extractedNamesText.split(',').map(name => name.trim()).filter(Boolean);

      const liveNavs = await fetchLiveNavForFunds(extractedFundNames);

      const promptText = `
        Analyze this PDF portfolio statement against current market trends and live NAVs. 
        Calculate the CURRENT VALUE of each fund using total units multiplied by current Live NAV.
        
        CRITICAL REQUIREMENT:
        1. Calculate exact portfolio allocation percentages for 'allocationState'.
        2. Give concrete 'recommendedAction' for portfolio rebalancing.
        3. Quantify 'expectedResult' (e.g. potential volatility reduction or return enhancement).
        4. For any fund marked for 'REBALANCE', 'SWITCH', or 'REPLACE', suggest a top-performing alternative fund in 'suggestedTargetFund'.

        Return ONLY a valid JSON object without markdown formatting.

        Live Market Data: ${JSON.stringify(liveNavs)}
        PDF Content: ${pdfText.substring(0, 4000)}

        Return JSON strictly in this format:
        {
          "investorName": "Name of investor from PDF",
          "totalInvested": "Total Investment Amount from PDF statement",
          "currentTotalValue": "Calculated Current Portfolio Total Value based on live NAVs",
          "riskLevel": "Low / Medium / High",
          "replacementOverview": "Strategy Overview paragraph explaining overall market alignment and exposure balance",
          "rebalancingStrategy": {
            "allocationState": "Detailed breakdown of fund percentages (e.g., 20.05% in Fund A, 59.83% in Fund B...)",
            "recommendedAction": "Clear advice on reducing or increasing exposure across caps/funds",
            "expectedResult": "Quantified expected result (e.g. This adjustment could potentially reduce volatility by 5-7%...)"
          },
          "funds": [
            {
              "name": "Fund Name from PDF",
              "pdfValue": "Invested Amount from PDF",
              "units": "Total Units held in PDF",
              "liveNav": "Live NAV value from provided Live Market Data",
              "currentValue": "Calculated value (Units * Live NAV)",
              "date": "Exact NAV Date from provided Live Market Data (e.g. DD-MM-YYYY)",
              "impact": "Up / Down / Stable",
              "action": "KEEP / CONTINUE SIP / REBALANCE / SWITCH",
              "suggestedTargetFund": "Specific fund name to switch into if action is REBALANCE/SWITCH, otherwise null",
              "suggestion": "Detailed reasoning based on market return and performance."
            }
          ]
        }
      `;

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: promptText }]
        })
      });

      if (!res.ok) {
        throw new Error('Failed to analyze portfolio with Groq API');
      }

      const data = await res.json();
      const parsedData = JSON.parse(data.choices[0].message.content);
      
      if (!parsedData.investorName || parsedData.investorName.toLowerCase().includes("unknown")) {
        const nameFromFileName = file.name.split('.')[0].replace(/[^a-zA-Z0-9\s]/g, ' ') || "Investor";
        parsedData.investorName = nameFromFileName;
      }

      setAnalysis(parsedData);
      setActiveTab('analysis');

    } catch (err) {
      console.error('API Error:', err);
      setErrorMsg('Error analyzing statement. Please check your API key or network connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setAnalysis(null);
    setErrorMsg('');
    setActiveTab('home');
  };

  return (
    <div className={`min-h-screen font-sans transition-colors duration-300 ${
      isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'
    }`}>
      
      <div className="w-full max-w-lg mx-auto flex-1 flex flex-col min-h-screen relative pb-20">
        
        {/* Top Header */}
        <header className={`sticky top-0 z-50 p-4 flex items-center justify-between shadow-lg backdrop-blur-md transition-colors ${
          isDark ? 'bg-emerald-900/90 text-white' : 'bg-emerald-600 text-white'
        }`}>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-emerald-200" />
            <span className="font-bold text-base tracking-wide">Portfolio Analyzer</span>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={cycleTheme}
              className="p-1.5 rounded-lg bg-emerald-950/40 hover:bg-emerald-950/60 text-emerald-100 border border-emerald-400/30 flex items-center gap-1 text-xs transition-all active:scale-95"
              title={`Current Theme: ${theme.toUpperCase()}`}
            >
              {theme === 'dark' && <Moon className="w-4 h-4 text-emerald-300" />}
              {theme === 'light' && <Sun className="w-4 h-4 text-amber-300" />}
              {theme === 'system' && <Monitor className="w-4 h-4 text-emerald-200" />}
              <span className="text-[10px] capitalize font-medium hidden sm:inline">{theme}</span>
            </button>

            <div className="flex items-center gap-1.5 text-xs bg-emerald-950/50 px-2.5 py-1 rounded-full text-emerald-100 border border-emerald-400/30">
              <Radio className="w-3 h-3 text-emerald-300 animate-pulse" /> Live NAV
            </div>
          </div>
        </header>

        {/* Main Body Content */}
        <main className="p-4 flex-1">

          {/* TAB 1: HOME */}
          {activeTab === 'home' && (
            <div className="space-y-4">
              <div className={`p-5 rounded-2xl border text-center space-y-4 mt-2 shadow-lg transition-colors ${
                isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-slate-200/50'
              }`}>
                <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-full w-12 h-12 mx-auto flex items-center justify-center">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <h2 className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Upload Portfolio Statement</h2>
                  <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Upload Sharekhan PDF to analyze live NAVs & Rebalance Advice</p>
                </div>

                <label htmlFor="pdf-upload" className={`border-2 border-dashed transition-all rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer block ${
                  isDark 
                    ? 'border-slate-700 hover:border-emerald-500 bg-slate-950/50' 
                    : 'border-slate-300 hover:border-emerald-600 bg-slate-50'
                }`}>
                  <p className="text-xs font-semibold text-emerald-600 truncate max-w-[250px]">
                    {file ? file.name : "Tap to choose PDF File"}
                  </p>
                  <span className={`text-[10px] mt-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Supports official PDF statements</span>
                  <input id="pdf-upload" type="file" accept=".pdf" onChange={handleFileUpload} className="hidden" />
                </label>

                {errorMsg && (
                  <p className="text-xs text-rose-500 font-medium bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20">
                    {errorMsg}
                  </p>
                )}

                {file && (
                  <button 
                    onClick={handleAnalyze} 
                    disabled={loading} 
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50 active:scale-95"
                  >
                    {loading ? (
                      <><Loader2 className="animate-spin h-4 w-4 text-white" /> Fetching Live NAVs & Market Data...</>
                    ) : (
                      <><Sparkles className="w-4 h-4 text-amber-300" /> Generate Live Report</>
                    )}
                  </button>
                )}
              </div>

              {analysis && (
                <div className={`border rounded-xl p-3.5 flex items-center justify-between ${
                  isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
                }`}>
                  <div className="flex items-center gap-2.5">
                    <FileText className="w-5 h-5 text-emerald-500" />
                    <div>
                      <p className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Report Ready</p>
                      <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Investor: {analysis.investorName}</p>
                    </div>
                  </div>
                  <button 
                    onClick={handleReset} 
                    className="text-[10px] bg-rose-500/10 text-rose-500 border border-rose-500/20 px-2.5 py-1 rounded-lg hover:bg-rose-500/20 transition-all active:scale-95"
                  >
                    Clear File
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ANALYSIS REPORT */}
          {activeTab === 'analysis' && (
            <div className="space-y-3.5">
              {!analysis ? (
                <div className={`p-8 rounded-2xl border text-center space-y-3 mt-6 ${
                  isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
                }`}>
                  <BarChart3 className="w-10 h-10 text-slate-400 mx-auto" />
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>No statement analyzed yet.</p>
                  <button 
                    onClick={() => setActiveTab('home')}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-4 py-2 rounded-lg font-semibold transition-all mt-1 active:scale-95"
                  >
                    Go to Upload
                  </button>
                </div>
              ) : (
                <div className="space-y-3.5 animate-in fade-in duration-300">
                  
                  {/* USER NAME BANNER */}
                  <div className={`border p-3.5 rounded-2xl flex items-center justify-between shadow-md ${
                    isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
                  }`}>
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl">
                        <User className="w-5 h-5" />
                      </div>
                      <div>
                        <span className={`text-[10px] uppercase font-semibold tracking-wider block ${
                          isDark ? 'text-slate-400' : 'text-slate-500'
                        }`}>Investor Name</span>
                        <h2 className={`text-sm font-bold leading-none ${
                          isDark ? 'text-white' : 'text-slate-900'
                        }`}>{analysis.investorName || "Investor"}</h2>
                      </div>
                    </div>
                  </div>

                  {/* Summary Stats */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className={`border p-2.5 rounded-xl ${
                      isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
                    }`}>
                      <div className={`text-[9px] font-medium mb-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        Invested
                      </div>
                      <div className={`text-xs font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        {analysis.totalInvested || "N/A"}
                      </div>
                    </div>

                    <div className={`border p-2.5 rounded-xl ${
                      isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
                    }`}>
                      <div className="text-[9px] mb-0.5 text-emerald-500 font-semibold">
                        Current Value
                      </div>
                      <div className="text-xs font-bold truncate text-emerald-600 dark:text-emerald-400">
                        {analysis.currentTotalValue || "N/A"}
                      </div>
                    </div>

                    <div className={`border p-2.5 rounded-xl ${
                      isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
                    }`}>
                      <div className={`text-[9px] font-medium mb-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        Risk Level
                      </div>
                      <div className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-500/20 text-amber-600 border border-amber-500/30">
                        {analysis.riskLevel || "Medium"}
                      </div>
                    </div>
                  </div>

                  {/* BLOCK 1: Strategy Overview */}
                  {analysis.replacementOverview && (
                    <div className={`border rounded-xl p-3.5 ${
                      isDark ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-emerald-50/70 border-emerald-200'
                    }`}>
                      <h3 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 mb-1.5">
                        <ArrowRightLeft className="w-4 h-4 text-emerald-500" /> Strategy Overview
                      </h3>
                      <p className={`text-[11px] leading-relaxed ${
                        isDark ? 'text-slate-300' : 'text-slate-700'
                      }`}>
                        {analysis.replacementOverview}
                      </p>
                    </div>
                  )}

                  {/* BLOCK 2: Smart Portfolio Rebalancing Advice */}
                  {analysis.rebalancingStrategy && (
                    <div className={`border rounded-2xl p-3.5 space-y-2.5 ${
                      isDark ? 'bg-slate-900/90 border-amber-500/30' : 'bg-amber-50/40 border-amber-200'
                    }`}>
                      <h3 className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                        <Lightbulb className="w-4 h-4 text-amber-500" /> Smart Portfolio Rebalancing Advice
                      </h3>

                      {analysis.rebalancingStrategy.allocationState && (
                        <div className="text-[11px] leading-relaxed">
                          <strong className="text-amber-700 dark:text-amber-300 font-bold">Allocation State: </strong>
                          <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                            {analysis.rebalancingStrategy.allocationState}
                          </span>
                        </div>
                      )}

                      {analysis.rebalancingStrategy.recommendedAction && (
                        <div className="text-[11px] leading-relaxed">
                          <strong className="text-amber-700 dark:text-amber-300 font-bold">Recommended Action: </strong>
                          <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                            {analysis.rebalancingStrategy.recommendedAction}
                          </span>
                        </div>
                      )}

                      {analysis.rebalancingStrategy.expectedResult && (
                        <div className={`p-2.5 rounded-xl border text-[11px] leading-relaxed flex items-start gap-2 ${
                          isDark ? 'bg-amber-950/40 border-amber-500/30 text-amber-200' : 'bg-amber-100/60 border-amber-300/60 text-amber-900'
                        }`}>
                          <Zap className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                          <div>
                            <strong className="font-bold">Expected Result: </strong>
                            {analysis.rebalancingStrategy.expectedResult}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Holdings List */}
                  <div className="space-y-2.5 pt-1">
                    <h3 className={`text-xs font-bold px-1 ${
                      isDark ? 'text-slate-300' : 'text-slate-700'
                    }`}>Holdings & Replacement Recommendations</h3>

                    {analysis.funds?.map((fund, index) => {
                      const isReplace = fund.action?.toUpperCase().includes('REBALANCE') || 
                                        fund.action?.toUpperCase().includes('SWITCH') || 
                                        fund.action?.toUpperCase().includes('REPLACE');
                      return (
                        <div key={index} className={`border rounded-xl p-3 space-y-2.5 ${
                          isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
                        }`}>
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex items-start gap-2">
                              <span className="text-[10px] font-bold bg-slate-500/10 text-slate-500 border border-slate-500/20 px-1.5 py-0.5 rounded shrink-0">
                                #{index + 1}
                              </span>
                              <h4 className={`text-xs font-bold leading-snug ${
                                isDark ? 'text-slate-100' : 'text-slate-800'
                              }`}>{fund.name}</h4>
                            </div>

                            {/* UPDATED IMPACT BADGE LOGIC */}
                            {(() => {
                              const impactVal = fund.impact?.toLowerCase() || '';
                              let badgeStyle = 'bg-slate-500/20 text-slate-500 border-slate-500/30';
                              let ImpactIcon = ArrowRightLeft;

                              if (impactVal === 'up') {
                                badgeStyle = 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30';
                                ImpactIcon = ArrowUpRight;
                              } else if (impactVal === 'down') {
                                badgeStyle = 'bg-rose-500/20 text-rose-500 border-rose-500/30';
                                ImpactIcon = ArrowDownRight;
                              }

                              return (
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase flex items-center gap-0.5 shrink-0 border ${badgeStyle}`}>
                                  <ImpactIcon className="w-3 h-3" />
                                  {fund.impact || 'Stable'}
                                </span>
                              );
                            })()}
                          </div>

                          {/* 3 Column Grid for Invested, Live NAV, and Current Value */}
                          <div className={`grid grid-cols-3 gap-1.5 text-[10px] p-2 rounded-lg ${
                            isDark ? 'bg-slate-950/60' : 'bg-slate-50'
                          }`}>
                            <div>
                              <span className={`text-[8px] block ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>PDF Invested</span>
                              <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{fund.pdfValue}</span>
                            </div>
                            <div>
                              <span className={`text-[8px] block ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Live NAV</span>
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400">₹{fund.liveNav}</span>
                              {fund.date && (
                                <span className={`text-[7px] font-medium block ${isDark ? 'text-emerald-400/70' : 'text-emerald-600/80'}`}>
                                  ({fund.date})
                                </span>
                              )}
                            </div>
                            <div>
                              <span className={`text-[8px] font-bold block text-emerald-500`}>Current Value</span>
                              <span className="font-bold text-emerald-600 dark:text-emerald-300">
                                {fund.currentValue ? `₹${fund.currentValue}` : 'N/A'}
                              </span>
                            </div>
                          </div>

                          {/* Action Badge & Recommended Alternative Fund */}
                          <div className="space-y-1.5">
                            <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded border ${
                              isReplace 
                                ? 'bg-amber-500/20 text-amber-600 border-amber-500/30' 
                                : 'bg-emerald-500/20 text-emerald-600 border border-emerald-500/30'
                            }`}>
                              {isReplace ? '🔄 ' : '✅ '}{fund.action}
                            </span>

                            {/* TARGET REBALANCE FUND SUGGESTION */}
                            {isReplace && fund.suggestedTargetFund && (
                              <div className={`p-2 rounded-lg border text-[11px] space-y-0.5 ${
                                isDark ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200' : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                              }`}>
                                <div className="flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400 text-[10px] uppercase tracking-wide">
                                  <Sparkles className="w-3 h-3 text-amber-400" /> Recommended Target Fund
                                </div>
                                <div className="font-semibold text-xs text-emerald-700 dark:text-emerald-300">
                                  👉 {fund.suggestedTargetFund}
                                </div>
                              </div>
                            )}
                          </div>

                          {fund.suggestion && (
                            <p className={`text-[11px] p-2 rounded-lg leading-relaxed border ${
                              isDark ? 'bg-slate-950/80 text-slate-300 border-slate-800' : 'bg-slate-50 text-slate-600 border-slate-200'
                            }`}>
                              💡 {fund.suggestion}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

        </main>

        {/* Bottom Navigation Bar */}
        <footer className={`fixed bottom-0 left-0 right-0 z-50 backdrop-blur-md border-t p-2.5 flex justify-around items-center max-w-lg mx-auto transition-colors ${
          isDark ? 'bg-slate-900/95 border-slate-800' : 'bg-white/95 border-slate-200'
        }`}>
          <button 
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center gap-1 transition-all active:scale-95 ${
              activeTab === 'home' 
                ? 'text-emerald-500 font-bold scale-105' 
                : isDark ? 'text-slate-500 hover:text-slate-400' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px]">Home</span>
          </button>

          <button 
            onClick={() => setActiveTab('analysis')}
            className={`flex flex-col items-center gap-1 transition-all relative active:scale-95 ${
              activeTab === 'analysis' 
                ? 'text-emerald-500 font-bold scale-105' 
                : isDark ? 'text-slate-500 hover:text-slate-400' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <BarChart3 className="w-5 h-5" />
            <span className="text-[10px]">Analysis</span>
            {analysis && activeTab !== 'analysis' && (
              <span className="absolute top-0 right-1 w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
            )}
          </button>
        </footer>

      </div>
    </div>
  );
}