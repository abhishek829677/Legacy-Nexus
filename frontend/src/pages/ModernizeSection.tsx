import type { ReactNode } from "react";
import { PAGE, type Topic } from "./modernize.copy";
import { TopicInfo } from "./ModernizeInfo";

type Step = { n: number; title: string; description: string; next: string };

/** One numbered step of the page: heading, one-sentence description, ⓘ and a next-step hint. */
export function StepSection({ step, topic, tour, ready = true, children }: {
  step: Step; topic: Topic; tour: string; ready?: boolean; children?: ReactNode;
}) {
  const headingId = `mod-step-${step.n}`;
  return (
    <section className="mod-step" aria-labelledby={headingId} data-tour={tour}>
      <div className="mod-step-head">
        <span className="mod-step-n" aria-hidden="true">{step.n}</span>
        <div className="mod-step-text">
          <h2 id={headingId} className="mod-step-title">
            <span className="mod-sr-only">{`Step ${step.n}: `}</span>{step.title}
            <TopicInfo topic={topic} />
          </h2>
          <p className="mod-step-desc">{step.description}</p>
        </div>
      </div>
      {ready ? children : <div className="mod-step-placeholder">{PAGE.notGeneratedYet}</div>}
      {ready && <p className="mod-step-next"><b>{PAGE.nextPrefix}</b> {step.next}</p>}
    </section>
  );
}

/** Card heading with an ⓘ and an optional caption carrying the result in words. */
export function CardHead({ title, topic, caption }: { title: string; topic?: Topic; caption?: ReactNode }) {
  return (
    <div className="card-head mod-card-head">
      <h3>{title}{topic && <TopicInfo topic={topic} />}</h3>
      {caption && <span className="subtle">{caption}</span>}
    </div>
  );
}
