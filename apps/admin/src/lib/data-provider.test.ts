import { describe, expect, test } from "bun:test";
import { listQuery } from "./data-provider";

describe("listQuery", () => {
  test("pagination, sort and filters, empty filters left out", () => {
    const query = listQuery({
      pagination: { page: 2, perPage: 25 },
      sort: { field: "name", order: "DESC" },
      filter: { q: "rock", role: "", bandless: true, gone: undefined },
    });
    expect(Object.fromEntries(new URLSearchParams(query))).toEqual({
      page: "2",
      perPage: "25",
      sort: "name",
      order: "desc",
      q: "rock",
      bandless: "true",
    });
  });

  test("nothing given: an empty query", () => {
    expect(listQuery({})).toBe("");
  });
});
