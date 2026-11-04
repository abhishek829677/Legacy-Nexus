import { isFactorKey, METRICS, NOT_AVAILABLE, READINESS, scoreMeaning, type FactorInputs } from "./modernize.copy";
import { fmtScore, fmtWeight, isNum, scoreBand } from "./modernize.format";
import { InfoFormula, InfoPopover, InfoSection } from "./ModernizeInfo";

export type ReadinessFactor = { key?: string; name: string; score: number; detail: string; weight?: number; inputs?: FactorInputs };
export type Readiness = { score: number; level: string; factors: ReadinessFactor[] };

const BAR_COLOR = { good: "var(--green)", prep: "var(--amber)", attention: "var(--red)" } as const;
const S = READINESS.sections;

/** Readiness gauge and factor rows. Every value shown, including in the ⓘ panels, comes from the `readiness` prop. */
export function ReadinessPanel({ readiness, targets }: { readiness: Readiness; targets: { language: string; database: string; platform: string } }) {
  const overallScore = fmtScore(readiness.score);
  return (
    <div className="card card-pad" data-testid="readiness-panel">
      <div className="gauge">
        <Gauge value={readiness.score} />
        <div>
          <div className="subtle mod-readiness-head">
            {READINESS.heading}
            <InfoPopover label={READINESS.aboutLabel(READINESS.heading)} title={READINESS.heading}>
              <InfoSection heading={S.measures}>{READINESS.overall.measures}</InfoSection>
              <InfoSection heading={S.result}>{overallScore ? READINESS.overall.result(overallScore, readiness.level) : NOT_AVAILABLE}</InfoSection>
              <InfoSection heading={S.meaning}>{READINESS.overall.meaning}</InfoSection>
              <InfoSection heading={S.next}>{READINESS.overall.next}</InfoSection>
              <InfoFormula heading={S.formula} formula={READINESS.overall.formula} variablesHeading={S.variables} variables={[...READINESS.overall.variables, READINESS.bandRule]} />
            </InfoPopover>
          </div>
          <h2>{readiness.level}</h2>
          <p className="muted">{READINESS.targetsNote(targets.language, targets.platform, targets.database)}</p>
        </div>
      </div>
      <div className="subtle" style={{ marginTop: 14 }}>{READINESS.factorsHeading} · {READINESS.scaleNote}</div>
      <div className="stack-sm" style={{ marginTop: 10 }}>
        {readiness.factors.map((f) => <FactorRow key={f.key ?? f.name} f={f} />)}
      </div>
    </div>
  );
}

function FactorRow({ f }: { f: ReadinessFactor }) {
  const m = isFactorKey(f.key) ? METRICS[f.key] : null;
  const name = m?.label ?? f.name;
  const score = fmtScore(f.score);
  const weight = fmtWeight(f.weight);
  const band = scoreBand(f.score);
  // Without the structured inputs, fall back to the backend's own detail text from the same factor.
  const result = m && f.inputs ? m.result(f.inputs) : f.detail || READINESS.unknownFactor.result;
  return (
    <div data-testid={`factor-${f.key ?? f.name}`}>
      <div className="mod-factor-head">
        <span className="mod-factor-name">
          {name}
          <InfoPopover label={READINESS.aboutLabel(name)} title={name}>
            <InfoSection heading={S.measures}>{m ? m.measures : READINESS.unknownFactor.measures}</InfoSection>
            <InfoSection heading={S.result}>{result}</InfoSection>
            <InfoSection heading={S.meaning}>{m?.meaning ? m.meaning(f.score) : scoreMeaning(f.score)}</InfoSection>
            <InfoSection heading={S.next}>{m ? m.next(f.inputs, f.score) : READINESS.unknownFactor.next}</InfoSection>
            {m && <InfoFormula heading={S.formula} formula={m.formula} variablesHeading={S.variables} variables={[...m.variables, READINESS.bandRule]} />}
          </InfoPopover>
        </span>
        <span className="mod-factor-weight">{READINESS.weightLabel}: {weight ?? NOT_AVAILABLE}</span>
        <span className="mod-factor-score">
          {band && <span className={`mod-status ${band}`}>{READINESS.band[band]}</span>}
          <b>{score ?? NOT_AVAILABLE}</b>
        </span>
      </div>
      <div
        className="bar"
        style={{ margin: "6px 0 4px" }}
        role="meter"
        aria-label={READINESS.barLabel(name, score ?? NOT_AVAILABLE)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={isNum(f.score) ? f.score : undefined}
      >
        {isNum(f.score) && band && <span style={{ width: `${f.score}%`, background: BAR_COLOR[band] }} />}
      </div>
      <div className="subtle">{result}</div>
    </div>
  );
}

function Gauge({ value }: { value: number }) {
  const r = 44, c = Math.PI * r;
  const color = value >= 75 ? "var(--green)" : value >= 50 ? "var(--amber-strong)" : "var(--red)";
  return (
    <svg width="120" height="70" viewBox="0 0 120 70" role="img" aria-label={`${READINESS.heading} ${value} / 100`}>
      <path d="M16 62 A44 44 0 0 1 104 62" fill="none" stroke="var(--line)" strokeWidth="10" strokeLinecap="round" />
      <path d="M16 62 A44 44 0 0 1 104 62" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} />
      <text x="60" y="60" textAnchor="middle" fontSize="24" fontWeight="600" fill="var(--text)">{value}</text>
    </svg>
  );
}
