export default function Customer() {
  return (
    <>
      <h1 data-scree="title">Mara Lindqvist</h1>
      <div className="row">
        <div className="avatar">ML</div>
        <div className="card hot" data-scree="revenue">
          <span>Lifetime value</span>
          <strong>€9,860</strong>
        </div>
      </div>
      <div className="card chart" data-scree="chart">
        {[22, 40, 35, 58, 90, 47, 66, 52].map((value, index) => (
          <i key={index} style={{ height: `${value}%` }} />
        ))}
      </div>
    </>
  );
}
