import { useEffect, useState, type ReactNode } from "react";
import { LuArrowRight, LuBadgeCheck, LuEyeOff, LuHistory, LuServer, LuShieldCheck, LuSparkles, LuUpload, LuWorkflow, LuZap } from "react-icons/lu";
import { DemoPlayer } from "../components/DemoPlayer";
import { Reveal, Slider, type Slide } from "../components/Motion";
import { Logo } from "../components/ui";
import { useAuth } from "../lib/auth";
import { Link } from "../lib/router";
import "./landing.css";

const LANGUAGES = ["COBOL", "JCL", "DB2 SQL", "Java", "C#", ".NET", "Python", "JavaScript", "TypeScript", "Shell scripts", "YAML config", "OpenAPI"];

function Chain({ items }: { items: string[] }) {
  return (
    <div className="lx-chain">
      {items.map((it, i) => (
        <span key={it} className="lx-chain-step" style={{ animationDelay: `${i * 90}ms` }}>
          <span className="lx-chip">{it}</span>
          {i < items.length - 1 && <LuArrowRight size={14} aria-hidden="true" />}
        </span>
      ))}
    </div>
  );
}

function SlideCard({ kicker, title, text, points, visual }: { kicker: string; title: string; text: string; points: string[]; visual: ReactNode }) {
  return (
    <div className="lx-slide">
      <div className="lx-slide-text">
        <span className="lx-kicker">{kicker}</span>
        <h3>{title}</h3>
        <p>{text}</p>
        <ul>{points.map((p) => <li key={p}><LuBadgeCheck size={16} aria-hidden="true" /> {p}</li>)}</ul>
      </div>
      <div className="lx-slide-visual">{visual}</div>
    </div>
  );
}

const SLIDES: Slide[] = [
  {
    key: "ask",
    label: "Ask questions",
    content: (
      <SlideCard
        kicker="Ask"
        title="Answers with the exact lines of code"
        text="Ask in plain language. Every answer names the program, table and field, and cites where it comes from."
        points={["Citations checked against the code", "Says so when the code has no answer"]}
        visual={
          <div className="lx-qa">
            <div className="lx-q">Where is interest calculated?</div>
            <div className="lx-a">
              In <b>INTEREST.CBL</b>, called from <b>ACCOUNT.CBL</b>, using <b>INTEREST_RATE</b> from table <b>ACCOUNT_MASTER</b>.
              <div className="lx-cites"><span>INTEREST.CBL:60-64</span><span>ACCOUNT.CBL:107</span></div>
            </div>
          </div>
        }
      />
    ),
  },
  {
    key: "map",
    label: "Map dependencies",
    content: (
      <SlideCard
        kicker="Map"
        title="Every dependency, from job to report"
        text="Jobs, programs, tables, files and APIs are linked automatically. Every link points to a source line."
        points={["Built by real parsers, no AI", "Filter by type, focus on one element"]}
        visual={<Chain items={["JOB NIGHTLY", "PAYMENT", "ACCOUNT", "ACCOUNT_MASTER", "REPORT 12"]} />}
      />
    ),
  },
  {
    key: "impact",
    label: "Assess impact",
    content: (
      <SlideCard
        kicker="Impact"
        title="Know what breaks before you change it"
        text="Pick a column, table or program. See everything it reaches through code, SQL, files and APIs."
        points={["Field-level tracing", "Evidence for every step"]}
        visual={<Chain items={["CUSTOMER_ADDRESS", "CUSTOMER", "ACCOUNT", "PAYMENT", "API_CUSTOMER"]} />}
      />
    ),
  },
  {
    key: "rules",
    label: "Extract business rules",
    content: (
      <SlideCard
        kicker="Rules"
        title="Business rules your teams can read"
        text="Rules are extracted with their source lines and turned into test scenarios for the new system."
        points={["Plain-language rule catalogue", "Parity tests as CSV or Gherkin"]}
        visual={
          <div className="lx-code">
            <div><span className="k">Scenario:</span> ACCOUNT – BR-012 holds</div>
            <div>&nbsp;&nbsp;<span className="k">Given</span> ACCOUNT-TYPE = 'SAV'</div>
            <div>&nbsp;&nbsp;<span className="k">And</span> NEW-BALANCE &lt; MIN-BALANCE</div>
            <div>&nbsp;&nbsp;<span className="k">Then</span> RETURN-CODE = 32</div>
          </div>
        }
      />
    ),
  },
  {
    key: "plan",
    label: "Plan the modernization",
    content: (
      <SlideCard
        kicker="Modernize"
        title="A migration plan from the code itself"
        text="Readiness score, a strategy per program, migration waves, target architecture and converted SQL schema."
        points={["Java, .NET or Python targets", "Azure, AWS, Google Cloud or on-prem"]}
        visual={
          <div className="lx-plan">
            {[["Code complexity", 88], ["Rule traceability", 100], ["Self-documentation", 100], ["Static resolvability", 100]].map(([k, v], i) => (
              <div key={k} className="lx-plan-row">
                <span>{k}</span>
                <div className="lx-plan-bar"><span style={{ width: `${v}%`, animationDelay: `${i * 120}ms` }} /></div>
                <b>{v}</b>
              </div>
            ))}
          </div>
        }
      />
    ),
  },
];

