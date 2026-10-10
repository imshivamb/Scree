const ORDERS = [
  ["#4821", "Mara Lindqvist", "€1,240"],
  ["#4820", "Teo Okafor", "€312"],
  ["#4819", "Ines Duarte", "€86"],
  ["#4818", "Jun Takeda", "€2,015"],
];

export default function Orders() {
  return (
    <>
      <h1 data-scree="title">Orders</h1>
      <div className="row">
        <ul className="card list" data-scree="orders">
          {ORDERS.map(([id, who, total]) => (
            <li key={id}>
              <span>{id}</span>
              <span>{who}</span>
              <span>{total}</span>
            </li>
          ))}
        </ul>
        <div className="card hot" data-scree="revenue">
          <span>Revenue</span>
          <strong>€48,200</strong>
        </div>
      </div>
    </>
  );
}
