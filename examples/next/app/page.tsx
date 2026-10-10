export default function Overview() {
  return (
    <>
      <h1 data-scree="title">Overview</h1>
      <div className="row">
        <div className="card hot" data-scree="revenue">
          <span>Revenue</span>
          <strong>€48,200</strong>
        </div>
        <div className="card" data-scree="orders">
          <span>Orders</span>
          <strong>1,284</strong>
        </div>
      </div>
      <div className="card chart" data-scree="chart">
        {[38, 52, 44, 71, 63, 86, 74].map((value, index) => (
          <i key={index} style={{ height: `${value}%` }} />
        ))}
      </div>
    </>
  );
}
