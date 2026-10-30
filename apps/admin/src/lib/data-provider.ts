import type { DataProvider, GetListParams } from "ra-core";
import { apiFetch } from "@/lib/api";

/** The homepage numbers (`GET /api/admin/stats`). */
export type AdminStats = {
  bands: number;
  newBandsThisMonth: number;
  users: number;
  activeUsers: number;
  songs: number;
  documents: number;
  documentsBytes: number;
  /** Every band's documents budget added up. */
  documentsQuotaBytes: number;
  pendingInvitations: number;
};

/**
 * A list's query string for `GET /api/admin/<resource>`: `page` and `perPage` (from 1), `sort` and
 * `order` (`asc` or `desc`), then the filters as they are (`q` for a search).
 */
export function listQuery({ pagination, sort, filter }: Partial<GetListParams>) {
  const params = new URLSearchParams();
  if (pagination) {
    params.set("page", String(pagination.page));
    params.set("perPage", String(pagination.perPage));
  }
  if (sort?.field) {
    params.set("sort", sort.field);
    params.set("order", sort.order.toLowerCase());
  }
  for (const [key, value] of Object.entries(filter ?? {})) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  return params.toString();
}

const notYet = (method: string) => () =>
  Promise.reject(new Error(`${method} isn't available in the admin API yet`));

/**
 * react-admin's data access, on our own admin routes (#246) rather than a generic REST format:
 * a list answers `{ data, total }`, a record `{ data }`. Writes come with the features needing them.
 */
export const dataProvider = {
  getList: (resource, params) => apiFetch(`/api/admin/${resource}?${listQuery(params)}`),
  getOne: (resource, { id }) => apiFetch(`/api/admin/${resource}/${encodeURIComponent(id)}`),
  getMany: notYet("getMany"),
  getManyReference: notYet("getManyReference"),
  create: notYet("create"),
  update: notYet("update"),
  updateMany: notYet("updateMany"),
  delete: notYet("delete"),
  deleteMany: notYet("deleteMany"),
  /** The homepage numbers. */
  stats: () => apiFetch<AdminStats>("/api/admin/stats"),
} satisfies DataProvider & { stats: () => Promise<AdminStats> };

export type AdminDataProvider = typeof dataProvider;
