import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { useSceneTransition } from "scree-react";
import { inject } from "@vercel/analytics";

import "./interfaces.css";

inject();

type Screen = "overview" | "orders" | "customer";

const SCREENS: { id: Screen; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "orders", label: "Orders" },
  { id: "customer", label: "Customer" },
];

const EFFECTS = [
  { id: "pieces", label: "Pieces" },
  { id: "shatter", label: "Shatter" },
  { id: "landslide", label: "Landslide" },
  { id: "blinds", label: "Blinds" },
  { id: "mosaic-flip", label: "Mosaic flip" },
  { id: "peel", label: "Page peel" },
  { id: "liquid", label: "Liquid" },
];

const WEEK = [38, 52, 44, 71, 63, 86, 74];
const ORDERS = [
  { id: "#4821", who: "Mara Lindqvist", total: "€1,240", state: "Paid" },
  { id: "#4820", who: "Teo Okafor", total: "€312", state: "Packed" },
  { id: "#4819", who: "Ines Duarte", total: "€86", state: "Paid" },
  { id: "#4818", who: "Jun Takeda", total: "€2,015", state: "Refund" },
  { id: "#4817", who: "Ava Brennan", total: "€144", state: "Paid" },
];

function Bars({ values }: { values: number[] }) {
  return (
    <div className="bars" data-scree="chart">
      {values.map((value, index) => (
        <i key={index} style={{ height: `${value}%` }} />
      ))}
    </div>
  );
}

function Overview() {
  return (
    <>
      <header className="screen-head">
        <h2 data-scree="title">Overview</h2>
        <span className="pill" data-scree="status">Live · 24 h</span>
      </header>
      <div className="metrics">
        <div className="metric metric-hot" data-scree="revenue">
          <span>Revenue</span>
          <strong>€48,200</strong>
          <em>+12.4%</em>
        </div>
        <div className="metric" data-scree="orders">
          <span>Orders</span>
          <strong>1,284</strong>
          <em>+3.1%</em>
        </div>
        <div className="metric">
          <span>Returning</span>
          <strong>38%</strong>
          <em>−0.6%</em>
        </div>
      </div>
      <div className="panel">
        <span className="panel-label">This week</span>
        <Bars values={WEEK} />
      </div>
    </>
  );
}

function Orders() {
  return (
    <>
      <header className="screen-head">
        <h2 data-scree="title">Orders</h2>
        <span className="pill" data-scree="status">5 open</span>
      </header>
      <div className="split">
        <ul className="table" data-scree="orders">
          {ORDERS.map((order) => (
            <li key={order.id}>
              <span className="mono">{order.id}</span>
              <span>{order.who}</span>
              <span className="mono">{order.total}</span>
              <span className={`state state-${order.state.toLowerCase()}`}>{order.state}</span>
            </li>
          ))}
        </ul>
        <div className="aside">
          <div className="metric metric-hot" data-scree="revenue">
            <span>Revenue</span>
            <strong>€48,200</strong>
          </div>
          <div className="panel">
            <span className="panel-label">Per day</span>
            <Bars values={WEEK.slice(3)} />
          </div>
        </div>
      </div>
    </>
  );
}

function Customer() {
  return (
    <>
      <header className="screen-head">
        <h2 data-scree="title">Mara Lindqvist</h2>
        <span className="pill" data-scree="status">VIP</span>
      </header>
      <div className="profile">
        <div className="avatar avatar-large" data-scree="avatar">ML</div>
        <div className="profile-copy">
          <p>Stockholm · customer since 2021</p>
          <div className="metric metric-hot" data-scree="revenue">
            <span>Lifetime value</span>
            <strong>€9,860</strong>
            <em>14 orders</em>
          </div>
        </div>
      </div>
      <div className="panel">
        <span className="panel-label">Spend per month</span>
        <Bars values={[22, 40, 35, 58, 90, 47, 66, 52]} />
      </div>
    </>
  );
}

function App() {
  const [screen, setScreen] = useState<Screen>("overview");
  const [effect, setEffect] = useState("pieces");
  const { ref, run } = useSceneTransition<HTMLDivElement>();

  const go = (next: Screen) => {
    if (next === screen) return;
    void run(() => setScreen(next), { effect });
  };

  return (
    <main className="page">
      <nav className="bar">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true" />
          Scree
        </a>
        <div className="bar-links">
          <a href="/#builders">Builders</a>
          <a href="https://github.com/imshivamb/Scree" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a className="bar-cta" href="/studio/">
            Open Studio
          </a>
        </div>
      </nav>

      <section className="intro">
        <p className="kicker">
          <span>08</span> Interfaces
        </p>
        <h1>
          Every element <em>finds its place.</em>
        </h1>
        <p className="lede">
          Click through the app below. The screen you leave breaks apart and each piece travels to where it sits on the
          next one: the revenue card, the chart, the title. It is the live page, captured as you click and handed back
          when it lands.
        </p>
      </section>

      <div className="effects" role="radiogroup" aria-label="Effect">
        {EFFECTS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={effect === item.id}
            className="chip"
            onClick={() => setEffect(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="device">
        <div className="app" ref={ref}>
          <aside className="side">
            <div className="side-brand">
              <span className="dot" /> Northwind
            </div>
            <ul>
              {SCREENS.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="nav"
                    aria-current={screen === item.id ? "page" : undefined}
                    onClick={() => go(item.id)}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
            <div className="side-user">
              {screen !== "customer" && (
                <div className="avatar" data-scree="avatar">
                  ML
                </div>
              )}
              <span>Mara L.</span>
            </div>
          </aside>
          <section className="content">
            {screen === "overview" && <Overview />}
            {screen === "orders" && <Orders />}
            {screen === "customer" && <Customer />}
          </section>
        </div>
      </div>

      <section className="how">
        <div>
          <p className="kicker">
            <span>01</span> Capture
          </p>
          <p>Before your change, Scree draws the element exactly as the browser shows it.</p>
        </div>
        <div>
          <p className="kicker">
            <span>02</span> Match
          </p>
          <p>
            After it, the new state is drawn too. Anything marked <code>data-scree="name"</code> on both screens travels
            as one piece; the rest pairs by place and colour.
          </p>
        </div>
        <div>
          <p className="kicker">
            <span>03</span> Hand back
          </p>
          <p>A canvas plays the transition over the element, then the live page returns, with focus and scroll kept.</p>
        </div>
      </section>

      <section className="snippet">
        <pre className="code">
          <code>
            <span className="c-k">import</span> {"{ useSceneTransition }"} <span className="c-k">from</span>{" "}
            <span className="c-s">"scree-react"</span>;{"\n\n"}
            <span className="c-k">const</span> {"{ ref, run }"} = useSceneTransition({"{ effect: "}
            <span className="c-s">"pieces"</span>
            {" });\n\n"}
            {'<div ref={ref}>{screen}</div>\n'}
            {'<button onClick={() => run(() => setScreen("orders"))}>Orders</button>\n\n'}
            <span className="c-c">{'// <div data-scree="revenue"> on both screens flies as one piece'}</span>
          </code>
        </pre>
        <p className="note">
          <code>npm i scree-react scree-core</code> · reduced motion applies the change at once · video, iframes and
          cross-origin images without CORS are not captured.
        </p>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
