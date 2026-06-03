import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Wallet, TrendingDown, Activity, Coins, Calendar,
  PiggyBank, TrendingUp, UserRound,
} from "lucide-react";

// ===== 歷史報酬序列（價格報酬，不含配息）=====
// 2005～2024，共 20 年。索引 0 對應「當前年齡」那一年，序列走完後循環重複。
const SP500_RETURNS = [
  0.030, 0.136, 0.035, -0.385, 0.235, // 2005-2009
  0.128, 0.000, 0.134, 0.296, 0.114,  // 2010-2014
  -0.007, 0.095, 0.194, -0.062, 0.289, // 2015-2019
  0.163, 0.269, -0.194, 0.242, 0.233,  // 2020-2024
];
// 0050（元大台灣50）：年度價格走勢估算值（貼近真實，部分年份為合理估算）。
// ★ 若要更嚴謹：用券商「還原收盤價」算出逐年報酬，直接替換下面陣列即可。
const T0050_RETURNS = [
  0.080, 0.180, 0.110, -0.430, 0.740, // 2005-2009
  0.120, -0.160, 0.100, 0.115, 0.085, // 2010-2014
  -0.060, 0.180, 0.150, -0.050, 0.330, // 2015-2019
  0.220, 0.215, -0.215, 0.265, 0.430, // 2020-2024
];

// ===== 工具函數 =====
const fmt = (n) =>
  isFinite(n) ? Math.round(n).toLocaleString("zh-TW") : "—";
const fmtMan = (n) => (n / 10000).toFixed(0); // 轉萬元

// ===== 可重用輸入元件（定義在 App 外，避免每次 render 重建導致輸入失焦）=====
function Slider({ label, value, setValue, min, max, icon: Icon }) {
  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-2">
        <span className="flex items-center gap-2 text-sm font-medium text-stone-700">
          {Icon && <Icon size={16} className="text-teal-700" />}
          {label}
        </span>
        <span className="text-teal-700 font-bold text-lg">{value}</span>
      </div>
      <input
        type="range" min={min} max={max} value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="w-full h-2 cursor-pointer"
      />
      <div className="flex justify-between text-xs text-stone-400 mt-1">
        <span>{min}</span><span>{max}</span>
      </div>
    </div>
  );
}

function NumberInput({ label, value, setValue, suffix, step = 1, icon: Icon }) {
  // 本地字串 state：輸入過程完全不受外部 render 干擾，可暫時為空或負號
  const [text, setText] = useState(String(value));
  // 外部值改變時（例如其他連動）才同步顯示
  useEffect(() => {
    setText(String(value));
  }, [value]);

  const commit = (raw) => {
    const n = Number(raw);
    if (raw === "" || isNaN(n)) {
      setValue(0);
      setText("0");
    } else {
      setValue(n);
      setText(String(n));
    }
  };

  return (
    <div className="mb-4">
      <label className="flex items-center gap-2 text-sm font-medium text-stone-700 mb-1">
        {Icon && <Icon size={16} className="text-teal-700" />}
        {label}
      </label>
      <div className="relative">
        <input
          type="number" inputMode="numeric" step={step}
          value={text}
          onChange={(e) => {
            setText(e.target.value);              // 即時更新本地顯示，不會失焦
            const n = Number(e.target.value);
            if (e.target.value !== "" && !isNaN(n)) setValue(n); // 有效數字才連動圖表
          }}
          onBlur={(e) => commit(e.target.value)}   // 失焦時清理（空白/非法→0）
          className="w-full bg-stone-50 border border-stone-300 rounded-lg px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm pointer-events-none">{suffix}</span>
        )}
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button onClick={onChange}
      className={`relative w-12 h-6 rounded-full transition-colors ${checked ? "bg-teal-700" : "bg-stone-300"}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${checked ? "translate-x-6" : ""}`} />
    </button>
  );
}

