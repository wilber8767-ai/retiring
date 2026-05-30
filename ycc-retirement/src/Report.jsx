import { useNavigate, useLocation } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import { ArrowLeft, Flame, TrendingDown, Target, Lightbulb, LineChart as LineChartIcon, AlertTriangle, Printer } from "lucide-react";

const fmt = (n) => (isFinite(n) ? Math.round(n).toLocaleString("zh-TW") : "—");
const fmtMan = (n) => (n / 10000).toFixed(0);

export default function Report() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state;

  // 沒有資料（直接打開 /report）就導回首頁
  if (!state || !state.calc) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-stone-600 mb-4">尚無報告資料，請從診斷系統產生報告。</p>
          <button onClick={() => navigate("/")} className="bg-teal-700 text-white px-5 py-2.5 rounded-lg font-semibold">
            返回診斷系統
          </button>
        </div>
      </div>
    );
  }

  const { client, params, calc } = state;
  const today = new Date().toLocaleDateString("zh-TW");

  // 現有儲蓄退休終值（已有準備金按退休前報酬複利到退休）
  const initialAtRetire = params.initialFund * Math.pow(1 + params.annualReturn / 100, Math.max(0, params.retireAge - params.currentAge));

  // 退休後第一條會耗盡的線：用「完美預期」破產年齡呈現耗盡警示
  const ruinAge = calc.ruin.perfect; // null 表示撐到壽命
  const yearsShort = ruinAge === null ? 0 : Math.max(0, params.lifeAge - ruinAge);

  return (
    <div className="min-h-screen bg-stone-100 text-stone-800">
      {/* 頂部標題列 */}
      <header className="bg-gradient-to-r from-teal-700 to-teal-800 text-white px-6 py-8">
        <div className="max-w-6xl mx-auto">
          <button
            onClick={() => navigate("/")}
            className="no-print flex items-center gap-1 text-teal-100 hover:text-white text-sm mb-6"
          >
            <ArrowLeft size={16} /> 返回診斷系統
          </button>
          <div className="text-center">
            <p className="text-xs tracking-[0.3em] text-teal-200 mb-2">PROFESSIONAL FINANCIAL ANALYSIS REPORT</p>
            <h1 className="text-3xl font-bold mb-2">
              「{client.clientName || "客戶"}」{client.clientGender === "女" ? "女士" : client.clientGender === "男" ? "先生" : ""} 專屬退休資產分析報告
            </h1>
            <p className="text-sm text-teal-100">
              報告日期：{today}　|　年齡：{params.currentAge} 歲　|　退休規劃：{params.retireAge} 歲
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* 退休財務缺口診斷 */}
        <section className="bg-white rounded-xl border border-stone-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-1">
            <Flame size={20} className="text-orange-500" />
            <h2 className="text-lg font-bold text-stone-900">退休財務缺口診斷</h2>
          </div>
          <p className="text-xs text-stone-400 mb-5">通膨複利 {params.inflation}% 精算　·　已計入工作期投入、勞保年金與保守報酬</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="rounded-xl p-5 bg-stone-50 border border-stone-200">
              <p className="text-sm text-stone-500 mb-1">現在每月支出</p>
              <p className="text-3xl font-black text-stone-800">${fmt(params.monthlyExpense)}</p>
              <p className="text-xs text-stone-400 mt-1">以今日幣值計算</p>
            </div>
            <div className="rounded-xl p-5 bg-orange-50 border border-orange-200">
              <p className="text-sm text-orange-600 mb-1">退休時等值月支出</p>
              <p className="text-3xl font-black text-orange-600">${fmt(calc.firstYearMonthly)}</p>
              <p className="text-xs text-orange-500 mt-1">通膨 {Math.max(0, params.retireAge - params.currentAge)} 年後</p>
            </div>
            <div className="rounded-xl p-5 bg-teal-50 border border-teal-200">
              <p className="text-sm text-teal-700 mb-1">退休當下預估總資產</p>
              <p className="text-3xl font-black text-teal-700">{fmtMan(calc.fundAtRetire)}萬</p>
              <p className="text-xs text-teal-600 mt-1">含工作期定期定額終值</p>
            </div>
          </div>

          <div className="rounded-xl bg-stone-50 border border-stone-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Lightbulb size={16} className="text-orange-500" />
              <span className="text-sm font-semibold text-stone-700">達成退休目標，您現在需要…</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-stone-500 mb-1">現有儲蓄退休終值</p>
                <p className="text-2xl font-bold text-teal-700">{fmtMan(initialAtRetire)}萬</p>
                <p className="text-xs text-stone-400 mt-1">現有資產按 {params.annualReturn}% 複利成長</p>
              </div>
              <div>
                <p className="text-xs text-stone-500 mb-1">退休資金缺口</p>
                <p className={`text-2xl font-bold ${calc.gapAtRetire > 0 ? "text-red-500" : "text-teal-700"}`}>
                  {calc.gapAtRetire > 0 ? `-${fmtMan(calc.gapAtRetire)}萬` : "無缺口"}
                </p>
                <p className="text-xs text-stone-400 mt-1">{calc.gapAtRetire > 0 ? "仍需額外累積" : "現有規劃已足夠"}</p>
              </div>
              <div>
                <p className="text-xs text-stone-500 mb-1">每月還需多存</p>
                <p className={`text-2xl font-bold ${calc.extraMonthly > 0 ? "text-orange-600" : "text-teal-700"}`}>
                  {calc.extraMonthly > 0 ? `$${fmt(calc.extraMonthly)}` : "$0"}
                </p>
                <p className="text-xs text-stone-400 mt-1">在現有投入之外</p>
              </div>
            </div>

            {calc.gapAtRetire <= 0 && (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-teal-50 border border-teal-200 px-5 py-4">
                <span className="text-xl">✓</span>
                <p className="text-sm text-teal-700">
                  <span className="font-bold">恭喜！</span>依目前規劃，您的退休準備已可支應預估的退休生活需求，無需額外加碼即可達成退休目標。
                </p>
              </div>
            )}
          </div>
        </section>

        {/* 未來現金流壓力曲線 */}
        <section className="bg-white rounded-xl border border-stone-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-1">
            <LineChartIcon size={20} className="text-teal-700" />
            <h2 className="text-lg font-bold text-stone-900">未來資產壓力曲線</h2>
          </div>
          <p className="text-xs text-stone-400 mb-4">完美預期 vs 防禦機制 — 觀察資產長期走勢</p>

          {ruinAge !== null && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 mb-4">
              <AlertTriangle size={16} className="text-red-500 shrink-0" />
              <p className="text-sm text-red-600">
                按目前規劃（完美預期情境），資產將在 <span className="font-bold">{ruinAge} 歲</span> 耗盡，距離壽命 {params.lifeAge} 歲還有 <span className="font-bold">{yearsShort} 年</span> 的資金缺口！
              </p>
            </div>
          )}

          <div className="h-[420px] print-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={calc.data} margin={{ top: 30, right: 24, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="age" stroke="#78716c" />
                <YAxis stroke="#78716c" tickFormatter={(v) => `${fmtMan(v)}萬`} width={80} />
                <Tooltip formatter={(v, name) => [`NT$ ${fmt(v)}`, name]} labelFormatter={(l) => `${l} 歲`}
                  contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #d6d3d1", borderRadius: 8, color: "#1c1917" }} />
                <Legend />
                <ReferenceLine x={params.retireAge} stroke="#0f766e" strokeDasharray="4 4"
                  label={{ value: "退休", fill: "#0f766e", position: "insideTop", fontSize: 12, dy: -20 }} />
                <Line type="monotone" dataKey="perfect" name="完美預期" stroke="#22c55e" strokeDasharray="6 4" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="t0050" name="0050 真實序列" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="sp500" name="S&P 500 真實序列" stroke="#ef4444" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="defense" name="防禦機制啟動" stroke="#9333ea" strokeWidth={2.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 退休快照表格 */}
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-stone-100 text-stone-600">
                  <th className="text-left font-semibold px-4 py-3 rounded-l-lg">情境</th>
                  <th className="text-right font-semibold px-4 py-3">退休時資產（{params.retireAge} 歲）</th>
                  <th className="text-right font-semibold px-4 py-3 rounded-r-lg">資產可支撐</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-stone-100">
                  <td className="px-4 py-3"><span className="flex items-center gap-2"><span className="w-3 h-1 rounded-full inline-block" style={{ background: "#22c55e" }} />完美預期</span></td>
                  <td className="px-4 py-3 text-right font-bold text-stone-800">NT$ {fmt(calc.perfectAtRetire)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-stone-700">
                    {calc.perfectSpan.reachedLife ? `逾 ${calc.perfectSpan.years} 年（撐至壽命）` : `${calc.perfectSpan.years} 年 ${calc.perfectSpan.months} 個月`}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3"><span className="flex items-center gap-2"><span className="w-3 h-1 rounded-full inline-block" style={{ background: "#9333ea" }} />防禦機制啟動</span></td>
                  <td className="px-4 py-3 text-right font-bold text-stone-800">NT$ {fmt(calc.defenseAtRetire)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-stone-700">
                    {calc.defenseSpan.reachedLife ? `逾 ${calc.defenseSpan.years} 年（撐至壽命）` : `${calc.defenseSpan.years} 年 ${calc.defenseSpan.months} 個月`}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 列印鈕 */}
        <div className="no-print flex justify-center pb-4">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-teal-700 hover:bg-teal-800 text-white font-semibold px-6 py-3 rounded-lg shadow-sm transition-colors"
          >
            <Printer size={18} /> 列印 / 儲存 PDF
          </button>
        </div>

        <p className="text-center text-xs text-stone-400 pb-8">
          本報告僅供參考，退休缺口試算採通膨假設 {params.inflation}%、報酬假設依設定值，不代表實際投資績效保證。
        </p>
      </main>
    </div>
  );
}
