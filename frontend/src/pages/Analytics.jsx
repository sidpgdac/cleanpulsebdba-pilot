import React, { useState } from 'react';

const trend=[94.8,95.2,94.9,96.0,95.7,96.3,96.8];
const hours=[2,3,2,5,8,12,9,6,4,3,2,1];

export default function Analytics({ notify }) {
  const [dateF, setDateF] = useState('Last 30 days');

  return (
    <section className="page-stack">
      <div className="page-title">
        <div>
          <p>QUALITY / ANALYTICS</p>
          <h1>Actionable intelligence</h1>
          <span>Patterns that help management fix causes—not just count events.</span>
        </div>
        <div className="page-actions">
          <select className="date-select" value={dateF} onChange={e => setDateF(e.target.value)}>
            <option>Last 30 days</option><option>Last 7 days</option><option>Today</option>
          </select>
          <button className="secondary" onClick={() => notify('Analytics snapshot exported')}>↓ Export</button>
        </div>
      </div>

      <div className="analytics-hero">
        <section className="panel trend-card">
          <header>
            <div>
              <span>Cleanliness uptime</span>
              <h2>96.8%</h2>
              <small>↑ 1.2% from previous period</small>
            </div>
            <div className="chart-legend"><i/>Facility uptime</div>
          </header>
          <div className="line-chart" aria-label="Cleanliness uptime trend">
            <div className="y-labels"><span>100%</span><span>97%</span><span>94%</span><span>91%</span></div>
            <div className="plot">
              <i className="grid-one"/><i className="grid-two"/><i className="grid-three"/>
              <svg viewBox="0 0 700 170" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#0b8b60" stopOpacity=".22" />
                    <stop offset="1" stopColor="#0b8b60" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M0 125 L116 110 L233 120 L350 83 L466 94 L583 72 L700 55 L700 170 L0 170Z" fill="url(#area)"/>
                <path d="M0 125 L116 110 L233 120 L350 83 L466 94 L583 72 L700 55" fill="none" stroke="#087a53" strokeWidth="4"/>
                <g fill="#fff" stroke="#087a53" strokeWidth="3">
                  {[[0,125],[116,110],[233,120],[350,83],[466,94],[583,72],[700,55]].map((p,i) => (
                    <circle key={i} cx={p[0]} cy={p[1]} r="5"/>
                  ))}
                </g>
              </svg>
              <div className="x-labels">
                {['20 Aug','21 Aug','22 Aug','23 Aug','24 Aug','25 Aug','26 Aug'].map(x => <span key={x}>{x}</span>)}
              </div>
            </div>
          </div>
        </section>
        
        <section className="panel availability-card">
          <header>
            <div>
              <span>Operational availability</span>
              <h2>96.4%</h2>
            </div>
          </header>
          <div className="availability-ring">
            <div>
              <strong>139</strong>
              <small>of 144 units</small>
            </div>
          </div>
          <ul>
            <li><span className="green-bg"/>Operational <b>139</b></li>
            <li><span className="dark-bg"/>Maintenance <b>5</b></li>
          </ul>
          <p>One unit issue does not close the block.</p>
        </section>
      </div>

      <div className="analytics-grid">
        <section className="panel bar-card">
          <header>
            <div>
              <h2>Complaints by hour</h2>
              <p>Peak attention window: 10 AM–1 PM</p>
            </div>
          </header>
          <div className="bar-chart">
            {hours.map((h, i) => (
              <div key={i}>
                <span style={{ height: `${h * 7}px` }} className={h >= 9 ? 'peak' : ''} />
                <small>{i % 2 === 0 ? `${i + 7}` : ''}</small>
              </div>
            ))}
          </div>
          <footer>Hour of day <b>+18% complaints during OPD peak</b></footer>
        </section>

        <section className="panel issue-breakdown">
          <header>
            <div>
              <h2>Complaint category</h2>
              <p>108 reports · last 30 days</p>
            </div>
          </header>
          {[
            ['Wet floor', 28, '#d5463a'],
            ['Bad smell', 22, '#d49316'],
            ['No soap', 18, '#087a53'],
            ['No water', 17, '#36413c'],
            ['Bin full', 13, '#5a8f7a'],
            ['Other', 10, '#9cadA4']
          ].map(x => (
            <div className="breakdown-row" key={x[0]}>
              <span>{x[0]}</span>
              <div><i style={{ width: `${x[1]}%`, background: String(x[2]) }} /></div>
              <b>{x[1]}%</b>
            </div>
          ))}
        </section>

        <section className="panel problem-list">
          <header>
            <div>
              <h2>Repeat-problem toilets</h2>
              <p>Root-cause signal</p>
            </div>
            <button>View all →</button>
          </header>
          <article>
            <span className="problem-rank">01</span>
            <div><b>Ward 3 Visitor</b><small>BDBA-T005 · 42 complaints</small></div>
            <em>88% infrastructure</em>
          </article>
          <article>
            <span className="problem-rank">02</span>
            <div><b>OPD Male</b><small>BDBA-T002 · 31 complaints</small></div>
            <em className="amber-text">61% housekeeping</em>
          </article>
          <article>
            <span className="problem-rank">03</span>
            <div><b>Casualty Female</b><small>BDBA-T003 · 18 complaints</small></div>
            <em className="green-text">Improving</em>
          </article>
        </section>
      </div>

      <div className="recommendation">
        <span>◎</span>
        <div>
          <small>CLEANPULSE RECOMMENDATION</small>
          <h3>Water supply is driving repeat complaints at Ward 3 Visitor Toilet.</h3>
          <p>Repeated cleaning will not solve this issue. Prioritize maintenance intervention and inspect the supply line.</p>
        </div>
        <button onClick={() => notify('Maintenance work order prepared')}>Create work order →</button>
      </div>
    </section>
  );
}
