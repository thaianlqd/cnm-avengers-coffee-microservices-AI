import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeChartRows,
  donutSegments,
  money,
} from "../src/components/console/chartModel.js";

test("payment partition includes every method and totals 100%, without dropping a fifth method", () => {
  const rows = [40, 30, 15, 10, 5].map((value, index) => ({
    label: String(index),
    value,
  }));
  assert.deepEqual(
    donutSegments(rows).map((row) => [row.share, row.offset]),
    [
      [40, 0],
      [30, 40],
      [15, 70],
      [10, 85],
      [5, 95],
    ],
  );
  assert.deepEqual(
    rows.map((row) => row.value),
    [40, 30, 15, 10, 5],
  );
});
test("empty and zero datasets cannot generate NaN sectors", () => {
  assert.deepEqual(donutSegments([]), []);
  assert.deepEqual(
    donutSegments([{ value: 0 }, { value: null }, { value: "invalid" }]),
    [],
  );
});
test("signed financial values stay visible in line/bar data; invalid amounts are finite", () => {
  assert.deepEqual(
    normalizeChartRows([
      { value: -120 },
      { value: "1000" },
      { value: Infinity },
      { value: undefined },
    ]).map((row) => row.value),
    [-120, 1000, 0, 0],
  );
  assert.deepEqual(
    donutSegments([{ value: -120 }, { value: 1000 }]).map((row) => row.share),
    [100],
  );
});
test("missing metrics are distinguishable from an actual zero", () => {
  assert.equal(money(null), "—");
  assert.equal(money(0), "0 đ");
  assert.equal(money("invalid"), "—");
  assert.equal(money(Infinity), "—");
});
