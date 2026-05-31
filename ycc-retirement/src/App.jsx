import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
  PieChart, Pie, Cell,
} from "recharts";
import {
  Wallet, TrendingDown, ShieldCheck, Activity, HeartPulse, Coins, Calendar,
  PiggyBank, Landmark, TrendingUp, Skull, Layers,
  FileText, UserRound,
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
  const [retireReturn, setRetireReturn] = useState(3); // ★退休後保守報酬率（Glide Path）%
  const [inflation, setInflation] = useState(2.5); // 通膨率 %

  // 勞保/勞退
  const [includePension, setIncludePension] = useState(true); // ★勞保開關
  const [monthlyPension, setMonthlyPension] = useState(20000); // ★每月基礎退休金（現值）

  const [includeMedical, setIncludeMedical] = useState(true); // 75 歲扣 500 萬

  // 圖表曲線可見性（預設只顯示完美預期，其餘由按鈕開啟）
  const [showLines, setShowLines] = useState({ perfect: true, t0050: false, sp500: false, defense: false });

  // ★三層防禦配置（退休那刻將資產拆成現金/配息/成長三層；僅作用於防禦機制紫線）
  const [cashPct, setCashPct] = useState(15);       // 現金安全層 %
  const [incomePct, setIncomePct] = useState(45);   // 配息收益層 %
  // 成長層 % = 100 - cashPct - incomePct（自動計算）
  const [dividendRate, setDividendRate] = useState(4); // 配息層年配息率 %

  const MEDICAL_DEBT = 5000000;
  const MEDICAL_AGE = 75;

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

  // 列印前自動顯示全部四條曲線，讓報表完整；列印後還原使用者原本的選擇
  useEffect(() => {
    const before = () => setShowLines({ perfect: true, t0050: true, sp500: true, defense: true });
    window.addEventListener("beforeprint", before);
    return () => window.removeEventListener("beforeprint", before);
  }, []);

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
    let balDefense = initialFund; // ★紫線：退休前單一資產池
    // 三層（退休那刻才拆分）
    let cashLayer = 0, incomeLayer = 0, growthLayer = 0;
    let layersInitialized = false;
    const growthPct = Math.max(0, 100 - cashPct - incomePct);
    const divRate = dividendRate / 100;
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

      // 綠線：完美預期（Glide Path，無衝擊）
      if (!bankruptPerfect) {
        const growth = isRetired ? rPost : rPre;
        balPerfect = balPerfect * (1 + growth);
        if (isRetired) balPerfect -= netDrawNow;
        else balPerfect += annualInvest + annualFixed;
        if (includeMedical && age === MEDICAL_AGE) balPerfect -= MEDICAL_DEBT;
        if (balPerfect <= 0) { balPerfect = 0; bankruptPerfect = true; ruinPerfect = age; }
      } else balPerfect = 0;

      // 紅線：S&P 500（含退休後前兩年熊市）
      if (!bankruptSP) {
        balSP = balSP * (1 + rSP);
        if (isRetired) balSP -= netDrawNow;
        else balSP += annualInvest + annualFixed;
        if (includeMedical && age === MEDICAL_AGE) balSP -= MEDICAL_DEBT;
        if (balSP <= 0) { balSP = 0; bankruptSP = true; ruinSP = age; }
      } else balSP = 0;

      // 藍線：0050（含退休後前兩年熊市）
      if (!bankrupt0050) {
        bal0050 = bal0050 * (1 + r0050);
        if (isRetired) bal0050 -= netDrawNow;
        else bal0050 += annualInvest + annualFixed;
        if (includeMedical && age === MEDICAL_AGE) bal0050 -= MEDICAL_DEBT;
        if (bal0050 <= 0) { bal0050 = 0; bankrupt0050 = true; ruin0050 = age; }
      } else bal0050 = 0;

      // ★紫線：防禦機制（三層架構）
      if (!bankruptDefense) {
        if (!isRetired) {
          // 退休前：單一資產池，與 S&P 基礎相同累積
          balDefense = balDefense * (1 + rSP) + annualInvest + annualFixed;
        } else {
          // 退休那一刻：把累積資產拆成三層（只做一次）
          if (!layersInitialized) {
            cashLayer = balDefense * (cashPct / 100);
            incomeLayer = balDefense * (incomePct / 100);
            growthLayer = balDefense * (growthPct / 100);
            layersInitialized = true;
          }
          // 成長層：跟著市場波動（含退休後前兩年熊市）
          growthLayer = growthLayer * (1 + rSP);
          // 配息層：本金不變，產生年配息現金流
          const dividendIncome = incomeLayer * divRate;
          // 當年需從資產淨提領（已扣勞保年金）
          let need = netDrawNow;
          // 1) 先用配息收益
          need -= dividendIncome;
          // 2) 不足從現金層提領
          if (need > 0) {
            const fromCash = Math.min(cashLayer, need);
            cashLayer -= fromCash;
            need -= fromCash;
          }
          // 3) 現金層空了，動用成長層
          if (need > 0) {
            growthLayer -= need;
            need = 0;
          }
          // 醫療負債：優先扣現金、再扣成長
          if (includeMedical && age === MEDICAL_AGE) {
            let debt = MEDICAL_DEBT;
            const c = Math.min(cashLayer, debt); cashLayer -= c; debt -= c;
            if (debt > 0) growthLayer -= debt;
          }
          if (growthLayer < 0) growthLayer = 0;
          balDefense = cashLayer + incomeLayer + growthLayer;
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
        const pension = includePension ? monthlyPension * 12 * Math.pow(1 + inf, yi) : 0;
        const netDraw = Math.max(0, expense - pension);
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
    const firstPension = pensionFirstYearAnnual; // 退休首年勞保年金
    // 配息層 = 退休那刻資產 × 配息比例；年配息 = 配息層 × 配息率
    const defenseRetireRow = data.find((d) => d.age === retireAge);
    const incomeLayerAmount = (defenseRetireRow ? defenseRetireRow.defense : 0) * (incomePct / 100);
    const firstDividend = incomeLayerAmount * (dividendRate / 100);
    const guaranteedIncome = firstPension + firstDividend;
    const marketDependent = Math.max(0, firstYearAnnual - guaranteedIncome);

    return {
      gapAtRetire, extraMonthly, lumpSum, fundAtRetire, contributionFV,
      firstYearMonthly,
      data, retireAge,
      ruin: { perfect: ruinPerfect, sp500: ruinSP, t0050: ruin0050, defense: ruinDefense },
      spRuinAge, defRuinAge, extraSafeYears,
      guaranteedIncome, marketDependent,
      perfectAtRetire, defenseAtRetire, sp500AtRetire, perfectSpan, defenseSpan, sp500Span,
    };
  }, [
    currentAge, retireAge, lifeAge, monthlyExpense, initialFund,
    monthlyInvest, monthlyFixed, annualReturn, retireReturn, inflation,
    includePension, monthlyPension, includeMedical,
    cashPct, incomePct, dividendRate,
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
          <p className="text-xs text-stone-400 mb-4">填入您的退休規劃參數，下方曲線與診斷將即時更新</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
            <div className="space-y-6">
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
            </div>
            <div className="space-y-6">
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
                <NumberInput label="預估年化報酬率（退休前）" value={annualReturn} setValue={setAnnualReturn} suffix="%" step={0.1} icon={Activity} />
                <NumberInput label="退休後保守報酬率（Glide Path）" value={retireReturn} setValue={setRetireReturn} suffix="%" step={0.1} icon={TrendingUp} />
                <NumberInput label="通膨率" value={inflation} setValue={setInflation} suffix="%" step={0.1} icon={TrendingDown} />
              </div>
            </div>
            <div className="space-y-6">
              <div className="bg-white rounded-xl p-6 border border-stone-200 shadow-sm">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <Layers size={18} className="text-teal-700" /> 退休資產三層配置
                </h2>
                <p className="text-xs text-stone-500 mb-4">退休那一刻將資產拆成三層，僅作用於「防禦機制」紫線</p>
                <NumberInput label="現金安全層比例" value={cashPct} setValue={setCashPct} suffix="%" step={1} icon={Wallet} />
                <NumberInput label="配息收益層比例" value={incomePct} setValue={setIncomePct} suffix="%" step={1} icon={Coins} />
                <div className="mb-4 flex items-center justify-between rounded-lg bg-stone-100 px-3 py-2">
                  <span className="text-sm text-stone-600">成長層比例（自動）</span>
                  <span className={`font-bold ${(100 - cashPct - incomePct) < 0 ? "text-red-500" : "text-teal-700"}`}>
                    {Math.max(0, 100 - cashPct - incomePct)}%
                  </span>
                </div>
                <NumberInput label="配息層年配息率" value={dividendRate} setValue={setDividendRate} suffix="%" step={0.1} icon={TrendingUp} />
                <p className="text-xs text-stone-500">
                  現金層用完不補；配息層本金不變、每年產生配息；成長層續留市場波動。提領順序：配息 → 現金層 → 成長層。
                </p>
                {(100 - cashPct - incomePct) < 0 && (
                  <p className="text-xs text-red-500 mt-2">⚠ 現金層 + 配息層超過 100%，請調整比例</p>
                )}
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
            <p className="text-xs text-stone-500 mb-3">
              四情境對比 · 退休後前兩年強制熊市（-20%／-25%）模擬報酬順序風險
            </p>
            <div className="no-print flex flex-wrap gap-2 mb-4">
              {[
                { key: "perfect", label: "完美預期", color: "#22c55e" },
                { key: "t0050", label: "0050 真實序列", color: "#3b82f6" },
                { key: "sp500", label: "S&P 500 真實序列", color: "#ef4444" },
                { key: "defense", label: "防禦機制啟動", color: "#9333ea" },
              ].map((ln) => {
                const on = showLines[ln.key];
                return (
                  <button
                    key={ln.key}
                    onClick={() => setShowLines((p) => ({ ...p, [ln.key]: !p[ln.key] }))}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${on ? "text-white border-transparent" : "bg-white text-stone-500 border-stone-300"}`}
                    style={on ? { backgroundColor: ln.color } : undefined}
                  >
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: on ? "#ffffff" : ln.color }} />
                    {ln.label}
                  </button>
                );
              })}
            </div>
            <div className="h-[460px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={calc.data} margin={{ top: 40, right: 24, left: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                  <XAxis dataKey="age" stroke="#78716c"
                    label={{ value: "年齡", position: "insideBottomRight", offset: -5, fill: "#78716c" }} />
                  <YAxis stroke="#78716c" tickFormatter={(v) => `${fmtMan(v)}萬`} width={80} />
                  <Tooltip formatter={(v, name) => [`NT$ ${fmt(v)}`, name]}
                    labelFormatter={(l) => `${l} 歲`}
                    contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #d6d3d1", borderRadius: 8, color: "#1c1917" }} />
                  <ReferenceLine x={calc.retireAge} stroke="#0f766e" strokeDasharray="4 4"
                    label={{ value: "退休", fill: "#0f766e", position: "insideTop", fontSize: 12, dy: -20 }} />
                  {showLines.perfect && <Line type="monotone" dataKey="perfect" name="完美預期(Glide Path)" stroke="#22c55e" strokeDasharray="6 4" strokeWidth={2} dot={false} isAnimationActive={false} />}
                  {showLines.sp500 && <Line type="monotone" dataKey="sp500" name="S&P 500 真實序列" stroke="#ef4444" strokeWidth={2.5} dot={false} isAnimationActive={false} />}
                  {showLines.t0050 && <Line type="monotone" dataKey="t0050" name="0050 真實序列" stroke="#3b82f6" strokeWidth={2.5} dot={false} isAnimationActive={false} />}
                  {showLines.defense && <Line type="monotone" dataKey="defense" name="防禦機制啟動" stroke="#9333ea" strokeWidth={2.5} dot={false} isAnimationActive={false} />}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 text-xs text-stone-500 flex flex-wrap gap-x-4 gap-y-1 justify-center">
              <span>退休當下預估總資產 NT$ {fmt(calc.fundAtRetire)}</span>
              <span>含工作期定期定額終值 NT$ {fmt(calc.contributionFV)}</span>
            </div>

            {/* 退休快照橫式表格：退休時資產 + 可支撐年數 */}
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-stone-100 text-stone-600">
                    <th className="text-left font-semibold px-4 py-3 rounded-l-lg">情境</th>
                    <th className="text-right font-semibold px-4 py-3">退休時資產（{retireAge} 歲）</th>
                    <th className="text-right font-semibold px-4 py-3 rounded-r-lg">資產可支撐</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-stone-100">
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-1 rounded-full inline-block" style={{ background: "#ef4444" }} />
                        純股票（無保本）
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-stone-800">NT$ {fmt(calc.sp500AtRetire)}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${calc.sp500Span.reachedLife ? "text-stone-700" : "text-red-600"}`}>
                      {calc.sp500Span.reachedLife
                        ? `逾 ${calc.sp500Span.years} 年（撐至壽命）`
                        : `${calc.sp500Span.years} 年 ${calc.sp500Span.months} 個月見底`}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-1 rounded-full inline-block" style={{ background: "#9333ea" }} />
                        股票 + 保本三層
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-stone-800">NT$ {fmt(calc.defenseAtRetire)}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${calc.defenseSpan.reachedLife ? "text-teal-700" : "text-red-600"}`}>
                      {calc.defenseSpan.reachedLife
                        ? `逾 ${calc.defenseSpan.years} 年（撐至壽命）`
                        : `${calc.defenseSpan.years} 年 ${calc.defenseSpan.months} 個月見底`}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="text-xs text-stone-400 mt-2">※ 可支撐年數依折線圖實際走勢計算，與上方曲線一致</p>
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
              onClick={() => navigate("/report", { state: {
                client: { clientName, clientGender, clientBirth },
                params: { currentAge, retireAge, lifeAge, monthlyExpense, initialFund, monthlyInvest, monthlyFixed, annualReturn, retireReturn, inflation, includePension, monthlyPension, includeMedical, cashPct, incomePct, dividendRate },
                calc,
              } })}
              className="no-print mt-4 flex items-center justify-center gap-2 border border-teal-700 text-teal-700 hover:bg-teal-50 font-semibold px-5 py-3 rounded-lg transition-colors"
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