export default function App() {
  const navigate = useNavigate();

  // ===== 客戶基本資料（純記錄，不影響計算；生日會連動當前年齡）=====
  const [clientName, setClientName] = useState("");
  const [clientGender, setClientGender] = useState("");
  const [clientBirth, setClientBirth] = useState("");

  // ===== 狀態 =====
  const [currentAge, setCurrentAge] = useState(30);
  const [retireAge, setRetireAge] = useState(65);
  const [lifeAge, setLifeAge] = useState(85);

  const [monthlyExpense, setMonthlyExpense] = useState(50000); // 現值每月生活費
  const [initialFund, setInitialFund] = useState(1000000); // 已有準備金
  const [monthlyFixed, setMonthlyFixed] = useState(5000);   // ★每月固定存（0% 不生息）
  const [monthlyInvest, setMonthlyInvest] = useState(10000); // ★每月定期定額（隨報酬波動）
  const [annualReturn, setAnnualReturn] = useState(6); // 工作期/退休前報酬 %
  const [inflation, setInflation] = useState(2.5); // 通膨率 %

  // 第四步路線B：配息現金流的合理年報酬率（使用者可調）
  const [incomeYieldAssumption, setIncomeYieldAssumption] = useState(4);
  const [yieldText, setYieldText] = useState("4"); // 報酬率輸入框本地字串（可自由編輯）
  const [selectedPlan, setSelectedPlan] = useState("B"); // 選中的方案：A=存一筆 / B=配息現金流
  const [needAnswer, setNeedAnswer] = useState(null); // 第二步提問：need=一定需要 / maybe=可有可無
  const [delayYears, setDelayYears] = useState(10); // 拖延成本：晚幾年才開始準備

  const [dividendRate, setDividendRate] = useState(4); // 配息保本：年配息率 %


  // ===== 核心運算 =====
  // 生日變動 -> 自動換算當前年齡並回填滑桿
  useEffect(() => {
    if (!clientBirth) return;
    const b = new Date(clientBirth);
    if (isNaN(b.getTime())) return;
    const now = new Date();
    let age = now.getFullYear() - b.getFullYear();
    const m = now.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
    if (age >= 20 && age <= 65) setCurrentAge(age);
  }, [clientBirth]);

  const calc = useMemo(() => {
    const rPre = annualReturn / 100;   // 報酬率（退休前後一致）
    const inf = inflation / 100;
    const yearsToRetire = Math.max(0, retireAge - currentAge);
    const retireYears = Math.max(0, lifeAge - retireAge);

    // 退休首年的名目每月生活費（現值經通膨成長至退休）
    const firstYearMonthly = monthlyExpense * Math.pow(1 + inf, yearsToRetire);
    const firstYearAnnual = firstYearMonthly * 12;

    // 退休所需總資金（名目現值）：全額生活費逐年折現（不抵勞保，保守估計）
    let needAtRetire = 0;
    for (let t = 0; t < retireYears; t++) {
      const expenseThatYear = firstYearAnnual * Math.pow(1 + inf, t);
      needAtRetire += expenseThatYear / Math.pow(1 + rPre, t);
    }

    // 已有準備金成長到退休年（退休前報酬）
    const initialAtRetire = initialFund * Math.pow(1 + rPre, yearsToRetire);

    // ★工作期投入終值：定期定額按月複利成長 + 固定存純累加（0% 不生息）
    const monthlyRate = rPre / 12;
    const months = yearsToRetire * 12;
    let investFV = 0;   // 定期定額終值
    let fixedFV = 0;    // 固定存終值（0%）
    if (months > 0) {
      investFV =
        monthlyRate === 0
          ? monthlyInvest * months
          : monthlyInvest * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);
      fixedFV = monthlyFixed * months;
    }
    const contributionFV = investFV + fixedFV;

    // 退休當下總資產
    const fundAtRetire = initialAtRetire + contributionFV;

    // 缺口（退休年現值）
    const gapAtRetire = Math.max(0, needAtRetire - fundAtRetire);

    // PMT 反推：在既有投入之外，現在還需每月再投入多少
    let extraMonthly = 0;
    if (months > 0) {
      if (monthlyRate === 0) {
        extraMonthly = gapAtRetire / months;
      } else {
        const fvFactor = (Math.pow(1 + monthlyRate, months) - 1) / monthlyRate;
        extraMonthly = gapAtRetire / fvFactor;
      }
    }
    const lumpSum = gapAtRetire / Math.pow(1 + rPre, yearsToRetire);

    // ===== 折線圖資料：四條線 =====
    // 報酬順序風險：紅/藍/紫線在「退休後第1、2年」強制套用 -20%、-25% 熊市，
    // 第3年起才回到歷史序列。紫線額外加入防禦型生存金現金流。
    const SHOCK_Y1 = -0.20;
    const SHOCK_Y2 = -0.25;

    const data = [];
    let balPerfect = initialFund;
    let balSP = initialFund;
    let bal0050 = initialFund;
    let balDefense = initialFund; // ★紫線：配息保本（退休後靠配息撐、本金隨市場波動）

    const divRate = dividendRate / 100;
    let bankruptPerfect = false, bankruptSP = false, bankrupt0050 = false, bankruptDefense = false;
    let ruinPerfect = null, ruinSP = null, ruin0050 = null, ruinDefense = null;

    for (let age = currentAge; age <= lifeAge; age++) {
      const yearIndex = age - currentAge;
      const isRetired = age >= retireAge;
      const retireYearIndex = age - retireAge; // 0 = 退休當年, 1 = 退休後第1年...

      const expenseNow = monthlyExpense * 12 * Math.pow(1 + inf, yearIndex);
      const netDrawNow = Math.max(0, expenseNow); // 退休後每年提領（全額生活費，不抵勞保）
      const annualInvest = monthlyInvest * 12;   // 定期定額（隨報酬波動）
      const annualFixed = monthlyFixed * 12;     // 固定存（0% 不生息，純累加）

      // 歷史序列報酬
      const histSP = SP500_RETURNS[yearIndex % SP500_RETURNS.length];
      const hist0050 = T0050_RETURNS[yearIndex % T0050_RETURNS.length];

      // 報酬順序風險：退休後第1、2年強制熊市（紅/藍/紫共用此衝擊）
      const shockReturn =
        retireYearIndex === 1 ? SHOCK_Y1 :
        retireYearIndex === 2 ? SHOCK_Y2 : null;
      const rSP = shockReturn !== null ? shockReturn : histSP;
      const r0050 = shockReturn !== null ? shockReturn : hist0050;

      // 綠線：完美預期（固定報酬率，無市場衝擊）
      if (!bankruptPerfect) {
        balPerfect = balPerfect * (1 + rPre);
        if (isRetired) balPerfect -= netDrawNow;
        else balPerfect += annualInvest + annualFixed;
        if (balPerfect <= 0) { balPerfect = 0; bankruptPerfect = true; ruinPerfect = age; }
      } else balPerfect = 0;

      // 紅線：S&P 500（含退休後前兩年熊市）
      if (!bankruptSP) {
        balSP = balSP * (1 + rSP);
        if (isRetired) balSP -= netDrawNow;
        else balSP += annualInvest + annualFixed;
        if (balSP <= 0) { balSP = 0; bankruptSP = true; ruinSP = age; }
      } else balSP = 0;

      // 藍線：0050（含退休後前兩年熊市）
      if (!bankrupt0050) {
        bal0050 = bal0050 * (1 + r0050);
        if (isRetired) bal0050 -= netDrawNow;
        else bal0050 += annualInvest + annualFixed;
        if (bal0050 <= 0) { bal0050 = 0; bankrupt0050 = true; ruin0050 = age; }
      } else bal0050 = 0;

      // ★紫線：配息保本（退休前同股票累積；退休後先用配息 cover，不足才動本金）
      if (!bankruptDefense) {
        if (!isRetired) {
          balDefense = balDefense * (1 + rSP) + annualInvest + annualFixed;
        } else {
          // 本金隨市場波動
          balDefense = balDefense * (1 + rSP);
          // 當年配息（資產 × 配息率）先支應生活費
          const dividendIncome = balDefense * divRate;
          let need = netDrawNow - dividendIncome;
          // 配息不足的部分才從本金提領（配息足夠則本金不減反增）
          if (need > 0) balDefense -= need;
          if (balDefense <= 0) { balDefense = 0; bankruptDefense = true; ruinDefense = age; }
        }
      } else balDefense = 0;

      data.push({
        age,
        perfect: Math.round(balPerfect),
        sp500: Math.round(balSP),
        t0050: Math.round(bal0050),
        defense: Math.round(balDefense),
      });
    }

    // ===== 退休快照：退休時資產 + 可支撐年數（與折線圖走勢一致）=====
    // 退休時資產 = 該線在退休年齡那筆的資產值
    const retireRow = data.find((d) => d.age === retireAge);
    const perfectAtRetire = retireRow ? retireRow.perfect : 0;
    const defenseAtRetire = retireRow ? retireRow.defense : 0;
    const sp500AtRetire = retireRow ? retireRow.sp500 : 0;

    // 可支撐年數：從退休年到該線觸底前；最後一年用「殘值/當年淨提領」估算到月
    const survivalSpan = (lineKey, ruinAge) => {
      // 退休後逐年掃描該線資產
      const retiredRows = data.filter((d) => d.age >= retireAge);
      let fullYears = 0;
      let months = 0;
      for (let i = 0; i < retiredRows.length; i++) {
        const row = retiredRows[i];
        const ageHere = row.age;
        const bal = row[lineKey];
        // 當年淨提領（與迴圈同口徑）
        const yi = ageHere - currentAge;
        const expense = monthlyExpense * 12 * Math.pow(1 + inf, yi);
        const netDraw = Math.max(0, expense);
        if (bal > 0) {
          fullYears = ageHere - retireAge + 1;
        } else {
          // 此年已歸零：用前一年殘值估算撐到第幾個月
          const prev = retiredRows[i - 1];
          if (prev && netDraw > 0) {
            const prevBal = prev[lineKey];
            months = Math.max(0, Math.min(11, Math.floor((prevBal / netDraw) * 12)));
          }
          fullYears = ageHere - retireAge; // 不含歸零這年
          break;
        }
      }
      // 若到壽命都沒歸零
      const reachedLife = ruinAge === null;
      return { years: fullYears, months, reachedLife };
    };

    const perfectSpan = survivalSpan("perfect", ruinPerfect);
    const defenseSpan = survivalSpan("defense", ruinDefense);
    const sp500Span = survivalSpan("sp500", ruinSP);

    // ===== 促結區衍生數值 =====
    // 1) 防禦資產多爭取的安全期年數（防禦線破產 − S&P 500 破產，未破產以壽命計）
    const spRuinAge = ruinSP === null ? lifeAge : ruinSP;
    const defRuinAge = ruinDefense === null ? lifeAge : ruinDefense;
    const extraSafeYears = Math.max(0, defRuinAge - spRuinAge);

    // 2) 退休現金流健康度（退休首年）：
    //    保證型收益 = 勞保年金(年) + 配息層年配息；波動型依賴 = 仍需從市場提領的缺口
    // ===== 四步引導流程：兩條路線所需本金 =====
    // （retireYears 已於前面宣告，此處直接沿用）
    // 路線A：本金純消耗(0%)，生活費逐年通膨成長，領到壽命歸零 → 所需本金 = 逐年生活費總和
    let lumpSumDepletion = 0;
    for (let t = 0; t < retireYears; t++) {
      lumpSumDepletion += firstYearAnnual * Math.pow(1 + inf, t);
    }
    // 路線B：配息現金流(不動本金) → 本金 = 退休首年年生活費 ÷ 年報酬率
    const incomeYield = incomeYieldAssumption / 100;
    const lumpSumIncome = incomeYield > 0 ? firstYearAnnual / incomeYield : 0;

    // ===== 拖延成本：達成目標金額，現在開始 vs 拖 N 年開始，每月各要存多少 =====
    // 目標金額 = 選中方案所需（扣掉已有準備金成長後的缺口），用 rPre 月複利反推 PMT
    const targetAmount = selectedPlan === "A" ? lumpSumDepletion : lumpSumIncome;
    const gapToFill = Math.max(0, targetAmount - initialAtRetire);
    const mRate = rPre / 12;
    const pmtFor = (years) => {
      const n = years * 12;
      if (n <= 0) return gapToFill; // 沒時間了，等於要一次拿出來
      if (mRate === 0) return gapToFill / n;
      return gapToFill * mRate / (Math.pow(1 + mRate, n) - 1);
    };
    const monthlyNow = pmtFor(yearsToRetire);
    const monthlyDelayed = pmtFor(Math.max(0, yearsToRetire - delayYears));
    const monthlyExtra = Math.max(0, monthlyDelayed - monthlyNow);

    return {
      gapAtRetire, extraMonthly, lumpSum, fundAtRetire, contributionFV,
      retireYears, lumpSumDepletion, lumpSumIncome, incomeYieldAssumption,
      monthlyNow, monthlyDelayed, monthlyExtra, targetAmount,
      firstYearMonthly,
      data, retireAge,
      ruin: { perfect: ruinPerfect, sp500: ruinSP, t0050: ruin0050, defense: ruinDefense },
      spRuinAge, defRuinAge, extraSafeYears,
      perfectAtRetire, defenseAtRetire, sp500AtRetire, perfectSpan, defenseSpan, sp500Span,
    };
  }, [
    currentAge, retireAge, lifeAge, monthlyExpense, initialFund,
    monthlyInvest, monthlyFixed, annualReturn, inflation,
    dividendRate,
    incomeYieldAssumption, selectedPlan, delayYears,
  ]);

  // ===== 子元件 =====
  return (
    <div className="min-h-screen bg-stone-100 text-stone-800">
      <header className="no-print border-b border-stone-200 bg-white px-6 py-4 flex items-center gap-3 shadow-sm">
        <div className="w-10 h-10 rounded-lg bg-teal-700 flex items-center justify-center font-black text-white text-sm">退休</div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-stone-900">退休資產管理系統</h1>
          <p className="text-xs text-stone-500">Retirement Asset Management System</p>
        </div>
      </header>

      <section className="px-6 py-6 bg-gradient-to-b from-white to-stone-50 border-b border-stone-200">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <UserRound size={18} className="text-teal-700" />
            <h2 className="text-lg font-bold text-stone-900">客戶基本資料</h2>
            <span className="text-xs text-stone-400">（生日將自動帶入下方當前年齡）</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">姓名</label>
              <input
                type="text" value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="請輸入客戶姓名"
                className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">性別</label>
              <div className="grid grid-cols-3 gap-2">
                {["男", "女", "其他"].map((g) => (
                  <button
                    key={g}
                    onClick={() => setClientGender(g)}
                    className={`py-2 rounded-lg text-sm font-medium transition-colors border ${clientGender === g ? "bg-teal-700 text-white border-teal-700" : "bg-white text-stone-600 border-stone-300"}`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">生日</label>
              <input
                type="date" value={clientBirth}
                onChange={(e) => setClientBirth(e.target.value)}
                className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
          </div>
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* 列印專用報表標頭（螢幕隱藏，列印時顯示） */}
        <div className="print-header" style={{ display: "none" }}>
          <div className="flex items-center justify-between border-b-2 border-teal-700 pb-4 mb-2">
            <div>
              <h1 className="text-2xl font-bold text-stone-900">退休資產壓力測試報告</h1>
              <p className="text-sm text-stone-500">Retirement Asset Stress Test Report</p>
            </div>
            <div className="text-right text-sm text-stone-600">
              <div>製表日期：{new Date().toLocaleDateString("zh-TW")}</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm mb-2">
            <div><span className="text-stone-500">客戶姓名：</span><span className="font-semibold text-stone-900">{clientName || "—"}</span></div>
            <div><span className="text-stone-500">性別：</span><span className="font-semibold text-stone-900">{clientGender || "—"}</span></div>
            <div><span className="text-stone-500">生日：</span><span className="font-semibold text-stone-900">{clientBirth || "—"}（{currentAge} 歲）</span></div>
          </div>
        </div>

        {/* 步驟一：參數設定區（並排卡片） */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-teal-700 text-white text-xs font-bold">1</span>
            <h2 className="text-lg font-bold text-stone-900">參數設定</h2>
          </div>
          <p className="text-xs text-stone-400 mb-4">填入退休規劃參數，下方引導流程將即時更新</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
            {/* 第一欄：年齡控制 */}
            <div className="bg-white rounded-xl p-6 border border-stone-200 shadow-sm">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Calendar size={18} className="text-teal-700" /> 年齡控制
              </h2>
              <Slider label="當前年齡" value={currentAge} setValue={setCurrentAge} min={20} max={65} />
              <Slider label="預計退休年齡" value={retireAge} setValue={setRetireAge} min={50} max={80} />
              <Slider label="預估壽命" value={lifeAge} setValue={setLifeAge} min={70} max={100} />
            </div>

            {/* 第二欄：財務基礎 */}
            <div className="bg-white rounded-xl p-6 border border-stone-200 shadow-sm">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Wallet size={18} className="text-teal-700" /> 財務基礎
              </h2>
              <NumberInput label="退休後每月生活費（現值）" value={monthlyExpense} setValue={setMonthlyExpense} suffix="元" step={1000} icon={Coins} />
              <p className="-mt-3 mb-4 text-xs text-stone-500">
                通膨調整後，退休當年實際約需 <span className="font-semibold text-teal-700">NT$ {fmt(calc.firstYearMonthly)}</span> / 月
              </p>
              <NumberInput label="目前已有退休準備金" value={initialFund} setValue={setInitialFund} suffix="元" step={10000} icon={Wallet} />
              <NumberInput label="工作期每月定期定額（隨市場波動）" value={monthlyInvest} setValue={setMonthlyInvest} suffix="元" step={1000} icon={PiggyBank} />
              <NumberInput label="工作期每月固定存（0% 不生息）" value={monthlyFixed} setValue={setMonthlyFixed} suffix="元" step={1000} icon={Wallet} />
              <NumberInput label="預估年化報酬率" value={annualReturn} setValue={setAnnualReturn} suffix="%" step={0.1} icon={Activity} />
              <NumberInput label="通膨率" value={inflation} setValue={setInflation} suffix="%" step={0.1} icon={TrendingDown} />
            </div>

            {/* 第三欄：配息保本設定 */}
            <div className="bg-white rounded-xl p-6 border border-stone-200 shadow-sm">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <TrendingUp size={18} className="text-teal-700" /> 配息保本設定
              </h2>
              <p className="text-xs text-stone-500 mb-4">退休後保本型資產（配息基金／儲蓄險／年金）的年配息率</p>
              <NumberInput label="年配息率" value={dividendRate} setValue={setDividendRate} suffix="%" step={0.1} icon={TrendingUp} />
              <p className="text-xs text-stone-500 leading-relaxed">
                退休後優先用配息支應生活費，配息足夠時本金不減；配息不足才動用本金。配息率越高，本金越能長久保留、對抗市場大跌。
              </p>
            </div>
          </div>
        </div>
        {/* /參數設定區 */}

        {/* 步驟二：退休現金流引導 */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-teal-700 text-white text-xs font-bold">2</span>
            <h2 className="text-lg font-bold text-stone-900">退休現金流引導</h2>
          </div>
          <p className="text-sm text-stone-500 mb-4 ml-8">四個步驟，帶客戶看懂「退休要準備多少、怎麼準備」</p>

          <div className="space-y-5">
            {/* STEP 1：退休後一個月要多少 */}
            <div className="bg-white rounded-xl p-6 border border-stone-200 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-teal-100 text-teal-700 text-sm font-bold">1</span>
                <h3 className="text-base font-bold text-stone-800">退休後，一個月要花多少？</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl p-5 bg-stone-50 border border-stone-200">
                  <p className="text-sm text-stone-500 mb-1">現在每月生活費（今日幣值）</p>
                  <p className="text-2xl font-black text-stone-800">NT$ {fmt(monthlyExpense)}</p>
                </div>
                <div className="rounded-xl p-5 bg-orange-50 border border-orange-200">
                  <p className="text-sm text-orange-600 mb-1">退休當年實際需要（通膨後）</p>
                  <p className="text-2xl font-black text-orange-600">NT$ {fmt(calc.firstYearMonthly)}</p>
                  <p className="text-xs text-orange-500 mt-1">{Math.max(0, retireAge - currentAge)} 年通膨累積後</p>
                </div>
              </div>
            </div>

            {/* STEP 2：提問互動 — 確立需求 */}
            <div className="bg-white rounded-xl p-6 border border-stone-200 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-teal-100 text-teal-700 text-sm font-bold">2</span>
                <h3 className="text-base font-bold text-stone-800">退休後這筆生活費，對您來說是？</h3>
              </div>
              <p className="text-sm text-stone-600 mb-4 leading-relaxed">
                退休後每月需要 <span className="font-semibold text-teal-700">NT$ {fmt(calc.firstYearMonthly)}</span> 維持生活。請先想想：這筆錢對您而言是必需，還是可有可無？
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setNeedAnswer("need")}
                  className={`py-4 rounded-xl border-2 font-bold transition-all ${needAnswer === "need" ? "border-teal-600 bg-teal-600 text-white shadow-md" : "border-stone-300 bg-white text-stone-700 hover:border-teal-400"}`}
                >
                  一定需要
                </button>
                <button
                  type="button"
                  onClick={() => setNeedAnswer("maybe")}
                  className={`py-4 rounded-xl border-2 font-bold transition-all ${needAnswer === "maybe" ? "border-stone-500 bg-stone-500 text-white shadow-md" : "border-stone-300 bg-white text-stone-700 hover:border-stone-400"}`}
                >
                  可有可無
                </button>
              </div>
              {needAnswer === "need" && (
                <div className="mt-4 rounded-xl bg-teal-50 border border-teal-200 px-5 py-4">
                  <p className="text-sm text-teal-800 leading-relaxed">
                    <span className="font-bold">沒錯，這是退休生活的底線。</span>既然這筆錢一定要有，關鍵就不是「要不要準備」，而是「現在就開始，還是等以後」——越早開始，每月負擔越輕。我們往下看要準備多少。
                  </p>
                </div>
              )}
              {needAnswer === "maybe" && (
                <div className="mt-4 rounded-xl bg-stone-100 border border-stone-200 px-5 py-4">
                  <p className="text-sm text-stone-700 leading-relaxed">
                    可以理解。不過退休後沒有薪水，這筆生活費是每個月都會發生的固定支出——如果不靠自己準備，屆時要靠誰？不妨先看看完整準備的金額，再決定如何取捨。
                  </p>
                </div>
              )}
            </div>

            {/* STEP 3：兩條準備路線 */}
            <div className="bg-white rounded-xl p-6 border border-stone-200 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-teal-100 text-teal-700 text-sm font-bold">3</span>
                <h3 className="text-base font-bold text-stone-800">你需要準備多少？兩條路線</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 路線A：存一筆錢花到老（可點選） */}
                <button
                  type="button"
                  onClick={() => setSelectedPlan("A")}
                  className={`text-left rounded-xl border-2 p-5 transition-all ${selectedPlan === "A" ? "border-teal-600 bg-teal-50/60 shadow-md" : "border-stone-200 bg-white hover:border-stone-300"}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-bold text-stone-700">路線 A · 存一筆錢，邊領邊花</p>
                    {selectedPlan === "A" && <span className="flex items-center justify-center w-5 h-5 rounded-full bg-teal-600 text-white text-xs">✓</span>}
                  </div>
                  <p className="text-xs text-stone-400 mb-3">本金不增值，從 {retireAge} 歲領到 {lifeAge} 歲（共 {calc.retireYears} 年）剛好用完</p>
                  <p className="text-3xl font-black text-stone-800">{fmtMan(calc.lumpSumDepletion)}<span className="text-lg font-bold">萬</span></p>
                  <p className="text-xs text-stone-400 mt-2">退休時需準備的總金額</p>
                </button>
                {/* 路線B：配息現金流（可點選） */}
                <div
                  onClick={() => setSelectedPlan("B")}
                  className={`cursor-pointer rounded-xl border-2 p-5 transition-all ${selectedPlan === "B" ? "border-teal-600 bg-teal-50/60 shadow-md" : "border-stone-200 bg-white hover:border-stone-300"}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-bold text-teal-700">路線 B · 靠配息現金流，不動本金</p>
                    {selectedPlan === "B" && <span className="flex items-center justify-center w-5 h-5 rounded-full bg-teal-600 text-white text-xs">✓</span>}
                  </div>
                  <p className="text-xs text-stone-400 mb-3">本金放著領配息，永遠不用動本金</p>
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-stone-600 mb-1">你覺得合理的年報酬率？</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" inputMode="decimal" step={0.5}
                        onClick={(e) => e.stopPropagation()}
                        value={yieldText}
                        onChange={(e) => {
                          setYieldText(e.target.value);            // 即時更新顯示，可暫時為空
                          const n = Number(e.target.value);
                          if (e.target.value !== "" && !isNaN(n) && n > 0) setIncomeYieldAssumption(n);
                        }}
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          if (e.target.value === "" || isNaN(n) || n <= 0) {
                            setIncomeYieldAssumption(4);            // 空白/非法/0 → 回預設 4
                            setYieldText("4");
                          } else {
                            setYieldText(String(n));
                          }
                        }}
                        className="w-24 bg-white border border-stone-300 rounded-lg px-3 py-1.5 text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                      <span className="text-sm text-stone-500">% / 年</span>
                    </div>
                  </div>
                  <p className="text-3xl font-black text-teal-700">{fmtMan(calc.lumpSumIncome)}<span className="text-lg font-bold">萬</span></p>
                  <p className="text-xs text-stone-400 mt-2">需準備的本金（{incomeYieldAssumption}% 配息可支應退休首年生活費）</p>
                </div>
              </div>
              <p className="text-xs text-stone-400 mt-3">
                註：兩條路線皆以退休首年（通膨調整後）全額生活費試算，屬保守估計。
              </p>
            </div>

            {/* STEP 3.5：拖延成本 */}
            <div className="bg-white rounded-xl p-6 border border-stone-200 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-orange-100 text-orange-600 text-sm font-bold">!</span>
                <h3 className="text-base font-bold text-stone-800">越晚開始，負擔越重</h3>
              </div>
              <p className="text-sm text-stone-600 mb-4 leading-relaxed">
                同樣的目標金額（{fmtMan(calc.targetAmount)} 萬），現在就開始準備，跟拖延之後才開始，每月要存的錢差很多：
              </p>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className="text-xs text-stone-400 mr-1">假設拖延</span>
                {[5, 10, 15].map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => setDelayYears(y)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${delayYears === y ? "bg-orange-500 text-white border-orange-500" : "bg-white text-stone-500 border-stone-300"}`}
                  >
                    {y} 年
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-5">
                  <p className="text-sm text-teal-700 mb-1">現在就開始</p>
                  <p className="text-2xl font-black text-teal-700">NT$ {fmt(calc.monthlyNow)}<span className="text-sm font-bold"> / 月</span></p>
                  <p className="text-xs text-stone-400 mt-1">距退休還有 {Math.max(0, retireAge - currentAge)} 年</p>
                </div>
                <div className="rounded-xl border-2 border-orange-300 bg-orange-50/60 p-5">
                  <p className="text-sm text-orange-600 mb-1">拖延 {delayYears} 年才開始</p>
                  <p className="text-2xl font-black text-orange-600">NT$ {fmt(calc.monthlyDelayed)}<span className="text-sm font-bold"> / 月</span></p>
                  <p className="text-xs text-orange-500 mt-1">只剩 {Math.max(0, retireAge - currentAge - delayYears)} 年可準備</p>
                </div>
              </div>
              <div className="mt-4 rounded-lg bg-orange-50 border border-orange-200 px-5 py-3">
                <p className="text-sm text-orange-700">
                  拖延 {delayYears} 年，每月得多存 <span className="font-bold">NT$ {fmt(calc.monthlyExtra)}</span>——時間就是您最大的本錢，越早開始越輕鬆。
                </p>
              </div>
            </div>

            {/* STEP 4：解決方案結論 */}
            <div className="bg-gradient-to-br from-teal-700 to-teal-800 rounded-xl p-6 text-white shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-white/20 text-white text-sm font-bold">4</span>
                <h3 className="text-base font-bold">你的退休解決方案 · {selectedPlan === "A" ? "路線 A" : "路線 B"}</h3>
              </div>
              <p className="text-sm text-teal-50 leading-relaxed mb-4">
                {selectedPlan === "A" ? (
                  <>
                    退休後每月需要 <span className="font-bold text-white">NT$ {fmt(calc.firstYearMonthly)}</span>。
                    您選擇的是「<span className="font-bold text-white">存一筆錢、邊領邊花</span>」，
                    需在退休時準備 <span className="font-bold text-white">{fmtMan(calc.lumpSumDepletion)} 萬</span>，
                    從 {retireAge} 歲領到 {lifeAge} 歲剛好用完。這條路本金會逐年消耗，需留意長壽與通膨風險。
                  </>
                ) : (
                  <>
                    退休後每月需要 <span className="font-bold text-white">NT$ {fmt(calc.firstYearMonthly)}</span>。
                    您選擇的是「<span className="font-bold text-white">靠配息現金流、不動本金</span>」，
                    在 {incomeYieldAssumption}% 年報酬率下需準備本金 <span className="font-bold text-white">{fmtMan(calc.lumpSumIncome)} 萬</span>；
                    這筆本金能持續產生現金流、不必擔心市場大跌侵蝕老本，還可保留資產傳承。
                  </>
                )}
              </p>
              <div className="flex flex-wrap gap-3">
                <div className="rounded-lg bg-white/10 px-4 py-3 flex-1 min-w-[140px]">
                  <p className="text-xs text-teal-100 mb-1">每月需準備現金流</p>
                  <p className="text-xl font-bold">NT$ {fmt(calc.firstYearMonthly)}</p>
                </div>
                <div className="rounded-lg bg-white/10 px-4 py-3 flex-1 min-w-[140px]">
                  <p className="text-xs text-teal-100 mb-1">{selectedPlan === "A" ? "存一筆錢方案所需總額" : "配息路線所需本金"}</p>
                  <p className="text-xl font-bold">{fmtMan(selectedPlan === "A" ? calc.lumpSumDepletion : calc.lumpSumIncome)} 萬</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* /退休現金流引導 */}

      </main>

      <footer className="text-center text-xs text-stone-400 py-6 border-t border-stone-200">
        退休資產管理系統 · 歷史報酬僅供教育參考，不代表未來績效，不構成投資建議
      </footer>
    </div>
  );
}