const STEPS = [
  { icon: LuUpload, title: "Upload", text: "Add source code as files or a .zip: COBOL, JCL, SQL, Java, C#, Python, JavaScript and more." },
  { icon: LuWorkflow, title: "Analyse", text: "Real parsers build a knowledge graph of programs, data, rules and interfaces. No AI tokens spent." },
  { icon: LuSparkles, title: "Act", text: "Ask questions, check impact, generate documentation and plan the migration from one graph." },
];

const TRUST = [
  { icon: LuEyeOff, title: "No full files sent to AI", text: "Only the few most relevant excerpts." },
  { icon: LuBadgeCheck, title: "Verified citations", text: "Unsupported answers abstain." },
  { icon: LuServer, title: "Your model, your network", text: "Including local Ollama." },
  { icon: LuHistory, title: "Full audit trail", text: "Keys encrypted at rest." },
];

export function LandingPage() {
  const { user } = useAuth();
  const cta = user ? { to: "/projects", label: "Open workspace" } : { to: "/login", label: "Sign in" };
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="lx">
      <nav className={`lx-nav ${scrolled ? "scrolled" : ""}`} aria-label="Main">
        <Link to="/" className="lx-brand"><Logo size={28} /> LegacyNexus <span>AI</span></Link>
        <div className="lx-links">
          <a href="#product" className="mx-underline">Product</a>
          <a href="#how" className="mx-underline">How it works</a>
          <a href="#security" className="mx-underline">Security</a>
        </div>
        <Link to={cta.to} className="lx-btn lx-btn-dark">{cta.label} <LuArrowRight size={15} aria-hidden="true" /></Link>
      </nav>

      <header className="lx-hero">
        <div className="lx-aurora" aria-hidden="true"><i /><i /><i /></div>
        <div className="lx-grid" aria-hidden="true" />
        <div className="lx-hero-inner">
          <div className="lx-hero-copy">
            <span className="lx-pill lx-in" style={{ animationDelay: "0ms" }}><LuZap size={13} aria-hidden="true" /> Legacy code intelligence</span>
            <h1 className="mx-focus-in" style={{ animationDelay: "80ms" }}>
              Understand any legacy application <span className="lx-grad">before you change it.</span>
            </h1>
            <p className="lx-lead lx-in" style={{ animationDelay: "160ms" }}>
              Every program, table and business rule mapped from the code, with answers that cite the exact line.
            </p>
            <div className="lx-ctas lx-in" style={{ animationDelay: "240ms" }}>
              <Link to={cta.to} className="lx-btn lx-btn-primary lx-btn-lg">{user ? cta.label : "Get started"} <LuArrowRight size={16} aria-hidden="true" /></Link>
              <a href="#product" className="lx-btn lx-btn-ghost lx-btn-lg">See what it does</a>
            </div>
          </div>
          <div className="lx-hero-visual lx-in" style={{ animationDelay: "200ms" }}>
            <div className="lx-glow" aria-hidden="true" />
            <div className="lx-demo-frame mx-glow-border"><DemoPlayer /></div>
          </div>
        </div>
      </header>

      <section className="lx-marquee" aria-label="Supported languages">
        <span className="lx-marquee-label">Reads</span>
        <div className="lx-marquee-track">
          <div className="lx-marquee-row">
            {[...LANGUAGES, ...LANGUAGES].map((l, i) => <span key={i} aria-hidden={i >= LANGUAGES.length}>{l}</span>)}
          </div>
        </div>
      </section>

      <section className="lx-section" id="product">
        <Reveal className="lx-head">
          <span className="lx-eyebrow">Product</span>
          <h2>One knowledge graph. Every answer you need.</h2>
        </Reveal>
        <Reveal delay={80}>
          <Slider slides={SLIDES} label="What LegacyNexus does" className="lx-slider" />
        </Reveal>
      </section>

      <section className="lx-section lx-alt" id="how">
        <Reveal className="lx-head">
          <span className="lx-eyebrow">How it works</span>
          <h2>From upload to answers in minutes.</h2>
        </Reveal>
        <div className="lx-steps">
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 120} className="lx-step mx-spot">
              <span className="lx-step-icon"><s.icon size={20} aria-hidden="true" /></span>
              <span className="lx-step-n">0{i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="lx-section" id="security">
        <Reveal className="lx-head">
          <span className="lx-eyebrow">Security</span>
          <h2>Built for code you cannot afford to leak.</h2>
        </Reveal>
        <div className="lx-trust">
          {TRUST.map((t, i) => (
            <Reveal key={t.title} delay={i * 90} className="lx-trust-item mx-spot">
              <t.icon size={20} aria-hidden="true" />
              <div><b>{t.title}</b><span>{t.text}</span></div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="lx-section lx-section-tight">
        <Reveal className="lx-cta">
          <div className="lx-cta-glow" aria-hidden="true" />
          <div>
            <h2>See it on a real legacy application.</h2>
            <p>Sign in and load the sample core-banking system. It takes about a minute.</p>
          </div>
          <Link to={cta.to} className="lx-btn lx-btn-light lx-btn-lg">{cta.label} <LuArrowRight size={16} aria-hidden="true" /></Link>
        </Reveal>
      </section>

      <footer className="lx-foot">
        <span className="lx-brand lx-brand-sm"><Logo size={20} /> LegacyNexus AI</span>
        <span><LuShieldCheck size={14} aria-hidden="true" /> Your code stays in your environment.</span>
        <span>© {new Date().getFullYear()} LegacyNexus AI</span>
      </footer>
    </div>
  );
}
