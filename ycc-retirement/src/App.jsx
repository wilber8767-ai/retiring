import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
  PieChart, Pie, Cell,
} from "recharts";
import {
  Wallet, TrendingDown, ShieldCheck, Activity, HeartPulse, Coins, Calendar,
  PiggyBank, Landmark, TrendingUp, Skull, Layers, Repeat,
  FileText,
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

export default function App() {
  // ===== 狀態 =====
  const [currentAge, setCurrentAge] = useState(30);
  const [retireAge, setRetireAge] = useState(65);
  const [lifeAge, setLifeAge] = useState(85);

  const [monthlyExpense, setMonthlyExpense] = useState(50000); // 現值每月生活費
  const [initialFund, setInitialFund] = useState(1000000); // 已有準備金
  const [monthlyContribution, setMonthlyContribution] = useState(10000); // ★工作期每月投入
  const [annualReturn, setAnnualReturn] = useState(6); // 工作期/退休前報酬 %
  const [retireReturn, setRetireReturn] = useState(3); // ★退休後保守報酬率（Glide Path）%
  const [inflation, setInflation] = useState(2.5); // 通膨率 %

  // 勞保/勞退
  const [includePension, setIncludePension] = useState(true); // ★勞保開關
  const [monthlyPension, setMonthlyPension] = useState(20000); // ★每月基礎退休金（現值）

  const [includeMedical, setIncludeMedical] = useState(true); // 75 歲扣 500 萬

  // ★防禦型資產配置（生存金）
  const [survivalAmount, setSurvivalAmount] = useState(200000); // 每次領取生存金金額
  const [survivalFreq, setSurvivalFreq] = useState(2); // 領取頻率：0=每月, 1=每年, 2=每兩年

  const MEDICAL_DEBT = 5000000;
  const MEDICAL_AGE = 75;

  // ===== 核心運算 =====
  const calc = useMemo(() => {
    const rPre = annualReturn / 100;   // 退休前報酬
    const rPost = retireReturn / 100;  // 退休後保守報酬（綠線用）
    const inf = inflation / 100;
    const yearsToRetire = Math.max(0, retireAge - currentAge);
    const retireYears = Math.max(0, lifeAge - retireAge);

    // 退休首年的名目每月生活費（現值經通膨成長至退休）
    const firstYearMonthly = monthlyExpense * Math.pow(1 + inf, yearsToRetire);
    const firstYearAnnual = firstYearMonthly * 12;

    // 勞保年金：退休首年名目年金額
    const pensionFirstYearAnnual = includePension
      ? monthlyPension * 12 * Math.pow(1 + inf, yearsToRetire)
      : 0;

    // 退休所需總資金（名目年金現值）：以「淨提領 = 生活費 − 勞保年金」折現
    let needAtRetire = 0;
    for (let t = 0; t < retireYears; t++) {
      const expenseThatYear = firstYearAnnual * Math.pow(1 + inf, t);
      const pensionThatYear = pensionFirstYearAnnual * Math.pow(1 + inf, t);
      const netDraw = Math.max(0, expenseThatYear - pensionThatYear);
      needAtRetire += netDraw / Math.pow(1 + rPost, t); // 退休後以保守報酬折現
    }

    // 已有準備金成長到退休年（退休前報酬）
    const initialAtRetire = initialFund * Math.pow(1 + rPre, yearsToRetire);

    // ★工作期定期定額的終值 FV（每月投入，月複利）
    const monthlyRate = rPre / 12;
    const months = yearsToRetire * 12;
    let contributionFV = 0;
    if (months > 0) {
      contributionFV =
        monthlyRate === 0
          ? monthlyContribution * months
          : monthlyContribution * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);
    }

    // 退休當下總資產
    const fundAtRetire = initialAtRetire + contributionFV;

    // 醫療負債折現到退休年
    let medicalPV = 0;
    if (includeMedical && MEDICAL_AGE > retireAge && MEDICAL_AGE <= lifeAge) {
      medicalPV = MEDICAL_DEBT / Math.pow(1 + rPost, MEDICAL_AGE - retireAge);
    }

    // 缺口（退休年現值）
    const gapAtRetire = Math.max(0, needAtRetire + medicalPV - fundAtRetire);

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
    let balDefense = initialFund; // ★紫線：基礎同 S&P 500 + 生存金
    let bankruptPerfect = false, bankruptSP = false, bankrupt0050 = false, bankruptDefense = false;
    let ruinPerfect = null, ruinSP = null, ruin0050 = null, ruinDefense = null;

    for (let age = currentAge; age <= lifeAge; age++) {
      const yearIndex = age - currentAge;
      const isRetired = age >= retireAge;
      const retireYearIndex = age - retireAge; // 0 = 退休當年, 1 = 退休後第1年...

      const expenseNow = monthlyExpense * 12 * Math.pow(1 + inf, yearIndex);
      const pensionNow = includePension
        ? monthlyPension * 12 * Math.pow(1 + inf, yearIndex)
        : 0;
      const netDrawNow = Math.max(0, expenseNow - pensionNow); // 退休後嚴格淨提領
      const annualContribution = monthlyContribution * 12;

      // 歷史序列報酬
      const histSP = SP500_RETURNS[yearIndex % SP500_RETURNS.length];
      const hist0050 = T0050_RETURNS[yearIndex % T0050_RETURNS.length];

      // 報酬順序風險：退休後第1、2年強制熊市（紅/藍/紫共用此衝擊）
      const shockReturn =
        retireYearIndex === 1 ? SHOCK_Y1 :
        retireYearIndex === 2 ? SHOCK_Y2 : null;
      const rSP = shockReturn !== null ? shockReturn : histSP;
      const r0050 = shockReturn !== null ? shockReturn : hist0050;

      // 生存金當年撥入金額（退休後，依頻率）
      // freq 0=每月（該年撥入 12 次）, 1=每年, 2=每兩年
      let survivalInflow = 0;
      if (isRetired && retireYearIndex > 0) {
        if (survivalFreq === 0) survivalInflow = survivalAmount * 12;
        else if (retireYearIndex % survivalFreq === 0) survivalInflow = survivalAmount;
      }

      // 綠線：完美預期（Glide Path，無衝擊）
      if (!bankruptPerfect) {
        const growth = isRetired ? rPost : rPre;
        balPerfect = balPerfect * (1 + growth);
        if (isRetired) balPerfect -= netDrawNow;
        else balPerfect += annualContribution;
        if (includeMedical && age === MEDICAL_AGE) balPerfect -= MEDICAL_DEBT;
        if (balPerfect <= 0) { balPerfect = 0; bankruptPerfect = true; ruinPerfect = age; }
      } else balPerfect = 0;

      // 紅線：S&P 500（含退休後前兩年熊市）
      if (!bankruptSP) {
        balSP = balSP * (1 + rSP);
        if (isRetired) balSP -= netDrawNow;
        else balSP += annualContribution;
        if (includeMedical && age === MEDICAL_AGE) balSP -= MEDICAL_DEBT;
        if (balSP <= 0) { balSP = 0; bankruptSP = true; ruinSP = age; }
      } else balSP = 0;

      // 藍線：0050（含退休後前兩年熊市）
      if (!bankrupt0050) {
        bal0050 = bal0050 * (1 + r0050);
        if (isRetired) bal0050 -= netDrawNow;
        else bal0050 += annualContribution;
        if (includeMedical && age === MEDICAL_AGE) bal0050 -= MEDICAL_DEBT;
        if (bal0050 <= 0) { bal0050 = 0; bankrupt0050 = true; ruin0050 = age; }
      } else bal0050 = 0;

      // ★紫線：防禦機制（基礎遭遇 = S&P 500 完全相同，額外加生存金現金流）
      if (!bankruptDefense) {
        balDefense = balDefense * (1 + rSP);
        if (isRetired) balDefense -= netDrawNow;
        else balDefense += annualContribution;
        if (survivalInflow > 0) balDefense += survivalInflow; // ★底層穩定現金流注入
        if (includeMedical && age === MEDICAL_AGE) balDefense -= MEDICAL_DEBT;
        if (balDefense <= 0) { balDefense = 0; bankruptDefense = true; ruinDefense = age; }
      } else balDefense = 0;

      data.push({
        age,
        perfect: Math.round(balPerfect),
        sp500: Math.round(balSP),
        t0050: Math.round(bal0050),
        defense: Math.round(balDefense),
      });
    }

    // ===== 促結區衍生數值 =====
    // 1) 防禦資產多爭取的安全期年數（防禦線破產 − S&P 500 破產，未破產以壽命計）
    const spRuinAge = ruinSP === null ? lifeAge : ruinSP;
    const defRuinAge = ruinDefense === null ? lifeAge : ruinDefense;
    const extraSafeYears = Math.max(0, defRuinAge - spRuinAge);

    // 2) 退休現金流健康度（退休首年）：
    //    保證型收益 = 勞保年金(年) + 生存金年流入；波動型依賴 = 仍需從市場提領的缺口
    const firstPension = pensionFirstYearAnnual; // 退休首年勞保年金
    const firstSurvival =
      survivalFreq === 0 ? survivalAmount * 12 :
      survivalFreq === 1 ? survivalAmount : 0; // 退休首年(第1年)：每兩年制此年不撥
    const guaranteedIncome = firstPension + firstSurvival;
    const marketDependent = Math.max(0, firstYearAnnual - guaranteedIncome);

    return {
      gapAtRetire, extraMonthly, lumpSum, fundAtRetire, contributionFV,
      data, retireAge,
      ruin: { perfect: ruinPerfect, sp500: ruinSP, t0050: ruin0050, defense: ruinDefense },
      spRuinAge, defRuinAge, extraSafeYears,
      guaranteedIncome, marketDependent,
    };
  }, [
    currentAge, retireAge, lifeAge, monthlyExpense, initialFund,
    monthlyContribution, annualReturn, retireReturn, inflation,
    includePension, monthlyPension, includeMedical,
    survivalAmount, survivalFreq,
  ]);

  // ===== 子元件 =====
  const Slider = ({ label, value, setValue, min, max, icon: Icon }) => (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-2">
        <span className="flex items-center gap-2 text-sm font-medium text-stone-700">
          {Icon && <Icon size={16} className="text-teal-700" />}
          {label}
        </span>
        <span className="text-teal-700 font-bold text-lg">{value}</span>
      </div>
      <input type="range" min={min} max={max} value={value}
        onChange={(e) => setValue(Number(e.target.value))} className="w-full" />
      <div className="flex justify-between text-xs text-stone-400 mt-1">
        <span>{min}</span><span>{max}</span>
      </div>
    </div>
  );

  const NumberInput = ({ label, value, setValue, suffix, step = 1, icon: Icon }) => (
    <div className="mb-4">
      <label className="flex items-center gap-2 text-sm font-medium text-stone-700 mb-1">
        {Icon && <Icon size={16} className="text-teal-700" />}
        {label}
      </label>
      <div className="relative">
        <input type="number" value={value} step={step}
          onChange={(e) => setValue(Number(e.target.value))}
          className="w-full bg-stone-50 border border-stone-300 rounded-lg px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-600" />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">{suffix}</span>
        )}
      </div>
    </div>
  );

  const Toggle = ({ checked, onChange }) => (
    <button onClick={onChange}
      className={`relative w-12 h-6 rounded-full transition-colors ${checked ? "bg-teal-700" : "bg-stone-300"}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${checked ? "translate-x-6" : ""}`} />
    </button>
  );

  return (
    <div className="min-h-screen bg-stone-100 text-stone-800">
      <header className="border-b border-stone-200 bg-white px-6 py-4 flex items-center gap-3 shadow-sm">
        <div className="w-10 h-10 rounded-lg bg-teal-700 flex items-center justify-center font-black text-white text-sm">退休</div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-stone-900">退休資產管理系統</h1>
          <p className="text-xs text-stone-500">Retirement Asset Management System</p>
        </div>
      </header>

      <section className="px-6 py-8 bg-gradient-to-b from-white to-stone-50 border-b border-stone-200">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-stone-500 text-sm flex items-center justify-center gap-2 mb-2">
            <TrendingDown size={16} className="text-red-400" />
            預估財富缺口（已計入工作期投入、勞保年金與保守報酬）
          </p>
          <div className="text-5xl md:text-6xl font-black text-teal-700 mb-2">
            NT$ {fmt(calc.gapAtRetire)}
          </div>
          <p className="text-stone-400 text-xs mb-6">（以退休年現值計算之資金缺口）</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
            <div className="bg-white border border-teal-600/30 rounded-xl p-5 shadow-sm">
              <p className="text-stone-500 text-sm mb-1">在現有投入之外，您現在還需</p>
              <p className="text-2xl font-bold text-stone-900">
                每月再投入 <span className="text-teal-700">NT$ {fmt(calc.extraMonthly)}</span>
              </p>
            </div>
            <div className="bg-white border border-teal-600/30 rounded-xl p-5 shadow-sm">
              <p className="text-stone-500 text-sm mb-1">或一次性</p>
              <p className="text-2xl font-bold text-stone-900">
                單筆投入 <span className="text-teal-700">NT$ {fmt(calc.lumpSum)}</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* 步驟一：參數設定區（並排卡片） */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-teal-700 text-white text-xs font-bold">1</span>
            <h2 className="text-lg font-bold text-stone-900">參數設定</h2>
          </div>
          <p className="text-xs text-stone-400 mb-4">填入您的退休規劃參數，下方曲線與診斷將即時更新</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
          <div className="bg-white rounded-xl p-6 border border-stone-200 shadow-sm">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Calendar size={18} className="text-teal-700" /> 年齡控制
            </h2>
            <Slider label="當前年齡" value={currentAge} setValue={setCurrentAge} min={20} max={65} />
            <Slider label="預計退休年齡" value={retireAge} setValue={setRetireAge} min={50} max={80} />
            <Slider label="預估壽命" value={lifeAge} setValue={setLifeAge} min={70} max={100} />
          </div>

          <div className="bg-white rounded-xl p-6 border border-stone-200 shadow-sm">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Wallet size={18} className="text-teal-700" /> 財務基礎
            </h2>
            <NumberInput label="退休後每月生活費（現值）" value={monthlyExpense} setValue={setMonthlyExpense} suffix="元" step={1000} icon={Coins} />
            <NumberInput label="目前已有退休準備金" value={initialFund} setValue={setInitialFund} suffix="元" step={10000} icon={Wallet} />
            <NumberInput label="工作期每月預計投入" value={monthlyContribution} setValue={setMonthlyContribution} suffix="元" step={1000} icon={PiggyBank} />
            <NumberInput label="預估年化報酬率（退休前）" value={annualReturn} setValue={setAnnualReturn} suffix="%" step={0.1} icon={Activity} />
            <NumberInput label="退休後保守報酬率（Glide Path）" value={retireReturn} setValue={setRetireReturn} suffix="%" step={0.1} icon={TrendingUp} />
            <NumberInput label="通膨率" value={inflation} setValue={setInflation} suffix="%" step={0.1} icon={TrendingDown} />
          </div>

          <div className="bg-white rounded-xl p-6 border border-stone-200 shadow-sm">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Landmark size={18} className="text-teal-700" /> 基礎社會保險
            </h2>
            <div className="flex items-center justify-between mb-4 p-3 bg-stone-100 rounded-lg">
              <span className="flex items-center gap-2 text-sm text-stone-700">
                <Landmark size={16} className="text-teal-700" /> 計入勞保／勞退年金
              </span>
              <Toggle checked={includePension} onChange={() => setIncludePension(!includePension)} />
            </div>
            <NumberInput label="每月基礎退休金（勞保/勞退，現值）" value={monthlyPension} setValue={setMonthlyPension} suffix="元" step={1000} icon={Coins} />
            <p className="text-xs text-stone-500">退休後此筆現金流可抵銷部分通膨調整後生活費</p>
          </div>

          <div className="bg-white rounded-xl p-6 border border-stone-200 shadow-sm">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Layers size={18} className="text-teal-700" /> 防禦型資產配置
            </h2>
            <NumberInput label={survivalFreq === 0 ? "每月領取生存金金額" : "每次領取生存金金額"} value={survivalAmount} setValue={setSurvivalAmount} suffix="元" step={10000} icon={ShieldCheck} />
            <label className="flex items-center gap-2 text-sm font-medium text-stone-700 mb-2">
              <Repeat size={16} className="text-teal-700" /> 領取頻率
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setSurvivalFreq(0)}
                className={`py-2 rounded-lg text-sm font-medium transition-colors border ${survivalFreq === 0 ? "bg-teal-700 text-white border-teal-700" : "bg-stone-50 text-stone-600 border-stone-300"}`}>
                每月
              </button>
              <button
                onClick={() => setSurvivalFreq(1)}
                className={`py-2 rounded-lg text-sm font-medium transition-colors border ${survivalFreq === 1 ? "bg-teal-700 text-white border-teal-700" : "bg-stone-50 text-stone-600 border-stone-300"}`}>
                每年
              </button>
              <button
                onClick={() => setSurvivalFreq(2)}
                className={`py-2 rounded-lg text-sm font-medium transition-colors border ${survivalFreq === 2 ? "bg-teal-700 text-white border-teal-700" : "bg-stone-50 text-stone-600 border-stone-300"}`}>
                每兩年
              </button>
            </div>
            <p className="text-xs text-stone-500 mt-3">
              {survivalFreq === 0
                ? "退休後每月撥入生存金（圖表以年計，等於該年領取 12 次），僅作用於「防禦機制」紫線"
                : "退休後依此頻率撥入生存金，僅作用於圖表中的「防禦機制」紫線"}
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 border border-stone-200 shadow-sm">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <ShieldCheck size={18} className="text-teal-700" /> 風險與防禦
            </h2>
            <div className="flex items-center justify-between p-3 bg-stone-100 rounded-lg">
              <span className="flex items-center gap-2 text-sm text-stone-700">
                <HeartPulse size={16} className="text-red-400" /> 計入晚年醫療與長照負債
              </span>
              <Toggle checked={includeMedical} onChange={() => setIncludeMedical(!includeMedical)} />
            </div>
            <p className="text-xs text-stone-500 mt-2">開啟時於 75 歲對三條線各強制扣除 NT$ 5,000,000</p>
          </div>
          </div>
        </div>
        {/* /參數設定區 */}

        {/* 步驟二：資產曲線 */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-teal-700 text-white text-xs font-bold">2</span>
            <h2 className="text-lg font-bold text-stone-900">資產曲線</h2>
          </div>
          <p className="text-xs text-stone-400 mb-4">四情境壓力測試，觀察資產在不同策略下的長期走勢</p>
          <div className="bg-white rounded-xl p-6 border border-stone-200 shadow-sm">
            <h2 className="text-lg font-bold mb-1">資產剩餘價值模擬</h2>
            <p className="text-xs text-stone-500 mb-4">
              四情境對比 · 退休後前兩年強制熊市（-20%／-25%）模擬報酬順序風險
            </p>
            <div className="h-[460px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={calc.data} margin={{ top: 40, right: 24, left: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                  <XAxis dataKey="age" stroke="#78716c"
                    label={{ value: "年齡", position: "insideBottomRight", offset: -5, fill: "#78716c" }} />
                  <YAxis stroke="#78716c" tickFormatter={(v) => `${fmtMan(v)}萬`} width={60} />
                  <Tooltip formatter={(v, name) => [`NT$ ${fmt(v)}`, name]}
                    labelFormatter={(l) => `${l} 歲`}
                    contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #d6d3d1", borderRadius: 8, color: "#1c1917" }} />
                  <Legend />
                  <ReferenceLine x={calc.retireAge} stroke="#0f766e" strokeDasharray="4 4"
                    label={{ value: "退休", fill: "#0f766e", position: "insideTop", fontSize: 12, dy: -20 }} />
                  <Line type="monotone" dataKey="perfect" name="完美預期(Glide Path)" stroke="#22c55e" strokeDasharray="6 4" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="sp500" name="S&P 500 真實序列" stroke="#ef4444" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="t0050" name="0050 真實序列" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="defense" name="防禦機制啟動" stroke="#9333ea" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 text-xs text-stone-500 flex flex-wrap gap-x-4 gap-y-1 justify-center">
              <span>退休當下預估總資產 NT$ {fmt(calc.fundAtRetire)}</span>
              <span>含工作期定期定額終值 NT$ {fmt(calc.contributionFV)}</span>
            </div>
          </div>
        </div>
        {/* /資產曲線 */}

        {/* 步驟三：壓力測試與解決方案 */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-teal-700 text-white text-xs font-bold">3</span>
            <h2 className="text-lg font-bold text-stone-900">壓力測試與解決方案</h2>
          </div>
          <p className="text-xs text-stone-400 mb-4">基於上述壓力測試之客觀診斷結果，制定缺口填補計畫並匯出報表</p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 1) 壓力測試結果對比 Stress Test Results */}
          <div className="bg-white rounded-xl p-6 border border-stone-200 shadow-sm flex flex-col">
            <h3 className="text-xs font-semibold text-stone-500 mb-4 uppercase tracking-wide">壓力測試結果對比</h3>
            <div className="space-y-3">
              <div className="rounded-lg p-4 bg-stone-50 border border-stone-200">
                <div className="text-xs text-stone-500 mb-1">無防禦機制</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-stone-800">{calc.spRuinAge}</span>
                  <span className="text-sm text-stone-500">歲</span>
                  <span className="text-xs text-stone-400 ml-1">{calc.ruin.sp500 === null ? "未觸底" : "資產觸底"}</span>
                </div>
              </div>
              <div className="rounded-lg p-4 bg-stone-50 border border-stone-200">
                <div className="text-xs text-stone-500 mb-1">加入防禦資產</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-stone-800">{calc.defRuinAge}</span>
                  <span className="text-sm text-stone-500">歲</span>
                  <span className="text-xs text-stone-400 ml-1">{calc.ruin.defense === null ? "未觸底" : "資產觸底"}</span>
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-center gap-2 rounded-lg py-3 px-4 bg-teal-50 border border-teal-200">
              <TrendingUp size={16} className="text-teal-700" />
              <span className="text-sm text-stone-600">有效延長絕對安全期</span>
              <span className="text-xl font-bold text-teal-700">{calc.extraSafeYears}</span>
              <span className="text-sm text-stone-600">年</span>
            </div>
          </div>

          {/* 2) 退休現金流結構分析 Donut */}
          <div className="bg-white rounded-xl p-6 border border-stone-200 shadow-sm flex flex-col">
            <h3 className="text-xs font-semibold text-stone-500 mb-1 uppercase tracking-wide">退休現金流結構分析</h3>
            <p className="text-xs text-stone-400 mb-2">退休首年收入來源組成</p>
            <div className="flex-1 min-h-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: "保證型收益", value: Math.round(calc.guaranteedIncome) },
                      { name: "波動型依賴", value: Math.round(calc.marketDependent) },
                    ]}
                    dataKey="value" nameKey="name"
                    innerRadius={48} outerRadius={70} paddingAngle={2}
                  >
                    <Cell fill="#0f766e" />
                    <Cell fill="#f59e0b" />
                  </Pie>
                  <Tooltip formatter={(v) => `NT$ ${fmt(v)}`} contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #d6d3d1", borderRadius: 8, color: "#1c1917" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5 mt-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-stone-600">
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "#0f766e" }} /> 保證型收益（社會保險+穩定現金流）
                </span>
                <span className="font-semibold text-stone-800">{fmt(calc.guaranteedIncome)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-stone-600">
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "#f59e0b" }} /> 波動型依賴（市場提領缺口）
                </span>
                <span className="font-semibold text-stone-800">{fmt(calc.marketDependent)}</span>
              </div>
            </div>
          </div>

          {/* 3) 系統優化建議與匯出 */}
          <div className="bg-white rounded-xl p-6 border border-stone-200 shadow-sm flex flex-col">
            <h3 className="text-xs font-semibold text-stone-500 mb-4 uppercase tracking-wide">缺口填補計畫</h3>
            <div className="rounded-lg p-4 bg-stone-50 border border-stone-200 mb-3">
              <div className="text-xs text-stone-500 mb-1">每月需額外投入（PMT）</div>
              <div className="text-2xl font-bold text-stone-800">NT$ {fmt(calc.extraMonthly)}</div>
            </div>
            <div className="rounded-lg p-4 bg-stone-50 border border-stone-200">
              <div className="text-xs text-stone-500 mb-1">或單筆投入</div>
              <div className="text-2xl font-bold text-stone-800">NT$ {fmt(calc.lumpSum)}</div>
            </div>
            <div className="flex-1" />
            <button
              onClick={() => alert("資產壓力測試報告產製功能開發中。\n\n將輸出含壓力測試結果、現金流結構分析與缺口填補計畫之完整診斷報告（PDF）。")}
              className="mt-4 flex items-center justify-center gap-2 border border-teal-700 text-teal-700 hover:bg-teal-50 font-semibold px-5 py-3 rounded-lg transition-colors"
            >
              <FileText size={18} />
              匯出資產壓力測試報告（PDF）
            </button>
          </div>
          </div>
        </div>
        {/* /壓力測試與解決方案 */}
      </main>

      <footer className="text-center text-xs text-stone-400 py-6 border-t border-stone-200">
        退休資產管理系統 · 歷史報酬僅供教育參考，不代表未來績效，不構成投資建議
      </footer>
    </div>
  );
}
