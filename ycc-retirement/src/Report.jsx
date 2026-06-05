import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, Printer, TrendingUp, AlertTriangle } from "lucide-react";

const fmt = (n) => (isFinite(n) ? Math.round(n).toLocaleString("zh-TW") : "—");
const fmtMan = (n) => (n / 10000).toFixed(0);

export default function Report() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state;

  if (!state || !state.calc) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-stone-600 mb-4">尚無報告資料，請從診斷系統產生報告。</p>
          <button onClick={() => navigate("/")} className="bg-teal-700 text-white px-5 py-2.5 rounded-lg font-semibold">
            返回系統
          </button>
        </div>
      </div>
    );
  }

  const { client, params, calc, selectedPlan } = state;
  const today = new Date().toLocaleDateString("zh-TW");
  const isA = selectedPlan === "A";
  const planLabel = isA ? "存一筆錢，邊領邊花" : "靠配息現金流，不動本金";
  const targetAmount = isA ? calc.lumpSumDepletion : calc.lumpSumIncome;
  const yearsToRetire = Math.max(0, params.retireAge - params.currentAge);

  return (
    <div className="min-h-screen bg-stone-100 text-stone-800">
      <header className="bg-gradient-to-r from-teal-700 to-teal-800 text-white px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => navigate("/")}
            className="no-print flex items-center gap-1 text-teal-100 hover:text-white text-sm mb-6"
          >
            <ArrowLeft size={16} /> 返回系統
          </button>
          <div className="text-center">
            <p className="text-xs tracking-[0.3em] text-teal-200 mb-2">RETIREMENT PLANNING SUMMARY</p>
            <h1 className="text-3xl font-bold mb-2">
              「{client.clientName || "客戶"}」{client.clientGender === "女" ? "女士" : client.clientGender === "男" ? "先生" : ""} 退休規劃摘要
            </h1>
            <p className="text-sm text-teal-100">
              報告日期：{today}　|　年齡：{params.currentAge} 歲　|　預計退休：{params.retireAge} 歲
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <section className="bg-gradient-to-br from-teal-700 to-teal-800 rounded-xl p-7 text-white shadow-sm">
          <p className="text-sm text-teal-100 mb-2">您的退休解決方案</p>
          <h2 className="text-xl font-bold mb-3">{planLabel}</h2>
          <p className="text-sm text-teal-50 leading-relaxed mb-5">
            退休後每月需要 <span className="font-bold text-white">NT$ {fmt(calc.firstYearMonthly)}</span>（通膨調整後）。
            {isA
              ? `採「存一筆錢」方式，需在退休時準備 ${fmtMan(targetAmount)} 萬，從 ${params.retireAge} 歲領到 ${params.lifeAge} 歲。`
              : `採「配息現金流」方式，在 ${params.incomeYieldAssumption}% 年報酬率下需準備本金 ${fmtMan(targetAmount)} 萬，本金可保留、持續產生現金流。`}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg bg-white/10 px-4 py-3">
              <p className="text-xs text-teal-100 mb-1">退休每月所需</p>
              <p className="text-lg font-bold">NT$ {fmt(calc.firstYearMonthly)}</p>
            </div>
            <div className="rounded-lg bg-white/10 px-4 py-3">
              <p className="text-xs text-teal-100 mb-1">需準備總額</p>
              <p className="text-lg font-bold">{fmtMan(targetAmount)} 萬</p>
            </div>
            <div className="rounded-lg bg-white/10 px-4 py-3">
              <p className="text-xs text-teal-100 mb-1">現在每月該存</p>
              <p className="text-lg font-bold">NT$ {fmt(calc.monthlyNow)}</p>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-orange-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-orange-500" />
            <h2 className="text-base font-bold text-stone-900">越早開始，負擔越輕</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-5">
              <p className="text-sm text-teal-700 mb-1">現在就開始（{yearsToRetire} 年）</p>
              <p className="text-2xl font-black text-teal-700">NT$ {fmt(calc.monthlyNow)}<span className="text-sm font-bold"> / 月</span></p>
            </div>
            <div className="rounded-xl border-2 border-orange-300 bg-orange-50/60 p-5">
              <p className="text-sm text-orange-600 mb-1">拖延 {params.delayYears} 年才開始</p>
              <p className="text-2xl font-black text-orange-600">NT$ {fmt(calc.monthlyDelayed)}<span className="text-sm font-bold"> / 月</span></p>
            </div>
          </div>
          <p className="text-sm text-orange-700 mt-3">
            拖延 {params.delayYears} 年，每月得多存 <span className="font-bold">NT$ {fmt(calc.monthlyExtra)}</span>——時間是最大的本錢。
          </p>
        </section>

        <section className="bg-white rounded-xl border border-stone-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={18} className="text-teal-700" />
            <h2 className="text-base font-bold text-stone-900">為什麼需要保本型資產？</h2>
          </div>
          <p className="text-xs text-stone-400 mb-4">退休後遇市場大跌（前兩年 -20%／-25%）的模擬對比</p>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-stone-100 text-stone-600">
                <th className="text-left font-semibold px-4 py-3 rounded-l-lg">情境</th>
                <th className="text-right font-semibold px-4 py-3 rounded-r-lg">資產可支撐</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-stone-100">
                <td className="px-4 py-3"><span className="flex items-center gap-2"><span className="w-3 h-1 rounded-full inline-block" style={{ background: "#ef4444" }} />純股票（無保本）</span></td>
                <td className={`px-4 py-3 text-right font-semibold ${calc.sp500Span.reachedLife ? "text-stone-700" : "text-red-600"}`}>
                  {calc.sp500Span.reachedLife ? `逾 ${calc.sp500Span.years} 年（撐至壽命）` : `${calc.sp500Span.years} 年 ${calc.sp500Span.months} 個月見底`}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3"><span className="flex items-center gap-2"><span className="w-3 h-1 rounded-full inline-block" style={{ background: "#9333ea" }} />股票 + 配息保本</span></td>
                <td className={`px-4 py-3 text-right font-semibold ${calc.defenseSpan.reachedLife ? "text-teal-700" : "text-red-600"}`}>
                  {calc.defenseSpan.reachedLife ? `逾 ${calc.defenseSpan.years} 年（撐至壽命）` : `${calc.defenseSpan.years} 年 ${calc.defenseSpan.months} 個月見底`}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-stone-500 mt-3 leading-relaxed">
            保本型資產（配息基金／儲蓄險／年金）每年產生穩定配息，退休後優先用配息支應生活費，就算股市大跌也不必賤賣股票，讓本金有時間回升。
          </p>
        </section>

        <div className="no-print flex justify-center pb-4">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-teal-700 hover:bg-teal-800 text-white font-semibold px-6 py-3 rounded-lg shadow-sm transition-colors"
          >
            <Printer size={18} /> 列印 / 儲存 PDF
          </button>
        </div>

        <p className="text-center text-xs text-stone-400 pb-8">
          本報告僅供參考，試算採通膨假設 {params.inflation}%、報酬假設依設定值，不代表實際投資績效保證。
        </p>
      </main>
    </div>
  );
}
