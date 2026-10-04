/**
 * Minimum-cost perfect assignment on a dense square cost matrix
 * (Hungarian / Kuhn–Munkres with potentials, O(n³)).
 * `cost[row * size + column]`. Returns `assignment[row] = column`.
 */
export function solveAssignment(cost: Float64Array, size: number): Uint32Array {
  const rowPotential = new Float64Array(size + 1);
  const columnPotential = new Float64Array(size + 1);
  const columnRow = new Int32Array(size + 1);
  const previousColumn = new Int32Array(size + 1);
  const slack = new Float64Array(size + 1);
  const used = new Uint8Array(size + 1);

  for (let row = 1; row <= size; row += 1) {
    columnRow[0] = row;
    let column = 0;
    slack.fill(Infinity);
    used.fill(0);
    do {
      used[column] = 1;
      const activeRow = columnRow[column] ?? 0;
      const base = (activeRow - 1) * size;
      let delta = Infinity;
      let nextColumn = 0;
      for (let candidate = 1; candidate <= size; candidate += 1) {
        if (used[candidate]) continue;
        const reduced =
          (cost[base + candidate - 1] ?? 0) -
          (rowPotential[activeRow] ?? 0) -
          (columnPotential[candidate] ?? 0);
        if (reduced < (slack[candidate] ?? Infinity)) {
          slack[candidate] = reduced;
          previousColumn[candidate] = column;
        }
        if ((slack[candidate] ?? Infinity) < delta) {
          delta = slack[candidate] ?? Infinity;
          nextColumn = candidate;
        }
      }
      for (let candidate = 0; candidate <= size; candidate += 1) {
        if (used[candidate]) {
          const owner = columnRow[candidate] ?? 0;
          rowPotential[owner] = (rowPotential[owner] ?? 0) + delta;
          columnPotential[candidate] = (columnPotential[candidate] ?? 0) - delta;
        } else {
          slack[candidate] = (slack[candidate] ?? 0) - delta;
        }
      }
      column = nextColumn;
    } while ((columnRow[column] ?? 0) !== 0);
    do {
      const previous = previousColumn[column] ?? 0;
      columnRow[column] = columnRow[previous] ?? 0;
      column = previous;
    } while (column !== 0);
  }

  const assignment = new Uint32Array(size);
  for (let column = 1; column <= size; column += 1) {
    assignment[(columnRow[column] ?? 1) - 1] = column - 1;
  }
  return assignment;
}
